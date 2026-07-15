# Story 2.16: Evento canônico de movimentação e contrato opt-in

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a plataforma,
I want um **evento canônico** após cada movimentação de Card **persistida**,
so that Automações (E4) e Notificações (E5) possam reagir de forma **opt-in**, sem efeitos duplicados.

## Acceptance Criteria

1. **CA1 — Emissão pós-persistência.** Dada uma movimentação persistida (2.14), quando ela conclui, então um evento canônico é emitido **na mesma transação** da movimentação, contendo no mínimo: `eventId`, `organizationId`, `pipeId`, `cardId`, `sourcePhaseId`, `targetPhaseId`, ator/origem, origem da movimentação (`MOVE`), momento efetivo e chave de correlação da operação.
2. **CA2 — Sem evento sem fato.** Dada uma movimentação **bloqueada, cancelada ou aguardando confirmação** (preflight 2.14/2.15 negou, ou no-op idempotente D4), quando ocorre, então **nenhum** evento canônico é emitido.
3. **CA3 — Idempotência para o consumidor.** Dado um reprocessamento técnico que reenvia o mesmo evento, quando reenviado, então preserva `eventId`/chave de idempotência para que o **consumidor** (E4/E5) impeça efeitos duplicados. O E2 **não** controla idempotência de Automação/Notificação — apenas garante identidade estável e no máximo **um evento canônico lógico** por movimentação.
4. **CA4 — Contrato inerte.** O contrato **não executa Automação, não distribui Notificação, não faz integração externa**. É um ponto de extensão **opt-in** (qualquer movimentação / entrada em Fase / saída de Fase / par origem→destino); sem consumidor concreto ativo, emitir o evento não produz efeito colateral.

## Tasks / Subtasks

> As decisões de **mecanismo (formato/entrega)** do evento canônico são **gate de Arquitetura** (epics §1009). Rodar Spec Kit `specify → clarify` para fechar D0–Dn com o dono ANTES de implementar (padrão da 2.15). Tarefas abaixo são o esqueleto sujeito ao clarify.

- [ ] T0 Gates: `context7-check` (Prisma transação interativa / Outbox) + `pre-implementation-check`.
- [ ] Task 1 — Modelo do evento canônico (AC: 1, 3)
  - [ ] Definir a persistência confiável do evento (decisão do dono no clarify: tabela **Outbox** `MovementEvent`/`OutboxEvent` org-scoped vs. reutilizar `CardHistory`). Alinhar a **AD-13** (evento de integração ≠ evento de domínio) e **AD-15** (quatro trilhas separadas — o canônico **não** é o Histórico do Card).
  - [ ] `eventId` estável + chave de idempotência (`@@unique`); envelope com `type+version` (AD-13).
  - [ ] Se tabela nova: RLS ENABLE+FORCE + WITH CHECK; GRANT mínimo (append-only — SELECT/INSERT), como `CardHistory`/`FormVersion`.
- [ ] Task 2 — Emissão na transação da movimentação (AC: 1, 2)
  - [ ] Estender a tx interativa de `card-movement.service` (após UPDATE `phaseId` + reentrada + `MOVED`) com o INSERT do evento canônico — **mesma transação** (AD-13), rollback integral em falha.
  - [ ] Garantir **CA2**: bloqueio/no-op/aguardando confirmação NÃO emitem (a emissão vive só no caminho que persistiu o UPDATE).
  - [ ] Preservar column-scoped/append-only e o padrão `definirContextoOrg` (client raiz).
- [ ] Task 3 — Ponto de extensão opt-in (AC: 4)
  - [ ] Contrato/tipo do envelope canônico exposto para consumo (E4/E5), **sem** motor/distribuição (fora de escopo). Sem abstração especulativa (Constitution II): só o produtor concreto (movimentação) + o contrato.
- [ ] Task 4 — Testes (PostgreSQL real)
  - [ ] RLS/GRANT do sítio de evento (fase vermelha; cross-tenant; append-only).
  - [ ] HTTP: movimentação feliz emite 1 evento com o envelope completo; bloqueio/no-op não emite (CA2); reprocessamento preserva `eventId` (CA3); concorrência sem 500 e sem evento duplicado.
