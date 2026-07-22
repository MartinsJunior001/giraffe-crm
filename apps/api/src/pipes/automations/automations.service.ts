import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe, resolverPoderNoPipe } from '../pipe-authz';
import {
  ConfiguracaoInvalidaError,
  type ConfiguracaoValidada,
  validarConfiguracao,
} from './automation-config';
import { revalidarReferencias } from './automation-references';
import {
  EventoForaDoCatalogoError,
  exigirEventoNoCatalogo,
} from '../../domain-events/event-catalog';
import {
  CondicaoForaDoCatalogoError,
  exigirCondicoesNoCatalogo,
} from './conditions/condition-catalog';
import { AcaoForaDoCatalogoError, exigirAcoesNoCatalogo } from './actions/action-catalog';

/**
 * O que uma Automação expõe pela API interna. `orgId` NÃO sai — fronteira interna, não dado de
 * apresentação; quem lê já está no escopo da própria Organização.
 */
export interface AutomationVisao {
  id: string;
  pipeId: string;
  name: string;
  state: 'INACTIVE' | 'ACTIVE' | 'ARCHIVED';
  /** Número da `AutomationVersion` em vigor (null = nunca ativada). Story 4.2 — D-4.2-B. */
  activeVersion: number | null;
  quando: unknown;
  condicoes: unknown;
  entao: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * O erro é um CONFLITO de escrita concorrente (→ idempotente ou 409)? P2002 = violação de UNIQUE (mesma
 * `idempotencyKey`/número de versão); P2028 = a transação interativa expirou/fechou sob contenção. Nunca 500.
 */
export function isConflitoDeEscrita(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/** Projeção de toda leitura/escrita — mantém `orgId` fora do payload por construção. */
export const SELECT_AUTOMATION = {
  id: true,
  pipeId: true,
  name: true,
  state: true,
  activeVersion: true,
  quando: true,
  condicoes: true,
  entao: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Resumo para LISTA: sem a configuração. Ver §"listar". */
const SELECT_AUTOMATION_RESUMO = {
  id: true,
  pipeId: true,
  name: true,
  state: true,
  activeVersion: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AutomationResumoVisao = Omit<AutomationVisao, 'quando' | 'condicoes' | 'entao'>;

/**
 * Modelo da Automação e seu vínculo ao Pipe (Story 4.1 — FR-21, RN-100/101, D4.1).
 *
 * TODA query passa por `withTenantContext`: o isolamento é do banco (RLS), não desta camada — não há um
 * único `where orgId` manual. O `orgId` vem do contexto resolvido no servidor, nunca do cliente.
 *
 * **Esta Story CRIA e LÊ — não edita e não transiciona estado.** Não é uma omissão de código: o runtime
 * não tem GRANT de `UPDATE` em `Automation` (a 4.2 o abrirá com o seu consumidor e o seu teste). Uma
 * rota de edição acrescentada por engano aqui bateria em `permission denied` no banco.
 *
 * **Autorização (D4.3):** administram o ciclo de vida o **Admin da Organização** e o **Admin do Pipe**;
 * o **Membro do Pipe** tem acesso **somente leitura** à configuração; o **Convidado não acessa**. Isso é
 * exatamente `exigirGerenciarPipe` (escrita) × `resolverPoderNoPipe` (leitura) — o helper compartilhado
 * de `pipe-authz.ts` (DBT-AUTHZ-01), sem tocar o guard/`ability.ts` (C3 congelado).
 */
@Injectable()
export class AutomationsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return {
      contexto,
      principal: { accountId: contexto.accountId, papel: contexto.papel },
      db: withTenantContext(this.prisma, contexto, this.logger),
    };
  }

  /**
   * Cria uma Automação ligada a EXATAMENTE UM Pipe (RN-100), sempre `INACTIVE` (D4.3).
   *
   * Ordem deliberada das checagens:
   *
   *   1. **autorização** (`exigirGerenciarPipe`) — que já resolve "o Pipe existe e é alcançável nesta
   *      Organização"; sem acesso ⇒ **404 não-enumerante**, sem revelar que o Pipe existe;
   *   2. **estado** do Pipe — autorização resolve PODER, não ESTADO; Pipe arquivado ⇒ **409**;
   *   3. **configuração** — núcleo puro, fail-closed ⇒ **400**.
   *
   * A validação vem DEPOIS da autorização de propósito: responder 400 a quem sequer alcança o Pipe
   * confirmaria a existência dele pelo formato do erro.
   *
   * O `pipeId` cross-tenant já foi barrado no passo 1 (a releitura acontece sob RLS). Mas essa releitura
   * **não é a garantia** — é a fonte do 404. A garantia é a **FK composta** `(orgId, pipeId) →
   * Pipe(orgId, id)` (F-A1): mesmo que este método fosse contornado, o banco recusaria o par.
   */
  async criar(
    pipeId: string,
    name: string,
    config: { quando: unknown; condicoes?: unknown; entao: unknown },
    idempotencyKey?: string,
  ): Promise<AutomationVisao> {
    const { contexto, principal, db } = this.db();

    await exigirGerenciarPipe(db, principal, pipeId);

    const pipe = await db.pipe.findUnique({ where: { id: pipeId }, select: { state: true } });
    // `exigirGerenciarPipe` já garantiu a existência sob RLS; a releitura aqui é do ESTADO.
    if (pipe?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'PIPE_ARQUIVADO' });
    }

    const validada = this.validar(config);
    await revalidarReferencias(db, pipeId, validada);

    let criada: AutomationVisao;
    try {
      criada = await db.automation.create({
        data: {
          orgId: contexto.orgId,
          pipeId,
          name,
          // `state` não é aceito do cliente: nasce INACTIVE pelo default da coluna (D4.3).
          // `configSchemaVersion` idem: carimbado pelo servidor via o núcleo puro.
          configSchemaVersion: validada.schemaVersion,
          quando: validada.quando as object,
          condicoes: validada.condicoes as object[],
          entao: validada.entao as object[],
          // Idempotência opcional (D-4.2-F): sem chave, NULLs são distintos no Postgres e nunca colidem —
          // a `criar` da 4.1 (sem chave) segue idêntica. Com chave, um retry devolve o existente.
          idempotencyKey: idempotencyKey ?? null,
        },
        select: SELECT_AUTOMATION,
      });
    } catch (err) {
      // Retry idempotente: mesma `idempotencyKey` já usada neste Pipe → devolve o existente, nunca 500.
      if (idempotencyKey !== undefined && isConflitoDeEscrita(err)) {
        const existente = await db.automation.findFirst({
          where: { pipeId, idempotencyKey },
          select: SELECT_AUTOMATION,
        });
        if (existente) return existente;
        throw new ConflictException('criação concorrente; recarregue e tente de novo');
      }
      throw err;
    }

    // Log sem a configuração: `quando`/`condicoes`/`entao` podem carregar valores de Campo (possível
    // PII), pelo mesmo critério que mantém `valores` fora da lista do Kanban (NFR-1/8/16).
    this.logger.info({ automationId: criada.id, pipeId, state: criada.state }, 'automação criada');

    return criada;
  }

