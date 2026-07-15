# Spec — Story 2.15 (Formulário de Fase e bloqueio de transição)

> Rastreabilidade: FR-16; D3.3; INV-FORM-01; AD-12/13. epics.md §986-997. **Consome:** contrato de preflight de
> movimentação (2.14); Form Builder/publicação (2.4/2.5/2.6); validação de valores da submissão (2.7). Dep.: 2.5,
> 2.6, 2.14. **Fora:** Formulário inicial (2.7); Formulário de Database (E3); evento canônico opt-in (2.16).

## Objetivo
Permitir que um usuário autorizado configure um **Formulário de Fase** que **exige dados para avançar**, garantindo a
qualidade do processo. O Formulário de Fase é **informativo/opcional**, **requisito de entrada** (valores da Fase
destino exigidos antes de mover) ou **requisito de saída** (valores da Fase atual validados antes de sair). Ele
**integra-se ao preflight da 2.14 como um `ValidadorDeTransicao`** — **não recria** a movimentação. Para o requisito
de entrada, os valores são validados e **persistidos na MESMA transação da movimentação**: falha ao persistir
**impede** a movimentação; **nenhuma movimentação parcial**.

## Decisão de design resolvida (dono, nesta sessão)
- **D0 — Persistência dos valores de Fase = NOVA tabela org-scoped `CardPhaseValues`.** RLS+FORCE+WITH CHECK; JSONB
  `valores` por `Field.id` (opção por `id` — AD-11/AD-12); referência à **`FormVersion` congelada** (AD-12);
  **append-only, sem DELETE** (padrão de `CardPhaseEntry`/`FormVersion`). `Card.valores` (2.7) é **só** do Formulário
  **inicial** — não misturar (INV-FORM-01). Fecha o Gate de Arquitetura que o epics defere (§994).

## Decisões de design (resolvidas no `clarify` — dono, 2026-07-15)
- **D1 — Modo no `Form` de contexto PHASE.** O modo (`INFORMATIVO`/`REQUISITO_ENTRADA`/`REQUISITO_SAIDA`) é
  propriedade do `Form` PHASE; um Formulário pode ser requisito de **entrada E de saída** de forma **independente**.
  Mantém a config no domínio Form (2.4).
- **D2 — Congela `FormVersion`.** A definição usada na validação/persistência fica **congelada por versão** (AD-12),
  como o Formulário inicial na 2.7/2.8 — independente de edições futuras do rascunho.
- **D3 — Obrigatoriedade como propriedade opt-in do `Field`, gated ao contexto PHASE.** A 2.15 introduz o flag
  "obrigatório" no `Field` **só** para o Formulário de Fase; **não** afeta o Formulário inicial (sem obrigatoriedade
  retroativa).
- **D4 — Chave de `CardPhaseValues` por `(orgId, cardId, phaseId)`**, com unicidade do conjunto ativo (default
  aplicado no `clarify`).
- **D5 — Correção posterior append-only + evento.** Nova linha em `CardPhaseValues` (sem DELETE/UPDATE destrutivo) +
  evento `PHASE_VALUES_CORRECTED` **antes/depois** no `CardHistory` — coerente com "sem DELETE" e AD-13.
- **D6 — Requisito de saída valida os valores JÁ PERSISTIDOS** da Fase atual (fonte da verdade), não do request
  (default aplicado no `clarify`).

## Clarifications
### Sessão 2026-07-15
- Q (Gate de Arquitetura): onde persistir os valores de Fase → **nova tabela `CardPhaseValues`** (D0).
- Q (D1): representação do modo → **no `Form` PHASE**, entrada+saída independentes.
- Q (D2): versionamento → **congela `FormVersion`** (AD-12).
- Q (D3): obrigatoriedade → **propriedade opt-in do `Field`**, gated ao PHASE.
- Q (D5): correção posterior → **append-only + evento `PHASE_VALUES_CORRECTED`** antes/depois.
- D4 (chave `(cardId,phaseId)`) e D6 (saída valida o persistido): defaults aplicados.

## Escopo
- **Configuração do Formulário de Fase (modo)**: "config do Pipe" (`exigirGerenciarPipe`; Admin da Org/Admin do Pipe;
  Membro→403; sem acesso→404), resolvendo poder por `phase.pipeId`. Reusa o domínio Form/Field (`context='PHASE'`) da
  2.4/2.5/2.6 — INV-FORM-01. Publicação reusa a 2.6 (D2).
