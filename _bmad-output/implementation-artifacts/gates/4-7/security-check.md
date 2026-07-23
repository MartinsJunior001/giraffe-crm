# security-check — Story 4.7

**Status:** APROVADO
**Risco:** ALTO (prevenção de DoS/exaustão via loops de Automação; multi-tenant; migration).

## Isolamento multi-tenant (invariante-mãe)
- `AutomationChainVisit`: RLS **ENABLE + FORCE**, policies `select/insert/update/delete` por `current_org_id()`,
  **WITH CHECK** no INSERT e no UPDATE. Prova: `automation-chaining-rls.test.ts` (owner=migrator, FORCE, 4 policies).
- **Cadeia por Org (CA6):** o índice único inclui `orgId` (`orgId, executionChainId, signature`) ⇒ um
  `executionChainId` NUNCA cruza tenant — uma cadeia/ciclo de outra Org não barra nem colide com a desta. Prova:
  rls (g) — mesma (cadeia, assinatura) em duas Orgs NÃO colide; cross-tenant read invisível; deny-by-default sem contexto.
- Toda query por `withTenantContext`/tx com `definirContextoOrg`; nenhum `orgId` do cliente; `orgId` fora da fronteira.

## GRANT como fronteira
- `AutomationChainVisit`: GRANT **só SELECT/INSERT** (append-only) — UPDATE e DELETE **negados** (`permission denied`,
  provado na rls). Registrar visita é INSERT; nunca reescrita/exclusão.
- `AutomationExecution.chainDepth` e `DomainEvent.chainDepth`: INSERT-only — FORA do UPDATE column-scoped
  (imutáveis por GRANT). Prova: rls — UPDATE de `chainDepth` negado; `chainDepth` ausente das colunas de UPDATE.

## Sanitização (AD-30) / LGPD
- `lastErrorCode` das Execuções barradas é enum ESTRUTURAL (`DEPTH_EXCEEDED`/`CYCLE_DETECTED`/`CHAIN_TIMEOUT`) —
  nunca id/valor/PII/stack. A visita guarda só `signature` (hash sha256), `eventId`/`executionId` (ids) e
  `executionChainId` — nenhum `valores`. O log `automation.chain.halted` carrega só `orgId`/`execId`/`motivo`.
- **Sem exclusão física** (LGPD): visita e Execução são append-only; retenção/expurgo é do dono (Governança/4.8).

## Prevenção de DoS (o objetivo de segurança da Story)
- **Fail-closed** (§1428): filho de cadeia sem idade computável ⇒ barra; profundidade malformada ⇒ barra.
- Detecção de ciclo **imposta pelo banco** (`@@unique`) — race-safe (dois workers arbitrados), não uma leitura frágil.
- `drenarOrg` com teto `MAX_ITERACOES_DRAIN` (belt-and-suspenders sobre profundidade/ciclo) — término garantido.
- Redelivery (mesmo `eventId`) não é falso positivo ⇒ at-least-once não gera dead-letter espúrio.

## Guard/CASL
- **C3 congelado**: `ability.ts`/`ability.factory.ts` intocados. A autorização das Ações é a do principal (4.5/4.6);
  a 4.7 só adiciona a barreira de encadeamento (não é autorização de usuário).

**Veredito:** APROVADO — nenhum caminho de bypass de RLS; GRANT prova a fronteira; sanitização preservada.