- [ ] Task 5 — Polish: typecheck/lint/format; `test:ci` serial; gates de conclusão (security/observability/migration).

## Dev Notes

- **Rastreabilidade:** FR-11; D2.5; AD-13/18/19. **Contrato consumido por** E4 (Automação) e E5 (Notificação). **Depende de** 2.14 (movimentação persistida). **Gate de Arquitetura:** mecanismo do evento canônico (formato/entrega). **Fora de escopo:** seleção/execução de efeitos (E4/E5), motor/prevenção de ciclos (AD-18), distribuição (E5/OQ-33).
- **AD-13 (Publish transacional):** publicar efeitos só **após** a transação — a alteração principal + o registro do evento confiável são confirmados **atomicamente** (ex.: **Outbox**), processando o assíncrono depois. Eventos carregam `id` único, Organização, ator/origem, timestamp, `type+version`, correlação e são **idempotentes**.
- **AD-15 (Quatro trilhas separadas):** Histórico do Card, Log operacional, Auditoria administrativa, Log técnico têm armazenamento/acesso/retenção próprios. O evento canônico de **movimentação** é contrato de **integração** (E4/E5), distinto do Histórico do Card (`CardHistory`, read-side na 2.17). Não conflar.
- **AD-19 (Entrega assíncrona):** a fila pode reentregar; **consumidores** são idempotentes com chave de deduplicação. Esta Story entrega o **produtor** confiável e a identidade estável; a semântica de consumo é de E4/E5.
- **Estado atual do código a preservar:** `card-movement.service.ts` já faz, na tx interativa no client raiz (`definirContextoOrg`): UPDATE `phaseId` (guarda otimista) + `registrarEntradaNaFase(origin=MOVE)` + INSERT `CardHistory` (`MOVED`) + (2.15) INSERT `CardPhaseValues` quando há requisito de entrada. O evento canônico entra como **passo adicional na MESMA tx**, sem quebrar a atomicidade, a guarda otimista (`updateMany where phaseId=<lido>`) nem o tratamento P2002/P2028→409. `Card` segue com GRANT de UPDATE **column-scoped** (só `phaseId` na 2.14) — o evento é INSERT em outro sítio, não toca `Card`.
- **Idempotência (CA3):** um `eventId` estável por movimentação lógica; reprocessamento reenvia o mesmo `eventId`. Decidir no clarify a **fonte** do `eventId`/chave (ex.: derivada da operação/correlação) e o índice único que impede duplicata lógica.
- **Sem antecipação (Constitution II):** não construir bus/registry/distribuição sem consumidor concreto. O consumidor concreto agora é a **própria emissão** + o contrato; E4/E5 consomem depois.

### Project Structure Notes

- Domínio: `apps/api/src/pipes/cards/movement/` (produtor) + provável novo sítio de persistência do evento (a definir no clarify: subpasta `events/` do domínio de Card, ou tabela Outbox no kernel se a Arquitetura decidir que é transversal — respeitando "regra de negócio nunca no kernel", AD-4/5).
- Migration (se tabela nova) segue o padrão multi-tenant: `ENABLE`+`FORCE ROW LEVEL SECURITY`, policies por `current_org_id()`, WITH CHECK no INSERT, GRANT mínimo append-only, `MODELOS_AUDITADOS += <nova tabela>`.
- Testes em `apps/api/test/` (`*-rls.test.ts` + `*-http.test.ts`), PostgreSQL real, Org C + `randomUUID`, `test:ci` serial.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.16 (L1002-1015)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-giraffe-crm-2026-07-11/ARCHITECTURE-SPINE.md#AD-13 (publish transacional/Outbox), #AD-15 (quatro trilhas), #AD-18/AD-19 (Automação/entrega assíncrona)]
- [Source: apps/api/src/pipes/cards/movement/card-movement.service.ts (tx interativa da movimentação — ponto de extensão)]
- Contrato de escrita append-only do Histórico estabelecido na 2.7; reusado por 2.10–2.16.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

### File List
