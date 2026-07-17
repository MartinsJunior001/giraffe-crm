---
story_key: 3-5-visualizacao-e-navegacao-de-registros
epic: 3
status: done
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: ALTO
baseline_commit: ba412d7
gate_arquitetura: Superfície de **LEITURA** (tabela/navegação) sobre `Record`/`Field` já materializados (3.4/3.3) — **sem migration e sem GRANT novo** (o runtime segue com o GRANT column-scoped da 3.4; ler é `SELECT`). Espelha o padrão do **Kanban read (2.9)**: cursor determinístico `[createdAt, id]` (teto 100 — NFR-3/4), projeção controlada, autorização por `exigirLerDatabase` (qualquer poder no Database — ler ≠ operar; sem acesso → 404 não-enumerante). **INV-REPORT-01:** nenhuma consulta/contagem revela Registros/Databases inacessíveis — o escopo é sempre um Database que o principal pode ler (RLS por Org + gate de acesso), e a contagem é só dos Registros visíveis daquele Database. **Registros ATIVOS por padrão**; opção **autorizada** de ver ARQUIVADOS (mesma autz de leitura; o estado é dado, não segredo). **Filtros mínimos** por tipo de Campo sobre `valores` JSONB (chaveado por `Field.id`): texto contém/igual, número/data igual/maior/menor/intervalo, Seleção contém opção, Sim/Não; combinação por **E** (AND). Ordenação por Campo. **Impossível editar a partir da visualização** quando o Registro OU o Database está arquivado (a 3.5 é read-side; a edição é 3.4 e já é bloqueada sob arquivamento — a visão só reflete a capacidade). Filtro **`Arquivo possui/não possui`** fica **oculto** (sem simulação) até 3.7/3.8. **DIFERENÇA vs. Kanban (2.9):** o Registro É o dado — a tabela **exibe `valores`** (não é PII a esconder como no Card; o acesso é por Database). Guard C3 congelado. FORA: grupos E/OU complexos, filtros salvos, visualizações personalizadas, fórmulas, agregações avançadas (fora da Fase 1); Histórico read-side (3.6); vínculo (3.9).
---

# Story 3.5 — Visualização e navegação de Registros

**As a** usuário autorizado,
**I want** consultar os Registros de um Database em tabela com filtros e ordenação,
**So that** eu encontre os dados que preciso sem vazamento por agregação.

**Status: done.** Quinta Story do **Épico 3**, risco **ALTO** — abre a superfície de **LEITURA** (tabela e
navegação) sobre `Record` (3.4), **sem migration e sem GRANT novo**, espelhando o **Kanban read (2.9)**: cursor
determinístico, projeção controlada, autorização por acesso de leitura ao Database. A **diferença** frente ao
Kanban é que o **Registro É o dado** — a tabela **exibe os `valores`** (não há PII a esconder da lista como no
Card; o acesso é por Database). **INV-REPORT-01:** nenhuma consulta revela contagens de Registros inacessíveis.

## Invariantes do dono (não erodir)

- **INV-REPORT-01 (nenhum vazamento por agregação):** toda consulta/contagem é escopada a **um Database que o
  principal pode ler**; nenhuma rota revela a existência/contagem de Registros de um Database sem acesso (sem
  acesso → **404 não-enumerante**). A contagem exibida é só dos Registros visíveis daquele Database.
- **Read-side puro:** a 3.5 **não** cria/edita/arquiva Registro (isso é a 3.4). **Sem migration, sem GRANT novo**
  (o runtime lê via `SELECT`). A visão **reflete** a capacidade de edição (bloqueada sob Registro/Database
  arquivado), mas **não** a executa.
- **Isolamento por Organização/Database:** RLS já vigente em `Record`; toda query por `withTenantContext`;
  `orgId`/`databaseId` do cliente nunca confiados (Database relido sob RLS; acesso por `exigirLerDatabase`).
- **Ativos por padrão; arquivados sob opção autorizada:** a lista mostra `lifecycleState=ATIVO` por padrão; ver
  ARQUIVADOS é uma **opção** (mesma autz de leitura — o estado é dado, não segredo); o estado é **indicado**
  claramente; Database arquivado → estado claro, edição bloqueada a partir da visão.
