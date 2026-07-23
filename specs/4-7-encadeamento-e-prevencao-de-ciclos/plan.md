# Plan — Story 4.7

**Consolidação do gate de Arquitetura**: ver `_bmad-output/implementation-artifacts/decisions/automation-chaining-4-7.md`
(números: profundidade 10 · tentativas 5 (reuso 4.6) · timeout Ação 30 s / Execução 60 s / cadeia 5 min ·
retenção = sem DELETE (Governança/4.8) · dead-letter = `HALTED_BY_LIMIT` + `lastErrorCode` · reprocessamento
deferido `DEB-4-7-REPROCESSAMENTO`).

## Componentes

### Núcleo PURO (sem I/O)
- `pipes/automations/engine/chain-guard.core.ts` — constantes/limites, `derivarAssinaturaVisita` (sha256
  determinístico), predicados de duração, `avaliarBarreira` (profundidade › duração; fail-closed).
- `engine-types.ts` — `ExecutionState += HALTED_BY_LIMIT`; `ErrorCode += DEPTH_EXCEEDED/CYCLE_DETECTED/CHAIN_TIMEOUT/ACTION_TIMEOUT/EXECUTION_TIMEOUT`.

### Envelope de Evento (4.3 estendido, aditivo)
- `event-envelope.ts` / `domain-event-emission.ts` — `chainDepth` no `DadosEvento`/`EnvelopeEvento`/create.

### Executores (4.6 estendido) — emissão de Evento-filho na MESMA tx (AD-13)
- `action-executors.ts` — `ContextoCadeia` no `ExecContext`; `criarRegistro` ⇒ `RECORD_CREATED`;
  `atribuirResponsavel` (com mudança) ⇒ `CARD_RESPONSIBLE_CHANGED`; `ResultadoExecucao.emittedEventId`.

### Motor (4.6 estendido)
- `automation-engine.service.ts` — `enfileirarUmaExecucao` (dedup → barreira → visita → PENDING/HALTED);
  `inicioDaCadeia` (min visit createdAt); `registrarVisita` (read-then-insert, eventId disambigua redelivery×ciclo);
  `drenarOrg` vira LOOP de cadeia (enfileira Eventos gerados até esvaziar, teto `MAX_ITERACOES_DRAIN`).

### Migration aditiva `20260729120000_automation_chaining` (+ `.down.sql`)
- `AutomationChainVisit` (RLS FORCE + WITH CHECK; GRANT SELECT/INSERT; `@@unique(orgId, executionChainId, signature)`).
- `AutomationExecution.chainDepth` (INSERT-only) + `@@index(orgId, executionChainId)`.
- `DomainEvent.chainDepth` (INSERT-only).
- `AutomationExecutionState += HALTED_BY_LIMIT` (`ADD VALUE`).
- `tenant-context.ts` — `AutomationChainVisit` em `MODELOS_AUDITADOS`.

## Decisões-chave

- **Cadeia por Org**: o índice único inclui `orgId` ⇒ um `executionChainId` nunca cruza tenant (CA6).
- **Ciclo pelo BANCO**: a detecção é o `@@unique` (race-safe, fail-closed) — não uma leitura otimista frágil.
- **Redelivery × ciclo**: a visita guarda `eventId`; assinatura repetida com o MESMO `eventId` = redelivery
  (at-least-once, não é ciclo); com `eventId` distinto = re-visita (ciclo). Evita falso positivo em retry.
- **Depth × assinatura são complementares**: cadeia que EXPANDE (alvo novo/nível) escapa da assinatura ⇒
  freada por profundidade; cadeia que RE-VISITA o mesmo alvo ⇒ freada pela assinatura.
- **Tx-abort do Postgres**: NÃO se captura P2002 no meio de uma tx interativa para continuar (a tx aborta);
  por isso `registrarVisita` LÊ antes de inserir e a criação da Execução é passo separado.

## Gates

pre-implementation-check · context7-check (Prisma 6.19.3, NestJS 11) · security-check · observability-check ·
migration-check (drill do `.down.sql`) · performance-check. Testes: core (puro) + e2e (integração real) + rls.
