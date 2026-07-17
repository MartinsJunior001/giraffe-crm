---
story_key: 3-3-formulario-de-database-schema-visual-do-registro
epic: 3
status: done
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: CRÍTICO
baseline_commit: 53ad4b8
gate_arquitetura: Ativa o contexto DATABASE do `Form` (stub desde 2.4) — nova coluna owner `Form.databaseId` + FK + CHECK de coerência de owner por contexto + índice, tocando uma entidade org-scoped já existente (RLS/FORCE já vigentes em Form/Field/FormVersion). REUTILIZA o Form Builder canônico de E2 (montagem 2.4, evolução segura de Campos 2.5, publicação por snapshot imutável 2.6) — SEM segundo builder nem segundo catálogo (INV-FORM-01). Introduz o ROTEAMENTO de autorização por contexto do Formulário (DBT-AUTHZ-01): contexto DATABASE resolve o poder por `database-authz` (3.2 — Admin da Org / Admin do Database gerenciam; MEMBER/VIEWER só leem), enquanto PIPE_INITIAL/PHASE seguem por `pipe-authz`; guard/`ability.ts` (C3) NÃO tocado — `@Requer('ler','Database')` grosso (aberto na 3.2) + guarda fina no serviço. Escopo congelado: SOMENTE o schema (Formulário de Database: montar/evoluir/publicar). Criação de Registro, ação `Novo Registro` e submissão = 3.4 (FORA). Campo Arquivo permanece gated (AD-28, 3.7/3.8). Imutabilidade da versão publicada = do banco (GRANT sem UPDATE/DELETE em FormVersion) — é o que garante que evolução de schema não corrompe Registros já criados (contrato consumido por 3.4).
---

# Story 3.3 — Formulário de Database (schema visual do Registro)

**As a** Admin da Organização ou Admin do Database,
**I want** definir, evoluir e publicar o schema visual do Registro reutilizando o Form Builder canônico,
**So that** os dados do Database sejam estruturados sem um segundo builder e sem corromper Registros já criados.

**Status: done.** Terceira Story do **Épico 3** (Databases, Registros, Vínculos e Arquivos), risco
**CRÍTICO** — ativa o **contexto `DATABASE`** do `Form` (materializado como stub na 2.4: "DATABASE é contrato
do E3, sem owner ainda") **reutilizando integralmente** o Form Builder de E2 (2.4 montagem, 2.5 evolução segura
de Campos, 2.6 publicação por `FormVersion` imutável). Introduz o **owner `Form.databaseId`** e roteia a
**autorização fina por contexto** do Formulário: o Formulário de Database resolve o poder por `database-authz`
(3.2), não por `pipe-authz`. O **catálogo canônico dos 12 tipos** e a estrutura comum de Campo são os mesmos —
**sem segundo builder/catálogo**, contextos isolados (INV-FORM-01). O terceiro dos **três Formulários
independentes** (inicial, de Fase, de Database) passa a existir de fato.

## Invariantes do dono (não erodir)

- **`Database ≠ Pipe`** (RN-061): o Formulário de Database é dono por `Database`; as **rotas** e o **subject CASL**
  são de Database; reusa-se a LÓGICA do builder (platform-level), nunca as entidades/rotas de Pipe.
- **Schema visual não permite injeção nem tipo arbitrário:** só os **12 tipos canônicos** (`FieldType`); o
  `typeConfig` passa pela **allowlist de chaves** e limites de `option-config.ts` (2.5, fail-closed); nenhuma
  entrada do cliente vira coluna/DDL/tipo novo. O snapshot valida schema/limite antes de publicar (`snapshot.ts`).
- **Isolamento por Organização e por Database:** RLS ENABLE+FORCE já vigente em `Form`/`Field`/`FormVersion`;
  toda query por `withTenantContext`; `orgId`/`databaseId` do payload nunca são confiados (owner resolvido no
  servidor; o Database é relido sob RLS).
- **Alterações de schema não corrompem Registros existentes:** a versão publicada é **`FormVersion` imutável**
  (GRANT do runtime só `SELECT`/`INSERT`, sem UPDATE/DELETE — garantia do banco, 2.6); editar o rascunho **não**
  altera versões já publicadas. Registros (3.4) referenciarão `formVersionId` congelado (AD-12).
