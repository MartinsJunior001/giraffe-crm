# Gate T012 — Revisão adversarial CRÍTICA + gates de conclusão da Story 3.5

Data: 2026-07-16 · Branch: `story/3-5-visualizacao-e-navegacao-de-registros` (off `origin/main` @ ba412d7)

## Gates de qualidade (evidência real)

- **typecheck** (src + test): ✅ verde. **lint** (`eslint .`): ✅. **format** (`prettier --check`): ✅.
- **testes-alvo:** `record-query-core` (unidade — allowlist/fail-closed), `records-read-rls` (raw sob RLS,
  cross-tenant invisível, contagem escopada), `records-read-http` (AC1–AC7 + injeção) — **verdes**.
- **regressão 3.4** (`records-http` + `records-rls`): ✅ **11/11** — a rota de listagem coexiste com o detalhe.
- **suíte serial completa** (`test:ci`): ✅ **727/727** (89 arquivos), zero falhas (o `login-http` rate-limit
  passou neste run). Gate autoritativo = CI limpo.
- **SC-206:** **N/A** — read-side puro, **sem migration** (nenhuma alteração de schema; `git status prisma/`
  vazio).

## Revisão adversarial CRÍTICA (4 camadas)

Segurança, Arquitetura/RLS, Edge Cases e Aceite. **Nenhum achado CRÍTICO/ALTO.** Aceite **APROVADO** (AC1–AC7;
C3 congelado por `git diff ba412d7 -- apps/api/src/kernel/authz/` **vazio**; sem migration/GRANT novo).

- **Segurança:** listar exige `exigirLerDatabase` (404 não-enumerante; VIEWER lê — ler ≠ operar). **SQL injection
  fechada**: o núcleo puro `record-query.core` valida por **allowlist** (Campo por `Field.id` da definição,
  operador por tipo, valor por tipo → 400 fail-closed); o SQL é **totalmente parametrizado** (`Prisma.sql`;
  `Prisma.raw` só para o literal `ASC`/`DESC` vindo do plano tipado, nunca entrada do cliente). **Prova**: teste de
  injeção (valor `'; DROP TABLE "Record"; --` tratado como literal → 0 linhas, tabela íntegra). **RLS em raw**:
  `$transaction([...definirContextoOrg, $queryRaw])` — teste prova cross-tenant invisível + contagem escopada
  (INV-REPORT-01). `orgId`/`databaseId`/`idempotencyKey` fora da projeção; `valores` é o dado (exibido por design
  — acesso por Database), fora de log. Data comparada como texto ISO (evita DoS de cast); número `::numeric`
  seguro (validado na escrita). `FILE` gated (filtro/ordenação → 400).
- **Arquitetura/RLS:** read-side puro (sem migration/GRANT — runtime segue `SELECT`); núcleo puro testável; raw
  pelo primitivo estabelecido; rota `GET /records` coexiste com `GET /records/:recordId` (regressão 3.4 verde);
  sem ciclo de módulo. INV-REPORT-01 **cai por construção** (acesso por-Database; sem agregação cross-Database).
- **Edge Cases:** Database sem Formulário → colunas `[]`, lista vazia; Database arquivado → legível, `podeEditar`
  falso; `take` default 50/máx 100; NULLS LAST na ordenação por Campo.
- **Aceite:** APROVADO.

### Achados / notas

- **INFO (colunas incluem o Campo `FILE`):** `colunas` devolve todos os Campos ativos, inclusive um `FILE`
  (não funcional até 3.8). É **honesto** (o Campo existe na definição) e o **filtro** sobre ele é rejeitado (gated,
  AD-28); a coluna aparecer vazia é UX, não defeito. Registrado; sem ação de código.
- **Decisão registrada (não é descope):** a ordenação por Campo é **entregue** via raw parametrizado (o Prisma
  6.19.3 não expressa `orderBy` sobre path JSON) — segura e provada; não é lacuna de AC.

## Gates de conclusão

- **security-check:** ✅ (injeção fechada + provada; RLS em raw; autz de leitura; INV-REPORT-01).
- **observability-check:** ✅ leitura pura; `orgId` fora da fronteira; `valores` fora de log.
- **migration-check:** N/A (sem migration).
- **lgpd-check:** ✅ leitura; sem exclusão; `valores` exibido por design (dado do Database, acesso por-Database),
  nunca em log.
- **backup-check:** N/A (sem alteração de schema/dado).
- **performance-check:** ✅ paginação `take ≤ 100` + `total` escopado; índice `@@index([orgId, databaseId])` da 3.4
  cobre a listagem por Database; raw parametrizado sem N+1.

## Veredito

**APROVADO PARA COMMIT/PR.** Gates verdes com evidência real; revisão adversarial CRÍTICA sem achado alto;
injeção fechada e provada; read-side puro sem migration/GRANT. Gate autoritativo da suíte serial = CI limpo.
