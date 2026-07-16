---
story_key: 3-4-ciclo-de-vida-do-registro-historico-write-side
epic: 3
status: ready-for-dev
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: CRÍTICO
baseline_commit: 4e60ee4
gate_arquitetura: Materializa a 1ª entidade de DADO do titular no Database — `Record` (Registro) — e a sua trilha `RecordHistory` (write-side append-only). Nova tabela org-scoped com RLS ENABLE+FORCE e `WITH CHECK` no INSERT e UPDATE (simétrica a Card/Database), GRANT SELECT/INSERT/UPDATE column-scoped (ciclo de vida) SEM DELETE (sem exclusão física — LGPD); `RecordHistory` GRANT SELECT/INSERT apenas (imutável, como CardHistory/FormVersion). REUTILIZA a maquinaria de submissão de Card (2.7): validação `submission.ts` (allowlist anti-mass-assignment, tipo por Campo, Seleção por `id`) contra o snapshot da `FormVersion` publicada do Formulário de DATABASE (3.3), valores JSONB por `Field.id` (AD-11/AD-12), idempotência por `@@unique([orgId, databaseId, idempotencyKey])` (P2002+P2028→idempotente/409, nunca 500), evento `CREATED` na MESMA transação interativa (AD-13; `definirContextoOrg`). Espelha o ciclo de vida do Card (2.11): núcleo puro `record-lifecycle.transitions.ts` + guarda otimista `updateMany where lifecycleState=<lido>`→409; mas o Registro tem SÓ 2 estados (ATIVO/ARQUIVADO — sem FINALIZADO), então restaurar volta sempre a ATIVO (sem `previousLifecycleState`). Acorda o poder DORMENTE de MEMBER do Database: operar Registro = `exigirOperarDatabase` (novo em `database-authz`, espelho de `exigirOperarPipe`). Guard C3 congelado (`@Requer('ler','Database')` grosso + guarda fina no serviço). FORA: `Novo Registro` UI, visualização/tabela (3.5), read-side do Histórico (3.6), arquivos/Campo Arquivo (3.7/3.8), vínculo Card↔Registro (3.9), ação de Automação `Criar Registro relacionado` (E4).
---

# Story 3.4 — Ciclo de vida do Registro (+ Histórico write-side)

**As a** usuário autorizado,
**I want** criar, editar, arquivar e restaurar Registros de forma idempotente,
**So that** os dados do Database sejam mantidos sem perda nem duplicação, com trilha própria.

**Status: ready-for-dev.** Quarta Story do **Épico 3** (Databases, Registros, Vínculos e Arquivos), risco
**CRÍTICO** — materializa **`Record`** (o **Registro**, 1ª entidade de **dado do titular** do Database) e o
**write-side** da sua trilha (`RecordHistory`, append-only). Reutiliza integralmente a maquinaria de **submissão
de Card** (2.7 — validação contra snapshot da `FormVersion`, valores JSONB por `Field.id`, idempotência,
evento na mesma transação) e o **ciclo de vida do Card** (2.11 — núcleo puro + guarda otimista), aplicados ao
**Formulário de Database publicado** que a 3.3 entregou. **`Card ≠ Registro`** (invariante conceitual): o
Registro pertence a **exatamente 1 Database** (RN-063, não transferível), não percorre Fases, e tem ciclo de
vida próprio de **2 estados** (ATIVO/ARQUIVADO).

## Invariantes do dono (não erodir)

- **`Card ≠ Registro` / `Database ≠ Pipe` (RN-061/063):** `Record` é entidade **distinta** — tabela/enum/subject/
  módulo próprios em `apps/api/src/databases/records/`. Reusa-se a **lógica** de submissão/ciclo de vida
  (platform-level), **nunca** as entidades/rotas de Card. O Registro pertence a **1 Database** e **não é
  transferível** (sem rota/UPDATE que troque `databaseId`).
