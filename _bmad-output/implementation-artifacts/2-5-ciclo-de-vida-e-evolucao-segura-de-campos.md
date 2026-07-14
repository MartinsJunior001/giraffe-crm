---
story_key: 2-5-ciclo-de-vida-e-evolucao-segura-de-campos
epic: 2
status: ready-for-dev
release: CORE (bloco 2.4–2.6, paralelo a 2.1–2.3; Sprint S5 do roadmap)
risco: ALTO
baseline_commit: pendente (empilha sobre a 2.4 / domínio Formulário — Form/Field/FieldType/FieldState/FormContext, helper `pipes/pipe-authz.ts`, opções de Seleção em JSON no `typeConfig` com UUID estável)
gate_arquitetura: Evolução segura das **instâncias de Campo** já criadas pela 2.4 — editar (rótulo/ajuda/typeConfig/valor padrão), arquivar/restaurar (transição de estado reversível) e o **ciclo de opções de Seleção** (adicionar/renomear/reordenar/arquivar/remover). NÃO cria entidade nem catálogo novo. **Decisão estrutural central (do Plan): opções de Seleção continuam em JSON no `typeConfig` (DBT-2.4-OPCOES-JSON) OU normalizam para tabela `FieldOption`.** Se permanecerem em JSON, a 2.5 é uma Story de **serviço/comportamento SEM migration nova** (as colunas `state`/`archivedAt` já existem em `Field` desde a 2.4, criadas para uso aqui) — risco ALTO; se normalizar, reintroduz **nova tabela org-scoped + RLS+FORCE+GRANT+migration** e o risco volta a CRÍTICO. Reusa — sem tocar o mecanismo (guard/`ability.ts` congelados, C3) — a resolução "config do Pipe" (Admin da Org ou Admin do Pipe) já extraída para `pipe-authz.ts` na 2.4. **Contrato futuro declarado, não materializado (AD-11):** as TRAVAS de 2.5 — "não arquivar Campo obrigatório em Formulário publicado / requisito de Fase / marco" e "mudança de tipo bloqueada quando houver valores/submissões" — dependem de publicação (2.6), submissões/valores (2.7+), requisito de Fase (2.15) e marco (2.12), **inexistentes hoje**; a 2.5 aplica as OPERAÇÕES e declara as travas como seam verificável, sem materializar tabela/estado. Escopo congelado: SOMENTE editar Campo + arquivar/restaurar Campo + ciclo de opções de Seleção + autorização de config + isolamento (herdado da 2.4). Publicação/versionamento = 2.6; submissão/Card = 2.7+.
---

# Story 2.5 — Ciclo de vida e evolução segura de Campos

**As a** usuário autorizado (Admin da Organização ou Admin do Pipe),
**I want** editar, arquivar/restaurar Campos e evoluir as opções de Seleção com segurança,
**So that** eu evolua Formulários sem perda silenciosa de dados nem quebra de identidade.

**Status: ready-for-dev.** Classificada **CORE** (bloco **2.4–2.6**, paralelo a 2.1–2.3 — Sprint S5), risco
**ALTO** — evolui as **instâncias de Campo** já criadas pela 2.4 (editar / arquivar / restaurar / ciclo de
opções), **sem** entidade, catálogo ou (se as opções permanecerem em JSON) migration nova. Consome os
contratos congelados C1–C8 e o substrato C3 (1.6) **sem alterar o mecanismo**, e **reusa** a resolução "config
do Pipe" (Admin da Org ou Admin do Pipe) já extraída para `pipes/pipe-authz.ts` na 2.4. Dependência direta:
**2.4** (`Form`/`Field`/`FieldType`/`FieldState`/`FormContext`; opções em `typeConfig` com UUID estável) e, por
transitividade, 2.1/2.2/2.3. É **pré-requisito de 2.6** (publicação) e das submissões (2.7+).

> **Escopo congelado:** **editar Campo** (rótulo/ajuda/`typeConfig`/valor padrão, **sem** alterar o `type` —
> identidade estável preservada, AD-12); **arquivar/restaurar Campo** (transição `ACTIVE↔ARCHIVED` reversível,
> preserva valores, idempotente, auditada — espelha o padrão de `Phase`); **ciclo de opções de Seleção**
> (adicionar/renomear/reordenar/arquivar/remover opção, com **id estável** por opção). **Fora:** a **criação**
> de Campo (adicionar) já é da **2.4** (D5 — não se re-implementa); **publicação/versionamento** é da **2.6**;
> **submissão e criação de Card** são de **2.7+**. As **travas** de 2.5 (não arquivar Campo obrigatório em
> publicado/requisito de Fase/marco; mudança de tipo bloqueada por valores/submissões) dependem de estados que
> **ainda não existem** — a 2.5 aplica as operações e declara as travas como **contrato futuro** (seam), sem
> materializar (AD-11 / Constitution II).

