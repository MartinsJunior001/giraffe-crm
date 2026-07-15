# Story 2.15: Formulário de Fase e bloqueio de transição

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário autorizado,
I want um Formulário de Fase que possa exigir dados para avançar,
so that eu garanta a qualidade do processo.

## Acceptance Criteria

1. **Given** um Formulário de Fase com campos obrigatórios não preenchidos **When** se tenta avançar **Then** o **validador reporta bloqueio ao preflight (2.14)**: a transição é bloqueada, o Card permanece na Fase, requisitos exibidos, **nenhum evento de movimentação**, valores informados **preservados**. (epics §997)
2. **Given** um **requisito de entrada** **When** a movimentação é confirmada **Then** os valores da Fase de **destino** são validados e **persistidos na mesma transação** da movimentação; falha na persistência **impede** a movimentação; **não há movimentação parcial**. (epics §997)
3. **Given** um **requisito de saída** **When** o Card sai da Fase **Then** os valores vinculados à Fase **atual** são validados **antes**. (epics §997)
4. **And** salvar **não movimenta sozinho**; valores **persistem após a saída** (visíveis a autorizados, não descartados ao mover/finalizar/arquivar/reabrir); **correção posterior** exige ação explícita autorizada e gera **evento antes/depois** no Histórico. (epics §992, §997)

**Rastreabilidade:** FR-16; D3.3; INV-FORM-01; AD-12/13. · **Consome:** contrato de **preflight de movimentação (2.14)**; Form Builder/publicação (2.4/2.5/2.6). · **Dep.:** 2.5, 2.6, 2.14. · **Gates:** **persistência transacional dos valores de Fase = decisão de Arquitetura** (resolver no `clarify`/`plan`). · **Fora:** Formulário inicial (2.7); Formulário de Database (E3); evento canônico opt-in (2.16).

## Tasks / Subtasks

> ⚠️ **Provisório — precede o Spec Kit.** Os itens marcados **[GATE-ARCH]** dependem de decisão de Arquitetura no
> `clarify`/`plan` (persistência dos valores de Fase; se o Formulário de Fase reusa `FormVersion`/publicação). Não
> implementar antes de `pre-implementation-check`.

- [ ] **T1 — Configuração do Formulário de Fase (modo)** (AC: 1, 2, 3, 4)
  - [ ] Cada `Phase` ganha um **modo de Formulário**: `INFORMATIVO`/`REQUISITO_ENTRADA`/`REQUISITO_SAIDA` (ou combinação — decidir no `clarify`). Config é **"config do Pipe"** — reusa `exigirGerenciarPipe` (Admin da Org/Admin do Pipe); Membro→403, sem acesso→404. **[GATE-ARCH]** representação do modo (coluna em `Phase` vs no `Form`).
  - [ ] O **Formulário de Fase** já existe como domínio (`Form.context = 'PHASE'`, 2.4) e resolve o poder pelo `phase.pipeId`. Montagem/evolução/publicação **reusam** 2.4/2.5/2.6 sem recriar — INV-FORM-01 (os três Formulários são independentes).
- [ ] **T2 — Validador de Formulário de Fase acoplado ao preflight da 2.14** (AC: 1, 2, 3)
  - [ ] Implementar um **`ValidadorDeTransicao`** (contrato puro de `cards/movement/transition-preflight.ts`) que reporta bloqueio quando um **requisito de saída** da Fase de origem ou **requisito de entrada** da Fase de destino não é satisfeito. O I/O (ler a definição do Formulário de Fase + valores) é resolvido **antes**, no serviço, e injetado **já materializado** no `ContextoDeTransicao` (mantendo o núcleo puro — padrão fixado na 2.14). Estender `ContextoDeTransicao` **aditivamente** (campos opcionais), sem quebrar os built-in.
  - [ ] A movimentação passa a aceitar os **valores do Formulário de Fase** no request (para o requisito de entrada). Validação de domínio (allowlist por `Field.id`, tipo por Campo, obrigatoriedade) **reusa** o núcleo de submissão (`submission.ts`, 2.7) — não reinventar.