- **Criação não corrompe e não duplica:** cada criação usa **exatamente a `FormVersion` publicada vigente no
  início da operação** (definição congelada — AD-12); os valores são validados contra o **snapshot** (allowlist
  anti-mass-assignment, tipo por Campo, Seleção por `id` — reuso de `submission.ts`), gravados em **JSONB por
  `Field.id`** (AD-11), nunca por rótulo. **Idempotência** por `@@unique([orgId, databaseId, idempotencyKey])`:
  duplo clique/timeout/retry com a mesma chave **não** cria Registro duplicado — devolve o existente. Uma ação
  lógica cria **zero ou um** Registro e **registra o resultado** (evento).
- **Isolamento por Organização e por Database:** RLS **ENABLE+FORCE** com `WITH CHECK` no INSERT **e** no UPDATE
  (simétrica a `Card`/`Database`); toda query por `withTenantContext`; `orgId`/`databaseId` do payload **nunca**
  confiados (o Database é relido sob RLS; a `FormVersion` publicada é resolvida no servidor).
- **Nenhuma exclusão física sem requisito:** o runtime tem **GRANT SELECT/INSERT/UPDATE column-scoped** em
  `Record` (só `lifecycleState`/`updatedAt`) e **SEM DELETE**; arquivar é `state` (reversível), preserva
  dados/arquivos/vínculos. `RecordHistory` tem **só SELECT/INSERT** (append-only imutável). Uma rota de DELETE
  por engano bateria em `permission denied`.
- **Arquivar não é bloqueado por vínculos e preserva tudo:** arquivar sai das consultas ativas (sem edição/novos
  vínculos), mas **não** é bloqueado por vínculos existentes; dados/arquivos/vínculos ficam preservados e
  consultáveis. Restaurar preserva **identidade/valores/arquivos/Histórico/vínculos**.
- **MEMBER/VIEWER ganham apenas os poderes previstos:** **operar** Registro (criar/editar/arquivar/restaurar) =
  Admin da Org / Admin do Database (gerenciar) **ou** MEMBER do Database (operar — poder diferencial **acordado
  aqui**); **VIEWER** do Database **só lê** (403 ao operar); **sem acesso** ao Database → **404 não-enumerante**.
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso (aberto na 3.2) + guarda fina no serviço
  (DBT-AUTHZ-01). `ability.ts`/`authz.guard.ts` **não** tocados.
- **Write-side, não read-side:** a 3.4 **persiste** os eventos (`CREATED`/`VALUES_UPDATED`/`ARCHIVED`/`RESTORED`);
  a **consulta** da timeline (projeção, autorização por acesso atual, mascaramento) é a **3.6**. Correção = **novo
  evento** append-only (não altera o original).
- **Não antecipar 3.5+:** SEM visualização/tabela/filtros (3.5); SEM read-side do Histórico (3.6); SEM arquivos/
  Campo Arquivo (3.7/3.8, gate AD-28 mantido); SEM vínculo Card↔Registro (3.9); SEM ação de Automação de E4. A UI
  `Novo Registro` é da 3.5 — a 3.4 entrega a **operação** (endpoint) que ela e a Automação consumirão.

## Escopo (do épico, congelado)

**Dentro:**
- Entidade **`Record`** org-scoped (dono `databaseId`, `formVersionId` congelado, `valores` JSONB, `origin`,
  `idempotencyKey`, `lifecycleState ∈ {ATIVO, ARQUIVADO}`), com migration (tabela + RLS ENABLE+FORCE + policies +
  GRANT column-scoped sem DELETE + índice de idempotência único).
- **`RecordHistory`** org-scoped append-only (GRANT SELECT/INSERT), evento por operação, na **mesma transação**.
- **Criação** (reuso de 2.7): resolver a `FormVersion` **publicada** do Formulário de Database, validar valores
  contra o snapshot (`submission.ts`), criar 1 Registro + evento `CREATED` na transação interativa; **idempotente**.