---

## Escopo (do épico + FR-14/D3.4/INV-FORM-01/AD-12, congelado)

Um usuário autorizado **evolui** um Formulário já montado pela 2.4: **edita** um Campo (rótulo, ajuda,
configuração do tipo, valor padrão) **sem** deslocar sua identidade (renomear **não** muda o `id` — AD-12);
**arquiva** e **restaura** Campos de forma reversível, **preservando** os valores para leitura; e evolui as
**opções de Seleção** (adicionar/renomear/reordenar/arquivar/remover), cada opção mantendo uma **identidade
estável** (o `id` da opção não depende do rótulo).

Configurar/evoluir Formulário (inicial e de Fase) é **config do Pipe** (D3.2, PRD §7) — a 2.5 **reusa** a
resolução de poder já extraída para `pipe-authz.ts` na 2.4: pode evoluir o **Admin da Org** (qualquer Pipe) **ou**
o **Admin do Pipe** (concessão `PipeGrant.role = ADMIN` ACTIVE, com `Membership` ACTIVE); MEMBER/VIEWER
concedidos **apenas leem**; **sem acesso ao Pipe → 404 não-enumerante**. Para o Campo de um Formulário **de
Fase**, o poder resolve pelo **Pipe dono da Fase** (`phase.pipeId`), como já faz o `FormsService`.

**Sem perda silenciosa de dados (D3.4):**
- **Renomear** rótulo/ajuda **não** altera identidade (Campo e opções mantêm `id`).
- **Arquivar** Campo é **reversível** e **preserva** valores (somente leitura); **restaurar** preserva
  identidade e devolve o Campo ao **final da ordem ativa** (nova `position`, como `Phase`).
- **Mudança de tipo:** o `type` **não** é editável na 2.5. A regra "mudança de tipo bloqueada quando houver
  valores/submissões vinculadas; a alternativa é criar novo Campo, preservando o anterior" é **contrato
  futuro**: valores/submissões só existem em **2.7+**, então não há o que bloquear hoje — a 2.5 mantém o `type`
  imutável e declara o guard como seam, sem materializar rota de mudança de tipo.
- **Opções de Seleção:** removíveis **enquanto nunca publicadas/usadas** (hoje **sempre**, pois publicação =
  2.6 e uso = 2.7+ não existem); após publicação/uso, **apenas arquiváveis** — **contrato futuro**. Uma opção
  **arquivada** preserva o rótulo (valores antigos continuam legíveis) e **restaurar** preserva o `id`.
- **Alterações de validação** (limites/formatos do `typeConfig`) valem **para novas submissões**, sem invalidar
  histórico — **contrato futuro** (não há submissão nesta Story); a 2.5 apenas permite **editar** o
  `typeConfig`.

**Travas que dependem de estados inexistentes (contrato futuro, AD-11):** "não arquivar Campo obrigatório em
Formulário **publicado** (2.6) / **requisito de Fase** (2.15) / **marco** (D2.7/2.12)" e "mudança de tipo
bloqueada por **valores/submissões** (2.7+)". Nenhum desses estados existe no código; **não** há sequer coluna
`required` em `Field` (a obrigatoriedade pertence ao **uso** do Campo no contexto — D3.1, não ao Campo global).
A 2.5 **aplica** as operações de evolução e **declara** cada trava como ponto de verificação futuro (mesmo
tratamento que a 2.3 deu à trava por Cards ativos e a 2.4 ao gate do Campo Arquivo) — **sem** materializar
tabela ou estado só para preparar o futuro.

**Rastreabilidade:** FR-14; D3.4 (edge behaviors de Campo — sem perda silenciosa); D3.1 (estrutura/identidade
estável); INV-FORM-01 (RN-050..054); AD-11/AD-12. **Dep.:** 2.4. **Consome:** `pipe-authz` (config do Pipe,
2.4), padrão de arquivar/restaurar de `Phase` (2.3), `MODELOS_AUDITADOS`. **É pré-requisito de:** 2.6, 2.7+.
[Source: epics.md#Story-2.5; prd.md#Modelo-de-Formulários-Campos-Databases-e-Registros (D3.4 edge behaviors,
D3.1); regras-negocio-fase-1.md#RN-050..054; ARCHITECTURE-SPINE.md#AD-11/AD-12]

**Fora do escopo:**
- **Criação/adição de Campo (2.4):** `adicionarCampo` e o `getOrCreate` do Formulário são da 2.4 (D5). A 2.5
  **não** re-implementa criação — o épico lista "criar" na 2.5, mas a fronteira 2.4×2.5 já foi fixada no Plan
  da 2.4 (ver Divergências).
