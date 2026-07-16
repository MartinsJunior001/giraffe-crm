import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type DatabaseRole, Prisma } from '../../../generated/prisma';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { exigirConcederPapel, exigirGerenciarDatabase } from '../database-authz';

/**
 * O que uma concessão de Database expõe pela API interna. `orgId` NÃO sai (fronteira interna). O
 * `membershipId` sai — é o alvo que o Admin precisa para gerir o roster; é identificador interno, não PII
 * (não é e-mail nem nome da pessoa). Twin de `ConcessaoVisao` de Pipe, SEM as capacidades de Pipe.
 */
export interface ConcessaoDatabaseVisao {
  id: string;
  databaseId: string;
  membershipId: string;
  role: DatabaseRole;
  state: 'ACTIVE' | 'REVOKED';
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
}

/** Projeção fixa — mantém `orgId` fora do payload por construção. */
const SELECT_GRANT = {
  id: true,
  databaseId: true,
  membershipId: true,
  role: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  revokedAt: true,
} as const;

/**
 * Concessão de papel POR Database (Story 3.2). Twin estrutural de `PipeGrantsService` (2.2), domínio DISTINTO
 * (Database ≠ Pipe — RN-061). TODA query passa por `withTenantContext`: o isolamento entre Organizações é do
 * banco (RLS), não desta camada. A tabela liga a concessão a uma `Membership` (o vínculo Account×Org), nunca
 * à Account global; o `orgId` gravado vem do contexto do servidor (nunca do corpo) e o `WITH CHECK` reconfere.
 *
 * **Autoridade hierárquica** (a diferença real frente à 2.2, que era Admin-da-Org-only): quem concede é
 * resolvido em `exigirConcederPapel` (Admin da Org → qualquer papel; Admin do Database → só MEMBER/VIEWER; só
 * Admin da Org toca ADMIN do Database). **Teto da Org** (AD-9): um Convidado (GUEST) só recebe VIEWER.
 *
 * **No máximo um papel ATIVO por (Database, pessoa)** é imposto pelo BANCO (índice único parcial
 * `WHERE state='ACTIVE'`), não por leitura-antes-de-escrever — uma segunda concessão ativa colide no INSERT
 * (P2002) e vira 409, sem corrida.
 */
@Injectable()
export class DatabaseGrantsService {
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
   * Garante que a Membership alvo existe NA ORGANIZAÇÃO do contexto e está ATIVA, devolvendo o papel de Org
   * dela (para o teto). Conceder papel a uma Membership de outra Org (id adivinhado) é barrado aqui — a RLS de
   * `Membership` a torna invisível — e conceder a uma suspensa/removida não faz sentido. 400 (o cliente mandou
   * um alvo inválido), não 404: o recurso da rota é o Database (que existe); o corpo é que está errado.
   */
  private async exigirMembershipAlvoAtiva(
    db: ReturnType<typeof withTenantContext>,
    membershipId: string,
  ): Promise<{ role: string }> {
    const m = await db.membership.findUnique({
      where: { id: membershipId },
      select: { role: true, state: true },
    });
    if (!m || m.state !== 'ACTIVE') {
      throw new BadRequestException('membershipId não é uma Membership ativa desta Organização');
    }
    return { role: m.role };
  }

  /**
   * Teto da Org (AD-9 / D3.4 §970): um Convidado (Membership `role = GUEST`) só recebe `VIEWER`. Papel de
   * Database nunca supera o da Organização. Papel incompatível com o alvo → **400** (corpo inválido para o alvo).
   */
  private aplicarTetoDaOrg(orgRoleAlvo: string, roleDatabase: DatabaseRole): void {
    if (orgRoleAlvo === 'GUEST' && roleDatabase !== 'VIEWER') {
      throw new BadRequestException(
        'um Convidado só pode receber Somente leitura (VIEWER) em Database',
      );
    }
  }