  /**
   * Automações de um Pipe. Leitura exige apenas **algum** poder no Pipe — ler ≠ administrar (D4.3:
   * "Membro do Pipe: acesso somente leitura à configuração"). Sem acesso ⇒ **404 não-enumerante**.
   *
   * A lista **não devolve a configuração**, só o resumo. Mesmo critério do Kanban (2.9): o que pode
   * conter PII fica no detalhe, nunca na listagem.
   */
  async listar(pipeId: string): Promise<AutomationResumoVisao[]> {
    const { principal, db } = this.db();
    await resolverPoderNoPipe(db, principal, pipeId);

    return db.automation.findMany({
      where: { pipeId },
      select: SELECT_AUTOMATION_RESUMO,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Detalhe de uma Automação, com a configuração. Mesma regra de leitura da lista. */
  async obter(pipeId: string, automationId: string): Promise<AutomationVisao> {
    const { principal, db } = this.db();
    await resolverPoderNoPipe(db, principal, pipeId);

    // `findFirst` com o `pipeId` no filtro: uma Automação de OUTRO Pipe da mesma Organização não pode
    // ser lida pela rota deste Pipe (o poder foi resolvido para ESTE Pipe, não para aquele).
    const automacao = await db.automation.findFirst({
      where: { id: automationId, pipeId },
      select: SELECT_AUTOMATION,
    });
    if (!automacao) throw new NotFoundException();
    return automacao;
  }

  /**
   * Traduz a falha do núcleo puro em 400 sanitizado — motivo estrutural, sem eco do payload. Além da estrutura
   * (4.1), impõe o CATÁLOGO de Eventos (Story 4.3, CA1): `quando.tipo` fora do núcleo selecionável → 400; o
   * CATÁLOGO de Condições (Story 4.4): Condição de tipo/operador/valor fora do catálogo → 400; e o CATÁLOGO de
   * Ações (Story 4.5): Ação de tipo/refs/parâmetros/alvo fora do catálogo → 400 `ACAO_FORA_DO_CATALOGO`. O
   * enforcement vive AQUI, no serviço, e não no núcleo estrutural da 4.1 (que aceita qualquer texto por desenho)
   * — assim os catálogos evoluem sem tocar o contrato puro da 4.1.
   */
  private validar(config: {
    quando: unknown;
    condicoes?: unknown;
    entao: unknown;
  }): ConfiguracaoValidada {
    try {
      const validada = validarConfiguracao(config);
      exigirEventoNoCatalogo(validada.quando.tipo);
      exigirCondicoesNoCatalogo(validada.condicoes);
      exigirAcoesNoCatalogo(validada.entao);
      return validada;
    } catch (erro) {
      if (erro instanceof ConfiguracaoInvalidaError) {
        throw new BadRequestException({ motivo: 'CONFIGURACAO_INVALIDA', detalhe: erro.motivo });
      }
      if (erro instanceof EventoForaDoCatalogoError) {
        throw new BadRequestException({ motivo: 'EVENTO_FORA_DO_CATALOGO', detalhe: erro.motivo });
      }
      if (erro instanceof CondicaoForaDoCatalogoError) {
        throw new BadRequestException({
          motivo: 'CONDICAO_FORA_DO_CATALOGO',
          detalhe: erro.motivo,
        });
      }
      if (erro instanceof AcaoForaDoCatalogoError) {
        throw new BadRequestException({ motivo: 'ACAO_FORA_DO_CATALOGO', detalhe: erro.motivo });
      }
      throw erro;
    }
  }
}
