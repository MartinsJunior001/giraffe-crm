# Spec — Story 2.14 (Movimentação e regras de transição)

> Rastreabilidade: FR-11; D2.4; RN-046; AD-13. epics.md §971-984; Apêndice A da spec 2.9. Dep.: 2.2, 2.3, 2.9,
> 2.10, 2.11, 2.12, 2.13. **Fora:** evento canônico opt-in (2.16); Formulário de Fase como validador (2.15);
> execução de efeitos (E4/E5); reordenação intra-Fase (`position`).

## Objetivo
Permitir que um usuário autorizado **mova um Card para outra Fase ativa do mesmo Pipe**, fazendo o trabalho avançar
no processo. Materializa o **serviço central de movimentação** — o **1º UPDATE de `Card.phaseId`** em runtime — e o
**contrato de preflight de transição** com validadores registráveis, sobre o qual 2.15/E4/E5 se integram **sem
recriar** a movimentação. A movimentação é **atômica**: persistir a nova Fase, registrar a reentrada temporal e
escrever o evento de Histórico são uma só transação; havendo bloqueio, **nada** é movimentado.

## Decisões de design (a confirmar no `clarify`)
> A epics.md marca a 2.14 com **Gates: —** (sem gate explícito de dono). Estas decisões têm default justificado
> pela Constitution/epics; as duas primeiras serão confirmadas com o dono no `clarify` por definirem contrato que
> 2.15/E4/E5 herdam.
- **D1 — Forma do contrato de preflight (default: lista ordenada de validadores PUROS + ponto de extensão
  documentado; SEM DI/registry).** Justificativa: Constitution "sem abstração especulativa sem consumidor concreto"
  — os validadores built-in da 2.14 são os consumidores concretos; 2.15/E4/E5 acrescentam validadores à lista sem
  reescrever o serviço. Alternativa (registry por DI) só se um consumidor concreto exigir resolução dinâmica.
- **D2 — Confirmação humana (default: flag explícita `confirmado: true` no request, tratada como validador).**
  Justificativa: R2/D2.4 "sem contornar confirmação humana"; a ausência/`false` é bloqueio de preflight.
- **D3 — GRANT column-scoped de `phaseId` (NÃO blanket).** Não é escolha livre: o invariante da casa é `valores`/
  `orgId` **nunca** recebem GRANT de UPDATE (CLAUDE.md). Diverge da letra do Apêndice A da 2.9 (`GRANT UPDATE ON
  "Card"`), a favor do invariante. `updatedAt` já concedido pela 2.11.
- **D4 — Mover para a mesma Fase (origem == destino): no-op idempotente (200).** Coerente com a postura de
  idempotência do domínio; sem UPDATE, sem evento, sem nova entrada.
- **D5 — Reordenação intra-Fase (`position`): fora de escopo.** Ordem por `createdAt` (Q2 da 2.9); só entra com
  migration própria quando um consumidor concreto pedir.

## Escopo
- **Núcleo puro `cards/movement/transition-preflight.ts`:** o tipo `ValidadorDeTransicao` (função pura: recebe
  contexto da transição — Card, Fase origem, Fase destino, poder do principal, `confirmado` — devolve `ok` ou
  **bloqueio** tipado com motivo) e os validadores **built-in** da 2.14: (a) **ciclo aberto** (só `ATIVO` move); (b)
  **Fase destino ativa**, **do mesmo Pipe** e **≠ origem**; (c) **confirmação humana** presente; (d) **par
  origem→destino** livre entre Fases ativas do mesmo Pipe (RN-046). Componível e ordenado; sem I/O.
- **Migration `card_movement`:** acrescenta **`GRANT UPDATE ("phaseId") ON "Card" TO giraffe_app`** (additivo ao
  grant column-scoped da 2.11). Policy `card_update` já existe (2.7). Sem enum (`CardHistory.type` é String); sem
  DELETE.