- [ ] **T3 — Persistência transacional dos valores de Fase (na tx da movimentação)** (AC: 2) **[GATE-ARCH]**
  - [ ] **Decisão de Arquitetura (Gate):** onde vivem os valores por-(Card, Fase). Candidatos: **nova tabela org-scoped** `CardPhaseValues` (RLS+FORCE+WITH CHECK; JSONB `valores` por `Field.id`; referência à `FormVersion` congelada — AD-12; chave por `(cardId, phaseId)` ou por entrada `CardPhaseEntry`) **vs** estrutura aninhada. **NÃO** normalizar por Campo (AD-11). Preserva o padrão da casa: sem DELETE (correção é novo estado/evento).
  - [ ] O requisito de **entrada** persiste os valores da Fase destino **na mesma transação interativa** da movimentação (2.14 — `card-movement.service`): estender a tx para **(iv)** persistir os valores validados. Falha na persistência → **rollback integral** (sem `phaseId` novo, sem `CardPhaseEntry`, sem `MOVED`) — **nenhuma movimentação parcial** (AC2). Reusa o primitivo `definirContextoOrg` (client raiz).
  - [ ] Valores **persistem após a saída** — nunca descartados por mover/finalizar/arquivar/reabrir (o ciclo de vida 2.11 e a saúde 2.13 não os tocam).
- [ ] **T4 — Correção posterior de valores de Fase (fora da Fase de origem)** (AC: 4)
  - [ ] Fora da Fase corrente: **leitura** no fluxo normal (autorizados). **Correção** exige ação explícita autorizada (operar o Card — `exigirOperarCard`, 2.10) e gera **evento antes/depois** no `CardHistory` (novo tipo, ex.: `PHASE_VALUES_CORRECTED`) na **mesma transação** (AD-13). Append-only preservado.
- [ ] **T5 — "Salvar não movimenta sozinho"** (AC: 4)
  - [ ] Salvar valores de Formulário de Fase (informativo/rascunho) é operação **distinta** de mover: nunca dispara transição. Rota/serviço separados da movimentação.
- [ ] **T6 — Testes (PostgreSQL real; fase vermelha quando houver GRANT novo)** (AC: 1, 2, 3, 4)
  - [ ] Unit puro: o novo `ValidadorDeTransicao` (requisito de entrada/saída satisfeito/não) compondo com `VALIDADORES_PADRAO` (curto-circuito preservado).
  - [ ] RLS (se `CardPhaseValues` nascer): fase vermelha do GRANT, isolamento cross-tenant, WITH CHECK, sem DELETE.
  - [ ] HTTP: campo obrigatório não preenchido → bloqueio (Card permanece, sem `MOVED`, valores preservados — AC1); requisito de entrada → valores persistidos na MESMA tx, falha → sem movimentação parcial (AC2); requisito de saída valida antes (AC3); correção posterior gera evento antes/depois (AC4); salvar não move (AC4). Org C + `randomUUID` ([[test-iso-01-causa-raiz]]).

## Dev Notes

### O que esta Story fecha (e o que ela CONSOME da 2.14)
A 2.15 **não recria a movimentação**: ela se **acopla ao contrato de preflight** que a 2.14 produziu
(`cards/movement/transition-preflight.ts`). A 2.14 deixou o ponto de extensão pronto: `ValidadorDeTransicao` é uma
função pura, e `executarPreflight(ctx, [...VALIDADORES_PADRAO, validadorDeFormularioDeFase])` compõe sem reescrever o
serviço. O I/O (definição do Formulário de Fase + valores submetidos/persistidos) é resolvido **no serviço**, antes do
preflight, e injetado **materializado** no `ContextoDeTransicao` — o núcleo segue puro. **Estender
`ContextoDeTransicao` aditivamente** (campos opcionais) para não quebrar os cinco built-in nem seus testes.