- **Publicação/versionamento (2.6):** rascunho → publicar → despublicar; só a versão publicada recebe
  submissões; **aplicação** das travas "obrigatório em publicado" e do gate do Campo Arquivo no ato de
  publicar. A 2.5 **não** cria rota de publicar nem estado de publicação.
- **Submissão e criação de Card (2.7+):** submeter Formulário, criar/preencher Card; **valores** de Campo.
  **Nenhuma tabela de Submissão/Valor/Card é materializada** (AD-11) — logo a mudança de tipo "bloqueada por
  valores" e a opção "usada" **não têm o que consultar**.
- **Requisito de Fase (2.15) e marco temporal (2.12/D2.7):** a obrigatoriedade contextual do Campo. Não há
  coluna `required` nem configuração de requisito nesta Story.
- **Contexto Database (E3):** a evolução de Campos vale para o contexto Database quando ele existir (E3
  reutiliza o mesmo builder e a evolução da 2.5); nada de Database é materializado aqui.
- **Exclusão definitiva** de Campo (o runtime não recebe GRANT de DELETE; arquivar é estado). **Remover uma
  opção** é uma **edição do `typeConfig`** (UPDATE do `Field`), **não** um `DELETE` de linha.
- **Regras condicionais entre campos, validação programável, exibição dinâmica** — fora da Fase 1 (D3.1).

**Demonstração vertical:** um Admin da Org (e um Admin do Pipe **no seu** Pipe) abre o Formulário inicial e o de
uma Fase montados na 2.4, **renomeia** um Campo (o `id` não muda; nada some), **edita** a ajuda e o
`typeConfig` de um Campo de Número, **arquiva** um Campo (some da ordem ativa, continua legível) e o
**restaura** (volta ao final); num Campo de Seleção, **adiciona**, **renomeia**, **reordena** e **arquiva** uma
opção (cada uma com `id` estável; a arquivada mantém o rótulo), e **remove** uma opção nunca usada; **alterar o
Formulário inicial não muda o da Fase** (INV-FORM-01); um **MEMBER/VIEWER** concedido **apenas lê** e recebe
**403** ao tentar evoluir; quem **não tem acesso ao Pipe** recebe **404**; outra Organização **nunca** vê nem
altera Campos (RLS herdado da 2.4).

---

## Acceptance Criteria

> BDD. **[ROLE]** marca o que reusa a resolução diferencial por papel de Pipe (config do Pipe). AC1/AC2/AC4
> são os edge behaviors de D3.4 tornados verificáveis; AC3 fixa o que é **contrato futuro**; AC5/AC6 tornam
> explícitas a autorização e o isolamento, como nas Stories 2.1/2.2/2.3/2.4.

1. **AC1 — editar Campo preserva identidade; `type` imutável.** *Given* um Campo existente *When* seu
   **rótulo/ajuda/`typeConfig`/valor padrão** são editados *Then* as alterações persistem, o **`id` do Campo
   não muda** (e os `id` das opções não mudam — AD-12/renomear não desloca valores), a **ordem** (posição) é
   preservada, e o **`type` NÃO é alterado** pela edição (mudança de tipo é contrato futuro — AC3). (SC-251,
   SC-252)
2. **AC2 — arquivar/restaurar Campo (reversível, preserva dados, idempotente).** *Given* um Campo **ACTIVE**
   *When* é **arquivado** *Then* fica `ARCHIVED` (`archivedAt` marcado), **sai da ordem ativa** mas **preserva**
   os dados (leitura), a operação é **idempotente** (arquivar já arquivado NÃO reemite `updateMany` — evita
   falso `denied` na auditoria) e **auditada**; *When* é **restaurado** *Then* volta a `ACTIVE` (`archivedAt =
   null`) ao **final da ordem ativa**, **preservando identidade**. (SC-253)
3. **AC3 — travas de arquivamento e de mudança de tipo são contrato futuro (seam declarado).** *Given* as travas
   "não arquivar Campo **obrigatório em Formulário publicado / requisito de Fase / marco**" e "**mudança de
   tipo** bloqueada quando houver **valores/submissões**" *When* avaliadas na 2.5 *Then* suas pré-condições —
   publicação (2.6), submissões/valores (2.7+), requisito de Fase (2.15), marco (2.12) e a própria coluna
   `required` — **não existem**; a 2.5 **declara** cada trava como ponto de verificação futuro **sem
   materializar** tabela/estado (AD-11), **nada** é falsamente bloqueado nem falsamente materializado, e o
   `type` permanece **imutável** (a "alternativa é criar novo Campo" continua sendo `adicionarCampo` da 2.4).
   (SC-254)