- **Filtros/ordenação só sobre a definição publicada:** filtro/ordenação por `Field.id` (JSONB `valores`),
  validados contra os Campos existentes; entrada malformada/Campo desconhecido → 400 (fail-closed), não SQL
  injection nem coluna arbitrária. Combinação por **E** (AND) apenas.
- **Filtro de Arquivo gated (AD-28):** `Arquivo possui/não possui` **não aparece** (oculto, **sem simulação**) até
  a capacidade de arquivos + Campo Arquivo (3.7/3.8) estarem habilitados.
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso + guarda fina no serviço (DBT-AUTHZ-01).
- **Sem antecipar escopo:** SEM grupos E/OU complexos, filtros salvos, visualizações personalizadas, fórmulas,
  agregações avançadas (fora da Fase 1); SEM Histórico read-side (3.6); SEM vínculo Card↔Registro (3.9).

## Escopo (do épico, congelado)

**Dentro:**
- **Listagem em tabela** de Registros de um Database ativo: colunas = Campos ativos da definição; linhas =
  Registros com `valores` + `lifecycleState`; **paginação por cursor** determinístico (`[createdAt, id]`, teto
  100 — NFR-3/4); **estados** carregando/vazio/sem permissão (o backend devolve o suficiente: lista vazia vs.
  404).
- **Ordenação** por um Campo (asc/desc), determinística (desempate por `id`).
- **Filtros mínimos** por tipo de Campo (combinação por E): texto contém/igual; número/data igual/maior/menor/
  intervalo; Seleção contém opção (por `id`); Sim/Não. **Indicação de filtros ativos** e **limpar filtros** (o
  backend aceita/ignora explicitamente; a indicação/limpeza é do consumo).
- **Arquivados:** parâmetro autorizado para incluir ARQUIVADOS (default só ATIVOS); estado por linha.
- **Capacidade de edição refletida** (não executada): a resposta indica se a edição é possível (Database ATIVO e
  Registro ATIVO) para o consumidor desabilitar a ação — a mutação segue sendo 3.4 (409 sob arquivamento).

**Fora (Stories futuras / fora da Fase 1):**
- Grupos E/OU complexos, filtros salvos, visualizações personalizadas, fórmulas, agregações avançadas.
- Filtro `Arquivo possui/não possui` (3.7/3.8, gate AD-28 — oculto até lá).
- Histórico do Registro read-side (3.6); vínculo Card↔Registro (3.9).

## Acceptance Criteria

- **AC1 — tabela com navegação uniforme:** dado um Database **ativo** que o principal pode ler, ao abrir, exibe os
  Registros **ativos por padrão** em tabela (colunas = Campos ativos; linhas = `valores`), com **paginação por
  cursor** determinística (teto 100) e ordenação por Campo; estados honestos (vazio vs. sem permissão).
- **AC2 — arquivados sob opção; edição refletida:** um parâmetro **autorizado** inclui ARQUIVADOS; cada linha
  indica seu `lifecycleState`; quando o Registro **ou** o Database está arquivado, a visão marca a edição como
  **indisponível** (não há edição a partir dali — a mutação 3.4 já responde 409).
- **AC3 — filtros mínimos por tipo (E):** filtrar por texto (contém/igual), número/data (igual/maior/menor/
  intervalo), Seleção (contém opção por `id`), Sim/Não, combinados por **E**; filtro sobre Campo desconhecido/
  malformado → **400** (fail-closed, sem coluna arbitrária).
- **AC4 — INV-REPORT-01 (sem vazamento):** nenhuma consulta/contagem revela Registros de um Database que o
  principal **não** pode ler; sem acesso ao Database → **404 não-enumerante**; a contagem é só dos Registros
  visíveis do Database consultado.
- **AC5 — filtro de Arquivo gated:** enquanto 3.7/3.8 não habilitam a capacidade de arquivos + Campo Arquivo, o
  filtro `Arquivo possui/não possui` **não** é oferecido/aceito (oculto, sem simulação).
