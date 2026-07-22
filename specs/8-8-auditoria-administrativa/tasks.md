# Tasks — Story 8.8

1. [x] **T1** Núcleo puro `audit-projection.ts`: `SELECT_EVENTO_AUDITORIA`, `projetarEvento` (allowlist),
   `montarLogAuditoria` (log sanitizado). Depende de: schema `MembershipEvent`.
2. [x] **T2** DTO `audit.dto.ts`: `parseConsultaAuditoria` (filtros fail-closed), `parseCursor`,
   `parseLimite`. Depende de: T1 (tipos).
3. [x] **T3** Serviço `audit-read.service.ts`: autz (defesa em profundidade), query sob `withTenantContext`,
   paginação por cursor, projeção, `AUDIT_LOG_VIEWED`. Depende de: T1, T2.
4. [x] **T4** Controller `audit.controller.ts`: `GET /organizations/audit`,
   `@Requer('administrar','Organizacao')`. Depende de: T3.
5. [x] **T5** Wiring em `organizations.module.ts`. Depende de: T3, T4.
6. [x] **T6** Teste puro `audit-projection-core.test.ts` (projeção allowlist + log sanitizado). Dep.: T1.
7. [x] **T7** Teste integração `audit-http.test.ts` (a/b/c/e end-to-end, banco real). Dep.: T4, T5.
8. [x] **T8** Gates: pre-implementation-check, security-check, observability-check, lgpd-check.
9. [ ] **T9** Verificação: lint, typecheck, test (API, DB no ar), build. → executar ao final.
10. [ ] **T10** commit-check → commit → PR.

## Ordem
T1 → T2 → T3 → T4 → T5 → (T6 ‖ T7) → T8 → T9 → T10.
