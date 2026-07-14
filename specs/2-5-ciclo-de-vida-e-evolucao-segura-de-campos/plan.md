# Plan — Story 2.5: Ciclo de vida e evolução segura de Campos

> Risco **ALTO** (evolui instâncias de `Field` da 2.4; **sem** entidade/catálogo novo). **Sem migration**
> (Opção A — ver `clarify.md` C1/C5): `state`/`archivedAt` já existem em `Field` desde a 2.4. Empilha sobre
> a 2.4 (já `done` na `main`). Não altera Architecture Spine, PRD nem Constitution.

## Decisão estrutural (Opção A, ratificada)
Opções de Seleção **permanecem em `typeConfig` JSON**. A forma da opção passa de `{ id, label, position }`
(2.4) para **`{ id, label, position, state }`** com `state ∈ {ACTIVE, ARCHIVED}`. Cada operação de opção é
**um único `field.update`** do `typeConfig` inteiro — atômico, compatível com a recusa de `$transaction`
por `withTenantContext`. **Nenhuma tabela `FieldOption`, nenhuma migration, nenhum GRANT/policy novo.**

## Modelo de dados (inalterado no schema)
- `Field` (2.4): `state FieldState`, `archivedAt DateTime?` — **já existem**. Editar altera
  `label`/`help`/`typeConfig`/`defaultValue`; **nunca** `id` (identidade estável, AD-12) nem `type` (imutável).
- Opção no `typeConfig.options[]`: `{ id: uuid, label: string, position: number, state: 'ACTIVE'|'ARCHIVED' }`.
  Compatibilidade retroativa: opções criadas pela 2.4 (sem `state`) são lidas como `ACTIVE` (default na
  normalização de leitura). Ao **regravar**, a 2.5 materializa o `state` explícito.
- `Field` já está em `MODELOS_AUDITADOS` (2.4) — editar/arquivar/restaurar/opção são mutações de config auditadas.

## Serviço — `FieldsService` (irmão do `FormsService`, mesmo módulo `src/pipes/forms/`)
Reusa a resolução de contexto/owner e a autorização fina do `FormsService`/`pipe-authz`. Toda query por
`withTenantContext`. Cada método público: (1) `exigirGerenciarPipe`; (2) resolve o Formulário do contexto
(sem criar — evoluir Campo pressupõe Campo, logo Formulário existente; senão **404**); (3) localiza o
`Field` por `id` **confirmando `formId`** (senão 404 não-enumerante); (4) aplica a mutação como **um único
`update`/`updateMany`**.

- `editarCampo(alvo, fieldId, patch)` — `patch` ⊆ `{ label?, help?, typeConfig(edições de tipo)?, defaultValue? }`.
  **Rejeita `type` no corpo** (400). `updateMany` filtrado por `{ id, formId }` (sem tocar `position`/`type`).
  Para Campo de Seleção, editar pode alterar `typeConfig` **apenas via as operações dedicadas de opção**
  (abaixo) — o `editarCampo` **não** aceita `options`/`typeConfig` cru do cliente (evita mass-assignment e
  perda de `id`). Retorna 200 + Campo.
- `arquivarCampo(alvo, fieldId)` / `restaurarCampo(alvo, fieldId)` — `ACTIVE↔ARCHIVED`, `archivedAt`
  marcado/nulo; **idempotente sem `updateMany` no caminho já-no-estado** (evita falso `denied` — lição
  2.1/2.3): lê o estado; se já no destino, retorna 200 sem emitir mutação. Restaurar devolve ao **final da
  ordem ativa** (`proximaPosicao`). Sem invariante "≥1 Campo ativo" (C6).