4. **AC4 — ciclo de opções de Seleção com identidade estável.** *Given* um Campo de Seleção
   (`SELECT_SINGLE`/`SELECT_MULTI`) *When* uma opção é **adicionada / renomeada / reordenada / arquivada /
   removida** *Then* cada opção mantém um **`id` estável** (renomear **não** muda o `id`), a **ordem** é
   determinística, uma opção **arquivada** preserva o rótulo (valores antigos permaneceriam legíveis) e
   **restaurar** preserva o `id`; **remover** é permitido enquanto a opção **nunca foi publicada/usada** (hoje
   sempre — publicação/uso inexistem), e a restrição "após uso, só arquivar" é **contrato futuro** (AC3).
   (SC-255, SC-256)
5. **AC5 — [ROLE] autorização de evolução = config do Pipe (reusa `pipe-authz`).** *Given* um principal sobre
   um Pipe *When* edita/arquiva/restaura um Campo (do Formulário inicial ou de Fase) ou evolui uma opção
   *Then*: (a) **Admin da Org** evolui Campos de **qualquer** Pipe da sua Org, **sem** concessão; (b) **Admin do
   Pipe** (`PipeGrant.role = ADMIN` **ACTIVE** **e** `Membership` **ACTIVE**) evolui os **do seu** Pipe; (c)
   **MEMBER/VIEWER** concedidos **leem**, mas **não** evoluem (**403**); (d) **sem acesso ao Pipe** → **404
   não-enumerante** em todas as rotas de evolução. A resolução **lê `role`** e **reconfere `Membership.state =
   ACTIVE`** — a mesma guarda fina `exigirGerenciarPipe` (DBT-AUTHZ-01), sem tocar C3; o Campo de Fase resolve
   pelo `phase.pipeId`. (SC-257, SC-258)
6. **AC6 — isolamento (RLS) e "sem exclusão" preservados; sem nova superfície (se JSON).** *Given* dois tenants
   *When* um evolui Campos/opções *Then* vê e altera **apenas** os da própria Organização (RLS herdado da 2.4 —
   `Field` já `ENABLE`+`FORCE`), um UPDATE de `Field` **fora de contexto** (ou de outra Org) é **negado pelo
   banco**, o runtime **não** apaga (sem GRANT `DELETE`) e **remover uma opção é um UPDATE do `typeConfig`**, não
   um `DELETE` de linha; **nenhuma nova tabela org-scoped é materializada** se as opções permanecerem em JSON
   (decisão do Plan — se normalizar para `FieldOption`, a nova tabela replica ENABLE+FORCE+4 policies+GRANT-
   sem-DELETE e a suíte prova o escopo do GRANT). (SC-259)

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** `context7-check` (Prisma 6.19.3 — atualização de `Json`/`typeConfig` in-place,
  `Prisma.DbNull` para `defaultValue`, `Decimal`; NestJS 11 — DTO/validação manual), `pre-implementation-check`
  (risco ALTO; **sem tabela nova se JSON** — confirmar decisão do Plan; evolução de dado org + autorização),
  `security-check`, `lgpd-check` (definição/opção de Campo = **metadado de configuração**, não valor submetido
  nem PII — o valor é 2.7+; confirmar), `migration-check` (**só se** normalizar opções para tabela — senão
  registrar "sem migration nesta Story, colunas já existem desde a 2.4"), `observability-check`. Registrar em
  `gates/2-5/`.
- [ ] **T2 — Decisão estrutural (Plan): opções em JSON vs tabela `FieldOption`.** Fechar no Plan (ver Dev
  Notes/Clarifications): **(A)** manter opções em `typeConfig` JSON (recomendado — atomicidade `field.update`
  único, DBT-2.4-OPCOES-JSON cujo gatilho de normalização — integridade referencial a partir de valores
  submetidos — **não** é atingido pela 2.5; **zero migration**), acrescentando `state`/ordenação à forma da
  opção **no JSON** (`{ id, label, position, state }`); **(B)** normalizar para tabela `FieldOption`
  (`id/orgId/fieldId/label/position/state`) com ENABLE+FORCE RLS + 4 policies + GRANT-sem-DELETE + migration +
  rollback — reintroduz superfície de segurança (risco volta a CRÍTICO). **Recomendação primária: (A).** Se
  (A), **não há migration** e T2 é só a decisão registrada; se (B), T2 inclui schema+migration+rollback+RLS+
  GRANT e `FieldOption` entra em `MODELOS_AUDITADOS`.
