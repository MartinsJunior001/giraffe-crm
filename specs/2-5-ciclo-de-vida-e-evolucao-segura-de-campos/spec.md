# Spec — Story 2.5: Ciclo de vida e evolução segura de Campos

> Risco **ALTO** — evolui as **instâncias de Campo** já criadas pela 2.4 (editar / arquivar / restaurar /
> ciclo de opções de Seleção). **NÃO** cria entidade nem catálogo novo; **sem migration** se as opções
> permanecerem em JSON no `typeConfig` (as colunas `state`/`archivedAt` já existem em `Field` desde a 2.4 —
> "usado a partir da 2.5"). Fica **CRÍTICO** apenas se o Plan normalizar as opções para uma tabela
> `FieldOption` (nova superfície RLS+GRANT+migration). Spec completo.
> Fonte: `_bmad-output/implementation-artifacts/2-5-ciclo-de-vida-e-evolucao-segura-de-campos.md`;
> `epics.md` Story 2.5; `prd.md` Modelo de Formulários/Campos (D3.4 edge behaviors, D3.1);
> `regras-negocio-fase-1.md` RN-050..054 (INV-FORM-01); `ARCHITECTURE-SPINE.md` AD-11/AD-12.

## Contexto
A Story 2.4 introduziu o **domínio Formulário**: catálogo canônico (`FieldType`), `Form` (contexto
inicial/Fase) e `Field` (rótulo/tipo/ajuda/`typeConfig` JSON/valor padrão/posição fracionária/estado), com
**opções de Seleção em JSON no `typeConfig`** (UUID estável — DBT-2.4-OPCOES-JSON) e a montagem
(adicionar/listar/reordenar). A 2.5 fecha o **ciclo de vida do Campo**: **editar** (rótulo/ajuda/`typeConfig`/
valor padrão), **arquivar/restaurar** (reversível, preserva valores) e o **ciclo de opções** (adicionar/
renomear/reordenar/arquivar/remover), **sem perda silenciosa de dados** e **preservando a identidade estável**
(AD-12). Evoluir Formulário é **config do Pipe** (D3.2) — logo **reusa** a resolução de poder já extraída para
`pipes/pipe-authz.ts` na 2.4, **sem** alterar o mecanismo C3. É **pré-requisito de 2.6** (publicação) e das
submissões (2.7+). Criação de Campo (2.4), publicação (2.6) e submissão/Card (2.7+) **não** entram.

## Modelo de dados
- **Sem entidade nova** (recomendação primária). A 2.5 opera sobre `Field` (2.4): `state FieldState (ACTIVE |
  ARCHIVED)` e `archivedAt DateTime?` **já existem** desde a 2.4 e foram criados para uso aqui — **arquivar/
  restaurar não exige migration**. Editar altera `label`/`help`/`typeConfig`/`defaultValue` (`Json`), sem tocar
  `id` (identidade estável) nem `type` (imutável na 2.5).
- **Opções de Seleção — a decisão estrutural central (Plan):**
  - **(A) Manter em `typeConfig` JSON** (recomendado): a forma da opção passa a `{ id, label, position, state }`
    (acrescenta `state` à forma da 2.4 `{ id, label, position }`); cada operação é **um único `field.update`**
    atômico (compatível com a recusa de `$transaction`); **zero migration**. O gatilho de normalização do
    DBT-2.4-OPCOES-JSON — integridade referencial a partir de **valores submetidos** — **não** é atingido pela
    2.5 (submissões = 2.7+).
  - **(B) Normalizar para tabela `FieldOption`** (`id/orgId/fieldId/label/position/state`): identidade/
    arquivamento no nível do banco, ao custo de **nova tabela org-scoped** (ENABLE+FORCE RLS + 4 policies +
    GRANT-sem-DELETE + migration + rollback + `MODELOS_AUDITADOS`) e da perda de atomicidade (inserts/updates de
    opção em transações separadas). Risco volta a **CRÍTICO**.
  - **Recomendação: (A).** Decidir no plan (afeta o modelo, a existência de migration e SC-255/SC-259).
- **Ordenação intra-Campo das opções:** posição fracionária (como `Field`/`Phase`) **ou** reindexação in-place
  do array no `field.update` — decisão do plan (em JSON, reescrever o array é atômico; a chave fracionária é
  desnecessária se cada reordenação é um `update` do array inteiro).
- **Sem exclusão definitiva:** runtime **sem GRANT DELETE** (herdado da 2.4). Editar/arquivar/restaurar são
  **UPDATE**; **remover uma opção é UPDATE do `typeConfig`**, não `DELETE` de linha. Arquivar Campo é
  `state = ARCHIVED` (reversível).
