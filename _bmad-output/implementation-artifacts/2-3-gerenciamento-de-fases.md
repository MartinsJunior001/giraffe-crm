---
story_key: 2-3-gerenciamento-de-fases
epic: 2
status: done
release: CORE (Lote 2 — WAVE 2 do épico)
risco: CRÍTICO
baseline_commit: pendente (empilha sobre a 2.2 / PR #20, já sobre a 2.1 / PR #17 mergeado)
gate_arquitetura: Nova entidade organizacional (Fase) com nova tabela + RLS + migration versionada, tocando o invariante-mãe (isolamento por Organização). ATIVA o poder diferencial por papel de Pipe deferido da 2.2 (débito DBT-2.2-ROLE-DORMENTE): gerenciar Fases é "config do Pipe" (PRD §7), logo o Admin do Pipe (PipeRole=ADMIN ACTIVE) passa a administrá-las — a resolução de acesso começa a LER `role` e a RECONFERIR `Membership.state`. Consome C3 (authz) sem alterar o mecanismo (guard/ability.ts congelados). Escopo congelado: SOMENTE ciclo de vida e ordenação de Fases (Formulário de Fase = 2.15; movimentação de Card = 2.14; Cards = 2.7+).
---

# Story 2.3 — Gerenciamento de Fases

**As a** Admin da Organização ou Admin do Pipe,
**I want** criar, renomear, reordenar, arquivar e restaurar Fases,
**So that** eu modele o fluxo do processo dentro de cada Pipe.

**Status: ready-for-dev.** Classificada **CORE (Lote 2, WAVE 2 do épico)**, risco **CRÍTICO** — introduz a
segunda entidade de domínio do Épico 2 (`Fase`) com **nova tabela, RLS e migration versionada**, tocando o
**invariante-mãe** (isolamento por Organização), **e** ativa o **poder diferencial por papel de Pipe** que a
Story 2.2 deixou dormente (`PipeRole` gravado, mas inerte): gerenciar Fases é **config do Pipe** (PRD §7),
então o **Admin do Pipe** passa a administrá-las. Consome os contratos congelados C1–C8 e o substrato C3
(1.6) **sem alterar o mecanismo**. Dependências **2.1** (`Pipe`, `done`/PR #17) e **2.2** (`PipeGrant` +
acesso por concessão, PR #20).

> **Escopo congelado:** **somente ciclo de vida e ordenação de Fases** (criar/renomear/reordenar/arquivar/
> restaurar) e a **autorização diferencial por papel de Pipe** que gerenciar Fases exige. **Formulário de
> Fase** é da **2.15**; **movimentação de Card** entre Fases é da **2.14**; **Cards** são de **2.7+**. Não
> antecipar (Constitution II).

---

## Escopo (do épico + RN-030/D2.2 + DBT-2.2-ROLE-DORMENTE, congelado)

Admin da Org **ou Admin do Pipe** cria/renomeia/**reordena (intra-Pipe)**/arquiva/restaura Fases de um Pipe;
**cada Fase pertence a exatamente um Pipe** e **nenhuma Fase migra entre Pipes** (RN-030); **arquivar Fase é
reversível** (preserva dados, retira do fluxo); **restaurar retorna ao final da ordem ativa**. O invariante
**"todo Pipe mantém ≥1 Fase ativa"** impede arquivar a última Fase ativa de um Pipe.

Esta Story é onde o **poder diferencial por papel de Pipe** — armazenado mas **inerte** desde a 2.2 —
**ativa** para a superfície "config do Pipe": **Admin da Org** administra Fases de **qualquer** Pipe; **Admin
do Pipe** (concessão `PipeRole = ADMIN` ACTIVE, com **Membership ACTIVE**) administra as Fases **do seu**
Pipe; **Membro/Somente leitura** (MEMBER/VIEWER concedidos) **apenas leem** as Fases; **sem acesso ao Pipe →
404 não-enumerante** (mesma resposta da 2.2). Satisfaz o **critério de correção de DBT-2.2-ROLE-DORMENTE**:
a resolução de acesso passa a **ler `role`** e a **reconferir `Membership.state`**.

**Rastreabilidade:** FR-8; RN-030 (+RN-021/031); D2.2; NFR-3/4; AD-6/AD-9/AD-10/AD-11.
**Dep.:** 2.1, 2.2. **Consome:** DBT-2.2-ROLE-DORMENTE, DBT-2.2-MEMBERSHIP-ADVISORY, DBT-AUTHZ-01.
[Source: epics.md#Story-2.3; regras-negocio-fase-1.md#RN-030; ARCHITECTURE-SPINE.md#AD-9/AD-10/AD-11]

**Fora do escopo:**
- **Formulário de Fase** (2.15) — RN-032/RN-051 não entram aqui.
- **Movimentação de Card** entre Fases (2.14) e **regras de movimentação/transição** (RN-033, PENDENTE) —
  fora.
- **Cards** (2.7+): a trava **"não arquivar Fase enquanto houver Cards ativos nela"** e o comportamento
  "impede novos Cards/movimentações para a Fase arquivada" são **contrato FUTURO** — não há tabela de Card e
  **nenhuma será materializada** para preparar o futuro (AD-11, Constitution II). Ver Dev Notes.
- **Papel diferencial de Card** (Membro do Pipe opera Cards): outra metade de DBT-2.2-ROLE-DORMENTE,
  endereçada em **2.7/2.10** — fora daqui.
- **Exclusão definitiva** de Fase (o runtime não recebe GRANT de DELETE; arquivar é estado).

**Demonstração vertical:** Admin da Org cria um Pipe, adiciona Fases, reordena-as e arquiva/restaura uma
delas; um **Admin do Pipe** (concessão ADMIN) faz o mesmo **no seu** Pipe; um **Membro/Somente leitura**
apenas vê a lista de Fases (403 ao tentar gerenciar); tentar arquivar a **última Fase ativa** é bloqueado;
outra Organização **nunca** vê as Fases (RLS).

---

## Acceptance Criteria

> BDD. Marcado com **[ROLE]** o que **depende da ativação de `role`** (poder diferencial — satisfaz
> DBT-2.2-ROLE-DORMENTE). As três primeiras linhas do épico são AC3/AC4/AC1/AC2; AC5/AC6 tornam explícitos a
> autorização diferencial e o isolamento, como nas Stories 2.1/2.2.

1. **AC1 — Fases são intra-Pipe, org-scoped, com ordem consistente.** *Given* um ator autorizado (Admin da
   Org ou Admin do Pipe) *When* cria/renomeia Fases de um Pipe *Then* elas aparecem de forma **consistente na
   ordem do Pipe**, **no escopo da Org atual**, e **nunca** em outro Pipe ou outra Organização; **cada Fase
   pertence a exatamente um Pipe** e **nenhuma Fase pertence a mais de um Pipe** (RN-030).
2. **AC2 — reordenação é intra-Pipe.** *Given* as Fases ativas de um Pipe *When* são reordenadas *Then* a
   **nova ordem persiste** e vale para consultas subsequentes; a reordenação de um Pipe **não** altera a
   ordem de outro Pipe nem de outra Organização (intra-Pipe).
3. **AC3 — invariante "≥1 Fase ativa".** *Given* um Pipe com **uma única** Fase ativa *When* se tenta
   arquivá-la *Then* o arquivamento é **bloqueado** (todo Pipe mantém ≥1 Fase ativa).
4. **AC4 — arquivamento reversível; trava por Cards ativos é contrato futuro.** *Given* uma Fase (com ≥1
   outra Fase ativa no Pipe) *When* arquivada *Then* sai do **fluxo ativo** preservando os dados; *When*
   restaurada *Then* volta ao **final da ordem ativa**, com **todos os dados preservados**. **A trava "não
   arquivar Fase enquanto houver Cards ativos nela"** (epics.md) é **contrato futuro** (Cards = 2.7+): em 2.3
   **não há Cards**, logo a precondição é **vacuamente satisfeita**; **não** se materializa tabela/relação de
   Card para preparar o futuro (AD-11, Constitution II) — mesmo tratamento que a 2.1 deu à trava de
   arquivamento de Pipe por Cards ativos (contrato futuro da 2.11).
5. **AC5 — [ROLE] poder diferencial por papel de Pipe (ATIVA DBT-2.2-ROLE-DORMENTE).** *Given* um principal
   sobre um Pipe *When* opera Fases *Then*: (a) **Admin da Org** administra Fases de **qualquer** Pipe da sua
   Org, **sem** concessão (preserva a 2.1/2.2); (b) **Admin do Pipe** — concessão `PipeRole = ADMIN` **ACTIVE**
   **e** `Membership` **ACTIVE** — administra Fases **do seu** Pipe; (c) **Membro do Pipe / Somente leitura**
   (MEMBER/VIEWER concedidos) **leem** as Fases mas **não** as gerenciam (**403** ao criar/renomear/reordenar/
   arquivar/restaurar); (d) **sem acesso ao Pipe** (nenhuma concessão ACTIVE e não-Admin) → **404
   não-enumerante** em todas as rotas de Fase (mesma resposta de "não existe" da 2.2). **Admin do Pipe ≠ Admin
   da Org**: o Admin do Pipe administra a **config** (Fases), mas **não** o **ciclo de vida do Pipe**
   (criar/arquivar/restaurar Pipe segue do Admin da Org — Story 2.1). A resolução do poder efetivo **lê o
   `role`** da concessão **e reconfere `Membership.state`** (fecha também DBT-2.2-MEMBERSHIP-ADVISORY para
   esta superfície).
6. **AC6 — isolamento (RLS) e "sem exclusão" provados.** *Given* dois tenants *When* um lê/gerencia Fases
   *Then* vê **apenas** as da própria Organização; um INSERT/SELECT/UPDATE de `Fase` **fora de contexto** (ou
   de outra Org) é **negado pelo banco** (ENABLE+FORCE RLS, policies por `current_org_id()`, WITH CHECK no
   INSERT **e** no UPDATE), não só pela aplicação; o runtime **não** tem GRANT de `DELETE` em `Fase`
   (arquivar é mudança de estado).

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** `context7-check` (Prisma 6.19.3 migration/índice; CASL 7 — leitura de `role`
  no serviço; NestJS 11), `pre-implementation-check` (risco CRÍTICO; nova tabela + RLS; **ativação de
  autorização diferencial**), `security-check`, `lgpd-check` (nome de Fase é rótulo de processo, não PII —
  confirmar como na 2.1), `migration-check` (versionada + rollback + banco descartável), `backup-check`,
  `observability-check`. Registrar em `gates/2-3/`.
- [ ] **T2 — Schema + migration + rollback.** Model `Phase` (nome a fixar no Plan; recomendação `Phase`,
  simétrico a `Pipe`): `id`, `orgId`, `pipeId` (FK `Pipe`, `onDelete: Cascade`), `name`, `state` (enum
  `PhaseState` = `ACTIVE`|`ARCHIVED`), **chave de ordenação** (representação a decidir no Plan — ver Dev
  Notes), `archivedAt` (nullable), timestamps. RLS **ENABLE+FORCE**, 4 policies por `orgId =
  current_org_id()` (WITH CHECK no INSERT **e** UPDATE), índice `(orgId, pipeId)` (+ ordenação). **GRANT
  SELECT/INSERT/UPDATE — sem DELETE** (arquivar é estado; escreva o teste do escopo do GRANT). Índice/uniqueness
  de ordenação por raw SQL se o Prisma 6.19.3 não expressar (como o índice parcial da 2.2). Rollback
  `.down.sql`. `Organization.phases` e `Pipe.phases` (relações inversas). `prisma generate`.
- [ ] **T3 — Autorização diferencial (o ponto crítico — consome DBT-AUTHZ-01 + ativa DBT-2.2-ROLE-DORMENTE).**
  A checagem "este principal pode **gerenciar** as Fases DESTE Pipe" ocorre **no serviço** (guarda fina —
  DBT-AUTHZ-01), **não** como condition do `AuthzGuard` (guarda grossa) e **sem** reabrir C3 (`ability.ts`/
  `authz.guard.ts` **não** são tocados). O serviço resolve o **poder efetivo** carregando a concessão
  `PipeGrant` da Membership atual e **lendo `role`** (`ADMIN` → gerencia; `MEMBER`/`VIEWER` → só lê),
  **reconferindo `Membership.state = ACTIVE`**, com o **Admin da Org** como bypass (AC5). **Leitura** de Fases
  segue o mesmo acesso ao Pipe da 2.2 (Admin da Org OU qualquer concessão ACTIVE → lê; senão 404). Decisão do
  Plan: filtro de serviço (como a 2.2 fez, INFO note) **ou** `ability.can('administrar', subject('Pipe',
  pipeComPapelEfetivo))` com `construirAbility` estendida (extensão de catálogo, não de mecanismo) — ver Dev
  Notes.
- [ ] **T4 — Módulo Fases (runtime).** `src/phases/` (nome no Plan) — rotas sob `withTenantContext`, todas com
  `@Requer('ler','Pipe')` como guarda **grossa** (o serviço aplica a fina): listar Fases de um Pipe,
  criar, renomear, **reordenar (intra-Pipe)**, arquivar, restaurar. Nenhuma rota aceita `orgId` do cliente;
  nenhuma rota de exclusão. `archive`/`restore`/`reorder` respondem **200** (transição, não criação); criar
  responde **201**. Registrar no `AppModule`. `Phase` em `MODELOS_AUDITADOS` (`tenant-context.ts`).
- [ ] **T5 — Testes (PostgreSQL real, escrita na Org C).** RLS de `Phase` (isolamento cross-tenant; INSERT/
  SELECT/UPDATE fora de contexto negados; WITH CHECK sem RETURNING via `createMany`; **sem DELETE**;
  `relowner` não é o runtime); ciclo de vida (criar/renomear/reordenar/arquivar/restaurar; restaurar volta ao
  final da ordem); **≥1 Fase ativa** (arquivar a última é bloqueado); RN-030 (Fase não migra entre Pipes);
  **poder diferencial em FASE VERMELHA** (Admin da Org gerencia; Admin do Pipe gerencia o seu; MEMBER/VIEWER
  concedidos → **403** ao gerenciar, mas leem; **Membership SUSPENDED** com concessão ADMIN → negado
  — reconferência de `state`; sem acesso → **404** não-enumerante); regressão da 2.1/2.2 (acesso de Admin da
  Org não regride; leitura por concessão da 2.2 intacta). Migration deploy+rollback (SC-239, banco
  descartável).
- [ ] **T6 — Documentação + gates finais.** Atualizar `CLAUDE.md` (bloco de estado: passa a existir `Fase`
  e o poder por papel de Pipe deixou de ser inerte para config), Spec Kit (`plan → checklist → tasks →
  analyze`), `safe-implementation`, `code-review` + **revisão adversarial independente** (não subagente do
  implementador — lição dos PRs #17/#20), `security-check` final, `commit-check`. Confirmar no
  **checklist de aceite** a reconferência `role` + `Membership.state` e o teste de poder diferencial (gate
  exigido por DBT-2.2-ROLE-DORMENTE).

---

## Dev Notes

### Decisões de modelagem que o Plan deve fechar (não pré-decidir na Story)

1. **Como a ordem/posição das Fases é persistida — a decisão mais afiada, por causa da restrição de
   transação.** `withTenantContext` **recusa `$transaction`** (contrato de 1.3): todas as operações da 2.1/
   2.2 são single-statement. Uma reordenação com **posição inteira contígua** exige **deslocar várias linhas**
   (multi-statement) — o que colide com essa restrição. Opções para o Plan:
   - **(A) chave de ordenação esparsa (inteiro com "gaps" grandes, decimal, ou rank lexicográfico tipo
     LexoRank):** mover uma Fase entre duas vizinhas é **um único UPDATE de uma linha** — compatível com o
     single-statement e sem transação. Restaurar ao final = `max(chave ativa) + gap`. Risco: reequilíbrio
     eventual quando os gaps esgotarem (raro; tratável por rebalance pontual). **Recomendação primária.**
   - **(B) posição inteira contígua com reordenação em um único statement** (ex.: um `UPDATE ... SET position
     = CASE ... END` via `$executeRaw` sob contexto, ou receber a **lista completa ordenada** e aplicar num
     só comando). Mantém posições limpas; exige SQL cuidadoso e ainda single-statement.
   - **(C) estender `withTenantContext` para uma transação com contexto** apenas para reordenar — **reabre
     escopo de 1.3** e adiciona risco; **desaconselhado** nesta Story.
   Recomenda-se **(A)** (ou **(B)** se o time preferir posições contíguas), decidindo também **uniqueness**:
   com (A), **sem** unicidade rígida de posição, apenas `ORDER BY chave, id` determinístico; com (B),
   `@@unique`/índice `(pipeId, posição)` **entre ACTIVE** (índice parcial por raw SQL, como a 2.2).
2. **Como o invariante "≥1 Fase ativa" é imposto.** Não há constraint de banco trivial para "pelo menos uma
   linha ACTIVE por Pipe". **Recomendação:** enforcement **no serviço** — antes de arquivar, contar Fases
   ACTIVE do Pipe; se `== 1`, recusar (400/409). Documentar como invariante de aplicação com teste dedicado.
   Cuidar da mesma armadilha de auditoria da 2.1 (`updateMany` com `count:0` → falso `denied`): usar a
   leitura-antes-de-escrever e caminho idempotente, como `arquivar`/`restaurar` de Pipe.
3. **Semeadura da primeira Fase.** Um Pipe recém-criado (2.1) hoje **não tem Fases**; RN-021 diz que "cada
   Pipe é composto por Fases". O Plan decide se **criar Pipe passa a semear uma Fase inicial** (tocaria o
   caminho de `criar` da 2.1) **ou** se o Pipe pode existir sem Fases e o invariante "≥1 ativa" só vale **a
   partir da primeira Fase criada** (impedindo arquivar a última). **Recomendação:** não alterar
   retroativamente a 2.1 sem necessidade; enforçar "≥1 ativa" **na operação de arquivar** (AC3). Registrar a
   escolha; se optar por semear, é mudança declarada no caminho de criação de Pipe.
4. **Nomes.** Model `Phase` e enum `PhaseState` (`ACTIVE`/`ARCHIVED`) — em inglês, simétrico a `Pipe`/
   `PipeState`/`PipeRole` (o schema usa nomes de model em inglês; `@@map` idem). Nome do campo de ordenação
   (`position`/`order`/`rank`) e do módulo (`phases`) a fixar no Plan.
5. **Mecanismo da autorização diferencial (CASL vs filtro de serviço).** Duas rotas satisfazem o critério de
   DBT-2.2-ROLE-DORMENTE, ambas sem tocar C3:
   - **(i) filtro no serviço** (o que a 2.2 incremento 2 efetivamente fez — ver INFO note da revisão): o
     serviço carrega a concessão ACTIVE + `Membership.state`, e decide `gerenciar` vs `só ler`. Simples,
     coerente com o já entregue. **Recomendação primária.**
   - **(ii) CASL nativo**: estender `construirAbility` para receber o **papel efetivo de Pipe** e emitir
     `can('administrar', 'Pipe', ...)` quando `PipeRole=ADMIN` — dá finalmente um **consumidor** ao `role` no
     próprio substrato (é a materialização prevista pela INFO note da 2.2). Extensão de **catálogo**, não de
     mecanismo (não altera `ability.ts` nem `authz.guard.ts`). Decidir no Plan.

### Autorização por RECURSO — DBT-AUTHZ-01 + DBT-2.2-ROLE-DORMENTE + DBT-2.2-MEMBERSHIP-ADVISORY
O `AuthzGuard` continua a guarda **grossa** ("o papel pode `ler`/`administrar` o TIPO Pipe nesta Org"). A 2.3
adiciona a guarda **fina** para a **config do Pipe**: "este principal pode **gerenciar as Fases** DESTE Pipe".
Ela **não** é condition do guard (o guard não carrega o recurso — DBT-AUTHZ-01) e vive no **serviço**, com a
concessão carregada. É aqui que **DBT-2.2-ROLE-DORMENTE** é fechado para esta superfície: a resolução passa a
**ler `role`** (`ADMIN` gerencia; `MEMBER`/`VIEWER` só leem) e a **reconferir `Membership.state = ACTIVE`**
(fechando também **DBT-2.2-MEMBERSHIP-ADVISORY**: uma Membership SUSPENDED com concessão ADMIN **não** gerencia).
O **checklist de aceite desta Story deve incluir explicitamente** essa reconferência e um teste de poder
diferencial em **fase vermelha** (papel errado / Membership não-ativa → 403/404) — é o **gate** que a revisão
da 2.2 exigiu para impedir o esquecimento.

### Isolamento (AD-6, invariante-mãe)
`Phase` recebe **ENABLE + FORCE ROW LEVEL SECURITY**, 4 policies por `orgId = current_org_id()` (WITH CHECK no
INSERT e no UPDATE), simétrico a `Pipe`/`PipeGrant`/`Membership`. Toda query por `withTenantContext`. GRANT do
runtime **SELECT/INSERT/UPDATE**, **sem DELETE** — "sem exclusão definitiva" é fronteira de banco, como em
`Pipe`/`PipeGrant`. Ao conceder o GRANT, escrever o teste que prova o escopo dele.

### Trava por Cards ativos = contrato futuro (Cards 2.7+)
A epics.md lista, como AC da 2.3, "Fase com Cards ativos não pode ser arquivada". Isso é **contrato futuro**:
não existe tabela de Card em 2.3 e **AD-11/Constitution II proíbem materializar relação só para preparar o
futuro**. Mesmo tratamento que a 2.1 deu à trava "não arquivar Pipe com Cards ativos" (deferida à 2.11):
precondição **vacuamente verdadeira** hoje, **enforced pela Story de ciclo de vida do Card** (2.7+/família
2.11), que então altera `arquivarFase`. Registrado como seam, **sem stub**. Idem "impede novos Cards/
movimentações para a Fase arquivada" (movimentação = 2.14).

### Preservar 2.1 e 2.2 (regressão proibida)
O acesso do **Admin da Org** a qualquer Pipe/Fase (AC5.a) e a **leitura por concessão** aberta na 2.2 **não
podem regredir**. As suítes da 2.1 e 2.2 devem continuar verdes. A 2.3 **adiciona** a superfície de Fases e
**ativa** o diferencial de `role` para config; não remove nem enfraquece nada anterior.

### Observabilidade / LGPD
Logs estruturados (Pino) sanitizados; **nome de Fase é rótulo de processo, não PII** (como o nome de Pipe na
2.1 — confirmar no `lgpd-check`). Mutações de Fase entram na trilha de auditoria (`MODELOS_AUDITADOS`) —
criar/renomear/reordenar/arquivar/restaurar são exatamente o que se quer auditar como mudança de config do
Pipe (AD-31/D1.6). Payload sem `orgId` (fronteira interna), sem segredo.

### References
- [Source: epics.md#Story-2.3] — escopo, AC (BDD), RN-030, dependências, "Fora: Formulário de Fase (2.15),
  movimentação (2.14)".
- [Source: regras-negocio-fase-1.md#RN-030] — cada Fase pertence a exatamente um Pipe; não há Fase
  compartilhada (`phase.pipeId`). (+ RN-021 Pipe possui fases; RN-031 Fase guia execução; **Fase ≠ Status**.)
- [Source: prd/permissoes-fase-1.md §7/§15] — "Admin do Pipe configura o pipe (**fases**, formulários,
  automações)"; gerenciar Fases é config, logo cabe ao Admin do Pipe (não ao Admin da Org exclusivamente).
- [Source: gates/2-2/revisao-independente-incremento-2.md#DBT-2.2-ROLE-DORMENTE] — critério + gate: a
  resolução de acesso passa a **ler `role`** e a **reconferir `Membership.state`**; teste de poder
  diferencial em fase vermelha; **Story 2.3** é o lote-alvo para a metade "Admin do Pipe administra config".
- [Source: gates/2-1/debitos-gerados.md#DBT-AUTHZ-01] — a granularidade fina é no serviço, não no guard.
- [Source: ARCHITECTURE-SPINE.md#AD-9/AD-10/AD-11] — CASL por action+subject+conditions; Fase é dado
  operacional org-owned; referência estável por `id`; não materializar relação para o futuro.
- [Source: apps/api/src/pipes/*, src/pipes/grants/*, kernel/authz/*, kernel/db/tenant-context.ts] — padrões
  a estender (schema/migration/RLS/GRANT, serviço por `withTenantContext`, `MODELOS_AUDITADOS`).

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (Claude Code)

### Debug Log References
_(a preencher na implementação)_

### Completion Notes List
_(a preencher na implementação)_

### File List
_(a preencher na implementação)_

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (L2/WAVE 2, Épico 2) a partir de `epics.md` (Story 2.3), RN-030/D2.2 e do débito **DBT-2.2-ROLE-DORMENTE** (revisão independente da 2.2, incremento 2). Risco **CRÍTICO** (nova tabela `Fase` + RLS + migration **e** ativação do poder diferencial por papel de Pipe). Escopo **congelado**: só ciclo de vida e ordenação de Fases + a autorização que gerenciar Fases exige (Formulário de Fase = 2.15; movimentação = 2.14; Cards = 2.7+ fora). **AC5** ativa DBT-2.2-ROLE-DORMENTE: resolução passa a ler `role` + reconferir `Membership.state` (Admin da Org e Admin do Pipe gerenciam; MEMBER/VIEWER só leem; sem acesso → 404). **AC4:** trava por Cards ativos é contrato futuro (AD-11), como na 2.1. Decisões deixadas para o Plan: representação da chave de ordenação (recomendado esparsa/rank por causa da recusa de `$transaction`); enforcement de "≥1 Fase ativa" (recomendado no serviço); semeadura da 1ª Fase; nomes; mecanismo da autorização diferencial (filtro de serviço vs CASL estendido). Ponto crítico: guarda fina no **serviço** (DBT-AUTHZ-01), `ability.ts`/`authz.guard.ts` congelados (C3). Empilha sobre a 2.2 (PR #20). Status → ready-for-dev. |
| 2026-07-13 | Implementada e mergeada na `main` (PR #22, merge commit 87e94a7) com CI verde, revisão independente completa (Security APPROVED, Edge Case APPROVED WITH LOW, Acceptance CHANGES REQUIRED → findings corrigidos: ordenação `[state,position,id]` e teste de Membership SUSPENDED) e **294/294** testes com PostgreSQL real. `migration-check` com evidência real de deploy/rollback/reaplicação. AC1..AC6 / SC-231..239 cobertos; **DBT-2.2-ROLE-DORMENTE fechado** (metade "Admin do Pipe administra config"). Débitos novos: DBT-2.3-POSITION-RENORM, DBT-2.3-ULTIMA-FASE-TOCTOU. Status → **done**. |