- [ ] **T3 — Editar Campo (no `FormsService`/subdomínio `forms/`).** Método `editarCampo(alvo, fieldId, patch)`
  por `withTenantContext`, poder = **gerenciar** (`exigirGerenciarPipe`, reuso 2.4). Edita **rótulo/ajuda/
  `typeConfig`/valor padrão**; **não** aceita `type` (imutável — AC1/AC3) nem `orgId`/`position`. `defaultValue`
  ausente → SQL NULL via `Prisma.DbNull`. 404 não-enumerante se o Campo não é do Formulário/contexto. Preserva
  `id` (identidade estável — AD-12). DTO manual (estilo `forms.dto.ts`), `BadRequestException` sanitizada.
- [ ] **T4 — Arquivar/restaurar Campo (espelha `Phase`).** `arquivarCampo`/`restaurarCampo` por
  `withTenantContext`, poder = gerenciar. Transição `ACTIVE→ARCHIVED` (`archivedAt = now`) e `ARCHIVED→ACTIVE`
  (`archivedAt = null`, nova `position = max+1`), **idempotentes SEM `updateMany`** no caminho já-no-estado
  (evita falso `denied` — lição 2.1/2.3), **auditadas** (`Field` já em `MODELOS_AUDITADOS`). **Sem invariante
  "≥1 Campo ativo"** (um Formulário pode ficar vazio — confirmar no Plan; diferente do "≥1 Fase" de `Phase`).
  As **travas** (obrigatório em publicado/requisito/marco) ficam como **seam documentado** (função/ponto de
  verificação vazio de pré-condição), **sem** consultar tabela inexistente. Transições respondem **200**.
- [ ] **T5 — Ciclo de opções de Seleção.** Operações sobre `typeConfig.options` de um Campo de Seleção, cada
  uma **um único `field.update`** atômico (compatível com a recusa de `$transaction`): **adicionar** opção
  (novo `id` estável ao final), **renomear** (mesmo `id`, novo rótulo), **reordenar** (posição fracionária ou
  reindexação in-place do array — decisão do Plan), **arquivar** (`state=ARCHIVED` na opção, mantém rótulo),
  **remover** (retira do array — permitido enquanto nunca usada; **contrato futuro** restringe após uso). Só
  para `SELECT_SINGLE`/`SELECT_MULTI` (senão 400/404). Rejeita rótulos duplicados entre opções **ativas** (como
  `forms.dto.ts`). Adicionar/arquivar/remover opção são **mutação do Campo** → **200** (nenhuma linha nova).
- [ ] **T6 — Rotas (controller `forms/`) + autorização fina.** Estender `FormsController` (sob `pipes/:pipeId`)
  com as rotas de evolução — forma exata no Plan; sugestão: `PATCH .../fields/:fieldId` (editar, 200);
  `POST .../fields/:fieldId/archive` e `.../restore` (200); operações de opção sob `.../fields/:fieldId/options`
  (200). Todas `@Requer('ler','Pipe')` (guarda **grossa**); a guarda **fina** (gerenciar → 403 para
  MEMBER/VIEWER; sem acesso → 404) vive no serviço via `exigirGerenciarPipe`. Nenhuma rota aceita `orgId`;
  **nenhuma** de exclusão, de publicar (2.6) nem de mudança de `type`. Campo de Fase resolve poder por
  `phase.pipeId`.
- [ ] **T7 — Testes (PostgreSQL real, escrita na Org C).** **Editar**: rótulo/ajuda/`typeConfig`/valor padrão
  persistem; `id` do Campo e das opções **inalterados** (SC-252); `type` **não** editável (rejeitado). **RLS**:
  UPDATE de `Field` fora de contexto / de outra Org **negado pelo banco** (fase vermelha — quebrar policy e
  confirmar); outra Org não vê/edita; **sem DELETE** (remover opção é UPDATE, não `DELETE` de linha) (SC-259).
  **Arquivar/restaurar**: transição + idempotência sem falso `denied`; dados preservados; INV-FORM-01 (evoluir
  Campo do contexto inicial não altera o da Fase — RN-054) (SC-253, SC-243-regressão). **Opções**: id estável
  em add/rename/reorder/archive/remove; arquivada mantém rótulo; remoção de opção nunca usada permitida; ordem
  determinística (SC-255, SC-256). **Autorização em FASE VERMELHA** (SC-257/258): Admin da Org evolui; Admin do
  Pipe evolui o seu (inclusive Campo de Fase, poder via `phase.pipeId`); MEMBER/VIEWER concedidos → **403** ao
  evoluir, mas leem; **Membership SUSPENDED** com concessão ADMIN → negado; sem acesso → **404**. **Contrato
  futuro** (SC-254): confirmar por teste/asserção documentada que nenhuma tabela de valores/publicação é
  consultada e que o `type` é imutável. Regressão 2.1/2.2/2.3/2.4 verde. (Se normalizar opções → suíte de RLS
  de `FieldOption` + migration deploy/rollback.)