- **`Field` já em `MODELOS_AUDITADOS`** (2.4) — editar/arquivar/restaurar/opção são mutações de config
  auditadas. (Se (B), `FieldOption` também entra.)

## Edge behaviors de Campo (D3.4) — o que a 2.5 aplica vs. contrato futuro
- **Renomear** rótulo/ajuda **não** altera identidade (Campo e opções mantêm `id` — AD-12). **Aplica agora.**
- **Arquivar** Campo é **reversível** e preserva valores (leitura); **restaurar** preserva identidade e devolve
  ao final da ordem ativa. **Aplica agora** (espelha `Phase`, idempotente sem falso `denied`).
- **Editar `typeConfig`/valor padrão.** **Aplica agora.** "Alterações de validação valem para novas
  submissões, sem invalidar histórico" é **contrato futuro** (não há submissão — 2.7+); a 2.5 apenas permite a
  edição.
- **Mudança de tipo bloqueada quando houver valores/submissões.** **Contrato futuro:** valores/submissões =
  2.7+. A 2.5 mantém o **`type` imutável** e **não** cria rota de mudança de tipo (a alternativa "criar novo
  Campo" já é `adicionarCampo` da 2.4). O guard fica declarado como seam, sem tabela a consultar.
- **Arquivar bloqueado enquanto obrigatório em Formulário publicado / requisito de Fase / marco.** **Contrato
  futuro:** publicação = 2.6, requisito de Fase = 2.15, marco = 2.12; **não** há coluna `required` em `Field`
  (a obrigatoriedade pertence ao **uso** no contexto — D3.1). A 2.5 aplica arquivar **sem** trava condicional
  (nada bloqueia hoje) e documenta o ponto de verificação futuro — **sem** materializar coluna/estado (AD-11).
- **Opções removíveis só se nunca publicadas/usadas; após uso, só arquiváveis.** A 2.5 aplica **arquivar** e
  **remover** de opção; como publicação/uso **não existem**, remover é hoje **sempre** permitido; a restrição
  "após uso, só arquivar" é **contrato futuro**. Opção arquivada preserva o rótulo; restaurar preserva o `id`.

## Contextos e isolamento (INV-FORM-01)
- A não-contaminação entre contextos (inicial/Fase) é consequência de linhas `Form` distintas + RLS (modelo da
  2.4). Como a 2.5 **adiciona operações de escrita**, o teste comportamental dedicado de **RN-054** deve cobrir
  a **evolução** (editar/arquivar um Campo de um contexto e afirmar que o outro é intocado), não só a montagem.
- `Field` já tem **ENABLE + FORCE ROW LEVEL SECURITY** (2.4); a 2.5 herda o isolamento sem novas policies (se
  (A)). Toda query por `withTenantContext`.

## Autorização (CASL, C3) — por recurso, no serviço; REUSA `pipe-authz` (2.4)
- **Evoluir Campo/opção** (editar/arquivar/restaurar) do Formulário **inicial** (do Pipe) e **de Fase** (da
  Fase daquele Pipe) é **config do Pipe** (D3.2): pode o **Admin da Org** (qualquer Pipe, sem concessão) **ou**
  o **Admin do Pipe** (`PipeGrant.role = ADMIN`, `state = ACTIVE`, com `Membership.state = ACTIVE`).
  **MEMBER/VIEWER** concedidos → **leem**, **não** evoluem (**403**). **Sem acesso ao Pipe** → **404
  não-enumerante**.
- Para o Campo de um Formulário **de Fase**, o poder resolve pelo **Pipe dono da Fase** (`phase.pipeId`) — como
  já faz o `FormsService`.
- Guarda **grossa** (`AuthzGuard`) mantém `@Requer('ler','Pipe')` nas rotas; a guarda **fina** vive **no
  serviço** (**DBT-AUTHZ-01**), reusando `exigirGerenciarPipe`/`resolverPoderNoPipe` da 2.4 (**lê `role`**,
  **reconfere `Membership.state`**). **Não** altera C3.

## Isolamento / RLS / GRANT (AD-6)
- `Field` (e, se (B), `FieldOption`): **ENABLE + FORCE ROW LEVEL SECURITY**, 4 policies por
  `orgId = current_org_id()`, **WITH CHECK no INSERT e no UPDATE** — herdado da 2.4 para `Field`.
- **GRANT runtime:** `SELECT, INSERT, UPDATE` — **sem DELETE** (a 2.5 **não** adiciona GRANT). **Remover opção =
  UPDATE** do `typeConfig`, não `DELETE` de linha. Ao (não) mexer no GRANT, **reprovar** por teste que o escopo
  segue `SELECT/INSERT/UPDATE` e que `DELETE` bate em `permission denied`.

## Contrato de API (interna)
> Rotas sob `pipes/:pipeId/...` (config do Pipe), estendendo o `FormsController` da 2.4. Forma exata = plan.
> Nenhuma rota recebe `orgId`; nenhuma de exclusão; nenhuma de publicar (2.6) nem de mudança de `type`.
> Verbos: mutação de linha existente = **200** (nenhuma criação de linha nova).
- `PATCH /pipes/:pipeId/forms/initial/fields/:fieldId` e `.../phases/:phaseId/form/fields/:fieldId` — **editar**
  rótulo/ajuda/`typeConfig`/valor padrão (não `type`). Requer **config do Pipe**. → 200 + `Field`.
- `POST .../fields/:fieldId/archive` e `.../fields/:fieldId/restore` — **arquivar/restaurar** (idempotente).
  Requer config. → 200.
- Operações de **opção de Seleção** sob `.../fields/:fieldId/options` (adicionar/renomear/reordenar/arquivar/
  remover) — forma exata no plan (sub-rotas dedicadas recomendadas vs substituição do array). Requer config.
  → 200. Só para `SELECT_SINGLE`/`SELECT_MULTI` (senão 400/404).
- Sem acesso ao Pipe → **404** não-enumerante em todas. Payload sem `orgId` e sem `position` (chave interna).

## Estados e transições
`Field.state`: `ACTIVE ↔ ARCHIVED` (arquivar/restaurar, reversível, `archivedAt` marcado/nulo), idempotente
**sem** `updateMany` no caminho já-no-estado (evita falso `denied` — lição 2.1/2.3). **Sem invariante "≥1 Campo
ativo"** (um Formulário pode ficar vazio — diferente do "≥1 Fase" de `Phase`; confirmar no plan). Opção:
`ACTIVE ↔ ARCHIVED` dentro do `typeConfig`. `type` **imutável**. Sem ciclo de publicação (2.6).

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-251** — **editar** persiste rótulo/ajuda/`typeConfig`/valor padrão; o **`type` NÃO é editável**
  (rejeitado); a ordem (posição) é preservada. (AC1)
- **SC-252** — **identidade estável**: o `id` do Campo e os `id` das opções **não mudam** ao editar/renomear
  (AD-12 — renomear não desloca valores). (AC1)
- **SC-253** — **arquivar/restaurar**: `ACTIVE→ARCHIVED` (`archivedAt` marcado, sai da ordem ativa, dados
  preservados) e `ARCHIVED→ACTIVE` (`archivedAt=null`, ao final da ordem); **idempotente sem falso `denied`**;
  identidade preservada. (AC2)
- **SC-254** — **contrato futuro:** as travas "obrigatório em publicado/requisito/marco" e "mudança de tipo por
  valores/submissões" **não** consultam tabela alguma (publicação/submissão/valor/requisito/marco inexistentes;
  sem coluna `required`); nada é falsamente bloqueado nem materializado (AD-11); o `type` é imutável. (AC3)
