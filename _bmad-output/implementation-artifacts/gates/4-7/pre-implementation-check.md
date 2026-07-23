# pre-implementation-check — Story 4.7

**Status:** APROVADO
**Risco:** ALTO (prevenir loops infinitos de Automação = proteção contra DoS/exaustão de recursos; migration; multi-tenant).

## Contexto verificado
- Dep done: 4.6 (motor `automation-engine.service.ts`/`action-executors.ts`/`retry-policy.core.ts`; ledger
  `AutomationExecution`/`AutomationActionResult`). Precedentes lidos: `event-envelope.ts`/`domain-event-emission.ts`
  (4.3), migrations `..._automation_engine`, `..._domain_events`, `..._membership_state_events` (ADD VALUE), `ScanSlot` (3.7).
- Decisão 4.6 (`decisions/automation-engine-4-6.md` §7) DELEGA explicitamente à 4.7: encadeamento + `executionChainId`
  propagado + prevenção de ciclos + dead-letter. Escopo confirmado com epics.md §1419–1438.

## Gate de Arquitetura (os NÚMEROS — §1435)
Consolidados por DERIVAÇÃO (precedente 4.6 + defaults conservadores), em `decisions/automation-chaining-4-7.md`:
profundidade 10 · tentativas 5 (reuso) · timeout Ação 30 s/Execução 60 s/cadeia 5 min · retenção = sem DELETE
(Governança/4.8) · dead-letter = `HALTED_BY_LIMIT`+`lastErrorCode` · reprocessamento deferido. **Nenhum exigiu
decisão de Produto/SLA sem base ⇒ NÃO é `EXTERNAL_BLOCKER`.**

## Verificação documental (context7-check)
- **Prisma 6.19.3**: `aggregate _min`, `$transaction([...])`, `create`/`findFirst`, `@@unique` parcial via SQL,
  `ALTER TYPE ADD VALUE` — todas APIs já EM USO nesta base (precedentes citados). Nenhuma assinatura nova inventada.
- **NestJS 11**: nenhum provider/módulo/controller novo (o motor 4.6 já é `@Injectable`). Edição aditiva.
- Baseline: `package.json` (prisma 6.19.3, nest 11). Consulta ao MCP Context7 registrada no `context7-check.md`.

## Decisões-chave (menor mudança correta)
- Detecção de ciclo pelo BANCO (`@@unique` de `AutomationChainVisit`) — race-safe/fail-closed, não leitura otimista.
- `chainDepth` como carimbo no Evento e na Execução (INSERT-only) — sem tabela de grafo de causação.
- Reuso de `MAX_ATTEMPTS`/`LEASE_MS`/`BACKOFF_CAP_MS` da 4.6 — sem números redundantes.
- `drenarOrg` vira loop de cadeia (consome PARCIALMENTE `DEB-4-6-DRIVER-CONTINUO`); driver contínuo segue deferido.

## Riscos e mitigação
- Tx-abort do Postgres em P2002 mid-tx ⇒ `registrarVisita` LÊ antes de inserir (não captura P2002 dentro da tx da Execução).
- Falso positivo em redelivery ⇒ a visita guarda `eventId` (mesmo Evento = redelivery, não ciclo).
- Cross-test (Evento pipeless enfileira Org-wide) ⇒ `afterEach` desativa as Automações do teste.