- **Nenhuma exclusão física sem requisito:** `Form`/`Field`/`FormVersion` seguem **sem GRANT de DELETE**;
  arquivar Campo é `state` (2.5); despublicar é ponteiro (2.6).
- **MEMBER/VIEWER ganham apenas os poderes previstos:** configurar/publicar o schema exige **gerenciar o Database**
  (Admin da Org / Admin do Database); MEMBER (operar) e VIEWER (ler) do Database **apenas leem** o schema. O poder
  diferencial de MEMBER sobre Registros segue **dormente** (3.4).
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso (aberto na 3.2) + guarda fina no serviço
  (DBT-AUTHZ-01). `ability.ts`/`authz.guard.ts` não tocados.
- **Não antecipar 3.4+:** SEM criação de Registro, SEM ação `Novo Registro`, SEM submissão. Campo Arquivo
  permanece gated (AD-28, funcional só em 3.7/3.8).

## Escopo (do épico, congelado)

**Dentro:**
- Ativar o contexto `DATABASE` do `Form`: owner `databaseId` (migration: coluna + FK + CHECK de coerência +
  índice), com o Formulário de Database **isolado** dos contextos de Pipe (INV-FORM-01).
- **Montagem** (2.4): obter (getOrCreate lazy no adicionar; ler não cria), adicionar e reordenar Campo no
  contexto Database.
- **Evolução segura de Campos** (2.5): editar rótulo/ajuda/valor padrão (não `type`), arquivar/restaurar Campo,
  ciclo de opções de Seleção — todos válidos no contexto Database.
- **Publicação** (2.6): publicar/despublicar/ler estado e versão do Formulário de Database (snapshot imutável).
- Autorização por contexto: DATABASE → `database-authz` (gerenciar = Admin da Org / Admin do Database; ler =
  qualquer poder no Database). Rotas Database-específicas (`databases/:databaseId/form...`), subject `Database`.

**Fora (Stories futuras):**
- Criação de Registro, ação `Novo Registro`, submissão do Formulário de Database → **3.4**.
- Histórico do Registro, navegação/filtragem de tabelas, vínculo Card↔Registro → 3.4/3.5/3.6/3.9.
- Campo Arquivo funcional / anexos → 3.7/3.8 (gate AD-28 mantido).
- Permissões por Campo (fora da Fase 1).

## Acceptance Criteria

- **AC1 — builder canônico, sem segundo builder (INV-FORM-01):** dado o contexto Database, ao montar um schema,
  usa-se o **catálogo canônico dos 12 tipos** e a estrutura comum de Campo, **isolado** dos contextos de Pipe
  (um Campo do Formulário de Database nunca aparece no Formulário inicial/de Fase e vice-versa), sem segundo
  builder nem segunda tabela de Campo.
- **AC2 — contexto sempre identificado:** o Formulário devolvido identifica `context='DATABASE'` e o owner
  (`databaseId`); ler NÃO cria (leitura sem efeito colateral); montar o 1º Campo materializa o `Form`.
- **AC3 — evolução segura (2.5):** editar rótulo/ajuda/valor padrão, arquivar/restaurar Campo e o ciclo de
  opções de Seleção funcionam no contexto Database; `type` permanece imutável.
- **AC4 — publicação e imutabilidade (2.6):** publicar congela uma `FormVersion` imutável (snapshot dos Campos
  ativos); despublicar zera o ponteiro (preserva histórico); a versão publicada **não** pode ser alterada
  (runtime sem UPDATE/DELETE em `FormVersion` → `permission denied`). Ler devolve estado + snapshot.
- **AC5 — autorização por Database:** **gerenciar** o Database (Admin da Org / Admin do Database) monta/evolui/
  publica; **MEMBER/VIEWER** do Database só **leem** o schema (403 ao mutar); **sem acesso** ao Database → **404
  não-enumerante**. Guard C3 congelado.
- **AC6 — isolamento por Organização/Database:** RLS prova que um Formulário de Database de outra Org é
  invisível; `orgId`/`databaseId` do cliente nunca são confiados; owner cross-tenant/cross-database → 404.
