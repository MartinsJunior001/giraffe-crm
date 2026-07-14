import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '../kernel/db/tenant-context';

/**
 * Resolução do **poder efetivo por recurso** sobre um Pipe (DBT-AUTHZ-01), compartilhada entre as
 * superfícies que tratam "config do Pipe": Fases (Story 2.3) e Formulários (Story 2.4).
 *
 * Extraída do `PhasesService` na 2.4 para que a MESMA regra fina não seja copiada em dois serviços e passe a
 * divergir. A guarda GROSSA continua no `AuthzGuard` (`@Requer('ler','Pipe')`); esta guarda FINA vive no
 * serviço, com o recurso carregado — **sem** tocar o mecanismo C3 (`ability.ts`/`authz.guard.ts`).
 *
 * **Não** aplica RLS: quem isola entre Organizações é o banco. Estas funções recebem um `db` já com contexto
 * (`withTenantContext`) e decidem apenas o poder DENTRO da Organização do contexto.
 */

/** Poder efetivo do principal sobre a config de um Pipe. `ler` também é concedido a quem `gerenciar`. */
export type Poder = 'gerenciar' | 'ler';

/** Só o que a decisão de poder consome do contexto: quem é o principal e seu papel de Organização. */
interface Principal {
  accountId: string;
  papel: string;
}

type DbComContexto = ReturnType<typeof withTenantContext>;

/**
 * Poder do principal sobre a config do Pipe, ou **404 não-enumerante** se não há acesso nenhum (indistinguível
 * de "não existe"). Admin da Org gerencia qualquer Pipe. Não-Admin: precisa de uma concessão `PipeGrant`
 * ACTIVE — `role = ADMIN` → gerencia; qualquer outro papel → só lê. **Lê `role`** e **reconfere
 * `Membership.state = ACTIVE`** (fecha DBT-2.2-ROLE-DORMENTE e, para estas superfícies, DBT-2.2-MEMBERSHIP-
 * ADVISORY).
 */
export async function resolverPoderNoPipe(
  db: DbComContexto,
  principal: Principal,
  pipeId: string,
): Promise<Poder> {
  const pipe = await db.pipe.findUnique({ where: { id: pipeId }, select: { id: true } });
  if (!pipe) throw new NotFoundException();
  if (principal.papel === 'ADMIN') return 'gerenciar';
  const membership = await db.membership.findFirst({
    where: { accountId: principal.accountId },
    select: { id: true, state: true },
  });
  if (!membership || membership.state !== 'ACTIVE') throw new NotFoundException();
  const grant = await db.pipeGrant.findFirst({
    where: { pipeId, membershipId: membership.id, state: 'ACTIVE' },
    select: { role: true },
  });
  if (!grant) throw new NotFoundException();
  return grant.role === 'ADMIN' ? 'gerenciar' : 'ler';
}

/** Exige poder de gerenciar; 403 se o principal só pode ler (tem acesso, mas não é Admin do Pipe/Org). */
export async function exigirGerenciarPipe(
  db: DbComContexto,
  principal: Principal,
  pipeId: string,
): Promise<void> {
  if ((await resolverPoderNoPipe(db, principal, pipeId)) !== 'gerenciar') {
    throw new ForbiddenException();
  }
}
