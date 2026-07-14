# Tasks — Story 2.4: Form Builder e catálogo canônico de Campos

> Fonte: `spec.md` + `plan.md`. Risco **CRÍTICO** — novo domínio Formulário (`Form`/`Field`) org-scoped + RLS
> + migration, tocando o invariante-mãe; catálogo canônico (enum `FieldType`); reuso da resolução "config do
> Pipe" da 2.3 (helper extraído); gate AD-28 fail-closed do Campo Arquivo. Opções de Seleção em **JSON com
> UUID estável** (D4), **sem** tabela `FieldOption`. Revisão adversarial **independente** (read-only, não
> subagente do implementador). Empilha sobre a 2.3 (PR #22, na `main`).

## Phase 1: Schema, migration, RLS
- [x] **T001** `schema.prisma`: enums `FieldType` (12 tipos), `FormContext` (PIPE_INITIAL/PHASE/DATABASE — sem
  owner `databaseId`), `FieldState` (ACTIVE/ARCHIVED); model `Form` (id/orgId/context/`pipeId?`/`phaseId?`/
  timestamps) e `Field` (id/orgId/formId/label/type/help?/`typeConfig Json @default("{}")`/`defaultValue Json?`/
  `position Decimal`/state/timestamps/archivedAt?); relações inversas `forms Form[]` em `Organization`/`Pipe`/
  `Phase`; índice `(orgId, formId, state, position)`. [D1, D2, D3]
- [x] **T002** Migration `<ts>_forms/migration.sql` (ts > `phases`): enums + tabelas `Form`/`Field` + índice +
  FKs (cascade) + **CHECK contexto↔owner** em `Form` + **UNIQUE parciais** `(orgId,pipeId) WHERE
  context='PIPE_INITIAL'` e `(orgId,phaseId) WHERE context='PHASE'` + **RLS ENABLE+FORCE** em `Form` e `Field`
  + 4 policies por `current_org_id()` (**WITH CHECK** no INSERT e UPDATE) + **GRANT SELECT/INSERT/UPDATE (sem
  DELETE)** em ambas. [D2, SC-248]
- [x] **T003** Rollback `<ts>_forms.down.sql` (DROP policies/índices/CHECK/unique parciais/tabelas/enums),
  **sem tocar** `Pipe`/`Phase`/`PipeGrant`/`Membership`. `prisma generate`. [SC-249]
- [x] **T004** `Form` e `Field` em `MODELOS_AUDITADOS` (`tenant-context.ts`). **Sem `FieldOption`** (D4).

## Phase 2: Reuso da resolução de poder (helper extraído — DBT-AUTHZ-01)
- [x] **T005** **Extrair** `resolverPoder`/`exigirGerenciar` do `PhasesService` para helper compartilhado em
  `src/pipes/` (util/serviço; **não** `kernel`): `resolverPoder(pipeId) → 'gerenciar' | 'ler' | 404` (Admin da
  Org → gerenciar; senão `PipeGrant` ACTIVE da Membership + reconfere `Membership.state = ACTIVE`; `role=ADMIN`
  → gerenciar; grant não-ADMIN → ler; sem grant → 404). `PhasesService` passa a consumi-lo — **refactor
  comportamentalmente neutro** (suíte 2.3 verde). **Não tocar C3** (`ability.ts`/`authz.guard.ts`). [D6]

## Phase 3: Serviço de Formulários + rotas + gate do Arquivo
- [x] **T006** `FormsService` (via `withTenantContext`): `obterInicial(pipeId)` e `obterDeFase(pipeId, phaseId)`
  — **getOrCreate lazy** do `Form` do contexto (upsert single-statement; corrida barrada pelo unique parcial)
  + `Field[]` na ordem `position, id`; `adicionarCampo(alvo, dto)` — poder=gerenciar, tipo do catálogo, opções
  iniciais no `typeConfig.options` (UUID estável) se Seleção, `position = max ACTIVE + 1`, **um** `create`;
  `reordenarCampo(...)` — 1 UPDATE fracionário (ponto médio dos vizinhos). Formulário de Fase resolve o poder
  por `phase.pipeId`. Cada gestão exige `resolverPoder == 'gerenciar'` (senão 403); leitura exige ≥ `'ler'`
  (senão 404). [D2, D3, D4, D6, SC-241/242/243/246/247]
- [x] **T007** Gate do Campo Arquivo (D8): flag `FILE_UPLOAD_ENABLED` no env (Zod, default `false`); função
  pura `podePublicarComArquivo(fields, { fileUpload })` fail-closed (recusa `FILE` ativo com upload
  desabilitado); tipo `FILE` marcado indisponível na saída do builder. **Sem** rota de publicar, **sem**
  storage. [SC-244]
- [x] **T008** `FormsController` sob `src/pipes/forms/` (+ DTOs manuais): `GET /pipes/:pipeId/forms/initial`;
  `GET /pipes/:pipeId/phases/:phaseId/form`; `POST .../fields` (201); `POST .../fields/reorder` (200). Todas
  `@Requer('ler','Pipe')`; nenhuma aceita `orgId`; nenhuma de exclusão/publicar/editar-Campo. Payload sem
  `orgId` nem `position`. Registrar no `PipesModule`. [SC-247]

## Phase 4: Testes (PostgreSQL real, escrita na Org C)
- [x] **T009** `forms-rls.test.ts`: outra Org não vê `Form`/`Field`; INSERT/SELECT/UPDATE sem contexto NEGADO
  (**fase vermelha**); WITH CHECK via `createMany` (sem RETURNING); **sem DELETE** (`permission denied`);
  `relowner` ≠ runtime. [SC-248]
- [x] **T010** `forms-http.test.ts`: catálogo (só os 12 tipos; fora → rejeitado) [SC-241]; **identidade
  estável** do Campo e das opções de Seleção [SC-242]; **INV-FORM-01** — alterar Campos do inicial não altera
  os da Fase e vice-versa (teste comportamental dedicado, RN-054) [SC-243]; ordenação (append; reorder
  intra-Form; determinística); getOrCreate idempotente; não-enumeração 404. [SC-243]
- [x] **T011** `forms-authz.test.ts` (reusa/prova a resolução da 2.3): Admin da Org monta qualquer Pipe;
  **Admin do Pipe** (grant ADMIN + Membership ACTIVE) monta o seu, inclusive o Formulário de **Fase** (poder
  via `phase.pipeId`); **MEMBER/VIEWER** concedidos → **403** ao montar, mas leem; **Membership SUSPENDED** +
  grant ADMIN → negado; sem grant → 404. **Fase vermelha** do diferencial. [SC-246, SC-247]
- [x] **T012** `forms-file-gate.test.ts`: `podePublicarComArquivo` recusa Formulário com `FILE` ativo quando
  `FILE_UPLOAD_ENABLED=false`; aceita sem `FILE`; unit puro. [SC-244]
- [x] **T013** Regressão 2.3: `phases-authz.test.ts` verde após a extração do helper (T005). Migration deploy
  (banco limpo) + rollback (sem tocar Pipe/Phase) + reaplicação. [SC-249, migration-check]

## Phase 5: Documentação e gates finais
- [~] **T014** Atualizar `CLAUDE.md` (bloco de estado do Épico 2: passa a existir o domínio Formulário —
  `Form`/`Field`, catálogo canônico `FieldType`, Form Builder; contextos inicial/Fase funcionais, Database
  previsto no contrato; Campo Arquivo gated por AD-28; resolução de poder extraída para helper compartilhado).
  `context7-check` (Json ✓ verificado no plan), `safe-implementation`, `security-check`,
  `observability-check`, `lgpd-check`, `migration-check` + **revisão adversarial independente** (read-only),
  `commit-check`. Registrar débitos DBT-2.4-OPCOES-JSON e DBT-2.4-FILE-GATE-CONSUMO.