- **AC6 — isolamento e autorização:** RLS prova que Registros de outra Org/Database são invisíveis; ler a tabela =
  **qualquer poder** no Database (ADMIN/MEMBER/VIEWER — ler ≠ operar); `orgId`/`databaseId` do cliente nunca
  confiados. Guard C3 congelado.
- **AC7 — sem antecipar escopo:** sem grupos complexos/filtros salvos/visualizações/fórmulas/agregações; sem
  Histórico read-side; sem vínculo. Sem migration nem GRANT novo.

## Tasks / Subtasks

- [ ] **T001 — Gate pré-código:** `context7-check` (Prisma 6.19.x — filtro/ordenação sobre JSONB, cursor; NestJS
  11) + `pre-implementation-check`. Registrar em `gates/3-5/T001-pre-code-gate.md`.
- [ ] **T002 — `RecordsReadService` (leitura/listagem):** `listar(databaseId, query)` — `exigirLerDatabase`;
  resolve os Campos da definição (para validar filtros/ordenação por `Field.id`); monta o `where` sobre `valores`
  JSONB por tipo; paginação por cursor `[createdAt, id]` (teto 100); default só ATIVOS, opção incluir ARQUIVADOS;
  projeção `RecordLinhaVisao` (id, `valores`, `lifecycleState`, `podeEditar` derivado, createdAt). `orgId` fora da
  fronteira. Sem N+1 (a contagem, se exposta, por `count` escopado ao Database).
- [ ] **T003 — Núcleo puro de filtros (`record-filter.ts`):** traduz um filtro validado (Campo + operador + valor)
  por **tipo** num predicado Prisma sobre `valores` (JSONB path por `Field.id`); allowlist de operadores por tipo;
  Campo desconhecido/operador inválido/valor malformado → erro tipado (→ 400). Fail-closed; sem coluna/SQL
  arbitrário. Provado em unidade.
- [ ] **T004 — DTO de query (`records-query.dto.ts`):** parse manual (sem class-validator) de `cursor`, `limit`
  (≤100), `orderBy` (`Field.id` + dir), `filtros` (lista de {fieldId, op, valor}), `incluirArquivados` (bool). O
  filtro de Arquivo é **rejeitado** enquanto gated (AD-28).
- [ ] **T005 — Controller:** `GET /databases/:databaseId/records` → 200 `RecordPaginaVisao` (linhas + `nextCursor`
  + `total` do Database visível). `@Requer('ler','Database')`. Rota **coexiste** com `GET .../records/:recordId`
  (3.4) sem conflito de rota.
- [ ] **T006 — Fiação:** registrar `RecordsReadService` em `DatabasesModule` (sem novo módulo se simples).
- [ ] **T007 — Testes RLS (PostgreSQL real):** `records-read-rls` — Registros de outra Org/Database invisíveis na
  listagem; contagem escopada; sem GRANT novo (segue só `SELECT`).
- [ ] **T008 — Testes HTTP (porta real):** `records-read-http` — AC1 (tabela/cursor/ordenação), AC2 (arquivados/
  edição refletida), AC3 (filtros por tipo + 400 fail-closed), AC4 (INV-REPORT-01: sem acesso → 404; contagem
  escopada), AC5 (filtro de Arquivo rejeitado/oculto), AC6 (VIEWER lê; cross-tenant 404).
- [ ] **T009 — Testes de unidade** do núcleo de filtros (`record-filter`): allowlist por tipo, fail-closed.
- [ ] **T010 — Regressão:** 3.4 (records-http/rls) e leitura por detalhe seguem verdes.
- [ ] **T011 — Atualizar `CLAUDE.md`** (bloco de estado 3.5: leitura/tabela read-side sobre Record; sem migration/
  GRANT; INV-REPORT-01; filtros por tipo sobre JSONB; filtro de Arquivo gated).
- [ ] **T012 — Revisão adversarial CRÍTICA** (Segurança; Arquitetura/RLS; Edge Cases; Aceite) — CRITICAL/HIGH com
  regressão e mutação obrigatórias.
