---
story_key: 2-2-papeis-e-acesso-por-pipe
epic: 2
status: in-progress
release: CORE (Lote 2 — WAVE 2 do épico)
risco: CRÍTICO
baseline_commit: pendente (empilha sobre a 2.1 / PR #17)
gate_arquitetura: Concessão explícita de papel POR Pipe (nova entidade org-scoped + RLS + migration). Estende o acesso a Pipe da 2.1 (que só o Admin da Org tinha) a MEMBER/GUEST por concessão. Toca o invariante-mãe (isolamento por Organização) E o substrato CASL (autorização por RECURSO, não só por tipo). Consome D1.4 (OQ-2) e D1.3 (OQ-1) já aprovadas no PRD. Escopo congelado: SOMENTE papéis e acesso por Pipe; acesso/concessão de Card = 2.10; modos condicionais ("visão restrita"/"apenas formulário inicial") NÃO são papéis.
---

# Story 2.2 — Papéis e acesso por Pipe

**As a** Administrador da Organização,
**I want** conceder papéis por Pipe,
**So that** cada pessoa acesse apenas os processos autorizados.

**Status: ready-for-dev.** Classificada **CORE (Lote 2, WAVE 2 do épico)**, risco **CRÍTICO** — introduz
a **autorização por recurso** (não só por tipo) sobre a entidade `Pipe` da Story 2.1, com **nova entidade
de concessão, RLS e migration versionada**, tocando o **invariante-mãe** (isolamento por Organização).
Consome **D1.4/D1.3** (decisões de Produto já aprovadas, OQ-1/OQ-2) e o substrato de autorização C3 (1.6).
Dependências **2.1** (sujeito CASL `Pipe` + tabela `Pipe`) e **1.6** (authz) — a 2.1 está **em review**
(PR #17); esta Story empilha sobre ela.

> **Escopo congelado:** **somente papéis e acesso POR Pipe.** Acesso/concessão de **Card** é da **2.10**
> (WAVE 2). Os "modos condicionais" **"visão restrita"** e **"apenas formulário inicial"** **não** são
> papéis oficiais (D1.4) e ficam **fora**. Não antecipar (Constitution II).

---

## Escopo (do épico + D1.4, congelado)

Admin da Org concede **papéis por Pipe**: **Admin do Pipe**, **Membro do Pipe**, **Somente leitura** — por
**concessão explícita por Pipe**; Admin da Org acessa **todos**; Membro/Convidado só onde receberam papel;
**ausência de papel = sem acesso**; **no máximo um papel efetivo por Pipe**; **Admin do Pipe ≠ Admin da
Org** (Admin do Pipe administra a config do Pipe conforme aprovado, mas **não** controla o ciclo de vida do
Pipe — criar/arquivar/restaurar continua sendo do Admin da Org, Story 2.1).

**Rastreabilidade:** FR-7; D1.4 (OQ-2), D1.3 (OQ-1); NFR-4; AD-9. **Dep.:** 2.1, 1.6.
[Source: epics.md#Story-2.2; prd §D1.4/D1.3; ARCHITECTURE-SPINE.md#AD-9]

**Fora do escopo:**
- **Acesso e concessão de Card** (2.10, WAVE 2) — "concessão direta de Card", Responsável, Observador,
  Comentador (D1.5) **não** entram aqui.
- **Modos condicionais** "visão restrita" e "apenas formulário inicial" (D1.4 — são modificadores, não
  papéis; "apenas formulário inicial" atado a OQ-10/R3).
- **Fases** (2.3), Formulários (2.4+), Cards (2.7+).
- **Publicar/despublicar** e demais ações nomeadas que exijam concessão explícita própria (D1.3) — só
  quando a capacidade existir.

**Demonstração vertical:** Admin da Org concede "Membro do Pipe" a um MEMBER num Pipe específico; esse
MEMBER passa a ver/editar **apenas aquele** Pipe (não os outros); um MEMBER sem concessão **não** vê o Pipe
(404, sem revelar o recurso); revogar a concessão remove o acesso; outra Organização nunca é afetada (RLS).

---

## Acceptance Criteria

1. **AC1 — sem papel, sem acesso (sem revelar o recurso).** *Given* um usuário sem papel num Pipe *When*
   tenta acessá-lo (ler/editar/administrar) *Then* o acesso é **negado** e o recurso **não é revelado**
   (404 indistinguível de "não existe", como na 2.1 — não-enumeração). Vale para MEMBER e GUEST; o Admin
   da Org é a exceção (AC3).
2. **AC2 — concessão dá exatamente o poder do papel, no máximo um por Pipe.** *Given* uma concessão de
   papel de Pipe (Admin do Pipe / Membro do Pipe / Somente leitura) *When* aplicada *Then* o usuário tem
   **exatamente** o poder daquele papel sobre **aquele** Pipe, e **no máximo um** papel efetivo por Pipe
   (conceder um segundo papel substitui ou é recusado — decisão do Plan). **Somente leitura** consulta sem
   editar/mover; **Membro do Pipe** edita recursos acessíveis do Pipe; **Admin do Pipe** administra a
   config do Pipe conforme aprovado, **sem** controlar o ciclo de vida do Pipe (que é do Admin da Org).
3. **AC3 — Admin da Org acessa qualquer Pipe sem concessão.** *Given* o Administrador da Organização
   *When* acessa qualquer Pipe da sua Org *Then* tem acesso **sem** concessão explícita — o papel de
   Organização já concede (preserva o comportamento da 2.1). Admin do Pipe **≠** Admin da Org.
4. **AC4 — isolamento (RLS) e revogação provados.** *Given* dois tenants e uma concessão *When* revogada
   *Then* o acesso cessa; um usuário de outra Organização **nunca** vê a concessão nem o Pipe; toda a
   tabela de concessão é **org-scoped por RLS** (FORCE), e a autorização fina por Pipe é imposta no
   **servidor** (não no frontend).

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** `context7-check` (Prisma migration + CASL por recurso), `pre-implementation-check`
  (risco CRÍTICO; nova tabela + RLS; autorização por recurso), `security-check`, `lgpd-check` (concessão
  liga Account↔Pipe — verificar exposição), `migration-check` (versionada + rollback + banco descartável),
  `backup-check`, `observability-check`.
- [ ] **T2 — Schema + migration + rollback.** Nova entidade de **concessão de papel por Pipe** (nome a
  definir no Plan: `PipeMembership`/`PipeGrant`): `id`, `orgId`, `pipeId` (FK `Pipe`), `membershipId`
  (FK `Membership` — o vínculo Account×Org; papel por Pipe **não** liga direto à Account global) OU
  `accountId` (decisão do Plan, ver Dev Notes), `role` (enum `PipeRole`: `ADMIN`/`MEMBER`/`VIEWER` — nomes
  a fixar), timestamps. **Unicidade `(pipeId, membershipId)`** (no máximo um papel por Pipe por pessoa).
  RLS ENABLE+FORCE, policies por `orgId = current_org_id()`; GRANT SELECT/INSERT/UPDATE/DELETE **a
  decidir** (revogação pode ser DELETE **ou** soft-delete — ver Dev Notes; se DELETE, escrever o teste do
  escopo). Rollback `.down.sql`. `prisma generate`.
- [ ] **T3 — Autorização (CASL) — o ponto crítico (DBT-AUTHZ-01).** A granularidade fina por Pipe **NÃO**
  pode ser condition avaliada no `AuthzGuard` (que é a guarda **grossa**, org-scoped — ver o débito). A
  checagem "este principal pode esta ação sobre ESTE Pipe" ocorre no **serviço**, com o Pipe **e** a
  concessão carregados: `ability.can(acao, subject('Pipe', pipeComConcessao))`. Estender `ability.factory`
  para MEMBER/GUEST **com base na concessão carregada** (não conceder no vácuo). O guard continua barrando
  quem não pode o tipo na Org; o serviço barra quem não tem o Pipe. **Preservar** o caminho do Admin da Org
  (AC3). Não alterar o mecanismo C3 (a mudança de arquivo do guard da 2.1 já está decidida — não reabrir).
- [ ] **T4 — Módulo (runtime).** Endpoints de concessão sob `withTenantContext`: conceder papel, listar
  concessões de um Pipe, alterar papel, revogar. E ajuste do `PipesService`/listagem: MEMBER/GUEST passam
  a **enxergar os Pipes concedidos** (a RLS isola por Org; o filtro por concessão é da query/serviço, pois
  a RLS de `Pipe` é org-scoped, **não** pipe-scoped). Registrar no `AppModule`.
- [ ] **T5 — Testes (PostgreSQL real).** Concessão dá exatamente o poder do papel; sem papel → 404
  (não-enumeração); no máximo um papel por Pipe; Admin da Org acessa sem concessão; revogação corta o
  acesso; isolamento cross-tenant da tabela de concessão; MEMBER com papel em Pipe X **não** enxerga Pipe Y;
  autorização por recurso provada no serviço (fase vermelha: sem concessão, negado). Migration
  deploy+rollback (SC próprio). Regressão da 2.1 (o acesso do Admin da Org **não** pode regredir).
- [ ] **T6 — Documentação + gates finais.** Atualizar `CLAUDE.md` (bloco de estado), Spec Kit,
  `safe-implementation`, `code-review` + revisão adversarial **independente** (não subagente do
  implementador — lição do PR #17), `security-check` final, `commit-check`.

---

## Dev Notes

### A decisão de modelagem que o Plan deve fechar (não pré-decidir na Story)
1. **A quem a concessão se liga: `Membership` ou `Account`?** O invariante é identidade **Account global +
   Membership por Org**. Um papel por Pipe vive **dentro** de uma Org, então ligar a `Membership`
   (Account×Org) é o mais coerente com AD-7/AD-10 e com a RLS org-scoped — a FK carrega o `orgId` pela
   própria Membership. Ligar direto a `Account` exigiria carregar `orgId` à parte e reabriria a porta de
   uma concessão "sem Org". **Recomendação:** `membershipId`. Fechar no Plan.
2. **Revogação = DELETE ou soft-delete (`state`)?** A 2.1 provou que "sem exclusão definitiva" pode ser
   fronteira de banco. Para concessão, a semântica é diferente: revogar acesso **deve** cortar o acesso.
   Um soft-delete (`REVOKED`) preserva trilha e é simétrico a `MembershipState`; um DELETE é mais simples
   mas perde histórico. **Recomendação:** soft-delete com `state`, auditado — coerente com a trilha
   (`MODELOS_AUDITADOS`). Fechar no Plan; se for DELETE, o GRANT precisa do teste de escopo.
3. **Nomes do enum `PipeRole`** e se "Somente leitura" é `VIEWER`/`READONLY`. Fechar no Plan.

### Autorização por RECURSO — consome o débito DBT-AUTHZ-01
O `AuthzGuard` é a guarda **grossa**: "papel pode a ação sobre o TIPO Pipe, nesta Org". A 2.2 introduz a
guarda **fina**: "sobre ESTE Pipe". Ela **não** é uma condition do guard (o guard não carrega o recurso do
banco — ver `gates/2-1/debitos-gerados.md#DBT-AUTHZ-01`). A checagem fina é no **serviço**, com o Pipe e a
concessão já carregados. Isto **não** exige mexer no guard nem reabrir C3.

Consequência para a listagem: hoje (2.1) MEMBER/GUEST são negados no tipo Pipe. Na 2.2 eles passam a poder
o tipo (para ter acesso a **algum** Pipe), e o serviço filtra **quais** pela concessão. A RLS de `Pipe`
continua **org-scoped** (não pipe-scoped) — o filtro por concessão é da query, com cuidado para **não**
vazar a existência de Pipes não concedidos (mesma não-enumeração da 2.1: 404, não 403 que revela).

### Isolamento (AD-6, invariante-mãe)
A tabela de concessão recebe **ENABLE + FORCE ROW LEVEL SECURITY**, policies por `orgId = current_org_id()`
(simétrico a `Membership`/`Pipe`). Toda query por `withTenantContext`. A concessão **nunca** cruza Org.

### Preservar a 2.1 (regressão proibida)
O acesso do **Admin da Org** a qualquer Pipe (AC3) é o comportamento da 2.1 e **não pode regredir**. A 2.2
**adiciona** acesso condicional a MEMBER/GUEST; não remove nem enfraquece o do ADMIN. A suíte da 2.1 deve
continuar verde.

### Dependência do PR #17 (2.1 em review)
Esta Story **empilha** sobre a branch da 2.1. Enquanto o PR #17 não fizer merge: **não** abrir PR desta
contra `main`; **não** alterar a migration da 2.1; **não** criar migration concorrente incompatível. Após
o merge da 2.1, rebasear sobre o novo `main`, revalidar diff/migration/CASL/RLS/testes, e então abrir o PR.
Correções da 2.1 têm **prioridade imediata** sobre esta preparação.

### Observabilidade / LGPD
Concessão liga uma **pessoa** (via Membership) a um Pipe — o `lgpd-check` deve confirmar que isso não
expõe PII indevida (o payload não deve vazar e-mail; usar identificadores internos). Mutações de concessão
entram na trilha de auditoria (`MODELOS_AUDITADOS`): conceder e revogar são exatamente o que se quer
auditar (D1.6 / AD-31 — alertar mudança de papel/Membership).

### References
- [Source: epics.md#Story-2.2] — escopo, AC, dependências, "Fora: acesso/concessão de Card (2.10)".
- [Source: prd §D1.4 (OQ-2)] — papéis oficiais de Pipe; concessão explícita por Pipe; Admin do Pipe ≠ Admin
  da Org; modos condicionais não são papéis.
- [Source: prd §D1.3 (OQ-1)] — matriz papel×verbo (Pipes: Administrar/Editar acessíveis/conforme papel).
- [Source: ARCHITECTURE-SPINE.md#AD-9] — CASL por `action + subject + conditions`; ausência de regra =
  negado; autorização por recurso dentro do escopo de Org.
- [Source: gates/2-1/debitos-gerados.md#DBT-AUTHZ-01] — a granularidade fina é no serviço, não no guard.
- [Source: apps/api/src/pipes/*, kernel/authz/*] — padrão a estender (2.1).

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (Claude Code)

### Debug Log References

**Incremento 1 (gestão de concessões) — 2026-07-13.** Implementado em branch empilhada sobre a 2.1.

Dois falsos negativos de *arranjo de teste* encontrados e corrigidos (nenhum era defeito do código):
- **Regex de UUID no DTO** rejeitava os ids sintéticos de Membership do seed (`a1a1a1a1-0000-...`, sem
  nibble de versão v1–5). Relaxado para o FORMATO UUID (o que a coluna `@db.Uuid` aceita) — a fronteira
  real de existência/escopo é a RLS + validação no serviço, não o regex.
- **Suíte "verde" que eu li como vermelha:** rodei a suíte com `set -a && . ./.env` no shell; o `.env` tem
  `NODE_ENV=development`, que troca o transporte do Pino para o modo *pretty* (escreve no fd, fora do
  `process.stdout.write`), quebrando os 2 testes de captura de log (`login-http`, `sessao`). Rodada do
  jeito do projeto (`pnpm --filter @giraffe/api test`, sem sourcear `.env`): **266/266**. O código nunca
  esteve quebrado; o defeito era a minha invocação.
- **Colisão no índice parcial dentro do próprio teste RLS:** um teste deixava uma concessão ATIVA no par
  `(pipe, pessoa)` e o teste do índice parcial colidia nele. Isolado com uma segunda Membership descartável.

### Completion Notes List

**Feito neste incremento (camada de gestão de concessões — aditiva, sem tocar o comportamento de acesso a
Pipe da 2.1):**
- Schema: enums `PipeRole`/`PipeGrantState` + model `PipeGrant` (liga a `Membership`, não `Account`).
- Migration `20260713130000_pipe_grants` com RLS ENABLE+FORCE, 4 policies, **índice único parcial**
  `(pipeId, membershipId) WHERE state='ACTIVE'` (raw SQL — Prisma 6.19.3 não expressa no schema), GRANT
  SELECT/INSERT/UPDATE **sem DELETE** (revogar é soft-delete). Rollback. **SC-228 verde** em banco
  descartável (`gates/2-2/migration-check.md`).
- Módulo `src/pipes/grants/` (service/controller/dto): conceder, listar, alterar papel, revogar. Só o
  **Admin da Org** administra concessões em 2.2 (guard `@Requer('administrar','Pipe')` — MEMBER/GUEST 403).
  Recusa 2ª concessão ativa ao mesmo par (409 pelo índice parcial); alvo de outra Org → 400; Pipe de outra
  Org → 404 (não-enumeração).
- `PipeGrant` em `MODELOS_AUDITADOS` (conceder/revogar auditados).
- Testes: `pipe-grants-rls.test.ts` + `pipe-grants-http.test.ts` (13 casos, PostgreSQL real).
- Suíte API **266/266**; typecheck/lint/format limpos.

**Deliberadamente adiado para depois do merge da 2.1 (incremento 2):** a mudança do **modelo de acesso a
Pipe** — abrir leitura a MEMBER/GUEST filtrando pela concessão (não-enumeração), 404 para Pipe não
concedido, `VIEWER` não edita. Isso reescreve `pipes.service`/`pipes.controller` e testes da **2.1** (que
hoje negam MEMBER/GUEST categoricamente) — arquivos **sob revisão externa no PR #17**. Fazer isso agora
entrelaçaria com o PR #17 e geraria retrabalho no rebase. Cobre AC1/AC3 e SC-221/222/224/227, que ficam
para o incremento 2 sobre base estável. Ver `analyze.md` RV-3.

### File List

**Novos**
- `apps/api/prisma/migrations/20260713130000_pipe_grants/migration.sql`
- `apps/api/prisma/rollback/20260713130000_pipe_grants.down.sql`
- `apps/api/src/pipes/grants/pipe-grants.{service,controller,dto}.ts`
- `apps/api/test/pipe-grants-{rls,http}.test.ts`
- `_bmad-output/implementation-artifacts/gates/2-2/migration-check.md`

**Modificados**
- `apps/api/prisma/schema.prisma` (enums + model `PipeGrant` + relações inversas)
- `apps/api/src/pipes/pipes.module.ts` (registra o módulo de concessões)
- `apps/api/src/kernel/db/tenant-context.ts` (`PipeGrant` em `MODELOS_AUDITADOS`)

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (L2/WAVE 2, Épico 2) a partir de `epics.md` (Story 2.2) e das decisões de Produto **D1.4 (OQ-2)** e **D1.3 (OQ-1)**, já aprovadas no PRD (não bloqueiam). Risco **CRÍTICO** (nova tabela de concessão + RLS + autorização por recurso). Escopo **congelado**: só papéis/acesso por Pipe (Card = 2.10; modos condicionais não são papéis). Decisões-chave deixadas para o Plan: concessão liga a `Membership` (recomendado) vs `Account`; revogação por soft-delete (recomendado) vs DELETE; nomes do enum `PipeRole`. Ponto crítico: autorização fina por Pipe é no **serviço** (DBT-AUTHZ-01), não no guard. Empilha sobre a 2.1 (PR #17, em review). Status → ready-for-dev. |
