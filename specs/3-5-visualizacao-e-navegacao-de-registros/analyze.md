# Analyze — Story 3.5 (consistência cruzada)

## Rastreabilidade AC ↔ RF ↔ Task ↔ Teste

| AC | RF | Task(s) | Teste |
|---|---|---|---|
| AC1 (tabela/paginação/ordenação) | RF-1/2 | T003, T005 | records-read-http (tabela/order/paginação) |
| AC2 (arquivados/edição refletida) | RF-4 | T003 | records-read-http (incluirArquivados; podeEditar) |
| AC3 (filtros por tipo; 400) | RF-3 | T002, T003 | record-query-core; records-read-http (400) |
| AC4 (INV-REPORT-01) | RF-5 | T003, T005 | records-read-http (404); records-read-rls (contagem escopada) |
| AC5 (filtro Arquivo gated) | RF-3 | T002 | record-query-core (rejeita); records-read-http (400) |
| AC6 (isolamento/autz) | RF-5 | T003 | records-read-rls (cross-tenant); records-read-http (VIEWER lê) |
| AC7 (sem antecipar; sem migration/GRANT) | NFR | — | ausência de migration/GRANT no diff; git diff kernel/authz vazio |

## Consistência de invariantes

- **Read-side puro:** sem migration/GRANT (data-model, plan). ✔
- **INV-REPORT-01:** escopo por Database legível + RLS; 404 sem acesso; contagem escopada; sem cross-Database. ✔
- **Fail-closed + parametrização total:** núcleo puro valida allowlist; raw parametrizado (plan §Segurança). ✔
- **Raw sob RLS:** `$transaction([...definirContextoOrg, $queryRaw])` — mesmo primitivo do `withTenantContext`. ✔
- **`valores` exibido (não é PII a esconder como no Card):** decisão registrada — o Registro É o dado, acesso por
  Database (spec §1; dev notes). ✔ (coerente com CLAUDE.md — "valores só no detalhe" era do **Card**, cujo acesso
  é por-Card; Registro é por-Database).
- **Filtro de Arquivo gated (AD-28):** rejeitado até 3.7/3.8 (spec §4; T002). ✔
- **DBT-AUTHZ-01 + C3 congelado:** autz fina no serviço; guard grosso. ✔

## Divergências/decisões fechadas

- **Ordenação por Campo sobre JSONB:** o Prisma 6.19.3 não a expressa nativamente → **raw parametrizado sob RLS**
  (Q2). Decisão registrada; não é descope do AC (a ordenação por Campo é entregue, só que por raw seguro).
- **Paginação offset (não cursor):** a 2.9 usou cursor (board em tempo real); a tabela ordenável/filtrável usa
  **offset + total** (Q5). Registrado — não é contradição com a 2.9 (contexto diferente).
- **Nenhuma contradição** com CLAUDE.md/Spine: a nota "valores só no detalhe" refere-se ao **Card** (acesso
  por-Card, PII por-linha); o Registro tem acesso por-Database e a tabela é a sua finalidade.

## Veredito

**Coerente e pronto para implementação.** Sem ambiguidade bloqueante; segurança da query raw endereçada por
allowlist + parametrização + RLS; escopo congelado sem antecipação.
