# Especificação — Evento canônico de movimentação e contrato opt-in (Story 2.16)

## Contexto

FR-11. Toda movimentação de Card **persistida** (2.14) deve produzir um **evento canônico** com identidade estável, para que Automações (E4) e Notificações (E5) reajam de forma **opt-in**, sem efeitos duplicados. Esta Story entrega **apenas a persistência canônica confiável** — não executa Automação, não distribui Notificação, não faz integração externa.

Alinha a **AD-13** (evento de integração confirmado atomicamente com a mutação — padrão Outbox; processamento assíncrono, se houver, vem depois), **AD-15** (quatro trilhas separadas — o evento canônico é trilha de integração, **distinta** do Histórico do Card) e **AD-19** (a idempotência de consumo é de E4/E5).

## Requisitos funcionais

- **FR-2.16-1** — Emissão pós-persistência: movimentação persistida ⇒ 1 `MovementEvent` na MESMA transação, com `eventId`, `organizationId`, `pipeId`, `cardId`, `sourcePhaseId`, `targetPhaseId`, ator/origem, origem da movimentação, momento efetivo e chave de correlação.
- **FR-2.16-2** — Sem fato, sem evento: movimentação bloqueada/cancelada/aguardando-confirmação/no-op não emite.
- **FR-2.16-3** — Idempotência para o consumidor: `eventId` estável por operação; reprocessamento reproduz o mesmo `eventId`; no máximo 1 evento lógico por movimentação.
- **FR-2.16-4** — Contrato inerte: não executa Automação nem distribui Notificação; sem publisher/fila/consumidor sem consumidor concreto.

## Critérios de aceite

Ver CA1–CA4 na story md (`_bmad-output/implementation-artifacts/2-16-...md`).

## Decisões do dono (clarify, 2026-07-15)

- **D0** — Persistência: nova tabela Outbox org-scoped **`MovementEvent`** (RLS ENABLE+FORCE + WITH CHECK; GRANT só SELECT/INSERT, append-only imutável). Não reusar `CardHistory` (AD-15).
- **D1** — Idempotência: `eventId = uuidv5(orgId + cardId + correlationId)`, `@@unique([orgId, eventId])`; `correlationId` server-side por operação.
- **D2** — Extensão opt-in: só o produtor + o tipo do envelope canônico; sem dispatcher/registry/bus/motor (Constitution II).

## Fora de escopo

Seleção/execução de efeitos (E4/E5), motor/prevenção de ciclos (AD-18), distribuição/entrega (E5), publisher/fila/consumidor.

## Assunções

- `correlationId` gerado por operação de movimentação (server-side) é suficiente para identidade estável; o no-op/bloqueio (que não persiste) nunca emite, então há 1 evento por movimento persistido por construção.
- O envelope não carrega `valores` do Formulário (PII) — só identificadores e metadados da transição.