  /**
   * Concede um papel a uma Membership num Database. Ordem: autoridade (`exigirConcederPapel` — 404 sem acesso
   * ao Database, 403 sem autoridade para o papel) → alvo ativo da Org (400) → teto da Org (400) → `create`
   * (P2002 do índice único parcial → 409). O `orgId` vem do contexto, nunca do corpo.
   */
  async conceder(
    databaseId: string,
    membershipId: string,
    role: DatabaseRole,
  ): Promise<ConcessaoDatabaseVisao> {
    const { contexto, principal, db } = this.db();
    await exigirConcederPapel(db, principal, databaseId, role); // 404 sem acesso / 403 sem autoridade
    const alvo = await this.exigirMembershipAlvoAtiva(db, membershipId);
    this.aplicarTetoDaOrg(alvo.role, role);
    try {
      return await db.databaseGrant.create({
        data: { orgId: contexto.orgId, databaseId, membershipId, role },
        select: SELECT_GRANT,
      });
    } catch (e) {
      // Índice único parcial (databaseId, membershipId) WHERE state='ACTIVE' — segunda concessão ativa ao
      // mesmo par. É o "no máximo um papel efetivo por Database" (AC5), imposto pelo banco. Alterar o papel
      // existente é o PATCH, não um novo POST.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'já existe uma concessão ativa para esta pessoa neste Database',
        );
      }
      throw e;
    }
  }

  /** Lista as concessões ATIVAS de um Database (o roster). Exige GERENCIAR (Admin da Org ou Admin do Database). */
  async listar(databaseId: string): Promise<ConcessaoDatabaseVisao[]> {
    const { principal, db } = this.db();
    await exigirGerenciarDatabase(db, principal, databaseId); // 404 sem acesso / 403 se só opera/lê
    return db.databaseGrant.findMany({
      where: { databaseId, state: 'ACTIVE' },
      select: SELECT_GRANT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Exige uma concessão ATIVA daquele Database, na Org do contexto — ou 404 uniforme. É uma LEITURA
   * (`findUnique`, não auditada) feita ANTES do `updateMany`, para que os casos "não existe / outra Org
   * (RLS→null) / outro Database / já revogada" respondam 404 **sem** emitir um `updateMany` com `{ count: 0 }`
   * (que a auditoria classificaria como falso `denied`). Devolve `role` e `membershipId` (o chamador precisa
   * do papel corrente para a autoridade e do alvo para o teto).
   */
  private async exigirConcessaoAtivaDoDatabase(
    db: ReturnType<typeof withTenantContext>,
    databaseId: string,
    grantId: string,
  ): Promise<{ role: DatabaseRole; membershipId: string }> {
    const grant = await db.databaseGrant.findUnique({
      where: { id: grantId },
      select: { databaseId: true, state: true, role: true, membershipId: true },
    });
    if (!grant || grant.databaseId !== databaseId || grant.state !== 'ACTIVE') {
      throw new NotFoundException();
    }
    return { role: grant.role, membershipId: grant.membershipId };
  }

  /**
   * Altera uma concessão ATIVA. Autoridade dupla: sobre o papel CORRENTE (alterar um `ADMIN` do Database exige
   * Admin da Org) E sobre o papel de DESTINO (elevar para `ADMIN` exige Admin da Org). Teto da Org sobre o alvo.
   * 404 (não-enumerante) se não existe, é de outro Database ou já revogada.
   */
  async alterarPapel(
    databaseId: string,
    grantId: string,
    role: DatabaseRole,
  ): Promise<ConcessaoDatabaseVisao> {
    const { principal, db } = this.db();
    const atual = await this.exigirConcessaoAtivaDoDatabase(db, databaseId, grantId);
    await exigirConcederPapel(db, principal, databaseId, atual.role); // autoridade sobre o papel corrente
    await exigirConcederPapel(db, principal, databaseId, role); // autoridade sobre o papel de destino
    const alvo = await this.exigirMembershipAlvoAtiva(db, atual.membershipId);
    this.aplicarTetoDaOrg(alvo.role, role);
    const { count } = await db.databaseGrant.updateMany({
      where: { id: grantId, databaseId, state: 'ACTIVE' },
      data: { role },
    });
    // A guarda acima e o `updateMany` são transações separadas (`withTenantContext` recusa `$transaction`).
    // Se uma revogação concorrente entrar nessa janela, o `updateMany` casa 0 linhas: honramos com 404 em vez
    // de devolver um corpo re-lido enganoso (200 sobre uma concessão que já não está mais ativa).
    if (count === 0) throw new NotFoundException();
    const grant = await db.databaseGrant.findUnique({
      where: { id: grantId },
      select: SELECT_GRANT,
    });
    if (!grant) throw new NotFoundException();
    return grant;
  }

  /**
   * Revoga uma concessão (soft-delete: `state = REVOKED`, `revokedAt = now`). NUNCA apaga (o runtime nem tem
   * GRANT de DELETE) — preserva a trilha (autoria/Histórico anteriores). Autoridade sobre o papel da
   * concessão-alvo (revogar um `ADMIN` do Database exige Admin da Org). Revogar uma já revogada (ou
   * inexistente/de outro Database) é 404 — sem gerar falso `denied` de auditoria.
   */
  async revogar(databaseId: string, grantId: string): Promise<ConcessaoDatabaseVisao> {
    const { principal, db } = this.db();
    const atual = await this.exigirConcessaoAtivaDoDatabase(db, databaseId, grantId);
    await exigirConcederPapel(db, principal, databaseId, atual.role); // autoridade sobre o papel revogado
    const { count } = await db.databaseGrant.updateMany({
      where: { id: grantId, databaseId, state: 'ACTIVE' },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });
    // Mesma janela de `alterarPapel`: uma revogação concorrente que vença a corrida deixa este `updateMany`
    // com 0 linhas. 404 é a resposta honesta — a concessão já não estava mais ativa para esta operação revogar.
    if (count === 0) throw new NotFoundException();
    const grant = await db.databaseGrant.findUnique({
      where: { id: grantId },
      select: SELECT_GRANT,
    });
    if (!grant) throw new NotFoundException();
    return grant;
  }
}
