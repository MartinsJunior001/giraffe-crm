# Tasks — Story 8.7 (roster read-side)

Ordem por dependência. `[x]` = concluída.

- [x] T1 — `roster.core.ts`: capacidades (proteção do último Admin), `normalizarPaginacao`, `conviteExpirado`.
- [x] T2 — `roster.dto.ts`: `parseConsultaMembros`/`parseConsultaConvites` (allowlist fail-closed).
- [x] T3 — `roster-read.service.ts`: `listarMembros` (Admin/Membro/Convidado) + `listarConvites` (Admin);
  `withTenantContext`; join `Account` global filtrado.
- [x] T4 — `roster.controller.ts`: rotas `members` (`ler`) e `invites` (`administrar`).
- [x] T5 — wire em `organizations.module.ts`.
- [x] T6 — `roster-core.test.ts` (unidade pura): capacidades/paginação/expirado/DTO.
- [x] T7 — `roster-http.test.ts` (integração real): (a) cross-tenant, (b) autz + visão reduzida,
  (c) projeção sem segredo, (d) paginação/ordem/allowlist.
- [ ] T8 — gates: typecheck/lint/format/build/test API; security-check; observability-check.
- [ ] T9 — commit atômico + PR.