- [ ] **T013 — `commit-check`** → PR → CI → merge → closure BMAD.

## Dev Notes

### Read-side espelha o Kanban (2.9) — sem migration, sem GRANT
Como a 2.9, a 3.5 é **leitura pura** sobre dados já materializados: cursor determinístico `[createdAt, id]` (teto
100 — NFR-3/4), autorização por `exigirLerDatabase` (qualquer poder — ler ≠ operar), `orgId` fora da fronteira.
**Não** abre migration nem GRANT (o runtime já tem `SELECT` em `Record` desde a 3.4). A **diferença**: a lista de
Registros **inclui `valores`** (o Registro É o dado; o acesso é por Database, não há PII por-linha a esconder como
no Card, cujos `valores` só saíam no detalhe).

### INV-REPORT-01 cai por construção
O acesso a Registro é **por Database** (3.4: não há grant por-Registro). A listagem é sempre escopada a UM
Database que o principal pode ler (`exigirLerDatabase` → 404 sem acesso) e a RLS filtra por Org. Logo, nenhuma
consulta/contagem alcança Registros de um Database inacessível — a contagem é só dos visíveis daquele Database.
Não há agregação cross-Database.

### Filtros sobre JSONB `valores` (por `Field.id`) — fail-closed
Os `valores` são JSONB chaveados por `Field.id`. Filtrar/ordenar por um Campo = consultar `valores` no path do
`Field.id`. O núcleo puro `record-filter.ts` valida (Campo existe na definição; operador permitido para o tipo;
valor bem-formado) e traduz num predicado Prisma — **allowlist**, nunca `Field.id`/operador/valor arbitrário vira
SQL. Campo desconhecido/operador inválido → 400. Combinação só por **E** (AND) — grupos complexos são fora da
Fase 1.

### Ordenação sobre JSONB — determinismo
Ordenar por um Campo usa o path JSONB; desempate sempre por `id` (determinístico), coerente com o cursor. Sem
Campo → ordem default `[createdAt, id]` (a mesma do cursor).

### Edição refletida, não executada
A visão marca `podeEditar = (Database ATIVO && Registro ATIVO)` para o consumidor desabilitar a ação — a mutação
segue sendo 3.4 e já responde 409 sob arquivamento. A 3.5 não muta nada.

### Referências
FR-20; D3.4; NFR-3/4; INV-REPORT-01; AD-28. Reusa: padrão de cursor/projeção do Kanban read (2.9); `Record`/
`exigirLerDatabase` (3.4/3.2); Campos da definição (3.3). Fora: Histórico read-side (3.6); vínculo (3.9); filtros
avançados (fora da Fase 1).

## Questões para o Spec Kit (clarify)

- **Q1 — `total` na resposta:** expor a **contagem** dos Registros visíveis do Database (para a paginação/UX) —
  confirmar que é escopada e não fere INV-REPORT-01 (é do Database consultado, que o principal pode ler). Custo:
  um `count` extra; aceitável (NFR-3/4)? Ou só cursor sem total?
- **Q2 — Ordenação por Campo sobre JSONB:** `orderBy` sobre `valores->>fieldId` — como texto (lexicográfico) para
  todos os tipos, ou coerção por tipo (número/data)? Inclinação: **lexicográfico** na Fase 1 (simples,
  determinístico), documentando a limitação; coerção fina fica para depois (sem consumidor que a exija).
- **Q3 — Filtro de data/número igual/maior/menor sobre string JSONB:** valores são strings no JSONB — comparação
  numérica/temporal exige coerção. Fase 1: comparar como **string** (igual/contém) sempre funciona; maior/menor
  numérico/temporal — confirmar se entra agora (coerção) ou fica documentado como limitação. O épico pede
  "número e datas igual/maior/menor/intervalo" — inclinação por **coerção mínima** no núcleo de filtro.
- **Q4 — Estado "sem permissão":** o backend devolve **404** (não-enumerante) sem acesso ao Database; o estado
  "sem permissão" da UX é derivado disso. Confirmar que não há 403 que enumere.