- [ ] **T8 — Documentação + gates finais.** Atualizar `CLAUDE.md` (bloco de estado: a evolução segura de
  Campos passa a existir — editar/arquivar/restaurar Campo + ciclo de opções; travas = contrato futuro;
  decisão JSON vs tabela registrada), Spec Kit (`plan → checklist → tasks → analyze`), `safe-implementation`,
  `code-review` + **revisão adversarial independente** (não subagente do implementador — lição dos PRs
  #17/#20/#22), `security-check` final, `commit-check`. Confirmar no **checklist de aceite** a identidade
  estável, a idempotência sem falso `denied`, o `type` imutável, o contrato futuro das travas e o teste de
  autorização em fase vermelha.

---

## Dev Notes

### Decisões que o Plan deve fechar (não pré-decidir na Story)

1. **Opções de Seleção: JSON no `typeConfig` vs tabela `FieldOption` — a decisão-chave.** A 2.4 escolheu **JSON
   com UUID estável** (DBT-2.4-OPCOES-JSON) pela **atomicidade** (criar Campo de Seleção com opções = um único
   `field.create`; o mecanismo `withTenantContext` **recusa `$transaction`**) e por **Constitution II / AD-11**
   (não materializar 3ª tabela org-scoped sem consumidor concreto). O **gatilho de normalização** registrado no
   débito é explícito: normalizar **se/quando** existir **integridade referencial a partir de valores
   submetidos** — que só surgem em **2.7+**. **A 2.5 NÃO atinge esse gatilho** (não há submissões). Além disso,
   evoluir opções em JSON é **um `field.update` por operação** (atômico), enquanto uma tabela `FieldOption`
   exigiria inserts/updates em transações separadas — o mesmo problema que barrou a normalização na 2.4. **E**:
   manter JSON deixa a 2.5 **sem migration nova** (as colunas `state`/`archivedAt` já existem em `Field` desde a
   2.4, criadas para uso aqui), baixando o risco de CRÍTICO para ALTO. **Recomendação primária: manter em JSON**,
   acrescentando à forma da opção o campo `state` (`{ id, label, position, state }`). **Escolher a tabela só
   se** o time julgar que o arquivamento de opção exige integridade no nível do banco **agora** — aceitando
   reintroduzir RLS+FORCE+GRANT+migration e o risco CRÍTICO. **Decidir no Plan** (afeta AC4/AC6/SC-255/SC-259 e
   a materialização — ou não — de migration).

2. **Fronteira 2.4 × 2.5 — já fixada, reafirmar.** O épico lista "criar" na 2.5, mas o Plan da 2.4 (D5) já
   fixou: **2.4 = adicionar/listar/reordenar Campo + atributo `state`**; **2.5 = editar + arquivar/restaurar +
   ciclo de opções**. A 2.5 **não** re-implementa criação. A "alternativa a mudar o tipo = criar novo Campo" é
   `adicionarCampo` da 2.4 (o usuário cria outro Campo e arquiva o antigo). Registrar para não duplicar nem
   deixar buraco.

3. **`type` imutável na 2.5.** Editar aceita rótulo/ajuda/`typeConfig`/valor padrão, **não** o `type`. Motivo:
   a única regra do épico sobre mudança de tipo é **"bloqueada quando houver valores/submissões"** — e valores
   só existem em 2.7+. Expor uma rota de mudança de tipo cujo único guard **nunca pode disparar** hoje seria
   materializar comportamento sem consumidor (Constitution II). **Recomendação:** manter `type` imutável;
   declarar o guard como seam futuro; a alternativa segura (criar novo Campo) já existe. Se o Plan quiser
   permitir mudança de tipo **quando não há valores** (que hoje é sempre), pesar o ganho marginal contra o risco
   de alterar `typeConfig`/`defaultValue` semanticamente — **desaconselhado** até 2.7 dar o consumidor real.

4. **Travas de arquivamento = contrato futuro, não guard vazio enganoso.** "Não arquivar Campo obrigatório em
   publicado/requisito de Fase/marco" depende de: **publicação** (2.6), **requisito de Fase** (2.15), **marco**
   (2.12) e de uma noção de **obrigatoriedade** que **não** é atributo global do Campo (D3.1 — pertence ao
   **uso** no contexto; não há coluna `required` em `Field`). Diferente do **gate do Campo Arquivo** da 2.4
   (que era uma função pura sobre `type`/`state`, ambos existentes) e diferente do "≥1 Fase" de `Phase` (que
   consultava linhas existentes), aqui **não há o que consultar**. **Recomendação:** aplicar arquivar/restaurar
   **sem** trava condicional na 2.5 (nada bloqueia hoje), e **documentar** o ponto onde a 2.6/2.15/2.12
   inserirão a verificação — **sem** criar coluna `required` nem stub de publicação. Mesmo espírito com que a
   2.3 tratou "não arquivar Fase com Cards ativos".

5. **Sem invariante "≥1 Campo ativo".** `Phase` bloqueia arquivar a última Fase ativa (SC-233). Um **Formulário
   pode ficar sem Campos ativos** (o épico/PRD não exige mínimo). **Recomendação:** **não** replicar o
   invariante de `Phase`; arquivar é livre quanto à contagem. Confirmar no Plan (evita copiar a trava errada).

6. **Idempotência sem falso `denied` (herda a lição de 2.1/2.3).** Arquivar já arquivado / restaurar já ativo
   retornam **sem** emitir `updateMany` — um `count: 0` filtrado pela policy viraria um `denied` falso na
   trilha de auditoria (`MODELOS_AUDITADOS`). Reusar o padrão exato de `PhasesService.arquivar/restaurar`.

7. **Reuso do poder e local do módulo.** A resolução "config do Pipe" já é `exigirGerenciarPipe`/
   `resolverPoderNoPipe` (`pipes/pipe-authz.ts`, extraída na 2.4). A 2.5 **consome** — não duplica, não toca C3.
   O Campo de Fase resolve o poder pelo `phase.pipeId` (o `FormsService` já valida `phase.pipeId` em
   `exigirFaseDoPipe`). **Recomendação:** estender o subdomínio existente `src/pipes/forms/` (novos métodos no
   `FormsService` ou um serviço irmão `FieldsService` no mesmo módulo — decisão do Plan), sem novo módulo.

8. **Forma da edição / DTO / verbos.** Edição parcial (rótulo/ajuda/`typeConfig`/valor padrão) — `PATCH` ou
   `POST` de ação, no estilo manual de `forms.dto.ts` (sem `class-validator` — Constitution II). Operações de
   opção como sub-rotas dedicadas (adicionar/renomear/reordenar/arquivar/remover) vs um único "editar
   `typeConfig`" que substitui o array inteiro — **decisão do Plan**. **Recomendação:** operações dedicadas por
   opção (intenção explícita, `id` estável servidor-lado, validação de duplicidade), evitando que o cliente
   reescreva o array e possa **perder um `id`** silenciosamente (o que quebraria a identidade estável — AD-12).
   Verbos: editar/arquivar/restaurar/opção = **200** (mutação de linha existente; nenhuma criação de linha).

### Isolamento e "sem exclusão" — herdados da 2.4, reprovar o escopo
`Field` já tem **ENABLE + FORCE ROW LEVEL SECURITY** e GRANT do runtime **SELECT/INSERT/UPDATE — sem DELETE**
(2.4). A 2.5 **não** adiciona GRANT: editar/arquivar/restaurar/opções são **UPDATE**; **remover opção é UPDATE
do `typeConfig`**, não `DELETE` de linha. Ao (não) mexer no GRANT, **reprovar** por teste que o escopo continua
`SELECT/INSERT/UPDATE` e que `DELETE` bate em `permission denied`. Se o Plan normalizar opções para
`FieldOption`, a nova tabela **replica** o padrão (ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK
no INSERT **e** UPDATE, GRANT sem DELETE) e a suíte prova o escopo do novo GRANT.

### INV-FORM-01 na evolução (RN-054)
Evoluir um Campo do contexto **inicial** não pode tocar o Formulário **de Fase** (e vice-versa) — a
não-contaminação é consequência de linhas `Form` distintas + RLS (modelo da 2.4), mas a 2.5 **adiciona
operações de escrita**, então o teste comportamental dedicado de INV-FORM-01 deve **cobrir a evolução**
(editar/arquivar Campo de um contexto e afirmar que o outro é intocado), não só a montagem da 2.4.

### Observabilidade / LGPD
Logs estruturados (Pino) sanitizados. **A definição/opção de Campo (rótulo, ajuda, `typeConfig`) é metadado de
configuração, não valor submetido nem PII** — o valor capturado (potencial PII) só surge com a submissão
(2.7+); confirmar no `lgpd-check`. Mutações de `Field` (editar/arquivar/restaurar/opção) entram na trilha de
auditoria (`Field` já em `MODELOS_AUDITADOS`) — evoluir Campo é mudança de config do Pipe (AD-30/D1.6). Payload
sem `orgId` e sem `position` (chave interna), sem segredo — como no `FormsService` (2.4).

### References
- [Source: epics.md#Story-2.5] — escopo (editar/arquivar/restaurar; mudança de tipo bloqueada por valores;
  renomear não altera identidade; opções removíveis só se nunca usadas, senão arquiváveis; validações valem
  para novas submissões); AC (BDD); Dep. 2.4; Fora: publicação (2.6), submissão (2.7).
- [Source: prd.md#Modelo-de-Formulários-Campos-Databases-e-Registros — D3.4 (edge behaviors de Campo)] —
  "sem perda silenciosa": mudança de tipo só sem valores/submissões (senão criar novo Campo); renomear não
  altera identidade; arquivar reversível preserva valores, bloqueado enquanto obrigatório em publicado/requisito
  de Fase/marco; opções removíveis só se nunca publicadas/usadas, após uso só arquiváveis (restaurar preserva
  identidade); validações valem para novas submissões sem invalidar histórico.
- [Source: prd.md#D3.1] — estrutura do Campo (identidade estável, rótulo, tipo, ajuda, config, valor padrão,
  posição, ativo/arquivado); opções com identidade estável; obrigatoriedade pertence ao **uso** no contexto.
- [Source: regras-negocio-fase-1.md#RN-050..054] — independência dos três Formulários (INV-FORM-01);
  **RN-054** crítica (teste comportamental dedicado, agora cobrindo evolução).
- [Source: ARCHITECTURE-SPINE.md#AD-12] — Campo e opção têm ID estável; valores não dependem do nome visual;
  renomear não desloca valores.
- [Source: ARCHITECTURE-SPINE.md#AD-11] — referência por id estável, tenant-safe; nada materializado só para
  "preparar o futuro" (valores/submissões = 2.7+; publicação = 2.6; requisito de Fase = 2.15; marco = 2.12).
- [Source: apps/api/src/pipes/forms/{forms.service,forms.dto,forms.controller,file-gate}.ts] — base a estender:
  `withTenantContext`, `exigirGerenciarPipe`/`resolverPoderNoPipe` (config do Pipe), `typeConfig` com opções em
  JSON de UUID estável (`montarTypeConfig`), chave fracionária, DTO manual sanitizado, projeções sem
  `orgId`/`position`.
- [Source: apps/api/src/pipes/phases/phases.service.ts] — padrão de **arquivar/restaurar** a reusar:
  idempotência **sem** `updateMany` no caminho já-no-estado; restaurar ao final da ordem ativa (nova
  `position`); `MODELOS_AUDITADOS`. (Sem replicar o invariante "≥1 ativa" — ver Dev Notes 5.)
- [Source: apps/api/prisma/schema.prisma — model Field] — `state FieldState @default(ACTIVE)` e `archivedAt
  DateTime?` **já existem** desde a 2.4 ("usado a partir da 2.5"): a 2.5 **não** precisa de migration se as
  opções permanecerem em JSON.

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
| 2026-07-14 | Story criada (Épico 2, bloco 2.4–2.6 — Sprint S5) a partir de `epics.md` (Story 2.5), dos edge behaviors de Campo do PRD (D3.4) + estrutura/identidade (D3.1), de RN-050..054 (INV-FORM-01) e de AD-11/AD-12. Empilha sobre a 2.4 (domínio Formulário). Risco **ALTO** (evolução de dado organizacional + autorização; **sem tabela/RLS/migration nova se as opções permanecerem em JSON** — colunas `state`/`archivedAt` já existem em `Field` desde a 2.4; CRÍTICO se normalizar opções para `FieldOption`). Escopo **congelado**: editar Campo (rótulo/ajuda/`typeConfig`/valor padrão, `type` imutável) + arquivar/restaurar Campo (espelha `Phase`, idempotente sem falso `denied`) + ciclo de opções de Seleção (add/rename/reorder/archive/remove, id estável). **AC5** reusa `pipe-authz` (config do Pipe — Admin da Org ou Admin do Pipe; MEMBER/VIEWER só leem; sem acesso → 404), sem tocar C3. **AC3** fixa como **contrato futuro** as travas que dependem de publicação (2.6), submissões/valores (2.7+), requisito de Fase (2.15) e marco (2.12) — nada materializado (AD-11). Decisões deixadas para o Plan: **opções JSON (recomendado) vs tabela `FieldOption`** (a decisão-chave, com/sem migration); `type` imutável (recomendado); travas como seam sem coluna `required`; sem invariante "≥1 Campo ativo"; forma da edição/DTO e verbos (200); operações de opção dedicadas vs substituir array. Divergência sinalizada: o épico lista "criar" na 2.5, mas a criação é da 2.4 (D5) — a 2.5 não re-implementa. Status → ready-for-dev. |