- **AC7 — sem antecipar 3.4:** não há rota de criação de Registro/`Novo Registro`/submissão; Campo Arquivo segue
  gated (AD-28). O estado de publicação é **exposto** para o consumidor 3.4, sem materializar Registro.

## Tasks / Subtasks

- [ ] **T001 — Gate pré-código:** `context7-check` (Prisma 6.19.x — ALTER/CHECK/índice; NestJS 11) +
  `pre-implementation-check`. Registrar em `gates/3-3/T001-pre-code-gate.md`.
- [ ] **T002 — Migration `..._database_forms`:** `ALTER TABLE "Form" ADD COLUMN "databaseId" UUID` + FK →
  `Database` (onDelete Cascade); **CHECK de coerência de owner por contexto** (PIPE_INITIAL→pipeId; PHASE→phaseId;
  DATABASE→databaseId; os demais NULL); índice `[orgId, databaseId]`. **Sem** GRANT novo (Form já SELECT/INSERT/
  UPDATE, sem DELETE). Rollback cirúrgico (`rollback/..._database_forms.down.sql`) que só remove a coluna/FK/CHECK/
  índice, sem tocar Field/FormVersion nem os owners de Pipe.
- [ ] **T003 — Schema Prisma:** `Form.databaseId String? @db.Uuid` + relação `Database.forms Form[]` (back-relation);
  `@@index([orgId, databaseId])`. Regenerar o client.
- [ ] **T004 — Generalizar `form-locate.ts`:** `AlvoFormulario` ganha `databaseId?`; `resolverContexto` deriva
  `DATABASE`/owner; `acharForm` filtra por `databaseId`; `SELECT_FORM` inclui `databaseId`. Isolamento por owner
  preservado.
- [ ] **T005 — Roteamento de autorização por contexto (DBT-AUTHZ-01):** helper `form-authz` (ou roteamento nos
  serviços) que, quando `alvo.databaseId`, resolve por `database-authz` (`exigirGerenciarDatabase`/
  `resolverPoderNoDatabase`, 3.2); senão por `pipe-authz`. **Sem** ciclo de módulo (funções puras). Guard não tocado.
- [ ] **T006 — Serviços do builder aceitam o alvo Database:** `FormsService` (montagem), `FieldsService`
  (evolução), `FormPublicationService` (publicação) passam a aceitar `AlvoFormulario` com `databaseId` e a rotear
  a autz por T005. O contexto DATABASE do Formulário de Fase (`requisitoEntrada/Saida`, `publicEnabled`) permanece
  **inaplicável** (CHECK impede).
- [ ] **T007 — Controllers Database-específicos:** `databases/forms/` — rotas sob `@Controller('databases/:databaseId')`,
  todas `@Requer('ler','Database')`, reusando os serviços do builder com `{ databaseId }`. Montagem (obter/adicionar/
  reordenar Campo), evolução (editar/arquivar/restaurar Campo, opções de Seleção) e publicação (publicar/despublicar/
  estado/versão). Status: criação de Campo → 201; transições/reorder/publicar → 200.
- [ ] **T008 — Fiação de módulos sem ciclo:** expor/compartilhar os serviços do builder para o módulo Databases
  (import de PipesModule ou extração para módulo compartilhado — decisão do Spec Kit); `database-authz` importado
  como função pura (sem provider).
- [ ] **T009 — Testes RLS (PostgreSQL real):** `database-forms-rls` — Form/Field/FormVersion do contexto DATABASE
  isolados por Org; CHECK de coerência de owner (fase vermelha: inserir DATABASE sem databaseId, ou com pipeId,
  falha); FormVersion sem UPDATE/DELETE (permission denied); owner cross-database invisível.
- [ ] **T010 — Testes HTTP (porta real):** `database-forms-http` — AC1 (catálogo canônico, isolamento de contexto),
  AC2 (obter não cria; adicionar materializa), AC3 (evolução), AC4 (publicar/despublicar/imutabilidade), AC5
  (gerenciar × MEMBER/VIEWER × sem acesso → 404), AC6 (cross-tenant), AC7 (sem rota de Registro; Arquivo gated).
- [ ] **T011 — Regressão de E2:** provar que a generalização do builder **não** alterou o comportamento dos
  Formulários inicial/de Fase (suíte de 2.4/2.5/2.6/2.15 verde).
