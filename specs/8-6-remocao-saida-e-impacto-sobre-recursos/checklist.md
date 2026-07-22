# Checklist — Story 8.6

## Autorização
- [x] Remoção exige Admin da Org (guard `administrar` + defesa em profundidade).
- [x] Saída voluntária = o próprio usuário (guard `ler`, alvo do contexto, sem id do cliente).
- [x] Cross-tenant/inexistente → 404 não-enumerante; não-Admin em remove → 403; sem sessão → 401; id
      malformado → 400.
- [x] Guard/`ability.ts` intocados (C3).

## Ciclo / decisão pura
- [x] `ACTIVE`/`SUSPENDED → REMOVED`; já REMOVED → NOOP idempotente (sem escrita/evento).
- [x] Sem bloqueio de auto-alvo (saída própria permitida); último Admin barra (409).

## Concorrência / atomicidade (D-2)
- [x] tx interativa + `definirContextoOrg` + `SELECT … FOR UPDATE` na Organization + recount in-tx.
- [x] Guarda otimista `updateMany where state=<lido>`; P2002/P2028 → 409, nunca 500.
- [x] Teste concorrente real (alvos distintos) → um 200, um 409/403, `count` final = 1 (nunca 0).

## Step-up (D-1)
- [x] Remover e sair exigem janela válida → 403 STEP_UP_REQUIRED fora dela (server-side).

## Sessão/acesso (D-3)
- [x] `AbilityCache.invalidar` + limpa `activeOrganizationId` só na Org afetada.
- [x] Deny-by-default na próxima requisição (rota real); outras Orgs intactas; Account não revogada.

## Impacto sobre recursos (contrato 2.10)
- [x] `aoAlterarMembership('REMOVED')` revoga `CardGrant` + remove `CardResponsavel` na mesma tx.
- [x] `creator` preservado; `PipeGrant`/`DatabaseGrant` não tocados (deny-by-default basta).
- [x] Preflight consultado (vacuamente verdadeiro); bloqueio → 409 sem alteração parcial.

## Evento / LGPD (D-4)
- [x] `MembershipEvent(REMOVED)` append-only na mesma tx; `eventId` determinístico; `saidaVoluntaria`.
- [x] Só metadados; nunca PII/segredo.

## Migration / RLS / GRANT
- [x] `ADD VALUE 'REMOVED'` aditivo; `REVOKE DELETE ON "Membership"` (DEB-MEMBERSHIP-EVENT-CASCADE).
- [x] Prova de permission denied (runtime sem DELETE) + fase vermelha; imutabilidade do evento REMOVED.
- [x] Testes fundacionais reconciliados ao invariante mais forte; rollback documentado.

## Gates
- [x] context7 · pre-implementation · security · observability · migration · lgpd · red-phase.
- [ ] lint · typecheck · test (API, PostgreSQL real) · build — evidência no PR.