- Opções (só `SELECT_SINGLE`/`SELECT_MULTI`; senão 400 se o Campo não é de Seleção, 404 se o Campo/opção não
  existe): `adicionarOpcao(label)`, `renomearOpcao(optionId, label)`, `reordenarOpcao(optionId, afterOptionId|null)`,
  `arquivarOpcao(optionId)`, `removerOpcao(optionId)`. **Todas** = ler `typeConfig` corrente → transformar o
  array em memória → **um** `update` do `typeConfig`. **Nunca** recebem o array inteiro do cliente.
  - `adicionarOpcao`: novo `{ id: randomUUID(), label, position: max+1, state: ACTIVE }`.
  - `renomearOpcao`: muda só `label` da opção com aquele `id` (o `id` **não** muda — invariante 3).
  - `reordenarOpcao`: recoloca a opção após `afterOptionId` (ou no início) e **reindexa `position`** do array
    inteiro de forma determinística (reescrever o array é atômico — chave fracionária desnecessária aqui, §Clarif 2.4).
  - `arquivarOpcao`: `state = ARCHIVED` (preserva `id`/`label`); idempotente.
  - `removerOpcao`: retira a opção do array (permitido enquanto uso inexiste — C4). **É UPDATE do `typeConfig`**,
    não DELETE de linha. Recusa remover a **última** opção ativa? Não — mas o Campo de Seleção sem opções é
    marcado como estado a validar na publicação (2.6); a 2.5 documenta o seam sem materializar.

## Validação e invariantes do `typeConfig` (módulo `option-config.ts`, funções puras)
Um módulo puro, testável em unidade e reusado pelo serviço:
- `lerOpcoes(typeConfig): Opcao[]` — **parse tolerante-a-leitura mas fail-closed a escrita**: valida a forma;
  opção legada sem `state` → `ACTIVE`; **`typeConfig` malformado** (não-objeto, `options` não-array, item sem
  `id`/`label` válidos, `id` duplicado, chave extra desconhecida) → lança (invariantes 5/6/8/9). Nunca "conserta".
- `serializarOpcoes(Opcao[]): InputJsonValue` — reescreve `{ options: [...] }`, `position` reindexado 1..n na
  ordem, validado contra os limites (invariante 7).
- Allowlist de chaves da opção: **exatamente** `{ id, label, position, state }` — qualquer outra chave recusa
  (invariante 9, anti-mass-assignment). O objeto `typeConfig` de topo só admite `options` (para Seleção) e `{}`
  (demais). `label` tratado como conteúdo não confiável: trim + limites, **sem** reescrever/sanitizar (a Web
  escapa — invariante 10).
- Limites (reuso da 2.4): `LABEL_MAX=200`, `OPCOES_MAX=200`; novo `TYPECONFIG_BYTES_MAX` (payload serializado)
  como teto defensivo (invariante 7).

## Contrato de API (interna) — rotas sob `pipes/:pipeId/...`, estendendo `FormsController`
Todas `@Requer('ler','Pipe')` (guarda grossa); a fina no serviço. Nenhuma recebe `orgId`. Mutação de linha
existente = **200**. Espelhadas para inicial (`forms/initial/...`) e Fase (`phases/:phaseId/form/...`).
- `PATCH .../fields/:fieldId` — editar `label`/`help`/`defaultValue` (não `type`, não `options` cru). → 200 + Campo.
- `POST .../fields/:fieldId/archive` · `POST .../fields/:fieldId/restore` — idempotente. → 200.
- `POST .../fields/:fieldId/options` — adicionar (`{ label }`). → 200 + Campo.
- `PATCH .../fields/:fieldId/options/:optionId` — renomear (`{ label }`). → 200.
- `POST .../fields/:fieldId/options/:optionId/reorder` — (`{ afterOptionId: uuid|null }`). → 200.
- `POST .../fields/:fieldId/options/:optionId/archive` — → 200.
- `DELETE`? **Não** — "remover opção" é `POST .../fields/:fieldId/options/:optionId/remove` (é UPDATE do
  `typeConfig`; o runtime **não** tem GRANT DELETE e não haverá rota DELETE). → 200.
- Fora de Seleção → 400; Campo/opção inexistente ou de outro Formulário → **404** não-enumerante. Sem acesso
  ao Pipe → **404**. Payload sem `orgId` e sem `position` do Campo (chave interna); as `position` das opções
  saem (fazem parte da forma pública da opção, como na 2.4).

## Autorização (CASL C3 intocado) — reusa `pipe-authz` (2.4/2.3)
Evoluir Campo/opção é **config do Pipe** (D3.2): **Admin da Org** (qualquer Pipe) **ou** **Admin do Pipe**
(`PipeGrant.role=ADMIN` ACTIVE + `Membership.state=ACTIVE`) via `exigirGerenciarPipe`. MEMBER/VIEWER → **403**
(mas leem pelo `FormsService`). Sem acesso → **404**. Campo de Fase resolve o poder pelo `phase.pipeId`.