- **Edição de valores:** revalida contra a versão vigente **do próprio Registro** (`formVersionId` congelado —
  AD-12), grava `valores`, evento `VALUES_UPDATED` (write-side); bloqueada se o Registro/Database estiver
  arquivado.
- **Ciclo de vida** (reuso de 2.11): arquivar/restaurar idempotentes, atômicos e auditados; núcleo puro
  `record-lifecycle.transitions.ts`; guarda otimista `updateMany where lifecycleState=<lido>`→409; transição
  inválida → 409.
- **Autorização:** `exigirOperarDatabase` (novo — acorda o MEMBER dormente da 3.2/3.3); ler Registro =
  `exigirLerDatabase`.

**Fora (Stories futuras):**
- Visualização/tabela/navegação/filtros e a UI `Novo Registro` → **3.5**.
- **Read-side** do Histórico do Registro (timeline, projeção, mascaramento) → **3.6**.
- Campo Arquivo funcional / anexo geral / eventos de arquivo → **3.7/3.8** (gate AD-28 mantido).
- Vínculo Card↔Registro e eventos de vínculo/`correlationId` → **3.9**.
- Ação de Automação `Criar Registro relacionado` → **E4** (consumidor futuro do mesmo endpoint de criação).

## Acceptance Criteria

- **AC1 — criação idempotente, no máximo 1 Registro:** dado um Formulário de Database **publicado**, ao submeter/
  acionar a criação, cria **no máximo 1** Registro, com os Campos/validações da **`FormVersion` publicada vigente
  no início da operação**; os valores são validados contra o snapshot (chave desconhecida → 400; tipo/Seleção por
  `id`) e gravados em JSONB por `Field.id`. Formulário **não publicado** → criação recusada (o rascunho não recebe
  submissão — contrato herdado da 3.3).
- **AC2 — idempotência real:** uma submissão repetida por duplo clique/timeout/retry (mesmo `idempotencyKey`)
  **não** cria Registro duplicado; devolve o Registro existente e o resultado é registrado. Concorrência resolve
  por `@@unique` → **P2002/P2028** tratados → idempotente ou 409, **nunca 500**.
- **AC3 — arquivar reversível e não bloqueado:** dado um Registro ATIVO, ao arquivar, ele **sai das consultas
  ativas** (não editável, sem novos vínculos), mas dados/arquivos/vínculos são **preservados e consultáveis**; o
  arquivamento **não** é bloqueado por vínculos existentes. Arquivar é **idempotente** (já arquivado → no-op sem
  falso `denied` na auditoria).
- **AC4 — restaurar preserva identidade:** dado um Registro ARQUIVADO, ao restaurar, **identidade (`id`)/valores/
  arquivos/Histórico/vínculos** são preservados; o estado volta a **ATIVO**.
- **AC5 — write-side do Histórico:** **cada** operação (criar/editar valores/arquivar/restaurar) **persiste um
  evento** na trilha própria do Registro (`RecordHistory`), na **mesma transação** da mutação (não há Registro/
  mutação sem evento; não há evento sem mutação). Trilha **append-only e imutável** (runtime sem UPDATE/DELETE).
- **AC6 — sem exclusão física; isolamento:** não há exclusão definitiva pelo usuário (runtime sem GRANT DELETE em
  `Record`/`RecordHistory`); RLS prova que um Registro de outra Org/Database é invisível; `orgId`/`databaseId` do
  cliente nunca confiados; owner cross-tenant/cross-database → 404.
- **AC7 — autorização por Database (poder diferencial):** **operar** (criar/editar/arquivar/restaurar) exige
  gerenciar **ou** operar o Database (Admin da Org / Admin do Database / **MEMBER**); **VIEWER** do Database → 403
  ao operar (só lê); **sem acesso** → 404 não-enumerante. Guard C3 congelado. `Record` **não transferível** (sem
  caminho que altere `databaseId`).

