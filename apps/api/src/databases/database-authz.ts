import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DatabaseRole } from '../../generated/prisma';
import { withTenantContext } from '../kernel/db/tenant-context';

/**
 * Resolução do **poder efetivo por recurso** sobre um Database (DBT-AUTHZ-01, Story 3.2). Twin de
 * `pipe-authz.ts` (2.2), aplicado ao domínio DISTINTO de Database (RN-061) — nunca reutilizar a resolução
 * de Pipe.
 *
 * A guarda GROSSA continua no `AuthzGuard` (`@Requer('ler','Database')`, aberta a qualquer Membership ativa
 * na 3.2); esta guarda FINA vive no serviço, com o recurso carregado — **sem** tocar o mecanismo C3
 * (`ability.ts`/`authz.guard.ts`).
 *
 * **Não** aplica RLS: quem isola entre Organizações é o banco. Estas funções recebem um `db` já com contexto
 * (`withTenantContext`) e decidem apenas o poder DENTRO da Organização do contexto.
 */

/**
 * Poder efetivo do principal sobre um Database, do mais forte ao mais fraco: `gerenciar` (Admin da Org ou
 * Admin do Database — config: concede papéis, e schema em 3.3) > `operar` (Membro do Database — edita
 * Registros, poder diferencial em 3.4) > `ler` (Somente leitura). Quem `gerenciar` também pode `operar`/`ler`.
 */
export type Poder = 'gerenciar' | 'operar' | 'ler';

/** Só o que a decisão de poder consome do contexto: quem é o principal e seu papel de Organização. */
interface Principal {
  accountId: string;
  papel: string;
}

type DbComContexto = ReturnType<typeof withTenantContext>;

/**
 * Poder do principal sobre um Database, ou **404 não-enumerante** se não há acesso nenhum (indistinguível de
 * "não existe"). Admin da Org gerencia qualquer Database. Não-Admin: precisa de uma concessão `DatabaseGrant`
 * ACTIVE — `role = ADMIN` → gerencia; `role = MEMBER` → opera; `role = VIEWER` → só lê. **Lê `role`** e
 * **reconfere `Membership.state = ACTIVE`** (defesa em profundidade).
 *
 * O poder MEMBER (operar) e o diferencial sobre Registros ficam **dormentes** até 3.4 (não há Registro em
 * 3.2 — AD-11); aqui a resolução já os distingue para os consumidores futuros e para a autoridade de concessão.
 */
export async function resolverPoderNoDatabase(
  db: DbComContexto,
  principal: Principal,
  databaseId: string,
): Promise<Poder> {
  const database = await db.database.findUnique({
    where: { id: databaseId },
    select: { id: true },
  });
  if (!database) throw new NotFoundException();
  if (principal.papel === 'ADMIN') return 'gerenciar';
  const membership = await db.membership.findFirst({
    where: { accountId: principal.accountId },
    select: { id: true, state: true },
  });
  if (!membership || membership.state !== 'ACTIVE') throw new NotFoundException();
  const grant = await db.databaseGrant.findFirst({
    where: { databaseId, membershipId: membership.id, state: 'ACTIVE' },
    select: { role: true },
  });
  if (!grant) throw new NotFoundException();
  if (grant.role === 'ADMIN') return 'gerenciar';
  if (grant.role === 'MEMBER') return 'operar';
  return 'ler';
}

/** Exige poder de LER o Database; 404 não-enumerante se não há acesso. Devolve o poder resolvido. */
export async function exigirLerDatabase(
  db: DbComContexto,
  principal: Principal,
  databaseId: string,
): Promise<Poder> {
  return resolverPoderNoDatabase(db, principal, databaseId); // já lança 404 sem acesso (ler é o piso)
}

/**
 * Exige poder de **gerenciar** o Database (Admin da Org OU Admin do Database); 403 se o principal só pode
 * operar/ler (tem acesso, mas não é Admin do Database/Org). Sem acesso → 404 (não-enumerante). É o gate de
 * LISTAR concessões (o roster do Database).
 */
export async function exigirGerenciarDatabase(
  db: DbComContexto,
  principal: Principal,
  databaseId: string,
): Promise<void> {
  if ((await resolverPoderNoDatabase(db, principal, databaseId)) !== 'gerenciar') {
    throw new ForbiddenException();
  }
}

/**
 * Exige a **autoridade** para conceder/alterar/revogar um papel `roleAlvo` num Database (ajuste 2 / D3.4 §969,
 * §1086 — a regra distintiva da 3.2). A autoridade é HIERÁRQUICA:
 *   • **Admin da Org** (`principal.papel === 'ADMIN'`): concede/altera/revoga **qualquer** papel.
 *   • **Admin do Database** (poder `gerenciar` via `DatabaseGrant role=ADMIN`, e NÃO Admin da Org): concede/
 *     revoga **só** `MEMBER`/`VIEWER` — tentar `ADMIN` → **403** (somente Admin da Org toca `ADMIN` do Database).
 *   • **Membro/Somente-leitura do Database:** poder `operar`/`ler` → **403** (não gerencia concessões).
 *   • **Sem acesso ao Database:** **404** não-enumerante (herdado de `resolverPoderNoDatabase`).
 *
 * `roleAlvo` é o papel que a operação quer estabelecer/tocar (na alteração, o de destino; na revogação, o da
 * concessão-alvo — o chamador o carrega). Assim, alterar/revogar um `ADMIN` do Database também exige Admin da Org.
 */
export async function exigirConcederPapel(
  db: DbComContexto,
  principal: Principal,
  databaseId: string,
  roleAlvo: DatabaseRole,
): Promise<void> {
  // Admin da Org: autoridade total sobre qualquer papel (não precisa resolver o grant).
  if (principal.papel === 'ADMIN') {
    // Reconfere que o Database existe na Org do contexto (404 não-enumerante), sem revelar cross-tenant.
    const database = await db.database.findUnique({
      where: { id: databaseId },
      select: { id: true },
    });
    if (!database) throw new NotFoundException();
    return;
  }
  // Não-Admin: precisa ser Admin do Database (poder `gerenciar`) E o alvo não pode ser `ADMIN`.
  const poder = await resolverPoderNoDatabase(db, principal, databaseId); // 404 se sem acesso
  if (poder !== 'gerenciar') throw new ForbiddenException(); // Membro/Somente-leitura não concede
  if (roleAlvo === 'ADMIN') throw new ForbiddenException(); // só Admin da Org toca ADMIN do Database
}