- [ ] **T012 — SC-206:** deploy → rollback cirúrgico → reapply em PostgreSQL descartável.
- [ ] **T013 — Atualizar `CLAUDE.md`** (bloco de estado 3.3: contexto DATABASE ativo; owner `Form.databaseId`;
  roteamento de autz por contexto; builder único reusado).
- [ ] **T014 — Revisão adversarial CRÍTICA** (Segurança; Arquitetura/RLS; Edge Cases; Aceite) — CRITICAL/HIGH com
  regressão e mutação obrigatórias.
- [ ] **T015 — `commit-check`** → PR → CI → merge → closure BMAD.

## Dev Notes

### Reuso do Form Builder (INV-FORM-01) — o núcleo é platform-level
O builder (`FormsService`/`FieldsService`/`FormPublicationService`, `snapshot.ts`, `option-config.ts`,
`file-gate.ts`) é **canônico e independente de domínio** (os três Formulários são independentes, mas compartilham
a MESMA maquinaria). A 3.3 **não** cria um segundo builder: generaliza o alvo (`AlvoFormulario` ganha
`databaseId`) e o roteamento de autorização. O catálogo dos 12 tipos e a estrutura de `Field` são os mesmos.

### Owner do Formulário e coerência (migration)
`Form` hoje tem `pipeId?`/`phaseId?` e `context ∈ {PIPE_INITIAL, PHASE, DATABASE}`; DATABASE nasceu como stub
sem owner (2.4). A 3.3 adiciona `databaseId?` e um **CHECK de coerência**: exatamente o owner do contexto está
preenchido, os demais NULL. `publicEnabled` já é barrado fora de PIPE_INITIAL (CHECK da 2.8) — DATABASE nunca é
público. `requisitoEntrada/Saida` só valem em PHASE (2.15) — DATABASE nunca os usa.

### Autorização por contexto (DBT-AUTHZ-01)
O Formulário inicial/de Fase resolve o poder por `pipe-authz` (config do Pipe). O Formulário de **Database**
resolve por `database-authz` (3.2): **gerenciar** = Admin da Org **ou** Admin do Database (grant `role=ADMIN`);
**ler** = qualquer poder no Database (ADMIN/MEMBER/VIEWER concedido); **sem acesso** → 404 não-enumerante. Isso
mantém o teto e a hierarquia da 3.2 e **não** concede poder novo a MEMBER/VIEWER (eles só leem o schema).

### Imutabilidade = não corromper Registros (contrato de 3.4)
A garantia "alterar o schema não corrompe Registros já criados" é a **imutabilidade de `FormVersion`** (2.6): o
runtime não tem UPDATE/DELETE nela. Registros (3.4) referenciarão a `formVersionId` publicada no ato da criação
(definição congelada, AD-12). Em 3.3 **não há Registro** — a 3.3 entrega o schema publicável e o estado de
publicação que 3.4 consumirá; a AC de "rascunho não recebe submissões" é o **contrato** que 3.4 impõe.

### Fiação de módulos (sem ciclo)
Os serviços do builder vivem em `PipesModule`. Para reusá-los em controllers de Database, o Spec Kit decide entre
(a) importar/exportar os serviços via módulo, ou (b) extrair o builder para um módulo compartilhado. `database-authz`
é função pura (sem provider) — importável por `pipes/forms/*` sem ciclo de DI.

### Referências
FR-17; D3.2/D3.5; INV-FORM-01; AD-12/AD-28; RN-061; DBT-AUTHZ-01. Consome: Form Builder (2.4/2.5/2.6/2.15),
Database + database-authz (3.1/3.2). Fora: Registro/Novo Registro/submissão (3.4).

## Questões para o Spec Kit (clarify)

- **Q1 — Localização dos controllers e fiação:** (a) `databases/forms/` importando os serviços do builder
  exportados por `PipesModule`; (b) extrair o builder para um `FormsModule` compartilhado importado por Pipes e
  Databases. Preferir a de **menor cirurgia** que preserve "sem segundo builder" e evite ciclo.
