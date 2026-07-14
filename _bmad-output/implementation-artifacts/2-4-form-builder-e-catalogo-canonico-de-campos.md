---
story_key: 2-4-form-builder-e-catalogo-canonico-de-campos
epic: 2
status: ready-for-dev
release: CORE (bloco 2.4–2.6, paralelo a 2.1–2.3; Sprint S5 do roadmap)
risco: CRÍTICO
baseline_commit: pendente (empilha sobre a 2.3 / PR #22, já sobre a 2.2 / PR #20 e a 2.1 / PR #17 mergeadas)
gate_arquitetura: Introduz o domínio Formulário do Épico 2 — novas entidades organizacionais (`Form` e `Field`, e possivelmente `FieldOption`) com nova(s) tabela(s) + RLS + migration versionada, tocando o invariante-mãe (isolamento por Organização). ESTABELECE o **catálogo canônico de tipos de Campo** (12 tipos, global/de plataforma — enum, não dado por Org) e o **contrato do Form Builder reutilizado pelo Épico 3** (sem segundo builder). REUSA — sem alterar o mecanismo (guard/`ability.ts` congelados, C3) — a resolução de "config do Pipe" já ativada na 2.3: configurar Formulário inicial/de Fase = **Admin da Org ou Admin do Pipe** (D3.2). Gate **AD-28 fail-closed** para o Campo Arquivo (tipo existe no catálogo, mas não é funcional antes do storage do E3). Escopo congelado: SOMENTE catálogo + estrutura do Campo + montagem do Formulário (adicionar/ordenar/listar Campos) + isolamento entre contextos (INV-FORM-01) + gate do Campo Arquivo. Evolução segura de Campos = 2.5; publicação/versionamento = 2.6; submissão/Card = 2.7+.
---

# Story 2.4 — Form Builder e catálogo canônico de Campos

**As a** usuário autorizado (Admin da Organização ou Admin do Pipe),
**I want** montar Formulários a partir de um catálogo canônico de tipos de Campo,
**So that** eu capture dados de forma consistente, com identidade estável e isolada por contexto.

**Status: ready-for-dev.** Classificada **CORE** (bloco **2.4–2.6**, paralelo a 2.1–2.3 — Sprint S5 do
roadmap), risco **CRÍTICO** — introduz o **domínio Formulário** do Épico 2 com **nova(s) tabela(s), RLS e
migration versionada**, tocando o **invariante-mãe** (isolamento por Organização), **e** estabelece dois
contratos que outras Stories consomem: o **catálogo canônico de tipos de Campo** e o **Form Builder
reutilizado pelo Épico 3** (sem segundo builder). Consome os contratos congelados C1–C8 e o substrato C3
(1.6) **sem alterar o mecanismo**, e **reusa** a resolução "config do Pipe" ativada na 2.3 (Admin da Org ou
Admin do Pipe). Dependências **2.1** (`Pipe`, PR #17), **2.3** (`Phase`, PR #22) e, por transitividade, **2.2**
(`PipeGrant` + acesso por concessão, PR #20).

> **Escopo congelado:** **catálogo canônico (12 tipos)**, **estrutura comum do Campo** (identidade estável,
> rótulo, tipo, ajuda, config do tipo, valor padrão, posição, ativo/arquivado; opções de Seleção com
> identidade estável), **montagem do Formulário** (adicionar/ordenar/listar Campos) em dois contextos
> funcionais (Pipe **inicial** e **Fase**), **isolamento entre contextos** (INV-FORM-01), **contrato do
> contexto Database** (previsto, integração no E3) e o **gate do Campo Arquivo** (AD-28 fail-closed). **A
> evolução segura de Campos** (editar/arquivar/restaurar com travas, mudança de tipo bloqueada, ciclo de
> opções) é da **2.5**; **publicação/versionamento** é da **2.6**; **submissão e criação de Card** são de
> **2.7+**. Não antecipar (Constitution II / AD-11).

---

## Escopo (do épico + FR-14/D3.1/INV-FORM-01, congelado)

Um usuário autorizado **monta** Formulários adicionando Campos de um **catálogo canônico de 12 tipos** (Texto
curto, Texto longo, Número, Seleção única, Seleção múltipla, Sim/Não, Data, Data e hora, E-mail, Telefone,
URL, Arquivo). Cada Campo tem **estrutura comum** — identidade estável, rótulo, tipo, ajuda opcional,
configuração do tipo, valor padrão, posição, estado ativo/arquivado — e as opções de Seleção têm **identidade
estável**. O catálogo (de **tipos**) é **canônico/global** — o mesmo para toda Organização (é um conjunto
fechado, decidido em D3.1, não um catálogo configurável por Organização); as **instâncias de Campo** é que são
dado organizacional, por contexto.

Os **três contextos** de Formulário — **inicial** do Pipe, **de Fase**, **de Database** — compartilham o
**mesmo catálogo visual e a mesma estrutura de Campo**, com **instâncias independentes**: **alterar o
Formulário de um contexto não altera outro** (INV-FORM-01 / RN-050..054). Neste Épico, o builder é
**funcional para os contextos inicial e de Fase**; o contexto **Database** é **previsto no contrato** e será
**integrado no Épico 3 reutilizando o mesmo builder** — **sem** um segundo builder ou catálogo.

Configurar Formulário (inicial e de Fase) é **config do Pipe** (D3.2, PRD §7): pode montar/ordenar Campos o
**Admin da Org** (qualquer Pipe) **ou** o **Admin do Pipe** (concessão `PipeGrant.role = ADMIN` ACTIVE, com
`Membership` ACTIVE) — **a mesma resolução de poder ativada na 2.3** para gerenciar Fases. MEMBER/VIEWER
concedidos **apenas leem** a definição; **sem acesso ao Pipe → 404 não-enumerante**.

**Campo Arquivo (gate AD-28, fail-closed):** o tipo **Arquivo** existe no catálogo e no contrato, mas **não é
apresentado como funcional** antes da capacidade de arquivos do Épico 3 — a interface indica **indisponibilidade
honesta** e o sistema **impede publicar um Formulário com Campo Arquivo ativo enquanto a capacidade de upload
estiver desabilitada**. Como a **publicação** só chega na **2.6**, a 2.4 **estabelece o contrato/regra do gate**
(fail-closed por configuração) e expõe o ponto de verificação; a **aplicação no fluxo de publicar** é consumida
pela 2.6 (seam declarado, sem stub de publicação — mesmo tratamento que a 2.3 deu a contratos futuros).

**Rastreabilidade:** FR-14; D3.1/D3.2; INV-FORM-01 (RN-050/051/052/053/054); AD-11/AD-12/AD-27/AD-28.
**Dep.:** 2.1, 2.3. **Contrato entregue:** Form Builder (reutilizado pelo E3). **Consome:** DBT-AUTHZ-01,
resolução "config do Pipe" da 2.3 (Admin da Org/Admin do Pipe).
[Source: epics.md#Story-2.4; prd.md#Modelo-de-Formulários-Campos-Databases-e-Registros (D3.1/D3.2);
regras-negocio-fase-1.md#RN-050..054; ARCHITECTURE-SPINE.md#AD-12/AD-27/AD-28]

**Fora do escopo:**
- **Evolução segura de Campos (2.5):** editar rótulo/ajuda/config/valor padrão; **arquivar/restaurar Campo**
  com travas (bloqueado enquanto obrigatório em Formulário publicado/requisito de Fase/marco); **mudança de
  tipo bloqueada** quando houver valores/submissões; ciclo de **opções de Seleção** (remover só se nunca
  publicadas/usadas, senão arquivar). A 2.4 cria o **atributo** ativo/arquivado na estrutura, mas a **operação
  de arquivar/editar com segurança** e suas travas são da 2.5 (ver Dev Notes — fronteira a fixar no Plan).
- **Publicação/versionamento (2.6):** rascunho → publicar → despublicar; só a versão publicada recebe
  submissões; a **aplicação** do gate do Campo Arquivo no ato de publicar. A 2.4 **não** cria rota de publicar.
- **Submissão e criação de Card (2.7+):** submeter Formulário inicial/de Fase, criar/preencher Card,
  bloqueio de transição por Campo obrigatório (2.15). **Nenhuma tabela de Card/Submissão é materializada**
  (AD-11, Constitution II).
- **Contexto Database funcional / Databases (E3):** a 2.4 modela o **valor de contexto** `DATABASE` no
  contrato/enum, mas **não** cria owner de Database nem builder de Database (Databases são do E3). Sem stub.
- **Exclusão definitiva** de Formulário/Campo (o runtime não recebe GRANT de DELETE; arquivar Campo é estado,
  operacionalizado na 2.5).
- **Regras condicionais entre campos, validação programável, exibição dinâmica** — fora da Fase 1 (D3.1).

**Demonstração vertical:** um Admin da Org (e um Admin do Pipe **no seu** Pipe) abre o Formulário **inicial**
de um Pipe e o Formulário **de uma Fase**, adiciona Campos de tipos distintos do catálogo (cada um com rótulo,
ajuda, config e identidade estável), reordena-os; **alterar o Formulário inicial não muda o da Fase** e
vice-versa (INV-FORM-01); adicionar um **Campo Arquivo** aparece como **indisponível** (gate AD-28) e a regra
que barra sua publicação está definida; um **MEMBER/VIEWER** concedido **apenas lê**; quem **não tem acesso ao
Pipe** recebe **404**; outra Organização **nunca** vê Formulários/Campos (RLS).

---

## Acceptance Criteria

> BDD. **[ROLE]** marca o que reusa a resolução diferencial por papel de Pipe da 2.3. As quatro primeiras
> linhas são as do épico (AC1..AC4); AC5/AC6 tornam explícitas a autorização de config e o isolamento, como
> nas Stories 2.1/2.2/2.3.

1. **AC1 — catálogo canônico + estrutura comum + identidade estável.** *Given* o builder de um Formulário
   *When* um Campo é adicionado *Then* ele pertence ao **catálogo canônico dos 12 tipos** (Texto curto/longo,
   Número, Seleção única/múltipla, Sim/Não, Data, Data e hora, E-mail, Telefone, URL, Arquivo), tem a
   **estrutura comum** (rótulo, tipo, ajuda opcional, config do tipo, valor padrão, posição, estado
   ativo/arquivado) e uma **identidade estável** que **não** depende do rótulo (renomear no futuro não desloca
   valores — AD-12); as **opções de Seleção** têm **identidade estável**. (SC-241, SC-242)
2. **AC2 — isolamento entre contextos (INV-FORM-01) e contexto sempre visível.** *Given* dois contextos de
   Formulário (ex.: inicial e de Fase do mesmo Pipe, ou de Pipes/Fases distintos) *When* um é alterado *Then*
   o **outro não muda** (nenhuma contaminação cruzada — RN-050/051/052/054), e o **contexto em edição está
   sempre identificado**; a listagem de Campos vem **na ordem** (posição) do Formulário. (SC-243)
3. **AC3 — gate do Campo Arquivo (AD-28, fail-closed).** *Given* um Formulário com um **Campo Arquivo ativo**
   e a **capacidade de upload desabilitada** *When* se avalia a possibilidade de **publicá-lo** *Then* a
   publicação é **impedida** e a indisponibilidade é indicada **honestamente**; o tipo Arquivo é apresentado
   como **não funcional** no builder. **Observação de escopo:** a **rota de publicar** é da **2.6**; a 2.4
   entrega o **contrato/regra do gate** (fail-closed) e o ponto de verificação, consumido pela 2.6. (SC-244)
4. **AC4 — contexto Database reutiliza o contrato no E3, sem segundo builder.** *Given* o catálogo, a
   estrutura de Campo e o contrato de contexto entregues nesta Story *When* o Épico 3 integrar o Formulário de
   Database *Then* ele **reutiliza** este mesmo catálogo/estrutura/builder — **sem** um segundo builder ou
   catálogo. Em 2.4 o valor de contexto `DATABASE` existe no **contrato/enum**, mas **não** é funcional (owner
   de Database é do E3). (SC-245)
5. **AC5 — [ROLE] autorização de config do Formulário (reusa a resolução da 2.3).** *Given* um principal sobre
   um Pipe *When* opera a definição do Formulário inicial (do Pipe) ou de Fase (da Fase daquele Pipe) *Then*:
   (a) **Admin da Org** monta/ordena Campos de **qualquer** Pipe da sua Org, **sem** concessão; (b) **Admin do
   Pipe** (concessão `PipeRole = ADMIN` **ACTIVE** **e** `Membership` **ACTIVE**) monta/ordena Campos **do
   seu** Pipe; (c) **MEMBER/VIEWER** concedidos **leem** a definição, mas **não** a montam (**403**); (d)
   **sem acesso ao Pipe** → **404 não-enumerante** em todas as rotas de Formulário/Campo. A resolução do poder
   efetivo **lê `role`** e **reconfere `Membership.state = ACTIVE`** — **a mesma** guarda fina no serviço
   (DBT-AUTHZ-01) já usada na 2.3, sem tocar C3. (SC-246, SC-247)
6. **AC6 — isolamento (RLS) e "sem exclusão" provados.** *Given* dois tenants *When* um lê/monta Formulários e
   Campos *Then* vê **apenas** os da própria Organização; um INSERT/SELECT/UPDATE de `Form`/`Field` (e
   `FieldOption`, se tabela) **fora de contexto** (ou de outra Org) é **negado pelo banco** (ENABLE+FORCE RLS,
   policies por `current_org_id()`, WITH CHECK no INSERT **e** no UPDATE), não só pela aplicação; o runtime
   **não** tem GRANT de `DELETE` (arquivar Campo é estado — operacionalizado na 2.5). (SC-248, SC-249)

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** `context7-check` (Prisma 6.19.3 — modelagem de JSON/`Json`, enum e possível
  índice parcial; NestJS 11; CASL 7 — reuso da resolução, sem novo mecanismo), `pre-implementation-check`
  (risco CRÍTICO; nova(s) tabela(s) + RLS; **novo domínio Formulário**; gate AD-28 fail-closed),
  `security-check`, `lgpd-check` (**definição** de Campo — rótulo/ajuda/config — **não** é valor submetido nem
  PII; o valor capturado é de 2.7+; confirmar), `migration-check` (versionada + rollback + banco descartável),
  `backup-check`, `observability-check`. Registrar em `gates/2-4/`.
- [ ] **T2 — Schema + migration + rollback.** Novas entidades organizacionais (**nomes/representação a fixar no
  Plan** — ver Dev Notes): `Form` (contexto + owner) e `Field` (FK `Form`); **opções de Seleção com identidade
  estável** — tabela `FieldOption` **ou** JSON com ids estáveis (decisão do Plan). Enum **`FieldType`** com os
  **12 tipos canônicos** (código, catálogo global — como `PipeRole`). Enum de estado do Campo
  (`ACTIVE`/`ARCHIVED`) e enum de **contexto** (`PIPE_INITIAL`/`PHASE`/`DATABASE`). **Posição** por chave
  fracionária `Decimal` **reusando o padrão da `Phase`** (mover = 1 UPDATE, compatível com a recusa de
  `$transaction`). RLS **ENABLE+FORCE** em toda tabela nova, 4 policies por `orgId = current_org_id()` (WITH
  CHECK no INSERT **e** UPDATE), índices de acesso (`orgId` + owner/`formId` + estado + posição). **GRANT
  SELECT/INSERT/UPDATE — sem DELETE** (escreva o teste do escopo do GRANT). Índice parcial por raw SQL se o
  Prisma 6.19.3 não expressar (como a 2.2/2.3). Rollback `.down.sql`. Relações inversas em `Organization`/
  `Pipe`/`Phase` conforme a modelagem escolhida. `prisma generate`.
- [ ] **T3 — Autorização de config (reusa a resolução da 2.3 — DBT-AUTHZ-01).** A checagem "este principal
  pode **montar** o Formulário DESTE Pipe" ocorre **no serviço** (guarda fina), **não** no `AuthzGuard`
  (grossa) e **sem** reabrir C3 (`ability.ts`/`authz.guard.ts` intocados). Reusar a lógica de `resolverPoder`/
  `exigirGerenciar` do `PhasesService` (Admin da Org → gerencia; concessão `PipeGrant.role = ADMIN` ACTIVE +
  `Membership` ACTIVE → gerencia; demais concessões ACTIVE → só leem; sem acesso → 404). **Para o Formulário
  de Fase**, o poder resolve pelo **Pipe dono da Fase** (`phase.pipeId`) — a config da Fase é config do mesmo
  Pipe. Decisão do Plan: **extrair** a resolução de poder para um helper compartilhado (evita duplicá-la
  entre `PhasesService` e o novo serviço) vs. replicar o padrão (ver Dev Notes).
- [ ] **T4 — Módulo Formulários (runtime).** `src/pipes/forms/` (local a fixar no Plan — ver Dev Notes) — rotas
  sob `withTenantContext`, todas com `@Requer('ler','Pipe')` como guarda **grossa** (o serviço aplica a fina):
  obter o Formulário de um contexto e listar seus Campos **na ordem**; **adicionar** Campo (de um tipo do
  catálogo, ao final da ordem); **reordenar** Campo (intra-Formulário, 1 UPDATE). Nenhuma rota aceita `orgId`
  do cliente; **nenhuma** rota de exclusão; **nenhuma** rota de publicar (2.6) nem de editar/arquivar Campo
  (2.5). Adicionar responde **201**; reordenar responde **200** (transição, não criação). O **Campo Arquivo**
  é aceito no catálogo mas marcado **indisponível** (gate AD-28), e a **regra que barra a publicação** com
  Arquivo ativo fica exposta como função verificável (consumida pela 2.6). Registrar no `AppModule`. Adicionar
  `Form`/`Field` (e `FieldOption`, se tabela) a `MODELOS_AUDITADOS` (`tenant-context.ts`).
- [ ] **T5 — Testes (PostgreSQL real, escrita na Org C).** RLS de cada tabela nova (isolamento cross-tenant;
  INSERT/SELECT/UPDATE fora de contexto negados; WITH CHECK sem RETURNING via `createMany`; **sem DELETE**;
  `relowner` não é o runtime); **catálogo** (só os 12 tipos são aceitos; tipo fora do catálogo → rejeitado);
  **identidade estável** do Campo e das opções de Seleção; **INV-FORM-01** (alterar Campos do contexto inicial
  não altera os do contexto de Fase e vice-versa — teste comportamental dedicado, exigido por RN-054);
  **ordenação** (adicionar ao final; reordenar intra-Formulário; ordem determinística); **gate do Campo
  Arquivo** (a regra de publicação recusa Formulário com Arquivo ativo enquanto a capacidade está desabilitada
  — fail-closed); **autorização em FASE VERMELHA** (Admin da Org monta; Admin do Pipe monta o seu;
  MEMBER/VIEWER concedidos → **403** ao montar, mas leem; **Membership SUSPENDED** com concessão ADMIN →
  negado; sem acesso → **404** não-enumerante); regressão da 2.1/2.2/2.3 (acesso de Admin da Org e leitura por
  concessão intactos). Migration deploy+rollback (SC-249, banco descartável).
- [ ] **T6 — Documentação + gates finais.** Atualizar `CLAUDE.md` (bloco de estado: passa a existir o domínio
  Formulário — `Form`/`Field`, catálogo canônico e Form Builder; contextos inicial/Fase funcionais, Database
  previsto no contrato; Campo Arquivo gated por AD-28), Spec Kit (`plan → checklist → tasks → analyze`),
  `safe-implementation`, `code-review` + **revisão adversarial independente** (não subagente do implementador
  — lição dos PRs #17/#20/#22), `security-check` final, `commit-check`. Confirmar no **checklist de aceite** o
  isolamento INV-FORM-01, o gate fail-closed do Campo Arquivo e o teste de autorização em fase vermelha.

---

## Dev Notes

### Decisões de modelagem que o Plan deve fechar (não pré-decidir na Story)

1. **Catálogo de tipos = enum de código (global), não tabela por Organização.** O "catálogo canônico" de D3.1 é
   um **conjunto fechado de 12 tipos**, igual para toda Organização — modela-se como **enum `FieldType`** (como
   `PipeRole`/`PhaseState`), **não** como dado organizacional configurável. O que é dado org-scoped são as
   **instâncias de Campo**. **Recomendação:** enum `FieldType` com os 12 valores; nomes canônicos em inglês
   simétricos ao schema (ex.: `TEXT_SHORT`, `TEXT_LONG`, `NUMBER`, `SELECT_SINGLE`, `SELECT_MULTIPLE`,
   `BOOLEAN`, `DATE`, `DATETIME`, `EMAIL`, `PHONE`, `URL`, `FILE`) — grafia final no Plan.
2. **Representação de `Form` e do vínculo com o contexto — a decisão estrutural central.** Um Formulário
   pertence a um **contexto** (inicial/Fase/Database) e a um **owner** (Pipe para o inicial; Fase para o de
   Fase; Database para o de Database, no E3). Opções:
   - **(A) Tabela única `Form` com enum de contexto + FKs de owner nuláveis** (`pipeId` p/ inicial, `phaseId`
     p/ Fase, `databaseId` p/ Database no E3), **um Form por owner** (unicidade org-scoped por owner+contexto).
     Expressa "**mesmo builder, instâncias isoladas**" naturalmente: cada contexto é uma **linha distinta**, e
     INV-FORM-01 (não-contaminação) cai como consequência de linhas separadas + RLS. **Recomendação primária.**
   - **(B) Tabelas separadas por contexto.** Contradiz o espírito "um catálogo/um builder, sem segundo builder"
     e multiplica RLS/migração; **desaconselhada.**
   Decidir também **semeadura**: o Form de um contexto é **criado sob demanda** (na 1ª adição de Campo) ou
   **explicitamente** (rota "obter/garantir Formulário do contexto")? — mesmo dilema da "semeadura da 1ª Fase"
   da 2.3. **Recomendação:** criação sob demanda (lazy) ou `getOrCreate` no obter, **sem** alterar
   retroativamente o `criar` de Pipe (2.1) nem o de Fase (2.3).
3. **Estrutura do Campo e a `config do tipo`/`valor padrão` — tabela+colunas vs `Json`.** O Campo tem atributos
   comuns (rótulo, tipo, ajuda, posição, estado) **mais** uma **config específica do tipo** (ex.: opções de
   Seleção; formato/limites de Número; único/múltiplo do Arquivo) e um **valor padrão**. Opções:
   - **(A) `Field` com colunas fixas + `typeConfig Json` + `defaultValue Json`** para o que varia por tipo.
     Simples e extensível; a validação por tipo vive no serviço. **Recomendação primária** para 2.4.
   - **(B) Normalização plena por tipo** — antecipa estrutura que a Fase 1 não exige; **desaconselhada.**
   Nota: limites/formatos/validações numéricas por tipo são **gate da 2.5** (epics) — em 2.4, `typeConfig`
   carrega o mínimo para **montar** e **identificar** o Campo; a **validação de submissão** é de 2.7+.
4. **Opções de Seleção com identidade estável — tabela `FieldOption` vs JSON com ids estáveis.** D3.1 exige
   **identidade estável** das opções, e a 2.5 exige **arquivar opção** (remover só se nunca publicada/usada).
   - **(A) Tabela `FieldOption`** (`id`, `orgId`, `fieldId`, `label`, `position`, `state`) — identidade e
     futuro arquivamento no nível do banco; custo: **mais uma tabela org-scoped** com RLS+FORCE+GRANT.
   - **(B) JSON em `typeConfig`** com **UUIDs estáveis** por opção — menos tabelas; o ciclo de opções da 2.5
     passa a viver em estado JSON (transformação mais delicada).
   **Recomendação:** **(A) tabela `FieldOption`** pela exigência de identidade estável + arquivamento futuro
   (2.5), aceitando o custo de RLS; escolher **(B)** só se o time preferir menos tabelas e assumir o ciclo em
   JSON. Decidir no Plan (afeta AC1/SC-242 e a 2.5).
5. **Fronteira 2.4 × 2.5 (montar vs evoluir com segurança) — precisa ficar afiada.** As duas Stories citam
   "criar Campo". **Recomendação:** 2.4 entrega **adicionar + listar + reordenar** Campo (montagem) e o
   **atributo** `state ACTIVE/ARCHIVED` na estrutura; **editar** (rótulo/ajuda/config/valor padrão),
   **arquivar/restaurar** Campo **com as travas** (obrigatório em publicado/requisito de Fase/marco), **mudança
   de tipo bloqueada** e o **ciclo de opções** são da **2.5**. Registrar a linha exata no Plan para não
   duplicar trabalho nem deixar buraco; se o Plan optar por incluir arquivar "básico" em 2.4, as **travas** de
   segurança **permanecem** em 2.5.
6. **Reuso da resolução de poder (config do Pipe).** A resolução "Admin da Org **ou** Admin do Pipe" já vive em
   `PhasesService.resolverPoder`/`exigirGerenciar`. **Recomendação:** **extrair** para um helper/serviço
   compartilhado (`kernel`? não — é regra de domínio de Pipe; melhor um util em `src/pipes/`) e consumir tanto
   em Fases quanto em Formulários, evitando duas cópias da mesma guarda fina que poderiam divergir. Para o
   **Formulário de Fase**, resolver pelo `phase.pipeId`. Decidir a forma da extração no Plan (sem tocar C3).
7. **Local do módulo.** Simétrico ao domínio Pipe/Fase, o mais coerente é `src/pipes/forms/` (o Formulário
   inicial pertence a um Pipe; o de Fase, a uma Fase do Pipe) — ou `src/forms/` se o Plan preferir um módulo de
   domínio próprio, dado que o E3 reusa o builder para Database. **Recomendação:** avaliar no Plan; um módulo
   `forms` reutilizável (não amarrado a `pipes`) favorece o **contrato reutilizado pelo E3** (AC4), desde que a
   resolução de poder por Pipe seja injetada.

### Gate do Campo Arquivo (AD-28, fail-closed) — contrato aqui, aplicação na 2.6
O tipo **Arquivo** entra no catálogo/contrato, mas a **capacidade de arquivos** é do **Épico 3** e permanece
**desabilitada por configuração e oculta/indisponível na UX** enquanto não aprovada (AD-27/AD-28). A 2.4
define a **regra fail-closed**: um Formulário com **Campo Arquivo ativo** **não pode ser publicado** com a
capacidade desabilitada. Como **publicar** é da **2.6**, a 2.4 entrega o contrato/função de verificação
(unit-testável, fail-closed) e o builder marca o tipo como **indisponível**; a 2.6 **consome** o gate no ato
de publicar. **Nenhum mecanismo de upload/storage é criado aqui** — seam declarado, sem stub, no mesmo espírito
com que a 2.3 tratou a trava por Cards ativos como contrato futuro.

### Isolamento entre contextos (INV-FORM-01) e AD-6 (invariante-mãe)
**INV-FORM-01** (alterar um contexto não altera outro — RN-050/051/052/054) é **requisito comportamental**
marcado `NÃO CONFIRMADO` na doc-fonte: **exige teste dedicado** (não é decisão de produto em aberto — PRD). No
modelo recomendado (Form por contexto = linha distinta), a não-contaminação é consequência de linhas separadas.
Sobreposto a isso, o **isolamento por Organização** (AD-6) é do **banco**: `Form`/`Field`/`FieldOption` recebem
**ENABLE + FORCE ROW LEVEL SECURITY**, 4 policies por `orgId = current_org_id()` (WITH CHECK no INSERT e no
UPDATE), simétrico a `Pipe`/`Phase`. Toda query por `withTenantContext`. GRANT do runtime **SELECT/INSERT/
UPDATE**, **sem DELETE** — "sem exclusão definitiva" é fronteira de banco. Ao conceder o GRANT, escrever o
teste que prova o escopo dele.

### Ordenação de Campos = padrão da `Phase` (chave fracionária)
`Field.position` reusa a **chave fracionária `Decimal`** da `Phase`: adicionar = `max(position) + 1`; reordenar
= **um único UPDATE** com `position` = ponto médio dos vizinhos — compatível com a **recusa de `$transaction`**
de `withTenantContext`. Ordem determinística por `ORDER BY position, id`. Sem unicidade rígida de `position`.

### Preservar 2.1/2.2/2.3 (regressão proibida)
O acesso do **Admin da Org** a qualquer Pipe/Fase/Formulário e a **leitura por concessão** (2.2) **não podem
regredir**; as suítes da 2.1/2.2/2.3 seguem verdes. A 2.4 **adiciona** o domínio Formulário e **reusa** a
resolução de config do Pipe; não remove nem enfraquece nada anterior.

### Observabilidade / LGPD
Logs estruturados (Pino) sanitizados. **A definição de Formulário/Campo (rótulo, ajuda, config) é metadado de
configuração, não valor submetido nem PII** — o valor capturado (potencial PII) só surge com a submissão
(2.7+); confirmar no `lgpd-check`. Mutações de `Form`/`Field`/`FieldOption` entram na trilha de auditoria
(`MODELOS_AUDITADOS`) — montar/ordenar Campo é mudança de config do Pipe (AD-30/D1.6). Payload sem `orgId` e
sem `position` (chave interna, como em Fase), sem segredo.

### References
- [Source: epics.md#Story-2.4] — escopo, AC (BDD), 12 tipos, estrutura comum, INV-FORM-01, gate do Campo
  Arquivo, contrato reutilizado pelo E3; "Fora: evolução de Campos (2.5), publicação (2.6)".
- [Source: prd.md#Modelo-de-Formulários-Campos-Databases-e-Registros — D3.1] — catálogo oficial (12 tipos);
  estrutura conceitual do Campo (identidade estável, rótulo, tipo, ajuda, config, valor padrão, posição,
  ativo/arquivado; opções com identidade estável); catálogo comum aos três contextos, instâncias
  independentes; obrigatoriedade pertence ao **uso** do Campo no contexto.
- [Source: prd.md#D3.2] — ciclo/publicação (rascunho→publicar→despublicar, **2.6**); **configuram/publicam:
  inicial e Fase → Admin da Org / Admin do Pipe**; Database → Admin da Org / Admin do Database (E3).
- [Source: regras-negocio-fase-1.md#RN-050..054] — independência dos três Formulários; **RN-054 é regra
  crítica** (validar com teste comportamental dedicado); RN-053 (mesmo catálogo — CONFIRMADO; lista oficial =
  D3.1).
- [Source: ARCHITECTURE-SPINE.md#AD-12] — Formulário e Campo têm ID estável; valores não dependem do nome
  visual; a execução/leitura registra a versão da definição (versionamento efetivo = 2.6).
- [Source: ARCHITECTURE-SPINE.md#AD-27/AD-28] — storage gated por Produto; **fail-closed** para capacidades
  gated (Campo Arquivo indisponível/oculto até o E3).
- [Source: ARCHITECTURE-SPINE.md#AD-11] — referência por id estável, tenant-safe; nada materializado só para
  "preparar o futuro" (Card/Submissão = 2.7+; Database owner = E3).
- [Source: apps/api/src/pipes/phases/* e src/pipes/*] — padrões a estender/reusar: schema/migration/RLS/GRANT,
  serviço por `withTenantContext`, `resolverPoder`/`exigirGerenciar` (config do Pipe), chave fracionária de
  posição, DTO manual, `MODELOS_AUDITADOS`.

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
| 2026-07-14 | Story criada (Épico 2, bloco 2.4–2.6 paralelo a 2.1–2.3 — Sprint S5) a partir de `epics.md` (Story 2.4), do Modelo de Formulários/Campos do PRD (D3.1/D3.2), de RN-050..054 (INV-FORM-01) e de AD-11/12/27/28. Risco **CRÍTICO** (novo domínio Formulário — `Form`/`Field`/`FieldOption` com RLS + migration, tocando o invariante-mãe; **catálogo canônico** de 12 tipos; **contrato do Form Builder** reutilizado pelo E3; gate **AD-28 fail-closed** do Campo Arquivo). Escopo **congelado**: catálogo + estrutura do Campo + montagem (adicionar/ordenar/listar) nos contextos inicial e de Fase + isolamento INV-FORM-01 + gate do Arquivo. **AC5** reusa a resolução "config do Pipe" da 2.3 (Admin da Org ou Admin do Pipe; MEMBER/VIEWER só leem; sem acesso → 404), sem tocar C3. **AC3:** publicação é da 2.6 — a 2.4 entrega o **contrato** do gate, não a rota de publicar. Decisões deixadas para o Plan: catálogo como enum global (recomendado); `Form` tabela única com contexto+owner (recomendado); `Field` com `typeConfig`/`defaultValue` em `Json` (recomendado); opções de Seleção como tabela `FieldOption` (recomendado) vs JSON; fronteira 2.4×2.5 (montar vs evoluir com segurança); extração/reuso da resolução de poder; local do módulo (`pipes/forms` vs `forms`). Non-objetivos: evolução segura de Campos (2.5), publicação/versionamento (2.6), submissão/Card (2.7+), Databases/contexto Database funcional (E3) — sem materializar Card/Submissão nem owner de Database (AD-11). Empilha sobre a 2.3 (PR #22). Status → ready-for-dev. |
