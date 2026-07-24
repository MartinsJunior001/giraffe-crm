import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import {
  DefinicaoInvalidaError,
  planejarArquivamento,
  podeEditarTemplate,
  validarConteudoTemplate,
  validarDefinicao,
  type EstadoTemplate,
  type VariavelDeclarada,
} from './template-definition.core';
import type { CriarTemplateDTO, NovaVersaoDTO } from './email-templates.dto';

type Db = ReturnType<typeof withTenantContext>;

/** O Template como sai pela API interna (`orgId` FORA da fronteira). */
export interface TemplateVisao {
  id: string;
  name: string;
  state: EstadoTemplate;
  activeVersion: number;
  createdByMembershipId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVersaoVisao {
  id: string;
  templateId: string;
  version: number;
  subject: string;
  body: string;
  variables: VariavelDeclarada[];
  authorMembershipId: string;
  createdAt: Date;
}

const SELECT_TEMPLATE = {
  id: true,
  name: true,
  state: true,
  activeVersion: true,
  createdByMembershipId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SELECT_VERSAO = {
  id: true,
  templateId: true,
  version: true,
  subject: true,
  body: true,
  variables: true,
  authorMembershipId: true,
  createdAt: true,
} as const;

function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Administração e versionamento de Templates de e-mail (Story 6.2). Twin de Form/FormVersion: editar =
 * publicar NOVA versão imutável numa tx interativa no client raiz (`definirContextoOrg` — padrão 2.6);
 * a imutabilidade da versão é do BANCO (GRANT só SELECT/INSERT). Arquivar/restaurar idempotentes
 * (no-op sem `updateMany` — sem falso `denied`); arquivado é somente-leitura (nova versão → 409).
 *
 * Autorização fina no serviço (C3 congelado): **administrar = Admin da Org** (403 senão); **consultar =
 * ADMIN/MEMBER** (GUEST 403) — Admin do Pipe NÃO administra (RF-1). Id invisível sob RLS → 404.
 */
@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  private exigirAdminOrg(contexto: ContextoOrganizacional): void {
    if (contexto.papel !== 'ADMIN') throw new ForbiddenException();
  }

  private exigirConsultar(contexto: ContextoOrganizacional): void {
    if (contexto.papel !== 'ADMIN' && contexto.papel !== 'MEMBER') throw new ForbiddenException();
  }

  private async membershipDoPrincipal(db: Db, contexto: ContextoOrganizacional): Promise<string> {
    const m = await db.membership.findFirst({
      where: { accountId: contexto.accountId, state: 'ACTIVE' },
      select: { id: true },
    });
    if (!m) throw new ForbiddenException();
    return m.id;
  }

  private async carregar(db: Db, templateId: string): Promise<TemplateVisao> {
    const t = await db.emailTemplate.findUnique({
      where: { id: templateId },
      select: SELECT_TEMPLATE,
    });
    if (!t) throw new NotFoundException(); // invisível sob RLS/inexistente — não-enumerante
    return t as TemplateVisao;
  }

  private valida400<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof DefinicaoInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** Auditoria manual (FR-214) das tx raiz (não passam pela extensão). Só metadados. */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId,
        orgId: contexto.orgId,
        action,
        resource,
        result: 'allowed',
        at: new Date().toISOString(),
      },
      'auditoria',
    );
  }

  // ─────────────────────────────────────────────────────────────── CRIAR ──

  async criar(dto: CriarTemplateDTO): Promise<TemplateVisao> {
    const { contexto, db } = this.db();
    this.exigirAdminOrg(contexto);
    const membershipId = await this.membershipDoPrincipal(db, contexto);

    const definicao = this.valida400(() => validarDefinicao(dto.variables));
    const conteudo = this.valida400(() =>
      validarConteudoTemplate(dto.name, dto.subject, dto.body, definicao),
    );

    const templateId = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        await tx.emailTemplate.create({
          data: {
            id: templateId,
            orgId: contexto.orgId,
            name: conteudo.name,
            activeVersion: 1,
            createdByMembershipId: membershipId,
          },
        });
        await tx.emailTemplateVersion.create({
          data: {
            orgId: contexto.orgId,
            templateId,
            version: 1,
            subject: conteudo.subject,
            body: conteudo.body,
            variables: definicao as unknown as object,
            authorMembershipId: membershipId,
          },
        });
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('conflito ao criar o Template; repita');
      throw err;
    }
    this.auditar(contexto, 'create', 'EmailTemplate');
    this.auditar(contexto, 'create', 'EmailTemplateVersion');
    const { db: db2 } = this.db();
    return this.carregar(db2, templateId);
  }

  // ──────────────────────────────────────────────────────────── NOVA VERSÃO ──

  async novaVersao(templateId: string, dto: NovaVersaoDTO): Promise<TemplateVersaoVisao> {
    const { contexto, db } = this.db();
    this.exigirAdminOrg(contexto);
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const atual = await this.carregar(db, templateId);
    if (!podeEditarTemplate(atual.state)) {
      throw new ConflictException({ motivo: 'TEMPLATE_ARQUIVADO' }); // restaurar → editar
    }

    const definicao = this.valida400(() => validarDefinicao(dto.variables));
    const conteudo = this.valida400(() =>
      validarConteudoTemplate(dto.name ?? atual.name, dto.subject, dto.body, definicao),
    );
    const proxima = atual.activeVersion + 1;

    let versaoId: string;
    try {
      versaoId = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const v = await tx.emailTemplateVersion.create({
          data: {
            orgId: contexto.orgId,
            templateId,
            version: proxima, // concorrência colide no UNIQUE (P2002 → 409)
            subject: conteudo.subject,
            body: conteudo.body,
            variables: definicao as unknown as object,
            authorMembershipId: membershipId,
          },
          select: { id: true },
        });
        // Guarda otimista do ponteiro: só avança se ninguém publicou no meio (defesa além do UNIQUE).
        const { count } = await tx.emailTemplate.updateMany({
          where: { id: templateId, state: 'ACTIVE', activeVersion: atual.activeVersion },
          data: { activeVersion: proxima, name: conteudo.name },
        });
        if (count === 0) throw new ConflictException({ motivo: 'EDICAO_CONCORRENTE' });
        return v.id;
      });
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      if (isConflito(err)) throw new ConflictException({ motivo: 'EDICAO_CONCORRENTE' }); // P2002/P2028 → 409, nunca 500
      throw err;
    }
    this.auditar(contexto, 'create', 'EmailTemplateVersion');
    const versao = await db.emailTemplateVersion.findUnique({
      where: { id: versaoId },
      select: SELECT_VERSAO,
    });
    return versao as unknown as TemplateVersaoVisao;
  }

  // ─────────────────────────────────────────────────────── ARQUIVAR/RESTAURAR ──

  async arquivar(templateId: string): Promise<TemplateVisao> {
    return this.transicao(templateId, 'arquivar');
  }

  async restaurar(templateId: string): Promise<TemplateVisao> {
    return this.transicao(templateId, 'restaurar');
  }

  private async transicao(
    templateId: string,
    acao: 'arquivar' | 'restaurar',
  ): Promise<TemplateVisao> {
    const { contexto, db } = this.db();
    this.exigirAdminOrg(contexto);
    const atual = await this.carregar(db, templateId);
    const plano = planejarArquivamento(atual.state, acao);
    if (plano.tipo === 'noop') return atual; // idempotente — sem updateMany (sem falso `denied`)

    const { count } = await db.emailTemplate.updateMany({
      where: { id: templateId, state: atual.state },
      data: { state: plano.alvo },
    });
    if (count === 0) {
      const depois = await this.carregar(db, templateId);
      if (depois.state === plano.alvo) return depois; // corrida para o MESMO alvo — idempotente
      throw new ConflictException({ motivo: 'TRANSICAO_CONCORRENTE' });
    }
    return this.carregar(db, templateId);
  }

  // ─────────────────────────────────────────────────────────────── LEITURA ──

  async listar(): Promise<TemplateVisao[]> {
    const { contexto, db } = this.db();
    this.exigirConsultar(contexto);
    const linhas = await db.emailTemplate.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SELECT_TEMPLATE,
    });
    return linhas as TemplateVisao[];
  }

  async obter(
    templateId: string,
  ): Promise<TemplateVisao & { versaoAtiva: TemplateVersaoVisao | null }> {
    const { contexto, db } = this.db();
    this.exigirConsultar(contexto);
    const t = await this.carregar(db, templateId);
    const versaoAtiva = await db.emailTemplateVersion.findFirst({
      where: { templateId, version: t.activeVersion },
      select: SELECT_VERSAO,
    });
    return { ...t, versaoAtiva: versaoAtiva as unknown as TemplateVersaoVisao | null };
  }

  async listarVersoes(templateId: string): Promise<TemplateVersaoVisao[]> {
    const { contexto, db } = this.db();
    this.exigirConsultar(contexto);
    await this.carregar(db, templateId); // 404 não-enumerante antes de listar
    const versoes = await db.emailTemplateVersion.findMany({
      where: { templateId },
      orderBy: { version: 'asc' },
      select: SELECT_VERSAO,
    });
    return versoes as unknown as TemplateVersaoVisao[];
  }
}
