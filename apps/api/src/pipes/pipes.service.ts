import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';

/**
 * O que um Pipe expõe pela API interna. Sem campo "de brinde": exatamente os atributos do catálogo
 * (id, nome, estado, marcadores e timestamps). `orgId` NÃO sai — é fronteira interna, não dado de
 * apresentação, e quem lê já está no escopo da própria Organização.
 */
export interface PipeVisao {
  id: string;
  name: string;
  state: 'ACTIVE' | 'ARCHIVED';
  locked: boolean;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/** Campos projetados em toda leitura/escrita — mantém `orgId` fora do payload por construção. */
const SELECT_PIPE = {
  id: true,
  name: true,
  state: true,
  locked: true,
  starred: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

/** Alterações parciais de um Pipe existente (renomear e/ou alternar marcadores). */
export interface AtualizacaoPipe {
  name?: string;
  locked?: boolean;
  starred?: boolean;
}

/**
 * Ciclo de vida e catálogo de Pipes (Story 2.1). TODA query passa por `withTenantContext`: o
 * isolamento entre Organizações é do banco (RLS), não desta camada — aqui não há nenhum `where orgId`
 * manual que pudesse ser esquecido. O `orgId` da Organização ativa vem do contexto resolvido no
 * servidor (nunca do cliente) e alimenta tanto o `set_config` da RLS quanto o `orgId` gravado no
 * INSERT (que o `WITH CHECK` da policy reconfere).
 *
 * `withTenantContext` recusa `$transaction`; todas as operações abaixo são single-statement, então
 * não há necessidade — nem tentativa — de transação multi-statement.
 */
@Injectable()
export class PipesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  /** Client já amarrado ao contexto da Organização ativa. `obter()` LANÇA se não houver contexto. */
  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Cria um Pipe ACTIVE na Organização do contexto. O `orgId` vem do servidor, nunca do corpo. */
  async criar(name: string): Promise<PipeVisao> {
    const { contexto, db } = this.db();
    return db.pipe.create({
      data: { orgId: contexto.orgId, name },
      select: SELECT_PIPE,
    });
  }

  /**
   * Membership da conta ativa NA ORG do contexto — a chave para resolver as concessões por Pipe. A RLS de
   * `Membership` já escopa à Org; há no máximo uma Membership por (conta, Org). `null` só se, por
   * regressão, não houver Membership (o contexto não teria nascido) — tratado como "sem acesso".
   */
  private async membershipIdAtual(
    db: ReturnType<typeof withTenantContext>,
    accountId: string,
  ): Promise<string | null> {
    const m = await db.membership.findFirst({ where: { accountId }, select: { id: true } });
    return m?.id ?? null;
  }

  /**
   * Catálogo. **Admin da Org vê TODOS os Pipes** (AC3/SC-224). Não-Admin (MEMBER/GUEST) vê **apenas os
   * Pipes com concessão `PipeGrant` ACTIVE** para a própria Membership (SC-221/SC-227) — a guarda FINA por
   * recurso, aqui no serviço, não no guard. Por padrão só os ACTIVE; `incluirArquivados` traz os ARCHIVED.
   */
  async listar(incluirArquivados: boolean): Promise<PipeVisao[]> {
    const { contexto, db } = this.db();
    const filtroEstado = incluirArquivados ? {} : { state: 'ACTIVE' as const };
    if (contexto.papel === 'ADMIN') {
      return db.pipe.findMany({
        where: filtroEstado,
        select: SELECT_PIPE,
        orderBy: { createdAt: 'asc' },
      });
    }
    const membershipId = await this.membershipIdAtual(db, contexto.accountId);
    if (!membershipId) return [];
    const grants = await db.pipeGrant.findMany({
      where: { membershipId, state: 'ACTIVE' },
      select: { pipeId: true },
    });
    const pipeIds = grants.map((g) => g.pipeId);
    if (pipeIds.length === 0) return [];
    return db.pipe.findMany({
      where: { id: { in: pipeIds }, ...filtroEstado },
      select: SELECT_PIPE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Um Pipe do contexto. 404 se não existe OU é de outra Org (RLS). Para **não-Admin**, também 404 se não
   * houver concessão ACTIVE para este Pipe (SC-221/SC-225) — mesma resposta de "não existe", para não
   * revelar a existência de um Pipe ao qual a pessoa não tem acesso (não-enumeração). **Admin da Org**
   * acessa qualquer Pipe da Org sem concessão (SC-224).
   */
  async obter(id: string): Promise<PipeVisao> {
    const { contexto, db } = this.db();
    const pipe = await db.pipe.findUnique({ where: { id }, select: SELECT_PIPE });
    if (!pipe) throw new NotFoundException();
    if (contexto.papel === 'ADMIN') return pipe;
    const membershipId = await this.membershipIdAtual(db, contexto.accountId);
    const grant = membershipId
      ? await db.pipeGrant.findFirst({
          where: { pipeId: id, membershipId, state: 'ACTIVE' },
          select: { id: true },
        })
      : null;
    if (!grant) throw new NotFoundException();
    return pipe;
  }

  /**
   * Renomeia e/ou alterna `locked`/`starred`. `updateMany` com `where: { id }` (e não `update`) para
   * que a filtragem da RLS resulte em `{ count: 0 }` — traduzido aqui em 404 — em vez de vazar a
   * existência de um Pipe de outra Org por um erro distinto. Só os campos presentes são tocados.
   */
  async atualizar(id: string, alteracao: AtualizacaoPipe): Promise<PipeVisao> {
    const { db } = this.db();
    const { count } = await db.pipe.updateMany({ where: { id }, data: alteracao });
    if (count === 0) throw new NotFoundException();
    return this.obter(id);
  }

  /**
   * Arquiva (ACTIVE → ARCHIVED, `archivedAt = now`). Idempotente: arquivar um já arquivado não é erro
   * e não reescreve `archivedAt`. Preserva todos os dados — só muda estado. NUNCA apaga (o runtime nem
   * tem GRANT de DELETE).
   *
   * O `obter()` inicial distingue "não existe / outra Org" (404) de "já no estado-alvo". No caminho
   * idempotente, retorna SEM emitir o `updateMany`: um `updateMany` que casasse 0 linhas seria
   * classificado como tentativa filtrada por RLS (`{ count: 0 }`) e sujaria a trilha de auditoria com um
   * falso `denied` — e aqui a idempotência é caminho feliz de primeira classe, não sinal de ataque.
   */
  async arquivar(id: string): Promise<PipeVisao> {
    const { db } = this.db();
    const pipe = await this.obter(id);
    if (pipe.state === 'ARCHIVED') return pipe;
    await db.pipe.updateMany({
      where: { id, state: 'ACTIVE' },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    return this.obter(id);
  }

  /**
   * Restaura (ARCHIVED → ACTIVE, `archivedAt = null`). Idempotente e sem perda de dados. Como em
   * `arquivar`, o caminho idempotente retorna sem emitir o `updateMany`, para não gerar um falso
   * `denied` de auditoria a partir de `{ count: 0 }`.
   */
  async restaurar(id: string): Promise<PipeVisao> {
    const { db } = this.db();
    const pipe = await this.obter(id);
    if (pipe.state === 'ACTIVE') return pipe;
    await db.pipe.updateMany({
      where: { id, state: 'ARCHIVED' },
      data: { state: 'ACTIVE', archivedAt: null },
    });
    return this.obter(id);
  }
}
