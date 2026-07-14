import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirGerenciarPipe } from '../pipe-authz';

/** Estado do acesso público de um Formulário inicial. `publicId` só quando há rota ativa. */
export interface EstadoPublico {
  publicEnabled: boolean;
  publicMode: 'TRIAGE' | 'DIRECT';
  publicId: string | null;
}

/** Gera um `publicId` opaco e aleatório (base64url, 32 chars) — não deriva de orgId/formId. */
function novoPublicId(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Configuração do acesso PÚBLICO de um Formulário inicial (Story 2.8) — é **config do Pipe** (como publicar):
 * exige `gerenciar` (Admin da Org / Admin do Pipe). Habilitar liga `Form.publicEnabled`/`publicMode` e cria uma
 * `PublicFormRoute` (URL opaca); revogar desliga e invalida a rota; rotacionar troca o `publicId`. A
 * `PublicFormRoute` é global/sem RLS, mas TODA operação é escopada pelo `Form` relido sob RLS (o `formId` é do
 * tenant do contexto) — nunca por parâmetro do cliente.
 */
@Injectable()
export class PublicConfigService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: ReturnType<typeof withTenantContext> } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Habilita o acesso público e devolve o `publicId`. Idempotente: reusa a rota ativa, atualiza o modo. */
  async habilitar(pipeId: string, mode: 'TRIAGE' | 'DIRECT'): Promise<EstadoPublico> {
    const { contexto, db } = this.ctx();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);

    await db.form.updateMany({
      where: { id: form.id },
      data: { publicEnabled: true, publicMode: mode },
    });

    let rota = await db.publicFormRoute.findFirst({
      where: { formId: form.id, active: true },
      select: { publicId: true },
    });
    if (!rota) {
      rota = await db.publicFormRoute.create({
        data: { orgId: contexto.orgId, formId: form.id, publicId: novoPublicId() },
        select: { publicId: true },
      });
    }
    return { publicEnabled: true, publicMode: mode, publicId: rota.publicId };
  }

  /** Revoga o acesso público: desliga o opt-in e invalida a(s) rota(s) ativa(s). Idempotente. */
  async revogar(pipeId: string): Promise<EstadoPublico> {
    const { contexto, db } = this.ctx();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);

    await db.form.updateMany({ where: { id: form.id }, data: { publicEnabled: false } });
    await db.publicFormRoute.updateMany({
      where: { formId: form.id, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    return this.montarEstado(db, form.id);
  }

  /** Rotaciona o identificador público: invalida o atual e cria um novo `publicId` (opt-in permanece). */
  async rotacionar(pipeId: string): Promise<EstadoPublico> {
    const { contexto, db } = this.ctx();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);

    await db.publicFormRoute.updateMany({
      where: { formId: form.id, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    await db.publicFormRoute.create({
      data: { orgId: contexto.orgId, formId: form.id, publicId: novoPublicId() },
    });
    return this.montarEstado(db, form.id);
  }

  /** Estado atual do acesso público. */
  async estado(pipeId: string): Promise<EstadoPublico> {
    const { contexto, db } = this.ctx();
    await exigirGerenciarPipe(db, contexto, pipeId);
    const form = await this.formInicial(db, pipeId);
    return this.montarEstado(db, form.id);
  }

  private async montarEstado(
    db: ReturnType<typeof withTenantContext>,
    formId: string,
  ): Promise<EstadoPublico> {
    const form = await db.form.findFirst({
      where: { id: formId },
      select: { publicEnabled: true, publicMode: true },
    });
    const rota = await db.publicFormRoute.findFirst({
      where: { formId, active: true },
      select: { publicId: true },
    });
    return {
      publicEnabled: form?.publicEnabled ?? false,
      publicMode: form?.publicMode ?? 'TRIAGE',
      publicId: rota?.publicId ?? null,
    };
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
