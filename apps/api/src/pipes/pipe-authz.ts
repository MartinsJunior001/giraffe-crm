import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '../kernel/db/tenant-context';

/**
 * Resolução do **poder efetivo por recurso** sobre um Pipe (DBT-AUTHZ-01), compartilhada entre as superfícies
 * que tratam "config do Pipe" — Fases (2.3), Formulários (2.4), evolução de Campos (2.5) e publicação (2.6) — e,
 * a partir da 2.7, a **operação** de Cards (submissão do Formulário inicial via `exigirOperarPipe`).
 *
 * Extraída do `PhasesService` na 2.4 para que a MESMA regra fina não seja copiada em dois serviços e passe a
 * divergir. A guarda GROSSA continua no `AuthzGuard` (`@Requer('ler','Pipe')`); esta guarda FINA vive no
 * serviço, com o recurso carregado — **sem** tocar o mecanismo C3 (`ability.ts`/`authz.guard.ts`).
 *
 * **Não** aplica RLS: quem isola entre Organizações é o banco. Estas funções recebem um `db` já com contexto
 * (`withTenantContext`) e decidem apenas o poder DENTRO da Organização do contexto.
 */

/**
 * Poder efetivo do principal sobre um Pipe, do mais forte ao mais fraco: `gerenciar` (config do Pipe — Admin
 * da Org ou Admin do Pipe) > `operar` (opera Cards, sem configurar — Membro do Pipe) > `ler` (só leitura —
 * Viewer concedido). Quem `gerenciar` também pode `operar` e `ler`; quem `operar` também pode `ler`.
 */
export type Poder = 'gerenciar' | 'operar' | 'ler';

/** Só o que a decisão de poder consome do contexto: quem é o principal e seu papel de Organização. */
interface Principal {
  accountId: string;
  papel: string;
}

type DbComContexto = ReturnType<typeof withTenantContext>;

/**
 * Poder do principal sobre a config do Pipe, ou **404 não-enumerante** se não há acesso nenhum (indistinguível
 * de "não existe"). Admin da Org gerencia qualquer Pipe. Não-Admin: precisa de uma concessão `PipeGrant`
 * ACTIVE — `role = ADMIN` → gerencia; `role = MEMBER` → opera; `role = VIEWER` → só lê. **Lê `role`** e
 * **reconfere `Membership.state = ACTIVE`** (fecha DBT-2.2-ROLE-DORMENTE e, para estas superfícies,
 * DBT-2.2-MEMBERSHIP-ADVISORY). O papel de Pipe **opera Cards** (Membro) ativa na Story 2.7.
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
  if (grant.role === 'ADMIN') return 'gerenciar';
  if (grant.role === 'MEMBER') return 'operar';
  return 'ler';
}

/** Exige poder de gerenciar; 403 se o principal só pode operar/ler (tem acesso, mas não é Admin do Pipe/Org). */
export async function exigirGerenciarPipe(
  db: DbComContexto,
  principal: Principal,
  pipeId: string,
): Promise<void> {
  if ((await resolverPoderNoPipe(db, principal, pipeId)) !== 'gerenciar') {
    throw new ForbiddenException();
  }
}

/**
 * Exige poder de **operar** (gerenciar OU operar); 403 se o principal só pode ler (Viewer concedido). É o gate
 * da submissão do Formulário inicial (Story 2.7): criar Card é operação, não leitura — o Membro do Pipe pode,
 * o Viewer não. Sem acesso ao Pipe → 404 (não-enumerante), herdado de `resolverPoderNoPipe`.
 */
export async function exigirOperarPipe(
  db: DbComContexto,
  principal: Principal,
  pipeId: string,
): Promise<void> {
  if ((await resolverPoderNoPipe(db, principal, pipeId)) === 'ler') {
    throw new ForbiddenException();
  }
}