- **Q5 — Paginação: cursor vs. offset:** cursor determinístico `[createdAt, id]` (como Kanban) — confirmar que
  atende a "paginação" do épico (sem número de página absoluto), coerente com NFR-3/4.

## Change Log

| Data | Mudança |
|------|---------|
| 2026-07-16 | Story criada (E3, Wave 4) a partir de `epics.md` (Story 3.5) e da Spine (FR-20, D3.4, NFR-3/4, INV-REPORT-01). Risco **ALTO** (superfície de leitura/tabela sobre Registros; INV-REPORT-01). Escopo **congelado**: tabela/paginação/ordenação/filtros mínimos por tipo, ativos por padrão + arquivados sob opção, edição refletida — read-side puro (sem migration/GRANT), espelhando o Kanban read (2.9). Filtro de Arquivo gated (3.7/3.8, AD-28). Grupos complexos/filtros salvos/visualizações/fórmulas/agregações, Histórico read-side (3.6) e vínculo (3.9) = fora. Guard C3 congelado. Dependência 3.4 `done`. Status → **ready-for-dev** (após create-story). |
| 2026-07-16 | Implementada, revisada (revisão adversarial CRÍTICA em 4 camadas sem achado CRÍTICO/ALTO; injeção fechada e provada), integrada pelo **PR #82** (merge `99f7bf9`) com CI **verde** nos 4 jobs. Read-side puro (**sem migration** — SC-206 N/A). Status → **done**. |

## Review Findings

Revisão adversarial CRÍTICA (4 camadas read-only sobre o diff da 3.5): **Segurança**, **Arquitetura/RLS**, **Edge Cases** e **Aceite**. **Nenhum achado CRÍTICO/ALTO de código.** Aceite **APROVADO** (AC1–AC7; guard C3 congelado confirmado por `git diff ba412d7 -- apps/api/src/kernel/authz/` vazio; sem migration/GRANT novo).

- **Segurança:** listar exige `exigirLerDatabase` (404 não-enumerante; VIEWER lê — ler ≠ operar). **SQL injection fechada**: núcleo puro `record-query.core` valida por **allowlist** (Campo por `Field.id` da definição, operador e valor por tipo → 400 fail-closed); SQL **totalmente parametrizado** (`Prisma.raw` só para o literal `ASC`/`DESC` do plano tipado). **Prova por teste de injeção** (valor `'; DROP TABLE "Record"; --` tratado como literal → 0 linhas, tabela íntegra). **RLS em raw** pelo primitivo `$transaction([...definirContextoOrg, $queryRaw])` (cross-tenant invisível + contagem escopada — INV-REPORT-01). `orgId` fora da projeção; `valores` exibido por design (dado do Database, acesso por-Database). Data comparada como texto ISO (sem DoS de cast); número `::numeric` seguro. `FILE` gated (AD-28).
- **Arquitetura/RLS:** read-side puro (sem migration/GRANT — runtime segue `SELECT`); núcleo puro testável; rota `GET /records` coexiste com `GET /records/:recordId` (regressão 3.4 verde); sem ciclo de módulo. INV-REPORT-01 **cai por construção** (acesso por-Database; sem agregação cross-Database).
- **Edge Cases / Aceite:** produção correta (Database sem Formulário → colunas vazias/lista vazia; Database arquivado legível com `podeEditar` falso; NULLS LAST). **INFO** (não defeito): `colunas` inclui o Campo `FILE` (não funcional até 3.8) — honesto (o Campo existe) e o **filtro** sobre ele é rejeitado (gated).

**Decisão registrada (não é descope):** a ordenação por Campo é **entregue** via raw parametrizado (o Prisma 6.19.3 não expressa `orderBy` sobre path JSON) — segura e provada.

**Evidência de execução:** typecheck/lint/format verdes; testes-alvo em PostgreSQL real (unidade allowlist/fail-closed; RLS raw cross-tenant invisível/contagem escopada; HTTP AC1–AC7 + injeção); regressão 3.4 **11/11**; suíte serial **727/727**; CI do PR #82 verde nos 4 jobs.

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
