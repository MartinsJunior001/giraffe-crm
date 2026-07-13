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
   * Catálogo da Organização. Por padrão só os ACTIVE; `incluirArquivados` traz também os ARCHIVED.
   * A RLS já limita ao `orgId` do contexto — o filtro por estado é de apresentação, não de isolamento.
   */
  async listar(incluirArquivados: boolean): Promise<PipeVisao[]> {
    const { db } = this.db();
    return db.pipe.findMany({
      where: incluirArquivados ? {} : { state: 'ACTIVE' },
      select: SELECT_PIPE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Um Pipe da Organização do contexto. 404 sanitizado se não existe OU pertence a outra Org (RLS). */
  async obter(id: string): Promise<PipeVisao> {
    const { db } = this.db();
    const pipe = await db.pipe.findUnique({ where: { id }, select: SELECT_PIPE });
    // Fora do escopo da Org, a RLS filtra e o findUnique devolve null — indistinguível de "não existe".
    // É deliberado: não se revela a existência de um Pipe de outra Organização (não-enumeração).
    if (!pipe) throw new NotFoundException();
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
   * e não reescreve `archivedAt` (o `where` exige `state: ACTIVE`; sem linha ⇒ já estava arquivado).
   * Preserva todos os dados — só muda estado. NUNCA apaga (o runtime nem tem GRANT de DELETE).
   */
  async arquivar(id: string): Promise<PipeVisao> {
    const { db } = this.db();
    // Distingue "não existe / outra Org" de "já arquivado": só o primeiro é 404.
    await this.obter(id);
    await db.pipe.updateMany({
      where: { id, state: 'ACTIVE' },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    return this.obter(id);
  }

  /** Restaura (ARCHIVED → ACTIVE, `archivedAt = null`). Idempotente e sem perda de dados. */
  async restaurar(id: string): Promise<PipeVisao> {
    const { db } = this.db();
    await this.obter(id);
    await db.pipe.updateMany({
      where: { id, state: 'ARCHIVED' },
      data: { state: 'ACTIVE', archivedAt: null },
    });
    return this.obter(id);
  }
}