- **SC-255** — **ciclo de opções**: add/rename/reorder/archive/remove mantêm **`id` estável** por opção;
  renomear não muda o `id`; opção arquivada preserva o rótulo; ordem determinística. (AC4)
- **SC-256** — **remover opção** é permitido enquanto **nunca usada** (hoje sempre — publicação/uso inexistem);
  a restrição "após uso, só arquivar" é contrato futuro. (AC4)
- **SC-257** — **[ROLE] autorização de evolução (reusa a 2.4):** Admin da Org evolui Campos de qualquer Pipe;
  **Admin do Pipe** (`PipeRole=ADMIN` ACTIVE + `Membership` ACTIVE) evolui os do seu Pipe (inclusive Campo de
  **Fase**, poder via `phase.pipeId`); **MEMBER/VIEWER** concedidos → **403** ao evoluir (mas **leem**);
  Membership SUSPENDED com concessão ADMIN → negado. (AC5)
- **SC-258** — **não-enumeração:** sem acesso ao Pipe → **404** em todas as rotas de evolução, indistinguível de
  "não existe". (AC5)
- **SC-259** — **isolamento e "sem exclusão":** outra Organização não vê nem edita Campos; UPDATE de `Field`
  sem contexto (ou de outra Org) é **negado pelo banco** (FORCE RLS); o runtime **não** apaga (sem GRANT
  DELETE) e **remover opção é UPDATE** do `typeConfig`; **nenhuma nova tabela** materializada se (A). (Se (B):
  suíte de RLS de `FieldOption` + escopo do novo GRANT.) (AC6)

