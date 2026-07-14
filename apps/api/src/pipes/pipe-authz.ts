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

/**
 * Exige a capacidade EXPLÍCITA "Revisar submissões públicas" (Story 2.8, PRD D3.3), negada por padrão. É
 * CAPACIDADE, não papel: o **Admin da Org** a possui implicitamente (qualquer Pipe); um não-Admin só revisa com
 * uma concessão `PipeGrant` ACTIVE que tenha `reviewPublicSubmissions = true` (e `Membership` ACTIVE). Sem acesso
 * ao Pipe → **404** não-enumerante; com acesso mas sem a capacidade → **403**. Reusa a mesma resolução fina das
 * demais superfícies (não toca o guard/`ability.ts` — C3 congelado).
 */
export async function exigirRevisarSubmissoesPublicas(
  db: DbComContexto,
  principal: Principal,
  pipeId: string,
): Promise<void> {
  const pipe = await db.pipe.findUnique({ where: { id: pipeId }, select: { id: true } });
  if (!pipe) throw new NotFoundException();
  if (principal.papel === 'ADMIN') return; // Admin da Org: capacidade implícita
  const membership = await db.membership.findFirst({
    where: { accountId: principal.accountId },
    select: { id: true, state: true },
  });
  if (!membership || membership.state !== 'ACTIVE') throw new NotFoundException();
  const grant = await db.pipeGrant.findFirst({
    where: { pipeId, membershipId: membership.id, state: 'ACTIVE' },
    select: { reviewPublicSubmissions: true },
  });
  if (!grant) throw new NotFoundException(); // sem acesso ao Pipe → 404 (não enumera)
  if (!grant.reviewPublicSubmissions) throw new ForbiddenException(); // acesso, mas sem a capacidade
}

// ─────────────────────────────────────────────────────────────────────────────
// Acesso no NÍVEL DO CARD (Story 2.10) — estende a resolução do Pipe compondo o papel-de-Pipe com a concessão
// DIRETA a um Card (`CardGrant`), o modificador "restrito ao próprio" do Membro e a atribuição de Responsável
// atual (`CardResponsavel`). Deny-by-default; sem acesso nenhum → **404 não-enumerante** (indistinguível de "não
// existe"). `creator` e histórico anterior **nunca** concedem acesso (SC-2105). Continua fora do guard/CASL (C3
// congelado): guarda FINA no serviço, com o Card carregado.
// ─────────────────────────────────────────────────────────────────────────────

/** Capacidades efetivas do principal sobre UM Card. `podeMover` é o DADO da capacidade (a operação é a 2.14). */
export interface AcessoNoCard {
  cardId: string;
  pipeId: string;
  podeLer: boolean;
  podeOperar: boolean;
  podeMover: boolean;
}

type Flags = Pick<AcessoNoCard, 'podeLer' | 'podeOperar' | 'podeMover'>;

/** Card mínimo que a decisão de acesso consome. */
interface CardRef {
  id: string;
  pipeId: string;
}

/**
 * Acesso de uma Membership NÃO-Admin a um Card, compondo papel-de-Pipe + concessão direta + "restrito ao próprio"
 * + Responsável-atual. Devolve `null` quando não há acesso NENHUM (nem leitura). É o núcleo reusado tanto pela
 * resolução do principal quanto pela verificação do **alvo** de uma atribuição de Responsável (SC-2101).
 *
 * Composição (deny-by-default):
 *   • Papel no Pipe (`PipeGrant` ACTIVE): ADMIN → total no Pipe; MEMBER → operar, **exceto** se `restritoAoProprio`
 *     e a pessoa não é Responsável atual (aí o papel não dá acesso — só a concessão direta abaixo pode dar);
 *     VIEWER → só ler. Sem papel no Pipe: o papel não contribui.
 *   • Concessão direta (`CardGrant` ACTIVE) **soma** acesso àquele Card mesmo sem papel no Pipe (Observador = ler;
 *     operacional = operar; `podeMover` opt-in).
 *   • `podeMover` derivado do papel é sempre falso (mover é capacidade explícita — 2.14/D-OA1); só a concessão
 *     direta com `podeMover` o liga (ou o Admin da Org, tratado fora daqui).
 */