- **`CardPhaseValues` (D0)** + migration: tabela org-scoped, RLS+FORCE+WITH CHECK (`select/insert` por
  `orgId=current_org_id()`, WITH CHECK no INSERT), GRANT **`SELECT`/`INSERT` apenas** (append-only — D5; sem UPDATE,
  sem DELETE — como `CardPhaseEntry`/`FormVersion`/`CardHistory`); o conjunto corrente por `(cardId, phaseId)` é o
  **mais recente** por `createdAt`. `MODELOS_AUDITADOS`.
- **Validador de Formulário de Fase acoplado ao preflight (2.14)**: um `ValidadorDeTransicao` que reporta bloqueio se
  um requisito de **saída** (Fase origem) ou **entrada** (Fase destino) não é satisfeito. O I/O (definição do
  Formulário de Fase + valores) é resolvido **antes**, no serviço, e injetado **materializado** no
  `ContextoDeTransicao` (estendido **aditivamente**) — o núcleo segue puro (padrão fixado na 2.14).
- **Persistência transacional na movimentação (entrada)**: o `card-movement.service` (2.14) ganha um passo na sua
  transação interativa: validar (via submissão 2.7) e **persistir** os valores da Fase destino em `CardPhaseValues`,
  na MESMA tx do UPDATE `phaseId` + `CardPhaseEntry(MOVE)` + `MOVED`. Falha → **rollback integral** (sem movimentação
  parcial).
- **Salvar ≠ mover**: salvar valores (informativo/rascunho) é rota/serviço distinto — nunca dispara transição.
- **Correção posterior (D5)**: fora da Fase corrente, leitura no fluxo normal (autorizados); correção exige **operar
  o Card** (`exigirOperarCard`, 2.10) e gera **evento antes/depois** no `CardHistory`, na mesma transação (AD-13).

## Cenários de aceite (BDD — epics §997)
- **CA1 (bloqueio):** Formulário de Fase com campo obrigatório não preenchido + tentativa de avançar → o validador
  reporta bloqueio ao preflight (2.14): transição bloqueada, Card permanece na Fase, requisitos exibidos, **nenhum**
  evento de movimentação, valores informados **preservados**.
- **CA2 (entrada, transação única):** requisito de entrada + movimentação confirmada → valores da Fase destino
  validados e **persistidos na mesma transação**; falha na persistência **impede** a movimentação; **sem** movimentação
  parcial.
- **CA3 (saída):** requisito de saída + Card sai da Fase → valores vinculados à Fase **atual** validados **antes**.
- **CA4:** salvar **não movimenta sozinho**; valores **persistem após a saída** (visíveis a autorizados; não
  descartados por mover/finalizar/arquivar/reabrir); correção posterior gera **evento antes/depois**.

## Concorrência e idempotência
Persistência de `CardPhaseValues` dentro da tx da movimentação herda a **guarda otimista** da 2.14 (por `phaseId`);
conflito de unicidade/serialização reconhece **P2002 e P2028** → **409**, **nunca 500**. Salvar/corrigir valores fora
da movimentação: idempotência por chave/estado conforme D4/D5.

## Fora de escopo
Formulário inicial (2.7) e sua obrigatoriedade; Formulário de Database (E3); evento canônico opt-in de movimentação
(2.16); execução de efeitos (E4/E5); reordenação intra-Fase (`position`); pré-visualização com submissão simulada.

## Invariantes preservados
**INV-FORM-01** (os três Formulários — inicial, de Fase, de Database — são **independentes**; `Card.valores` é só do
inicial); `Fase ≠ Status do Card` (o Formulário de Fase não muda o ciclo de vida/saúde); `Card ≠ Registro`; AD-12
(definição congelada por `FormVersion`); AD-13 (mutação + evento/persistência na mesma transação, atômico; sem
movimentação parcial); isolamento por Organização pelo banco (RLS+FORCE+WITH CHECK); **sem DELETE** (correção é
estado/evento, não exclusão); C3/guard/`ability.ts` congelados (guarda fina no serviço via `pipe-authz`);
deny-by-default; nenhuma rota aceita `orgId` do cliente; o núcleo de movimentação da 2.14 **não é reescrito** — a
2.15 se acopla como validador.
