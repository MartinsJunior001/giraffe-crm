# Story 8.3 — Plan + Checklist + Tasks + Analyze

> Consolida as fases Clarify→Plan→Checklist→Tasks→Analyze do Spec Kit. Precedência de decisão:
> Constituição → Arquitetura → PRD/Épico → Story → padrões do código. Base `origin/main` `458e4c3`.

## CLARIFY — resolução das questões abertas do Specify

- **Q1 (Notificações 5.6):** o dono decidiu — tratar como **contrato/porta/stub explícito e testável**,
  observável, sem dependência circular, sem duplicar o write-side de E5, sem fallback silencioso. → PORT
  `InviteAcceptedNotificationPort` + adapter de LOG (registra a emissão do contrato; **não** finge
  entrega). Emissão **pós-commit**, idempotente por Convite.
- **Q2 (verificação de e-mail de E1, usuário novo):** o E1 já entrega `Account.emailVerified` (schema) e
  a autenticação (1.4). A 8.3 **não** abre cadastro público: exige **sessão** (Account autenticada) e
  `emailVerified=true` cujo `email` case com `invite.normalizedEmail`. A criação de Account por posse do
  Convite (fluxo "usuário novo") é do **onboarding/E1** — a 8.3 consome a Account já autenticada. Não
  inventar cadastro aqui (fora do escopo, sem fonte).
- **Q3 (superfície):** `POST /invites/accept`, `@SemContextoOrganizacional()` (molde da 1.9): autenticado
  **sem** contexto de org (o convidado ainda não é membro). Corpo `{ token }` (allowlist). Org/Account
  **nunca** do cliente.
- **Q4 (step-up ADMIN):** a 8.2 já **impede emitir** Convite `ADMIN` (fail-closed `STEP_UP_REQUIRED`);
  logo, no fluxo normal **não existe** Convite `PENDING` com `role=ADMIN` para aceitar. Sem gate novo no
  aceite (defesa em profundidade: se algum existisse, o aceite apenas materializa o papel do Convite).
- **Q5 (Membership pré-existente):** `@@unique([accountId, orgId])` é **cheio**. `REMOVED` → reativa
  (UPDATE→ACTIVE, papel do Convite); `ACTIVE` → idempotente (consome o Convite, devolve a Membership);
  `SUSPENDED` → **409** (reativação é 8.5, não aceite). A 8.2 já bloqueia emitir para ACTIVE/SUSPENDED.

## PLAN — decisões de arquitetura

### 1. Resolução de tenant pré-contexto (o ponto central)
`Invite` é RLS **FORCE**; o convidado não tem contexto de org. Espelha **exatamente** o padrão da 2.8
(`PublicFormRoute` GLOBAL): **nova tabela GLOBAL `InviteRoute { tokenHash PK, orgId }`**, **sem RLS**
(como `Account`/`PublicFormRoute`). O aceite: (1) hash do token → `orgId` por `InviteRoute` (client raiz,
pré-contexto); (2) `withTenantContext(orgId)` e **RELÊ o `Invite` sob RLS** — a RLS é a **autoridade**;
uma rota envenenada (hash→org errada) não concede nada, pois o relê sob RLS não acha o Convite → 404.
- **Manutenção sem tocar a 8.2:** a `InviteRoute` é mantida por **trigger** em `Invite`
  (`AFTER INSERT` insere; `AFTER UPDATE OF tokenHash` troca OLD→NEW — cobre a rotação no reenvio). A
  migration **backfilla** os Convites `PENDING` existentes. Nenhum arquivo TS da 8.2 é alterado.
- **Segurança:** `InviteRoute` mapeia `SHA-256(token)`→`orgId`; sem o token bruto (irreversível) é inócua;
  `orgId` não é segredo. Igual à `PublicFormRoute`. Runtime: `GRANT SELECT` (+ `INSERT/DELETE` para o
  trigger, que roda como invoker `giraffe_app`). **Não** entra em `MODELOS_AUDITADOS` (índice derivado,
  escrito por trigger fora de `withTenantContext`; a auditoria real é de `Invite`/`Membership`).

### 2. Aceite atômico e idempotente
Transação **interativa no client raiz** com `definirContextoOrg(tx, {orgId, accountId})` (molde de
`records.service`/`converter-submissao`):
1. relê `Invite` por `tokenHash` sob RLS; `validarParaAceite(state, expiresAt, agora)` (reúso puro 8.2).
2. **consumo atômico do token:** `updateMany where {id, state:'PENDING'} → {state:'ACCEPTED'}`; `count`
   deve ser 1 (guarda otimista contra corrida cancelar×aceitar e duplo aceite). `count=0` → relê →
   idempotente (se já `ACCEPTED` **e** a conta é a destinatária **e** tem Membership ACTIVE) ou 404.
3. **Membership** (upsert sobre `@@unique([accountId, orgId])`): sem linha → INSERT `ACTIVE role=invite.role`;
   `REMOVED` → UPDATE `state=ACTIVE, role`; `ACTIVE` → no-op idempotente; `SUSPENDED` → 409.