async function computeAcessoNaoAdmin(
  db: DbComContexto,
  membershipId: string,
  card: CardRef,
): Promise<Flags | null> {
  const [grant, pipeGrant] = await Promise.all([
    db.cardGrant.findFirst({
      where: { cardId: card.id, membershipId, state: 'ACTIVE' },
      select: { podeLer: true, podeOperar: true, podeMover: true },
    }),
    db.pipeGrant.findFirst({
      where: { pipeId: card.pipeId, membershipId, state: 'ACTIVE' },
      select: { role: true, restritoAoProprio: true },
    }),
  ]);

  let podeLer = false;
  let podeOperar = false;
  let podeMover = false;

  if (pipeGrant) {
    if (pipeGrant.role === 'ADMIN') {
      podeLer = podeOperar = podeMover = true;
    } else if (pipeGrant.role === 'MEMBER') {
      if (pipeGrant.restritoAoProprio) {
        // Restrito: o papel só dá acesso se a pessoa for Responsável ATUAL (creator/histórico não contam).
        const responsavel = await db.cardResponsavel.findFirst({
          where: { cardId: card.id, membershipId, state: 'ACTIVE' },
          select: { id: true },
        });
        if (responsavel) {
          podeLer = podeOperar = true;
        }
      } else {
        podeLer = podeOperar = true;
      }
    } else {
      // VIEWER concedido: só leitura.
      podeLer = true;
    }
  }

  // A concessão direta compõe (nunca reduz): soma o que o papel não deu.
  if (grant) {
    podeLer = podeLer || grant.podeLer;
    podeOperar = podeOperar || grant.podeOperar;
    podeMover = podeMover || grant.podeMover;
  }

  if (!podeLer) return null; // sem acesso nenhum
  return { podeLer, podeOperar, podeMover };
}

/**
 * Resolve o acesso do **principal** a um Card, ou **404 não-enumerante** se não há acesso nenhum. Admin da Org →
 * total. Não-Admin → composição de `computeAcessoNaoAdmin` (papel-de-Pipe + concessão direta + restrito +
 * Responsável). Reconfere `Membership.state = ACTIVE`.
 */
export async function resolverAcessoNoCard(
  db: DbComContexto,
  principal: Principal,
  cardId: string,
): Promise<AcessoNoCard> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, pipeId: true },
  });
  if (!card) throw new NotFoundException();

  if (principal.papel === 'ADMIN') {
    return {
      cardId: card.id,
      pipeId: card.pipeId,
      podeLer: true,
      podeOperar: true,
      podeMover: true,
    };
  }

  const membership = await db.membership.findFirst({
    where: { accountId: principal.accountId },
    select: { id: true, state: true },
  });
  if (!membership || membership.state !== 'ACTIVE') throw new NotFoundException();

  const flags = await computeAcessoNaoAdmin(db, membership.id, card);
  if (!flags) throw new NotFoundException(); // sem acesso → 404 (não enumera)
  return { cardId: card.id, pipeId: card.pipeId, ...flags };
}

/**
 * Acesso do **alvo** (uma Membership qualquer, por `membershipId`) a um Card — usado para validar que quem receberá
 * o papel de Responsável JÁ tem acesso operacional prévio (SC-2101). Devolve `null` se o alvo não tem acesso
 * (Membership inexistente/inativa incluída). Admin da Org → total. NÃO lança: quem decide o efeito é o chamador.
 */
export async function resolverAcessoDaMembership(
  db: DbComContexto,
  membershipId: string,
  cardId: string,
): Promise<Flags | null> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, pipeId: true },
  });
  if (!card) return null;

  const membership = await db.membership.findFirst({
    where: { id: membershipId },
    select: { id: true, role: true, state: true },
  });
  if (!membership || membership.state !== 'ACTIVE') return null;
  if (membership.role === 'ADMIN') {
    return { podeLer: true, podeOperar: true, podeMover: true };
  }
  return computeAcessoNaoAdmin(db, membership.id, card);
}

/** Exige poder de LER o Card; 404 não-enumerante se não há acesso. Devolve o acesso resolvido (capacidades). */
export async function exigirLerCard(
  db: DbComContexto,
  principal: Principal,
  cardId: string,
): Promise<AcessoNoCard> {
  return resolverAcessoNoCard(db, principal, cardId); // já lança 404 sem acesso (podeLer é o piso)
}

/**
 * Exige poder de OPERAR o Card. Sem acesso nenhum → **404** (não enumera); com acesso de leitura mas sem operar
 * (Observador/Viewer) → **403**. Devolve o acesso resolvido.
 */
export async function exigirOperarCard(
  db: DbComContexto,
  principal: Principal,
  cardId: string,
): Promise<AcessoNoCard> {
  const acesso = await resolverAcessoNoCard(db, principal, cardId);
  if (!acesso.podeOperar) throw new ForbiddenException();
  return acesso;
}