## Isolamento / RLS / GRANT (AD-6) — herdado, sem novidade
`Field` já tem ENABLE+FORCE RLS + policies por `orgId=current_org_id()` (2.4). A 2.5 **não** adiciona
policy/tabela/GRANT. Runtime: `SELECT/INSERT/UPDATE`, **sem DELETE** — remover opção é UPDATE. Teste **reprova**
que o escopo do GRANT segue sem DELETE e que UPDATE cross-org é negado pelo banco.

## Atomicidade e concorrência (invariante 12)
Cada mutação é **um** `update`/`updateMany` — sem transação multi-statement (recusada por `withTenantContext`).
O ciclo de opções é ler → transformar em memória → regravar, **passos separados** (não há transação
multi-statement): entre a leitura e a escrita de um administrador, outro pode ter comitado. Uma escrita "última
vence" ingênua perderia a alteração do primeiro **em silêncio**. Por isso o `field.update` do ciclo de opções
carrega uma **guarda otimista**: o `typeConfig` lido é o token de versão, e o `updateMany` filtra por
`typeConfig: { equals: <lido> }`. Se o valor mudou desde a leitura, o UPDATE atinge **0 linhas** e o serviço
responde **409** (falha alto, o cliente recarrega e repete) — nunca um 200 cuja escrita sumiu. O teste de
concorrência dispara duas edições simultâneas e afirma que **nenhuma some**: cada resposta é 200 (aplicada) ou
409 (conflito), e o estado final contém exatamente as opções das requisições 200. A prova determinística do
mecanismo (token obsoleto → 0 linhas; mutação da guarda → 1 linha, lost update) vive em `fields-rls.test.ts`.

## Sequência (red-green-mutação)
1. **Unidade `option-config.ts`** (vermelho→verde): id duplicado recusa; label vazio recusa; chave extra
   recusa; malformado recusa; renomear preserva id; reordenar não altera valor; limites.
2. **Serviço + rotas**: editar (não `type`), arquivar/restaurar (idempotente), ciclo de opções.
3. **HTTP real** (`fields-http.test.ts`): 200/400/404; identidade estável; ordem determinística.
4. **Authz** (`fields-authz.test.ts`): Admin Org / Admin Pipe / MEMBER-VIEWER 403 / sem acesso 404 / Membership
   SUSPENDED negada — inclusive Campo de Fase por `phase.pipeId`.
5. **RLS/isolamento** (`fields-rls.test.ts`): outra Org não vê/edita; UPDATE sem contexto negado; GRANT sem DELETE;
   INV-FORM-01 sob **evolução** (editar/arquivar Campo de um contexto não toca o outro — RN-054).
6. **Mutação**: (a) aceitar id duplicado → teste fica vermelho; (b) persistir label no lugar do id → vermelho;
   (c) remover a validação do `typeConfig` → vermelho; (d) aceitar propriedade desconhecida → vermelho.
7. **Gates**: `context7-check` (Prisma 6.19.3 / Nest 11 — JSON update, sem API nova), `security-check`,
   `observability-check`, `lgpd-check` (rótulo/ajuda = metadado de config, não PII submetida), `migration-check`
   (N/A — sem DDL), `performance-check` (leve — update de linha única, índice existente).

## Riscos e mitigações
- **R1 — mass-assignment via `typeConfig`/`type`:** editar **não** aceita `type` nem `options` cru; opções só
  por rotas dedicadas; allowlist de chaves. Provado por mutação (d).
- **R2 — perda de identidade da opção:** operações dedicadas (nunca "substituir array"); renomear preserva id.
  Provado por SC-252/SC-255 + mutação (b).
- **R3 — falso `denied` em idempotência:** arquivar/restaurar já-no-estado retorna 200 sem `updateMany`.
- **R4 — escopo antecipado:** nenhuma trava condicional/coluna/tabela materializada (AD-11); seams documentados.
- **R5 — regressão da 2.4:** a 2.5 só adiciona; `FormsService`/rotas da 2.4 intocados; suíte da 2.4 re-executada.

## Constitution / arquitetura
AD-11 (não materializar futuro), AD-12 (identidade estável), Constitution II (sem escopo/abstração
especulativa — sem `FieldOption`), deny-by-default preservado, DBT-AUTHZ-01 (autorização fina no serviço).
