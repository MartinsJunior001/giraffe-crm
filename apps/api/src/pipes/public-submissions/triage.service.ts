import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirRevisarSubmissoesPublicas } from '../pipe-authz';
import { converterSubmissaoEmCard } from './converter-submissao';

/** O que uma submissão pendente expõe na triagem (o revisor autorizado vê os `valores` para decidir). */
export interface SubmissaoPendenteVisao {
  id: string;
  formVersionId: string;
  valores: Prisma.JsonValue;
  createdAt: Date;
}

/**
 * Triagem das submissões públicas (Story 2.8) — superfície AUTENTICADA. Reusa a resolução de autorização fina:
 * exige a capacidade **"Revisar submissões públicas"** (`exigirRevisarSubmissoesPublicas`) — Admin da Org
 * implícito; demais só por concessão explícita; sem acesso → 404, sem a capacidade → 403.
 *
 * **Aprovar** cria exatamente 1 Card (origem `PUBLIC`) na 1ª Fase ativa e marca a submissão `CONVERTED` na MESMA
 * transação, idempotente (uma convertida não reconverte → 409, nunca 2 Cards). **Rejeitar** marca `REJECTED`
 * sem criar Card (preserva — LGPD). As submissões são do **Formulário inicial** do Pipe.
 */
@Injectable()
export class TriageService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: ReturnType<typeof withTenantContext> } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Fila de submissões PENDING do Formulário inicial do Pipe. */
  async listarPendentes(pipeId: string): Promise<SubmissaoPendenteVisao[]> {
    const { contexto, db } = this.ctx();
    await exigirRevisarSubmissoesPublicas(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);
    return db.submissaoPublica.findMany({
      where: { formId: form.id, state: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, formVersionId: true, valores: true, createdAt: true },
    });
  }

  /** Aprova: cria 1 Card na 1ª Fase ativa e marca CONVERTED (atômico, idempotente). */
  async aprovar(pipeId: string, submissaoId: string): Promise<{ ok: true; cardId: string }> {
    const { contexto, db } = this.ctx();
    await exigirRevisarSubmissoesPublicas(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);

    const submissao = await db.submissaoPublica.findFirst({
      where: { id: submissaoId, formId: form.id },
      select: { id: true, state: true, formVersionId: true, valores: true },
    });
    if (!submissao) throw new NotFoundException();
    if (submissao.state !== 'PENDING') throw new ConflictException('submissão já decidida');

    const fase = await db.phase.findFirst({
      where: { pipeId, state: 'ACTIVE' },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!fase) throw new ConflictException('o Pipe não tem Fase ativa');

    // Os `valores` do Card são os já validados e congelados na submissão (contra a versão publicada no ato).
    const valores =
      submissao.valores &&
      typeof submissao.valores === 'object' &&
      !Array.isArray(submissao.valores)
        ? (submissao.valores as Record<string, unknown>)
        : {};

    const { cardId } = await converterSubmissaoEmCard(
      this.prisma,
      contexto,
      {
        submissaoId: submissao.id,
        formId: form.id,
        formVersionId: submissao.formVersionId,
        pipeId,
        phaseId: fase.id,
        valores,
      },
      this.logger,
    );
    return { ok: true, cardId };
  }

  /** Rejeita: marca REJECTED sem criar Card (preserva). Idempotente por guarda de estado. */
  async rejeitar(pipeId: string, submissaoId: string): Promise<{ ok: true }> {
    const { contexto, db } = this.ctx();
    await exigirRevisarSubmissoesPublicas(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);

    const existe = await db.submissaoPublica.findFirst({
      where: { id: submissaoId, formId: form.id },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException();

    const marcada = await db.submissaoPublica.updateMany({
      where: { id: submissaoId, formId: form.id, state: 'PENDING' },
      data: { state: 'REJECTED', decidedBy: contexto.accountId ?? null, decidedAt: new Date() },
    });
    if (marcada.count === 0) throw new ConflictException('submissão já decidida');
    return { ok: true };
  }

  /** Formulário inicial do Pipe (404 se não materializado). */
  private async formInicial(
    db: ReturnType<typeof withTenantContext>,
    pipeId: string,
  ): Promise<{ id: string }> {
    const form = await db.form.findFirst({
      where: { context: 'PIPE_INITIAL', pipeId },
      select: { id: true },
    });
    if (!form) throw new NotFoundException();
    return form;
  }
}
