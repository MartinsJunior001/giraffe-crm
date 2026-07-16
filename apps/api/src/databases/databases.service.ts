import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';
import { resolverPoderNoDatabase } from './database-authz';
import {
  planejarArquivamento,
  planejarRestauracao,
  podeEditarDatabase,
} from './database-lifecycle';

/**
 * O que um Database expõe pela API interna. Sem campo "de brinde": exatamente os atributos do catálogo
 * (id, nome, estado, timestamps). `orgId` NÃO sai — é fronteira interna, não dado de apresentação, e
 * quem lê já está no escopo da própria Organização.
 */
export interface DatabaseVisao {
  id: string;
  name: string;
  state: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/** Campos projetados em toda leitura/escrita — mantém `orgId` fora do payload por construção. */
const SELECT_DATABASE = {
  id: true,
  name: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

/**
 * Ciclo de vida e catálogo de Databases (Story 3.1). Twin estrutural de `PipesService`, entidade
 * DISTINTA (Database ≠ Pipe — RN-061). TODA query passa por `withTenantContext`: o isolamento entre
 * Organizações é do banco (RLS), não desta camada — não há um único `where orgId` manual. O `orgId`
 * ativo vem do contexto resolvido no servidor (nunca do cliente).
 *
 * Autorização em 3.1: **só o Admin da Org** alcança estas operações (guard + CASL — `ler`/`administrar`
 * Database concedidos apenas ao ADMIN; MEMBER/GUEST → 403). Por isso não há aqui a lógica de concessão
 * fina de `PipesService` (papéis por Database são a 3.2): o Admin vê e administra TODOS os Databases da
 * própria Org.
 *
 * `withTenantContext` recusa `$transaction`; todas as operações abaixo são single-statement.
 */
@Injectable()
export class DatabasesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  /** Client já amarrado ao contexto da Organização ativa. `obter()` LANÇA se não houver contexto. */
  private db() {
    const contexto = this.requestContext.obter();
    return {
      contexto,
      principal: { accountId: contexto.accountId, papel: contexto.papel },
      db: withTenantContext(this.prisma, contexto, this.logger),
    };
  }

  /** Cria um Database ACTIVE na Organização do contexto. O `orgId` vem do servidor, nunca do corpo. */
  async criar(name: string): Promise<DatabaseVisao> {
    const { contexto, db } = this.db();
    return db.database.create({
      data: { orgId: contexto.orgId, name },
      select: SELECT_DATABASE,
    });
  }

  /**
   * Catálogo da Org atual. **Acesso fino por concessão (Story 3.2):** o **Admin da Org** vê TODOS os
   * Databases da própria Org; um **não-Admin** vê **apenas** os Databases com uma `DatabaseGrant` ACTIVE
   * para a própria Membership — os não concedidos simplesmente **não aparecem** (não-enumerante; sem revelar
   * o que não lhe foi concedido). Por padrão só os ACTIVE; `incluirArquivados` traz também os ARCHIVED.
   * Nunca lista de outra Org (RLS).
   */
  async listar(incluirArquivados: boolean): Promise<DatabaseVisao[]> {
    const { contexto, db } = this.db();
    const filtroEstado = incluirArquivados ? {} : { state: 'ACTIVE' as const };
    if (contexto.papel === 'ADMIN') {
      return db.database.findMany({
        where: filtroEstado,
        select: SELECT_DATABASE,
        orderBy: { createdAt: 'asc' },
      });
    }
    // Não-Admin: filtra pela concessão ACTIVE da própria Membership. Sem Membership ativa (defesa em
    // profundidade — o contexto já exige uma) ou sem concessão nenhuma → lista vazia, nunca a da Org toda.
    const membership = await db.membership.findFirst({
      where: { accountId: contexto.accountId },
      select: { id: true, state: true },
    });
    if (!membership || membership.state !== 'ACTIVE') return [];
    return db.database.findMany({
      where: {
        ...filtroEstado,
        grants: { some: { membershipId: membership.id, state: 'ACTIVE' } },
      },
      select: SELECT_DATABASE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Um Database do contexto. **Acesso fino por concessão (Story 3.2):** o Admin da Org obtém qualquer
   * Database da própria Org; um não-Admin só obtém um Database com concessão ACTIVE — sem concessão
   * (ou inexistente/de outra Org) → **404 não-enumerante** (mesma resposta, para não revelar a existência).
   * `resolverPoderNoDatabase` faz exatamente essa resolução (Admin → gerenciar; não-Admin → papel da
   * concessão ou 404). O ciclo de vida (renomear/arquivar/restaurar) chama `obter` já sob `administrar`
   * (Admin da Org), para quem a resolução devolve `gerenciar` sem 404 — comportamento da 3.1 preservado.
   */
  async obter(id: string): Promise<DatabaseVisao> {
    const { principal, db } = this.db();
    await resolverPoderNoDatabase(db, principal, id); // 404 não-enumerante se inexistente/cross-tenant/sem concessão
    const database = await db.database.findUnique({ where: { id }, select: SELECT_DATABASE });
    if (!database) throw new NotFoundException();
    return database;
  }

  /**
   * Renomeia um Database. **SOMENTE-LEITURA INTEGRAL (D1):** um Database `ARCHIVED` NÃO pode ser
   * renomeado → **409** (`{ motivo: 'DATABASE_ARQUIVADO' }`). Para renomear um arquivado, o fluxo é
   * restaurar → renomear → arquivar novamente. O `updateMany` filtra também por `state: 'ACTIVE'`:
   * defesa em profundidade contra corrida (arquivar entre o `obter` e o `update`).
   */
  async renomear(id: string, name: string): Promise<DatabaseVisao> {
    const { db } = this.db();
    const atual = await this.obter(id); // 404 se inexistente/cross-tenant
    if (!podeEditarDatabase(atual.state)) {
      throw new ConflictException({ motivo: 'DATABASE_ARQUIVADO' });
    }
    const { count } = await db.database.updateMany({
      where: { id, state: 'ACTIVE' },
      data: { name },
    });
    // count 0 só se arquivou numa corrida entre o obter e o update: reflete o estado real (409).
    if (count === 0) throw new ConflictException({ motivo: 'DATABASE_ARQUIVADO' });
    return this.obter(id);
  }

  /**
   * Arquiva (ACTIVE → ARCHIVED, `archivedAt = now`). Idempotente: arquivar um já arquivado não é erro e
   * não reescreve `archivedAt`. Preserva todos os dados — só muda estado; NUNCA apaga (runtime sem
   * GRANT de DELETE). **Não bloqueado** por dados dependentes (inexistentes em 3.1; contrato futuro).
   *
   * No caminho idempotente retorna SEM emitir o `updateMany`: um `updateMany` de 0 linhas seria
   * classificado como tentativa filtrada por RLS (`count: 0`) e sujaria a auditoria com um falso `denied`.
   */
  async arquivar(id: string): Promise<DatabaseVisao> {
    const { db } = this.db();
    const atual = await this.obter(id);
    const plano = planejarArquivamento(atual.state, new Date());
    if (!plano.aplicar) return atual;
    await db.database.updateMany({
      where: { id, state: 'ACTIVE' },
      data: { state: plano.novoState, archivedAt: plano.archivedAt },
    });
    return this.obter(id);
  }

  /**
   * Restaura (ARCHIVED → ACTIVE, `archivedAt = null`), PRESERVANDO identidade e referências (não toca
   * `id`/`name`). Idempotente e sem perda de dados. Como em `arquivar`, o caminho idempotente retorna
   * sem emitir o `updateMany`, para não gerar um falso `denied` de auditoria a partir de `count: 0`.
   */
  async restaurar(id: string): Promise<DatabaseVisao> {
    const { db } = this.db();
    const atual = await this.obter(id);
    const plano = planejarRestauracao(atual.state);
    if (!plano.aplicar) return atual;
    await db.database.updateMany({
      where: { id, state: 'ARCHIVED' },
      data: { state: plano.novoState, archivedAt: plano.archivedAt },
    });
    return this.obter(id);
  }
}