## Tasks / Subtasks

- [ ] **T001 — Gate pré-código:** `context7-check` (Prisma 6.19.x — nova tabela, RLS/CHECK/índice único parcial de
  idempotência, transação interativa `$transaction`; NestJS 11) + `pre-implementation-check`. Registrar em
  `gates/3-4/T001-pre-code-gate.md`.
- [ ] **T002 — Migration `..._records`:** tabela `Record` (colunas + FKs para `Organization`/`Database`/`Form`/
  `FormVersion`, onDelete Cascade) + `RecordHistory`; enum `RecordLifecycleState { ATIVO, ARQUIVADO }`; RLS
  **ENABLE+FORCE** + 4 policies por `orgId=current_org_id()` com `WITH CHECK` no INSERT **e** UPDATE (ambas
  tabelas); **GRANT**: `Record` = `SELECT, INSERT, UPDATE ("lifecycleState","updatedAt")` (column-scoped) **sem
  DELETE**; `RecordHistory` = `SELECT, INSERT` **sem UPDATE/DELETE**; índice único de idempotência
  `[orgId, databaseId, idempotencyKey]` (raw SQL) + `@@index([orgId, databaseId])`. Rollback cirúrgico
  (`rollback/..._records.down.sql`): drop das 2 tabelas + enum + policies (sem tocar Database/Form/FormVersion).
  **Backfill:** nenhum (tabelas novas, vazias).
- [ ] **T003 — Schema Prisma:** modelos `Record`/`RecordHistory`, enum `RecordLifecycleState`, back-relations em
  `Database`/`Form`/`FormVersion`/`Organization`. Índice único de idempotência **NÃO** exprimível no schema
  (Prisma 6.19.x) → em raw SQL na migration (padrão de 2.7). Regenerar o client. `Record`/`RecordHistory` em
  `MODELOS_AUDITADOS` (`tenant-context.ts`).
- [ ] **T004 — `exigirOperarDatabase` (acordar o MEMBER):** em `database-authz.ts`, espelho de `exigirOperarPipe`
  (2.7): `resolverPoderNoDatabase ∈ {gerenciar, operar}` → ok; `ler` (VIEWER) → **403**; sem acesso → **404**.
  Função pura (sem provider), sem tocar o guard/`ability.ts`.
- [ ] **T005 — `RecordsService` (criação idempotente):** resolver a `FormVersion` **publicada** do Formulário de
  Database (via `form-locate`/publication da 3.3), validar `valores` contra o snapshot **reusando `submission.ts`**
  (allowlist, tipo, Seleção por `id`), criar `Record` + `RecordHistory(CREATED)` na **transação interativa no
  client raiz** (`definirContextoOrg`, AD-13). Idempotência por `@@unique` → **P2002/P2028** → devolve existente
  ou 409, **nunca 500** (reuso do reconhecedor de conflito de 2.7/2.8). `orgId`/`databaseId` fora do payload.
- [ ] **T006 — Edição de valores:** revalida contra a `FormVersion` **do próprio Registro** (`formVersionId`
  congelado); grava `valores`; evento `VALUES_UPDATED` na mesma transação. Bloqueada se Registro/Database
  arquivado (409 `RECORD_ARQUIVADO`/`DATABASE_ARQUIVADO`, defesa em profundidade no `where lifecycleState=ATIVO`).
  **Nota:** editar `valores` é UPDATE de coluna **não** coberta pelo GRANT column-scoped do ciclo de vida — decidir
  no Spec Kit (Q1): (a) ampliar o GRANT para incluir `valores`, ou (b) edição via caminho próprio. **Provar o
  escopo com teste** (permission denied onde não concedido).
