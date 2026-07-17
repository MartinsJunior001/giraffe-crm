# Spec — Story 3.5: Visualização e navegação de Registros

Baseline `ba412d7` · Épico 3 · Risco ALTO · Depende de 3.4 (reusa 3.3/3.2/2.9). Todas `done`.

## 1. Resumo

Superfície de **LEITURA** (tabela/navegação) sobre `Record` (3.4), **sem migration e sem GRANT novo** (o runtime
já lê via `SELECT`). Espelha o **Kanban read (2.9)** no rigor (autz por acesso de leitura, projeção controlada,
`orgId` fora da fronteira), com a **diferença** de que o **Registro É o dado** — a tabela **exibe `valores`**.
**INV-REPORT-01:** nenhuma consulta revela contagens de Registros inacessíveis (escopo sempre = um Database que o
principal pode ler). Filtros mínimos por tipo + ordenação por Campo sobre `valores` JSONB.

## 2. Fora de escopo (não antecipar — Constitution II)

- Grupos E/OU complexos, filtros salvos, visualizações personalizadas, fórmulas, agregações avançadas (fora da
  Fase 1).
- Filtro `Arquivo possui/não possui` (3.7/3.8 — oculto/rejeitado, sem simulação; AD-28).
- Histórico do Registro read-side (3.6); vínculo Card↔Registro (3.9). Mutação (3.4 — a 3.5 só reflete a
  capacidade).

## 3. Requisitos funcionais

- **RF-1 (listagem/tabela):** `GET /databases/:databaseId/records` — Registros do Database (ATIVOS por padrão);
  linhas = `valores` + `lifecycleState` + `podeEditar` (derivado); colunas = Campos ativos da definição.
  Paginação por **offset** (`skip`/`take`, `take ≤ 100` — NFR-3/4) + `total` escopado ao Database.
- **RF-2 (ordenação por Campo):** `orderBy` = `Field.id` (asc/desc) sobre `valores` JSONB — parametrizado e
  validado; desempate por `id` (determinístico). Sem Campo → `createdAt desc, id`.
- **RF-3 (filtros mínimos, E):** por tipo — texto contém/igual; número/data igual/maior/menor/intervalo; Seleção
  contém opção (por `id`); Sim/Não. Combinação por **E**. Campo desconhecido/operador inválido/valor malformado →
  **400** (fail-closed).
- **RF-4 (arquivados):** parâmetro `incluirArquivados` (default false) — mesma autz de leitura; estado por linha.
- **RF-5 (autorização):** ler a tabela = `exigirLerDatabase` (qualquer poder — ler ≠ operar); sem acesso → 404.

## 4. Requisitos não-funcionais / invariantes

- **INV-REPORT-01:** escopo sempre = um Database legível; contagem só dos Registros visíveis; sem acesso → 404
  não-enumerante; sem agregação cross-Database.
- **Isolamento (AD-6):** RLS vigente em `Record`; toda leitura sob contexto de Org (nativo por `withTenantContext`
  ou raw via `$transaction([...definirContextoOrg, $queryRaw])` — mesmo primitivo); `orgId`/`databaseId` do
  cliente nunca confiados.
- **Read-side puro:** sem migration, sem GRANT novo (runtime segue `SELECT` em `Record`, GRANT column-scoped da
  3.4 intacto). A 3.5 não muta nada.
- **Filtro/ordenação fail-closed:** allowlist de Campos (por `Field.id` da definição) e de operadores por tipo;
  `Field.id`/operador/valor sempre **parametrizados** (nunca concatenados) — sem SQL injection, sem coluna
  arbitrária.
- **Filtro de Arquivo gated (AD-28):** `Arquivo possui/não possui` rejeitado enquanto 3.7/3.8 não habilitam.
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso + guarda fina no serviço (DBT-AUTHZ-01).

## 5. Acceptance Criteria

Ver o story file (AC1–AC7). Resumo: tabela com navegação/ordenação/estados (AC1); arquivados sob opção + edição
refletida (AC2); filtros por tipo + 400 fail-closed (AC3); INV-REPORT-01 (AC4); filtro de Arquivo gated (AC5);
isolamento/autz VIEWER lê (AC6); sem antecipar escopo, sem migration/GRANT (AC7).

## 6. Decisões (clarify Q1–Q5, ver `plan.md`)

- **Q1 — `total`:** exposto (contagem dos Registros **visíveis** do Database consultado — INV-REPORT-01 seguro; é
  do Database que o principal pode ler). Custo: um `count` escopado.
- **Q2 — ordenação por Campo:** **implementada** via `ORDER BY "valores"->>$fieldId` parametrizado (fieldId
  validado contra a definição) sob RLS; coerção por tipo (número→`::numeric`, data→`::timestamptz`; texto/Seleção/
  Sim-Não→texto). Desempate por `id`.
- **Q3 — comparação número/data:** coerção no predicado raw (`(valores->>$k)::numeric`/`::timestamptz`); o valor do
  filtro é validado por tipo no DTO/núcleo (malformado → 400), então o cast não falha em runtime.
- **Q4 — "sem permissão":** **404** não-enumerante (nunca 403 que enumere). O estado de UX deriva do 404.
- **Q5 — paginação:** **offset** (`skip`/`take ≤ 100`) + `total` — o fit de uma tabela ordenável/filtrável (o
  cursor da 2.9 era para o board em tempo real). Determinismo por `ORDER BY … , id`.

## 7. Riscos

- **SQL injection no filtro/ordenação:** mitigado por allowlist de Campos/operadores + **tudo parametrizado**
  (`Prisma.sql`); provado por teste (Campo desconhecido → 400; valor com aspas não escapa).
- **RLS não aplicada em query raw:** mitigado por rodar o raw dentro de `$transaction([...definirContextoOrg,
  $queryRaw])` (mesmo primitivo do `withTenantContext`); provado por teste de isolamento (cross-tenant invisível).
- **INV-REPORT-01:** mitigado por escopo sempre em um Database legível (`exigirLerDatabase`→404) + RLS; sem
  agregação cross-Database; teste prova 404 e contagem escopada.
- **Coerção `::numeric`/`::timestamptz` falhar:** mitigado validando o tipo do valor do filtro no núcleo
  (fail-closed → 400) antes do cast.