## Não-objetivos
**Criação/adição de Campo** (2.4 — a 2.5 não re-implementa). **Publicação/versionamento** (2.6): rascunho→
publicar→despublicar; **aplicação** das travas "obrigatório em publicado" e do gate do Campo Arquivo no ato de
publicar. **Submissão e criação de Card** (2.7+); **valores** de Campo; bloqueio de transição por Campo
obrigatório (2.15) — **não se materializa** Submissão/Valor/Card (AD-11). **Requisito de Fase** (2.15) e
**marco** (2.12/D2.7). **Mudança de `type`** (guard sem consumidor real hoje). **Contexto Database** (E3).
**Exclusão definitiva** de Campo. Regras condicionais/validação programável/exibição dinâmica (fora da Fase 1).

## Segurança / observabilidade / LGPD
Sem bypass de RLS (AD-6). **A definição/opção de Campo (rótulo/ajuda/`typeConfig`) é metadado de configuração,
não valor submetido nem PII** — o valor capturado surge só com a submissão (2.7+); confirmar no `lgpd-check`.
Evoluir Campo/opção entra na trilha de auditoria (`Field` já em `MODELOS_AUDITADOS` — mudança de config,
AD-30/D1.6). Idempotência sem falso `denied`. Logs sanitizados; payload sem `orgId` nem `position`; nenhum
segredo.

## Dependências e ordem
Empilha sobre a **Story 2.4** (`Form`/`Field`/`FieldType`/`FieldState`/`FormContext`, `pipe-authz`, opções JSON)
e, por transitividade, 2.3/2.2/2.1/1.6. Bloco **2.4–2.6** (Sprint S5). É **pré-requisito de 2.6** e das
submissões (2.7+). Não abrir PR contra `main` antes de a base (2.4) estar mergeada; após o merge, rebasear e
revalidar diff/CASL/RLS/testes (e migration **só** se (B)). Regressão de 2.1/2.2/2.3/2.4 proibida.

## Clarifications (a resolver no plan)
1. **Opções de Seleção — JSON no `typeConfig` (com `state`) vs tabela `FieldOption`.** *A decisão-chave.*
   *Recomendação: manter JSON — atomicidade (`field.update` único), o gatilho de normalização do
   DBT-2.4-OPCOES-JSON (integridade referencial a partir de valores submetidos) NÃO é atingido pela 2.5, e
   manter JSON deixa a Story **sem migration** (colunas já existem desde a 2.4). Normalizar só se o time exigir
   integridade no banco agora, aceitando reintroduzir RLS+GRANT+migration e risco CRÍTICO.*
2. **`type` imutável na 2.5 vs rota de mudança de tipo agora.** *Recomendação: `type` imutável; mudança de tipo
   é contrato futuro (guard "bloqueado por valores" nunca dispara hoje — valores = 2.7+); a alternativa "criar
   novo Campo" já é `adicionarCampo` da 2.4. Constitution II / AD-11.*
3. **Travas de arquivamento como seam vs guard funcional.** *Recomendação: aplicar arquivar/restaurar SEM trava
   condicional (nada existe para bloquear: publicação=2.6, requisito de Fase=2.15, marco=2.12, sem coluna
   `required`); documentar o ponto de verificação futuro sem materializar coluna/estado (AD-11). Diferente do
   gate do Campo Arquivo da 2.4 (função pura sobre `type`/`state`) — aqui não há o que consultar.*
4. **Semântica de remover opção agora.** *Recomendação: remover permitido enquanto nunca usada (hoje sempre);
   arquivar sempre disponível; a restrição "após uso, só arquivar" entra quando 2.6/2.7 derem o consumidor.*
5. **Migration ou não.** *Recomendação: se (A) JSON, **sem migration** (state/archivedAt já existem em `Field`);
   se (B), migration+RLS+GRANT+rollback de `FieldOption`. Registrar explicitamente para o `migration-check`.*
6. **Invariante "≥1 Campo ativo"?** *Recomendação: NÃO replicar o "≥1 Fase ativa" de `Phase` — um Formulário
   pode ficar vazio; arquivar é livre quanto à contagem.*
7. **Forma da edição / DTO / verbos e operações de opção.** *Recomendação: DTO manual (sem `class-validator`);
   editar/arquivar/restaurar/opção = 200; operações de opção **dedicadas** (add/rename/reorder/archive/remove)
   em vez de substituir o array inteiro — evita o cliente perder um `id` silenciosamente (quebraria a
   identidade estável — AD-12).*
8. **Local/serviço.** *Recomendação: estender o subdomínio existente `src/pipes/forms/` (novos métodos no
   `FormsService` ou serviço irmão `FieldsService` no mesmo módulo); sem novo módulo; reusar `pipe-authz` e a
   resolução por `phase.pipeId`; sem tocar C3.*