- **Serviço `cards/movement/card-movement.service.ts` + rota:** `moverCard(cardId, { destinoPhaseId, confirmado,
  idempotencyKey? })`. Resolve acesso, lê Card + Fases sob `withTenantContext`, roda o preflight; havendo bloqueio →
  resposta de bloqueio sem persistir. Sem bloqueio → **transação interativa no client raiz** (`definirContextoOrg`):
  **(i)** UPDATE `Card.phaseId` com **guarda otimista** (`updateMany where id=… AND phaseId=<origem lida>`); **(ii)**
  `registrarEntradaNaFase(tx, contexto, { cardId, phaseId: destino, origin: 'MOVE' })` (helper da 2.12 — reentrada =
  novo INSERT de `CardPhaseEntry`); **(iii)** INSERT `CardHistory { type: 'MOVED' }` (append-only). Atômico, com
  auditoria manual (FR-214).
- **Autorização (reuso `pipe-authz`):** mover exige **operar o Card** (`exigirOperarCard`, 2.10) **e** a capacidade
  **`podeMover`** para concessões diretas (`CardGrant.podeMover` — o DADO existe desde a 2.10; a operação é esta
  Story). Admin da Org/Admin do Pipe/Membro no escopo efetivo movem; **Somente leitura/Observador** → 403; sem
  acesso → 404 não-enumerante; **`restritoAoProprio`** limita.
- **Recálculo de marcos/saúde por leitura:** cai **por construção** — a nova `CardPhaseEntry` (origin=MOVE) com seu
  `configSnapshot` vira a entrada atual; `calcularMarcos` (2.12)/`derivarSaude` (2.13) já leem a atual. Sem persistir,
  sem evento de saúde.

## Cenários de aceite (BDD — epics §981-984)
- **CA1:** autorizado + Fase destino ativa do mesmo Pipe + sem bloqueio → nova Fase persistida, marcos/saúde
  recalculados (leitura), evento `MOVED` no Histórico, nova `CardPhaseEntry` — tudo na mesma transação.
- **CA2:** um validador reporta bloqueio → **nada** é movimentado (sem UPDATE de `phaseId`, sem `CardHistory`, sem
  `CardPhaseEntry`).
- **CA3:** Somente leitura/Observador → 403; Fase arquivada/outro Pipe → bloqueio; Card de ciclo não-aberto
  (FINALIZADO/ARQUIVADO) → bloqueio. Só ciclo aberto move.
- **CA4:** o núcleo de movimentação existe **sem** o Formulário de Fase (2.15); E4/E5 registram validadores no mesmo
  contrato sem recriar a movimentação.

## Concorrência e idempotência
Guarda otimista no UPDATE (`count === 0` → reconsulta → idempotente se já na Fase destino, senão **409**); conflito
de unicidade/serialização reconhece **P2002 e P2028** → **409**, **nunca 500**. Sem movimentação parcial.

## Fora de escopo
Evento canônico opt-in e seu contrato (2.16); Formulário de Fase e sua integração como validador de
entrada/saída (2.15); execução de efeitos — Automação (E4) e Notificação (E5); reordenação intra-Fase (`position`);
movimentação em lote; desfazer/mover-de-volta como operação dedicada (é apenas outra movimentação).

## Invariantes preservados
`Fase ≠ Status do Card` (mover muda a Fase, não o ciclo de vida nem a saúde); `Card ≠ Registro`; nunca entre Pipes
(RN-030/RN-046); **`valores`/`orgId` seguem sem GRANT de UPDATE** (só `phaseId` se soma ao column-scoped da 2.11);
`CardHistory`/`CardPhaseEntry` **append-only** (SELECT+INSERT, sem DELETE); isolamento por Organização pelo banco
(RLS+FORCE+WITH CHECK — o `WITH CHECK` do UPDATE barra mover a linha para outra Org); **C3/guard/`ability.ts`
congelados** (guarda fina no serviço via `pipe-authz`, DBT-AUTHZ-01); deny-by-default; nenhuma rota aceita `orgId`
do cliente; AD-13 (mutação principal + evento na mesma transação, atômico).