- **Q2 — CHECK de coerência de owner:** materializar o CHECK completo (todos os contextos) agora, ou só a cláusula
  DATABASE, reconciliando com o CHECK existente da 2.4 (se houver)?
- **Q3 — Superfície da 3.3 vs 3.4:** a 3.3 expõe `estado`/`versão` da publicação (para 3.4 consumir) sem
  qualquer rota de submissão/Registro — confirmar o corte exato.
- **Q4 — Campo Arquivo no schema:** permitir **montar** um Campo Arquivo no schema de Database (gated, não
  funcional até 3.7/3.8) ou bloquear a montagem? Alinhar ao comportamento de E2 (o tipo existe no catálogo; o
  gate é na publicação/uso).

## Change Log

| Data | Mudança |
|------|---------|
| 2026-07-16 | Story criada (E3, Wave 4) a partir de `epics.md` (Story 3.3) e da Spine (FR-17, INV-FORM-01, AD-12). Risco **CRÍTICO** (ativa o contexto DATABASE do Form: coluna owner + CHECK + índice; roteamento de autz por contexto). Escopo **congelado**: só o schema (montar/evoluir/publicar o Formulário de Database) reutilizando o Form Builder de E2 — sem segundo builder/catálogo. Registro/`Novo Registro`/submissão = 3.4 (fora). Campo Arquivo gated (AD-28). Guard C3 congelado. Dependências 3.1/3.2/2.4/2.5/2.6 `done`. Status → **ready-for-dev** (após create-story). |
| 2026-07-16 | Implementada, revisada (revisão adversarial CRÍTICA em 4 camadas — Segurança/Arquitetura-RLS/Edge/Aceite — sem achado CRÍTICO/ALTO), integrada pelo **PR #78** (merge `8580e2d`) com CI **verde** nos 4 jobs (Qualidade, Segurança/Trivy, Testes PostgreSQL real, Containers) e drill de migration/rollback/reapply (**SC-206**) verde. Status → **done**. |

## Review Findings

Revisão adversarial CRÍTICA (4 camadas read-only, em paralelo sobre o diff da 3.3): **Segurança**, **Arquitetura/RLS**, **Edge Cases** e **Aceite**. **Nenhum achado CRÍTICO/ALTO de código.** Aceite **APROVADO** (AC1–AC7 e invariantes do dono atendidos; guard C3 congelado confirmado por `git diff 53ad4b8 -- kernel/authz/` vazio).

- **Segurança:** roteamento de autz por contexto sólido (todo sítio de mutação/leitura passa por `form-authz`; MEMBER/VIEWER do Database só leem → 403 ao mutar; sem acesso → 404 não-enumerante); CHECK de owner correto; sem GRANT novo; `FormVersion` imutável preservada; sem ciclo de módulo. 1 LOW (rollback) endereçado.
- **Arquitetura/RLS:** INV-FORM-01 preservado (controllers reusam os 3 serviços canônicos, zero segundo builder); generalização **aditiva** sem regressão de E2 (caminho Pipe/Fase é o default); migration coerente com o padrão de owner; fiação unidirecional Databases→Pipes sem ciclo.
- **Edge Cases / Aceite:** produção correta; achados = **lacunas de teste (MÉDIO)**, **endereçadas** na própria Story (opções de Seleção; mutação por MEMBER → 403; publicação inválida 404/400; publish/unpublish por Admin do Database; aresta DATABASE+phaseId no CHECK).

**Achados endereçados nesta Story:** (1) **LOW** — rollback re-adiciona o CHECK de 2 cláusulas antes de dropar a coluna; é **fail-safe por construção** (transação implícita do Postgres reverte o rollback inteiro se houver Form `DATABASE`), com **pré-condição documentada** no `.down.sql`. (2) **MÉDIO** — 4 casos de teste adicionados (14/14 em PostgreSQL real). (3) **Doc** — contrato `database-forms.http.md` corrigido (publish → **201**, paridade com E2; o código já retornava 201).

**Evidência de execução:** typecheck/lint/format/build verdes; testes-alvo **14/14** em PostgreSQL real; suíte serial **695/696** (a única falha é `login-http` rate-limit, **flake ambiental** alheio à 3.3 — verde 23/23 isolado); **SC-206** verde; CI do PR #78 verde nos 4 jobs.

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