- Conflito (`P2002` da unique / `P2028` timeout) → relê para idempotência → 200 ou 409, **nunca 500**.
- **Sem** `InviteHistory` (não existe tabela; fora de escopo criar). Auditoria pelo `MODELOS_AUDITADOS`
  (a mutação de `Invite` e `Membership` já é logada, ator = `context.accountId`, sem token/PII).
- Notificação `convite aceito` **pós-commit** pela porta; só o **primeiro** consumo (count=1) emite.

### 3. Autorização e identidade
- Guarda grossa: **sessão exigida** (principal resolvido no controller → 401). NÃO é ação de Admin.
- Identidade: `account.emailVerified === true` e `normalizarEmail(account.email) === invite.normalizedEmail`.
  Divergência (token válido, conta errada) → **403** (o requerente **possui** o token; não é enumeração).
  E-mail não verificado → **403 EMAIL_NAO_VERIFICADO**.
- **Não-enumeração:** token inexistente/`InviteRoute` ausente/relê vazio/estado não aceitável
  (expirado/cancelado/já usado por outro) → **404 uniforme**. Não revela existência a quem **não** tem o
  token (todo caminho de "token ruim" colapsa em 404).

### 4. Rate limit do aceite (consome os limites DORMENTES da 8.2)
`RATE_LIMITS.aceitacaoPorIpPor15min=20` e `aceitacaoPorConvitePor15min=5` (definidos na 8.2, sem
consumidor até agora — AD-11). `InviteAcceptRateLimit` sobre o primitivo `RateLimiter.contar`, chaves
`inv:acc:ip:<ipConfiável>` e `inv:acc:tok:<tokenHash>` (o hash é conhecível pré-contexto). Cobrado
**antes** de resolver (fail-closed → 429 + `Retry-After`), throttla brute-force de token. IP via
`client-ip.ts` (nunca `X-Forwarded-For` cru).

### 5. Migrations & RLS
- **Nova:** `InviteRoute` (global, sem RLS) + trigger em `Invite` + backfill; `.down.sql` em
  `prisma/rollback/`. Drill up→down→up obrigatório.
- **Sem ALTER** em `Invite` (idempotência é derivada — sem colunas `acceptedBy`) nem em `Membership`
  (GRANT já é `SELECT/INSERT/UPDATE/DELETE`; a 8.3 é o **1º** criador de Membership em runtime — teste
  prova o escopo do GRANT).

## CHECKLIST (confirmado antes de implementar)
- [x] Contrato público: `POST /invites/accept`, corpo `{token}`, sem org/account do cliente.
- [x] Autenticação prévia: sim (sessão); sem org (`@SemContextoOrganizacional`).
- [x] destinatário↔Account↔Membership: email verificado casa `normalizedEmail`; Membership por
      `(accountId, orgId)`.
- [x] Estados do Invite: só `PENDING` não-expirado aceita; demais → 404 (ou idempotente 200).
- [x] Expiração/revogação/consumo: `validarParaAceite` (reúso) + guarda `updateMany state=PENDING`.
- [x] Idempotência: derivada (estado ACCEPTED + conta destinatária + Membership ACTIVE → 200).
- [x] Concorrência: guarda otimista + unique de Membership + P2002/P2028 → 200/409.
- [x] Limites 8.2: `InviteAcceptRateLimit` consome os limites de aceite dormentes.
- [x] Auditoria: `MODELOS_AUDITADOS` (Invite+Membership), sem token/PII.
- [x] Notificação: porta + adapter de log, pós-commit, idempotente por Convite.
- [x] HTTP/não-enumeração: 401/403/404/409/200 conforme acima; 404 uniforme p/ token ruim.
- [x] Migration/RLS: só `InviteRoute` global + trigger + backfill; sem ALTER em Invite/Membership.

## TASKS (ordem de implementação)
1. `schema.prisma`: model `InviteRoute` (global). Migration `..._invite_route` + trigger + backfill + `.down.sql`.
2. `notification.port.ts` (símbolo + interface) + `log-invite-notification.adapter.ts`.
3. `invite-accept-rate-limit.ts` (+ unit).
4. `invite-route.resolver.ts` (global, pré-contexto).
5. `invite-accept.service.ts` (transação atômica) + `invite-accept.dto.ts`.
6. `invite-accept.controller.ts` (`@SemContextoOrganizacional`, principal no controller).
7. `organizations.module.ts`: registrar controller/serviço/porta.
8. Testes: `invite-accept-core`/reúso, `invite-route-resolver`, `invites-accept-rls`, `invites-accept-http`.
9. Gates + DB (porta livre) + up/down/up + push + PR + CI.

## ANALYZE — riscos e conformidade
- **Isolamento:** a autoridade é o **relê sob RLS**; `InviteRoute` é só hint (2.8). ✔ AD-6/AD-10.
- **`Usuário ≠ Organização`:** aceite cria **1** Membership; unique impede a 2ª. ✔
- **Atomicidade AD-13:** consumo do token + Membership na mesma tx raiz; notificação pós-commit. ✔
- **Sem 500:** P2002/P2028 mapeados. ✔
- **Escopo:** nada de módulo E5, nada de cadastro público, nada de InviteHistory, nada de alterar a 8.2.
  Débito: `DEB-8-3-NOTIF-WRITE-SIDE` (integração real da Notificação quando 5.6 existir) — flag de
  planejamento, não bloqueante.