- [ ] **T007 — Ciclo de vida (`record-lifecycle`):** núcleo **puro** `record-lifecycle.transitions.ts`
  (`planejarArquivamento`/`planejarRestauracao`; 2 estados; idempotentes; transição inválida → erro tipado);
  `record-lifecycle.service.ts` aplica com **guarda otimista** (`updateMany where lifecycleState=<lido>` →
  reconsulta → idempotente/**409**; P2002/P2028→409); evento `ARCHIVED`/`RESTORED` na mesma transação. Caminho
  no-op **não** emite `updateMany` (sem falso `denied` na auditoria — padrão 3.1).
- [ ] **T008 — Controllers Database-específicos:** `databases/records/records.controller.ts` sob
  `@Controller('databases/:databaseId')`, todas `@Requer('ler','Database')` + guarda fina no serviço. Rotas:
  `POST /records` (criar, **201**, idempotente); `GET /records/:recordId` (obter, **200** — leitura básica p/ 3.5/
  3.6 consumirem, sem tabela/filtro); `PATCH /records/:recordId` (editar valores, 200/409); `POST
  /records/:recordId/archive` e `.../restore` (200/409). **Sem** rota de exclusão. `databaseId`/`recordId` via
  `validarIdRota`; `orgId` nunca no payload.
- [ ] **T009 — Fiação de módulos sem ciclo:** `RecordsModule` (ou dentro de `DatabasesModule`) reusa `submission.ts`
  (puro) e os localizadores/serviço de publicação da 3.3 (já exportados por `PipesModule`, importado por
  `DatabasesModule`); `database-authz` é função pura. Sem ciclo Databases↔Pipes (unidirecional).
- [ ] **T010 — Testes RLS (PostgreSQL real):** `records-rls` — isolamento por Org/Database; `WITH CHECK` no INSERT
  e UPDATE (fase vermelha provada: quebrar a policy e ver o teste falhar); GRANT column-scoped (UPDATE de coluna
  fora do escopo → **permission denied**; **sem DELETE** em `Record`/`RecordHistory`); idempotência por índice
  único (P2002); `RecordHistory` imutável (UPDATE/DELETE → permission denied).
- [ ] **T011 — Testes HTTP (porta real):** `records-http` — AC1 (criação valida snapshot; não publicado → recusa),
  AC2 (idempotência: mesma chave → 1 Registro; concorrência → nunca 500), AC3 (arquivar reversível/idempotente),
  AC4 (restaurar preserva identidade/valores), AC5 (evento por operação — verificável via consulta direta ao
  write-side no teste), AC6 (cross-tenant/cross-database → 404), AC7 (MEMBER opera; VIEWER → 403; sem acesso →
  404; Admin da Org opera).
- [ ] **T012 — Regressão:** provar que o reuso de `submission.ts`/publicação **não** alterou o comportamento de
  Card (2.7/2.8) nem do Formulário de Database (3.3) — suítes verdes.
- [ ] **T013 — SC-206:** deploy → rollback cirúrgico → reapply em PostgreSQL descartável (drop limpo de `Record`/
  `RecordHistory`/enum/policies; reapply íntegro).
- [ ] **T014 — Atualizar `CLAUDE.md`** (bloco de estado 3.4: `Record`/`RecordHistory`; criação idempotente reusando
  2.7; ciclo de vida reusando 2.11; `exigirOperarDatabase` acorda o MEMBER; GRANT column-scoped sem DELETE).
- [ ] **T015 — Revisão adversarial CRÍTICA** (Segurança; Arquitetura/RLS; Edge Cases; Aceite) — CRITICAL/HIGH com
  regressão e mutação obrigatórias.
- [ ] **T016 — `commit-check`** → PR → CI → merge → closure BMAD.

## Dev Notes

### Reuso da submissão de Card (2.7) — a maquinaria é platform-level
A validação de submissão (`apps/api/src/pipes/cards/submission.ts`) é **pura** e independente de domínio:
recebe o snapshot da `FormVersion` e os `valores`, aplica allowlist anti-mass-assignment (chave desconhecida →
400), tipo por Campo e Seleção por `id`. A 3.4 **reusa** essa função para validar a criação/edição do Registro
contra o snapshot do Formulário de **Database** publicado (3.3), sem duplicar a lógica. A criação segue o padrão
de `card-submission.service.ts`: transação **interativa no client raiz** com `definirContextoOrg`
(`tenant-context.ts`), INSERT do dado + INSERT do evento na mesma transação (AD-13), idempotência por `@@unique`
com reconhecimento de **P2002 e P2028** → idempotente/409, nunca 500.

### `Record` espelha `Card`, mais simples (2 estados)
`Record` = `Card` **sem** `pipeId`/`phaseId` (não percorre Fases) e **sem** `FINALIZADO`: o ciclo de vida tem
**2 estados** (ATIVO/ARQUIVADO), então **não** há `previousLifecycleState` (restaurar sempre volta a ATIVO). O
núcleo puro `record-lifecycle.transitions.ts` espelha `card-lifecycle.transitions.ts` (2.11) reduzido; o serviço
aplica com **guarda otimista** idêntica (`updateMany where lifecycleState=<lido>`→409). GRANT de `Record` para o
ciclo de vida é **column-scoped** (`lifecycleState`, `updatedAt`), como o 1º UPDATE de Card na 2.11.

### Idempotência e "uma ação lógica cria 0 ou 1 Registro"
Chave `idempotencyKey` do cliente + `@@unique([orgId, databaseId, idempotencyKey])`. Um retry da MESMA operação
lógica colide e **devolve o Registro existente** (nunca duplica) — exatamente o padrão de Card (2.7) e da
conversão pública (2.8). O escopo do `@@unique` é por **Database** (o Registro pertence a 1 Database), não por
Form. A mesma infra atenderá a ação de Automação de E4 (consumidor futuro do endpoint de criação — AD-11).

### Definição congelada e não corromper (AD-12)
O Registro referencia a `formVersionId` **publicada no ato da criação** (imutável — a 3.3 garante que
`FormVersion` não tem UPDATE/DELETE no runtime). Editar valores revalida contra **essa** versão congelada do
próprio Registro, não contra o rascunho atual — mudar o schema depois **não** corrompe Registros já criados. A
resolução da versão publicada usa o serviço/localizadores de publicação da 3.3 (Formulário de Database).

### Autorização — acordar o MEMBER (poder dormente 3.2/3.3)
`database-authz` (3.2) já resolve `resolverPoderNoDatabase` (Admin→gerenciar, MEMBER→operar, VIEWER→ler) mas só
expôs `exigirLerDatabase`/`exigirGerenciarDatabase`/`exigirConcederPapel`. A 3.4 adiciona **`exigirOperarDatabase`**
(espelho de `exigirOperarPipe` da 2.7): operar Registro = gerenciar **ou** operar; VIEWER → 403; sem acesso →
404. É aqui que o poder diferencial de MEMBER (anunciado como dormente em 3.2/3.3) **se ativa** — sem tocar o
guard/`ability.ts` (C3 congelado).

### Write-side ≠ read-side
A 3.4 **grava** os eventos; **não** os projeta/consulta (isso é a 3.6, com autorização por acesso atual e
mascaramento). O vocabulário inicial: `CREATED`, `VALUES_UPDATED`, `ARCHIVED`, `RESTORED`. Eventos de **arquivo**
(3.8) e **vínculo** (3.9, com `correlationId`) são acrescentados por suas Stories — a 3.4 estabelece o contrato
append-only e imutável (como `CardHistory`), sem antecipá-los. Correção de valor = **novo evento**, nunca
alteração do original (a imutabilidade é do banco: sem UPDATE/DELETE em `RecordHistory`).

### `Record` não transferível
RN-063: cada Registro pertence a **exatamente 1 Database**. Não há rota nem GRANT que permita trocar `databaseId`
(a coluna fica fora do GRANT column-scoped de UPDATE — só `lifecycleState`/`updatedAt`). Uma tentativa de
"mover" o Registro bateria em `permission denied` (provado no teste RLS).

### Referências
FR-19; RN-062/063; D3.5; AD-11/12/13/15. Reusa: submissão/validação (2.7 `submission.ts`), ciclo de vida (2.11),
reconhecedor de conflito idempotente (2.7/2.8), `definirContextoOrg` (2.6), Formulário de Database publicado
(3.3), Database + `database-authz` (3.1/3.2). Fora: visualização (3.5), read-side (3.6), arquivos (3.7/3.8),
vínculo (3.9), Automação (E4).

## Questões para o Spec Kit (clarify)

- **Q1 — GRANT para edição de valores:** o ciclo de vida (2.11) usa GRANT `UPDATE(lifecycleState, updatedAt)`
  column-scoped. Editar `valores` é UPDATE de outra coluna. Opções: (a) ampliar o GRANT column-scoped para incluir
  `valores` (e `updatedAt`), mantendo `databaseId`/`formVersionId`/`orgId` fora; (b) manter o ciclo de vida
  column-scoped separado e um GRANT distinto para `valores`. Preferir (a) — um único GRANT column-scoped
  `(lifecycleState, valores, updatedAt)`, com teste provando que `databaseId`/`formVersionId`/`orgId` seguem sem
  UPDATE. Confirmar.
- **Q2 — Superfície de leitura da 3.4:** `GET /records/:recordId` devolve o Registro cru (estado + valores) para
  3.5/3.6 consumirem, **sem** tabela/paginação/filtro (3.5) e **sem** projeção de Histórico (3.6). Confirmar o
  corte (a 3.4 não expõe listagem para não antecipar a navegação da 3.5, que tem INV-REPORT-01).
- **Q3 — Origem do Registro (`origin`):** materializar um enum `RecordOrigin` agora (ex.: `NOVO_REGISTRO`/
  `AUTOMACAO`/`PUBLIC`?) ou só o suficiente para 3.4 (criação interna autenticada), deixando os demais para seus
  consumidores (AD-11)? O épico cita `Novo Registro` (3.5) e Automação (E4) como origens — evitar antecipar valores
  sem consumidor.
- **Q4 — Edição sob Database arquivado:** a 3.1 já impõe somente-leitura sob Database ARCHIVED. Confirmar que
  criar/editar/arquivar/restaurar Registro respeitam isso (Database arquivado → 409), com defesa em profundidade,
  reusando o padrão `DATABASE_ARQUIVADO` da 3.1.
- **Q5 — Idempotência opcional vs obrigatória:** `idempotencyKey` é obrigatória na criação (como 2.7) ou opcional?
  O épico exige "cada submissão/comando possui identificador idempotente" — inclinação por **obrigatória** na
  criação (400 se ausente), coerente com "uma ação lógica cria 0 ou 1 Registro".

## Change Log

| Data | Mudança |
|------|---------|
| 2026-07-16 | Story criada (E3, Wave 4) a partir de `epics.md` (Story 3.4) e da Spine (FR-19, RN-062/063, AD-11/12/13/15). Risco **CRÍTICO** (1ª entidade de dado do titular no Database: `Record` + write-side `RecordHistory`). Escopo **congelado**: criar/editar/arquivar/restaurar Registro idempotente + write-side do Histórico, reusando a submissão de Card (2.7) e o ciclo de vida (2.11) sobre o Formulário de Database publicado (3.3). Acorda o MEMBER do Database (`exigirOperarDatabase`). Visualização (3.5), read-side (3.6), arquivos (3.7/3.8), vínculo (3.9), Automação (E4) = fora. Guard C3 congelado. Dependências 3.3/3.2 `done`. Status → **ready-for-dev** (após create-story). |

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