### Requisito de ENTRADA é o ponto delicado (transação única — AC2)
O requisito de entrada **muda o fluxo transacional** da 2.14. Hoje o `card-movement.service` faz o preflight **fora**
da transação e, sem bloqueio, roda a tx interativa (UPDATE `phaseId` + `registrarEntradaNaFase(MOVE)` + `MOVED`). Para
a entrada, os **valores da Fase destino** precisam ser validados (preflight) **e persistidos na MESMA transação** —
falha na persistência tem de **abortar a movimentação inteira** (rollback integral; sem `phaseId` novo, sem entrada,
sem `MOVED`). Portanto a 2.15 **estende a transação da 2.14** com um 4º passo (persistir valores), preservando a
atomicidade AD-13 e o "sem movimentação parcial". Reusar `definirContextoOrg` (client raiz) — o `withTenantContext`
recusa `$transaction`.

### Persistência dos valores de Fase — GATE DE ARQUITETURA (resolver no clarify/plan)
O epics marca explicitamente: **"persistência transacional dos valores de Fase = Arquitetura"**. Decidir:
- **Onde** vivem os valores por-(Card, Fase): provável **nova tabela org-scoped `CardPhaseValues`** (RLS+FORCE+WITH
  CHECK; JSONB `valores` por `Field.id`, opção por `id` — AD-11/AD-12; sem normalização por Campo; sem DELETE). Chave
  candidata: `(orgId, cardId, phaseId)` ou vínculo à `CardPhaseEntry` da entrada. `Card.valores` (2.7) é **só** do
  Formulário **inicial** — não misturar (INV-FORM-01).
- **Se** o Formulário de Fase congela uma **`FormVersion`** no ato (como a 2.7/2.8 fazem com o inicial — AD-12): a
  definição usada na validação/persistência fica **congelada**, independente de edições futuras do rascunho.
- **GRANT** da nova tabela (se houver): fronteira column/tabela como as demais; teste que prova o escopo (fase
  vermelha). Provável `SELECT`/`INSERT` (+`UPDATE` só se a correção posterior for UPDATE — mas o padrão da casa
  favorece append + evento; decidir).

### Autorização
- **Configurar** o Formulário de Fase e seu modo = **"config do Pipe"** → `exigirGerenciarPipe` (Admin da Org/Admin
  do Pipe; Membro→403; sem acesso→404). Reusa `pipe-authz` (DBT-AUTHZ-01), resolvendo poder por `phase.pipeId`.
- **Preencher/mover** com valores de entrada = **operar/mover o Card** → o mesmo gate da 2.14 (`exigirMoverCard` =
  operar o Card). **Corrigir** valores fora da Fase corrente = **operar o Card** (`exigirOperarCard`, 2.10).
- Guard/`ability.ts` **congelados** (C3) — guarda fina no serviço.

### Invariantes a preservar
`Fase ≠ Status do Card` (o Formulário de Fase é da Fase, não muda o ciclo de vida); **INV-FORM-01** (os três
Formulários — inicial, de Fase, de Database — são **independentes**: não reusar `Card.valores` para valores de Fase);
`Card ≠ Registro`; isolamento por Organização pelo banco (RLS+FORCE+WITH CHECK); append-only de `CardHistory`
(evento antes/depois da correção); AD-12 (definição congelada por versão); AD-13 (mutação + evento/persistência na
mesma transação, atômico); deny-by-default; nenhuma rota aceita `orgId` do cliente.

### Reuso obrigatório (não reinventar)
- **Form/Field/FormVersion**: montagem (2.4), evolução de Campos (2.5), publicação/snapshot (2.6) — o Formulário de
  Fase é o **mesmo** domínio com `context = 'PHASE'`, resolvendo poder por `phase.pipeId`. Localizadores em
  `forms/form-locate.ts`.
- **Validação de valores**: `cards/submission.ts` (2.7) — allowlist anti-mass-assignment por `Field.id`, tipo por
  Campo, Seleção por `id`. A obrigatoriedade **não existe** em `Field` na Fase 1 (2.4-2.7 registram isso): a 2.15
  **introduz** o conceito de "campo obrigatório" **para o Formulário de Fase** (requisito) — decidir no `clarify` se
  é uma propriedade do Campo no contexto PHASE ou do modo da Fase. **Não inventar** obrigatoriedade retroativa no
  Formulário inicial.
