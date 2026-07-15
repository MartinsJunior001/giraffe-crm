import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirLerCard, exigirOperarCard } from '../../pipe-authz';
import { SubmissaoInvalidaError, validarSubmissao } from '../submission';
import { formularioPublicadoDaFase } from './phase-form-requirement';

type Db = ReturnType<typeof withTenantContext>;

/** Valores de Fase, do jeito que saem pela API interna (`orgId` fora da fronteira). */
export interface ValoresDeFaseVisao {
  cardId: string;
  phaseId: string;
  valores: Record<string, unknown>;
}

function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Valores do Formulário de Fase por (Card, Fase) (Story 2.15), FORA da movimentação. Duas operações:
 *
 *  • **salvar** (`registrar`) — grava/atualiza os valores de uma Fase que o Card acessa, SEM movimentar (CA4:
 *    "salvar não movimenta sozinho"). É **append-only**: cada gravação é um novo INSERT em `CardPhaseValues`; o
 *    conjunto corrente é o mais recente. Quando já havia um conjunto (correção posterior), escreve um evento
 *    `PHASE_VALUES_CORRECTED` no `CardHistory`, na MESMA transação (AD-13); a 1ª gravação escreve `PHASE_VALUES_SAVED`.
 *    O par "antes/depois" (CA4) é preservado **por construção**: a linha anterior é o "antes", a nova é o "depois".
 *
 *  • **ler** (`ler`) — devolve o conjunto corrente de valores (detalhe do Card; pode conter PII, por isso exige
 *    poder de LER o Card e nunca vai para log).
 *
 * Autorização: operar o Card (`exigirOperarCard`, 2.10) para gravar; ler o Card para consultar. Validação SEMPRE
 * contra o snapshot da `FormVersion` **publicada** (AD-12) da Fase — obrigatoriedade NÃO é exigida ao salvar (salvar
 * pode ser parcial; a obrigatoriedade é imposta na transição — 2.14/preflight).
 */
@Injectable()
export class PhaseValuesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Grava (append-only) os valores de uma Fase que o Card acessa, sem movimentar. */
  async registrar(
    cardId: string,
    phaseId: string,
    valores: Record<string, unknown>,
  ): Promise<ValoresDeFaseVisao> {
    const { contexto, db } = this.db();
    await exigirOperarCard(db, contexto, cardId); // 404 sem acesso; 403 se só lê

    // A Fase precisa pertencer a um Card acessível e ter Formulário de Fase publicado (há definição a validar).
    const publicado = await formularioPublicadoDaFase(db, phaseId);
    if (!publicado) throw new NotFoundException(); // sem Formulário de Fase publicado nesta Fase

    let normalizados: Record<string, unknown>;
    try {
      normalizados = validarSubmissao(publicado.snapshot as never, valores);
    } catch (err) {
      if (err instanceof SubmissaoInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }

    // "Antes": havia um conjunto para esta (Card, Fase)? Decide o tipo do evento (correção vs 1ª gravação).
    const anterior = await db.cardPhaseValues.findFirst({
      where: { cardId, phaseId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const evento = anterior ? 'PHASE_VALUES_CORRECTED' : 'PHASE_VALUES_SAVED';
    const resumo = anterior ? 'Valores da Fase corrigidos' : 'Valores da Fase salvos';

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        await tx.cardPhaseValues.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            phaseId,
            formVersionId: publicado.versionId,
            valores: normalizados as never,
            actorId: contexto.accountId ?? null,
          },
        });
        // Evento na MESMA transação (AD-13). Sem PII no summary: o "antes/depois" vive nas linhas append-only.
        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: evento,
            summary: resumo,
            actorId: contexto.accountId ?? null,
          },
        });
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('gravação concorrente; reconsulte e repita');
      throw err;
    }

    this.auditar(contexto, 'create', 'CardPhaseValues');
    this.auditar(contexto, 'create', 'CardHistory');
    return { cardId, phaseId, valores: normalizados };
  }

  /** Lê o conjunto corrente de valores de uma Fase (detalhe — pode conter PII; exige ler o Card). */
  async ler(cardId: string, phaseId: string): Promise<ValoresDeFaseVisao> {
    const { contexto, db } = this.db();
    await exigirLerCard(db, contexto, cardId); // 404 sem acesso
    const corrente = await db.cardPhaseValues.findFirst({
      where: { cardId, phaseId },
      orderBy: { createdAt: 'desc' },
      select: { valores: true },
    });
    return { cardId, phaseId, valores: (corrente?.valores ?? {}) as Record<string, unknown> };
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca `valores` (PII). */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId ?? null,
        orgId: contexto.orgId,
        action,
        resource,
        result: 'allowed',
        at: new Date().toISOString(),
      },
      'auditoria',
    );
  }
}
