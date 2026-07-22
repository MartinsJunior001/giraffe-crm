# Gate — lgpd-check — Story 8.5

**Status: APROVADO**

## Minimização (D-4)

`MembershipEvent` (SUSPENDED/REACTIVATED) grava só referências mínimas e metadados:
`membershipId`, `actorId`, `fromRole=toRole` (papel preservado — não é PII), `correlationId`,
`occurredAt`, e `payload` = `{ fromState, toState, revokedCardGrants, removedResponsavelDe,
reatribuir }` (ids org-scoped, sem PII). **NUNCA** senha/hash/token/cookie/id de sessão/e-mail/corpo
HTTP/nome/PII desnecessária. Auditoria manual (Pino) idem: só `actor`/`orgId`/`action`/`resource`/
`result`/`at`.

## Sem exclusão física (preservação do dado do titular)

Suspender/reativar são transições de `state` — preservam Account, papel, autoria e Histórico
(reversível). `CardGrant`→REVOKED e `CardResponsavel`→REMOVED são soft-delete (sem DELETE). A
limpeza de `AuthSession.activeOrganizationId` anula um PONTEIRO (não apaga a sessão nem dado do
titular).

## Direito de acesso/retificação

Não aplicável a esta Story (read-side de auditoria é a 8.8). A correção de trilha é por NOVO evento
(append-only), nunca reescrita.