- **Movimentação**: `cards/movement/*` (2.14) — o serviço, o preflight e o helper `registrarEntradaNaFase`.

### Arquivos a tocar (provável — confirmar no plan)
- **UPDATE** `apps/api/src/pipes/cards/movement/transition-preflight.ts` — estender `ContextoDeTransicao`
  (aditivo) + novo `ValidadorDeTransicao` de Formulário de Fase (ou arquivo separado que compõe).
- **UPDATE** `apps/api/src/pipes/cards/movement/card-movement.service.ts` — resolver o Formulário de Fase (I/O),
  injetar no contexto, e **estender a transação** para persistir os valores de entrada (AC2).
- **NEW** domínio de valores de Fase (`cards/phase-values/` ou similar) + **[GATE-ARCH]** migration (tabela
  `CardPhaseValues` + RLS/policies/GRANT) se a decisão for tabela nova.
- **UPDATE** `Phase`/`Form` para o **modo** do Formulário de Fase **[GATE-ARCH]**.
- **UPDATE** `apps/api/src/pipes/pipes.module.ts`; `tenant-context.ts` (`MODELOS_AUDITADOS` se tabela nova).
- **NEW** testes: validador puro, RLS (se GRANT novo), HTTP (AC1-AC4).

### Questões para o `clarify` (decisões de dono/arquitetura — NÃO inventar)
1. **Persistência dos valores de Fase** (Gate de Arquitetura): tabela nova `CardPhaseValues` vs estrutura aninhada;
   vínculo por `(cardId, phaseId)` vs por `CardPhaseEntry`; GRANT/append-only vs UPDATE na correção.
2. **`FormVersion` para o Formulário de Fase?** Congela versão no ato (AD-12) como o inicial, ou usa o rascunho
   publicado corrente?
3. **Representação do modo** (informativo/entrada/saída): coluna em `Phase`, no `Form`, ou combinação; um Formulário
   pode ser entrada **e** saída?
4. **Obrigatoriedade de Campo**: propriedade do `Field` no contexto PHASE, ou derivada do modo? (A Fase 1 não tinha
   obrigatoriedade — a 2.15 a introduz **só** para o Formulário de Fase.)
5. **Correção posterior**: novo INSERT append-only + evento vs UPDATE + evento antes/depois; qual autorização exata.
6. **Requisito de saída**: valida contra os valores **já persistidos** da Fase atual (não do request) — confirmar a
   fonte da verdade na saída.

### Project Structure Notes
- Domínio provável em `apps/api/src/pipes/cards/phase-values/` (valores por Fase) + extensão de `cards/movement/`.
  Núcleo de validação reusa `submission.ts`; núcleo de preflight reusa `transition-preflight.ts`.
- Toda query por `withTenantContext`; nenhuma rota aceita `orgId`; guarda fina no serviço (C3 congelado).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.15] (§986-997; §992 escopo; §997 AC/requisitos entrada/saída)
- [Source: _bmad-output/planning-artifacts/epics.md#Contratos] (§762 — preflight de movimentação 2.14 → 2.15)
- [Source: _bmad-output/implementation-artifacts/2-14-movimentacao-e-regras-de-transicao.md] (contrato de preflight, `ValidadorDeTransicao`, extensão por composição, transação da movimentação)
- [Source: CLAUDE.md] (INV-FORM-01 três Formulários independentes; AD-11 JSONB por Field.id sem normalização; AD-12 definição congelada; AD-13 mutação+evento na mesma tx; Card.valores é só do inicial; RLS+FORCE+WITH CHECK; GRANT como fronteira; sem DELETE)
- [Source: apps/api/src/pipes/cards/movement/transition-preflight.ts] (ponto de extensão: `ContextoDeTransicao`, `ValidadorDeTransicao`, `executarPreflight`, `VALIDADORES_PADRAO`)
- [Source: apps/api/src/pipes/cards/submission.ts] (validação de valores por `Field.id`, allowlist, tipo, Seleção por id)
- [Source: apps/api/src/pipes/forms/*] (Form/Field/FormVersion; `form-locate.ts`; publicação 2.6)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
