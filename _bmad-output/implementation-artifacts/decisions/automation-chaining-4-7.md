# Decisão de Arquitetura — Encadeamento e prevenção de ciclos (Story 4.7)

> Gate de Arquitetura da Story 4.7 (epics.md §1435): **profundidade máxima; tentativas máximas; timeout por
> Ação; timeout por Execução; timeout/duração máxima da cadeia; retenção das Execuções; política de
> dead-letter/reprocessamento autorizado**, "sem inventar números agora". Este documento CONSOLIDA os números,
> DERIVANDO do precedente 4.6 (já no `main`) e de defaults conservadores de Fase 1 — é a fonte durável da
> decisão (CLAUDE.md — "decisão material fica registrada no PR **e** na documentação durável").

## 0. Veredito do gate: NÃO é `EXTERNAL_BLOCKER`

Todos os limites são DERIVÁVEIS do precedente 4.6 ou de defaults operacionais seguros — nenhum é uma decisão
de Produto/SLA sem base. O único item com sabor de Governança é a **retenção das Execuções**, e ele resolve
por construção para a postura de LGPD já vigente ("sem exclusão física; expurgo é do dono"): a 4.7 **não**
apaga Execução nenhuma; a política de retenção/anonimização fina é da trilha (4.8) e da Governança, não desta
Story. Logo, **decidido um default seguro e documentado**, sem escalar.

## 1. Os NÚMEROS (consolidação do gate)

Vivem em `chain-guard.core.ts` (núcleo PURO, testável sem banco), explícitos e justificados — nada de mágica.

| Limite do gate | Constante | Valor | Derivação |
| --- | --- | --- | --- |
| **profundidade máxima** | `MAX_CHAIN_DEPTH` | **10** | Fase 1: uma Automação legítima raramente encadeia além de poucos níveis. 10 dá folga sem permitir estouro. Combinado com a **assinatura de visita** (re-visita do MESMO alvo é barrada antes de crescer) e a **dedup por Ação** (4.6), impede a tempestade. |
| **tentativas máximas** | `MAX_ATTEMPTS` (reusado de 4.6) | **5** | Reuso do `retry-policy.core.ts` — **sem número novo**. Backoff exponencial com teto de 5 min (4.6). |
| **timeout por Ação** | `MAX_ACTION_DURATION_MS` | **30 s** | Guarda LÓGICO: `excedeuDuracaoAcao` definido e coberto no núcleo. **Fio no laço de Ações DEFERIDO** (`DEB-4-7-ACTION-EXEC-TIMEOUT-HARD`) — ver linha abaixo; não afeta a terminação (NFR-7). |
| **timeout por Execução** | `MAX_EXECUTION_DURATION_MS` | **60 s** | Alinhado ao `LEASE_MS` da 4.6 (60 s). **A fronteira por-Execução VIGENTE em runtime é o `LEASE_MS` FÍSICO** (um `RUNNING` além do lease é reivindicado — recuperação de crash, 4.6) **+ `MAX_ATTEMPTS`**. O guarda LÓGICO `excedeuDuracaoExecucao` existe e é coberto no núcleo, mas **o fio dele no laço de Ações do motor está DEFERIDO** (`DEB-4-7-ACTION-EXEC-TIMEOUT-HARD`, abaixo). |
| **timeout lógico por Ação/Execução — fio no motor** | — (deferido) | `DEB-4-7-ACTION-EXEC-TIMEOUT-HARD` | Os guardas `excedeuDuracaoAcao`/`excedeuDuracaoExecucao` (30 s/60 s) estão definidos e testados no núcleo `chain-guard.core.ts`, mas **ainda não são consumidos** por `automation-engine.service.ts`/`action-executors.ts`: hoje a fronteira temporal por-Execução recai sobre o `LEASE_MS` FÍSICO (4.6) + `MAX_ATTEMPTS`. **Não abre ciclo nem tempestade** (NFR-7 é contido por profundidade + assinatura + duração-de-cadeia de 5 min + `MAX_ITERACOES_DRAIN`). O fio (mais o cancelamento DURO da Ação em andamento) fica como débito com consumidor futuro (AD-11); os docstrings das constantes foram corrigidos para não afirmar que já são consultados. |
| **default de profundidade no envelope — fail-closed** | — (deferido) | `DEB-4-7-ENVELOPE-DEPTH-FAIL-CLOSED` | `montarEnvelope` faz clamp de `chainDepth` malformado/≤0 para 0 (aparência de raiz). **Inalcançável** hoje (os dois executores sempre passam `exec.chainDepth + 1` ≥1 e nenhuma rota escreve no outbox; um 0 ainda seria pego pela assinatura). Endurecimento sugerido (malformado COM `executionChainId` ⇒ tratar como excedido) registrado como LOW; comentário corrigido. |
| **timeout / duração máxima da cadeia** | `MAX_CHAIN_DURATION_MS` | **5 min** | Mesma ordem de grandeza do `BACKOFF_CAP_MS` (4.6). Uma cadeia não pode ficar "viva" indefinidamente; além disto, filhos novos são barrados (`CHAIN_TIMEOUT`). Início da cadeia = `min(createdAt)` das visitas. |
| **retenção das Execuções** | — (banco) | **preservadas; sem DELETE de runtime** | LGPD "sem exclusão física": a Execução/visita são append-only; expurgo é do dono. Retenção/anonimização fina = Governança + 4.8 (trilha). |
| **dead-letter** | estado `HALTED_BY_LIMIT` + `lastErrorCode` | **terminal auditável** | Uma Execução barrada NÃO é reivindicável (a fila só pega `PENDING`/`RUNNING`-lease-vencida) e registra o motivo SANITIZADO. É o dead-letter: sem loop silencioso (§1432). |
| **reprocessamento autorizado** | — (deferido) | `DEB-4-7-REPROCESSAMENTO` | Um re-drive administrativo de um dead-letter exige superfície de operação (endpoint/UI + autoridade) que a 4.7 não possui — antecipá-la seria escopo da trilha/admin (4.8). Registrado como débito com consumidor futuro (AD-11). |

## 2. O modelo de encadeamento (propagação legítima — §1424)

```
  Evento externo (RAIZ, chainDepth=0, executionChainId=NULL)
        │  enfileira Execução (chainId := eventId da raiz; profundidade 0)
        ▼
  Execução roda uma Ação que GERA um novo fato
        │  o executor EMITE um DomainEvent na MESMA tx (AD-13):
        │     causationId := eventId do gatilho
        │     executionChainId := chainId (HERDA a cadeia)
        │     chainDepth := profundidade-do-pai + 1
        ▼
  drain enfileira o Evento-filho → Execução-filha (profundidade+1) → …
```

- **`executionChainId`**: a RAIZ é o próprio `eventId` do Evento externo (assim TODAS as Automações do mesmo
  Evento compartilham a MESMA cadeia); o filho HERDA. Fonte: `enfileirarParaEvento` +
  `ContextoCadeia` injetado no executor.
- **`causationId`**: o `eventId` do Evento gatilho da Execução que gerou o filho. Aponta a causa imediata.
- **profundidade**: carimbada em `DomainEvent.chainDepth` pelo emissor e herdada em
  `AutomationExecution.chainDepth` no enfileiramento. INSERT-only (imutável por GRANT — não migra de nível).
- **Emissores da Fase 1** (produtores concretos — AD-11): `RECORD_CREATE`/`RECORD_CREATE_RELATED` ⇒
  `RECORD_CREATED`; `CARD_ASSIGN_RESPONSIBLE` (quando HÁ mudança) ⇒ `CARD_RESPONSIBLE_CHANGED`. `correlationId`
  determinístico (`uuidv5(NS, "corr:<execId>:<idx>")` ou o id do Registro) ⇒ `eventId` retry-safe.

## 3. A prevenção (NFR-7 — o coração de segurança)

Consultada ANTES de enfileirar/processar a Execução-filha (`enfileirarUmaExecucao`), em precedência
**dedup › profundidade › duração da cadeia › assinatura de visita**:

1. **Dedup** (§1427): a Execução `(evento, Automação, versão)` já existe ⇒ redelivery at-least-once (não recria).
   NÃO substitui a prevenção de ciclos entre novos Eventos — só evita reprocessar o MESMO Evento.
2. **Profundidade** (`MAX_CHAIN_DEPTH`): barra a cadeia que EXPANDE (cria alvos SEMPRE novos ⇒ assinatura
   distinta a cada nível ⇒ a assinatura não a pega). É o freio da "tempestade de execuções".
3. **Duração da cadeia** (`MAX_CHAIN_DURATION_MS`): filho de cadeia velha ⇒ `CHAIN_TIMEOUT`. **Fail-closed**:
   filho SEM idade computável ⇒ barra (não se roda um loop cuja origem não se prova — §1428).
4. **Assinatura de visita** (§1425/§1431): `sig = sha256(automationId : versão : eventType : resourceId)`. O
   índice único parcial `AutomationChainVisit(orgId, executionChainId, signature)` faz a RE-VISITA da MESMA
   assinatura na MESMA cadeia COLIDIR — detecção de ciclo **direto A→A** e **indireto A→B→A** imposta pelo
   BANCO (race-safe: dois workers são arbitrados pelo `@@unique`; fail-closed: colisão ⇒ barra). O `eventId`
   na visita distingue **redelivery** do MESMO Evento (não é ciclo) de **re-visita** (Evento distinto — é ciclo).

**Sem falso positivo** (§1431): a MESMA Automação em CADEIAS distintas (índice inclui `executionChainId`) OU
em ALVOS distintos (assinatura inclui `resourceId`) NÃO colide. Cross-tenant: o índice inclui `orgId` ⇒ um
`executionChainId` **nunca cruza tenant** (uma cadeia de outra Org não barra a desta).

**Barrado ⇒ dead-letter**: a Execução é PERSISTIDA como `HALTED_BY_LIMIT` (estado TERMINAL, honesto —
"interrompida por limite", UX-DR6/§1432) com `lastErrorCode` ∈ `{DEPTH_EXCEEDED, CYCLE_DETECTED, CHAIN_TIMEOUT}`
(SANITIZADO — AD-30, nunca id/valor/PII/stack). NÃO é reivindicável ⇒ sem loop silencioso; a 4.8 lê o motivo.
**Só a cadeia afetada** para: outras Automações/cadeias independentes seguem (cada uma é sua própria Execução).

## 4. Tabela nova + alterações (migration aditiva `20260729120000_automation_chaining`)

- **`AutomationChainVisit`** (org-scoped): RLS ENABLE+FORCE, WITH CHECK no INSERT/UPDATE, GRANT **só
  SELECT/INSERT** (append-only — sem UPDATE/DELETE). `@@unique(orgId, executionChainId, signature)` (a
  prevenção de ciclo). `executionId` é referência por id (sem FK, isolada por RLS+orgId — como `eventId` em
  `AutomationExecution`). Em `MODELOS_AUDITADOS`.
- **`AutomationExecution.chainDepth`** (Int, INSERT-only, FORA do UPDATE column-scoped) + `@@index(orgId,
  executionChainId)`.
- **`DomainEvent.chainDepth`** (Int, INSERT-only — o outbox não tem GRANT de UPDATE).
- **`AutomationExecutionState += HALTED_BY_LIMIT`** (`ALTER TYPE ADD VALUE`, precedente `membership_*`).

**Reversível** (`.down.sql` + drill): DROP da tabela nova, do índice e das colunas `chainDepth`. O valor de
enum não é removível por `DROP VALUE` no PostgreSQL — deixá-lo é inócuo (nenhuma linha o usa ao reverter).

## 5. O loop de drenagem (consome parcialmente `DEB-4-6-DRIVER-CONTINUO`)

`drenarOrg` virou um LOOP de cadeia: reivindica (`FOR UPDATE SKIP LOCKED`) → processa → enfileira os Eventos
GERADOS → repete até esvaziar. O término é GARANTIDO pela prevenção (filhos barrados = `HALTED` não
reivindicáveis) + o teto de segurança `MAX_ITERACOES_DRAIN`. Multi-réplica segue seguro por `SKIP LOCKED`. O
**driver contínuo** (o que chama `drenarOrg` periodicamente, com leader election robusto) segue **deferido**
(`DEB-4-6-DRIVER-CONTINUO`, AD-11) — a 4.7 entrega o MECANISMO de prevenção que o motor consulta, não o driver.

## 6. Débitos registrados

- **`DEB-4-7-REPROCESSAMENTO`**: o re-drive administrativo de um dead-letter (`HALTED_BY_LIMIT`) — "reprocessamento
  autorizado" do gate — exige superfície de operação + autoridade que a 4.7 não possui (é da trilha/admin 4.8).
  O estado terminal + `lastErrorCode` é o dead-letter; a AÇÃO de reprocessar fica para o consumidor concreto.
- **`DEB-4-7-CHILD-EVENT-SWEEP`**: se uma Execução lançar erro INESPERADO após uma Ação anterior ter emitido um
  Evento-filho (committado em tx própria), o `eventId` do filho não é devolvido ao drain e o Evento fica no
  outbox sem ser enfileirado. É seguro (nada executa a mais) e raro; o driver contínuo (deferido) varreria o
  outbox por Eventos sem Execução. O caminho feliz (encadeamento bem-sucedido) devolve os filhos corretamente.
- **`DEB-4-7-ACTION-EXEC-TIMEOUT-HARD`**: os timeouts por Ação/Execução são GUARDAS lógicos + o lease físico da
  4.6; o cancelamento DURO de uma operação de banco em curso depende de `statement_timeout`/lease, não de um
  `Promise.race` (que não cancela a query). A duração da CADEIA é imposta duramente na barreira de enfileiramento.

## 7. Fontes

- epics.md §1419–1438 (Story 4.7), §1396–1417 (4.6).
- Precedentes de código: `automation-engine.service.ts`/`action-executors.ts`/`retry-policy.core.ts` (4.6),
  `event-envelope.ts`/`domain-event-emission.ts` (4.3), migrations `..._automation_engine`, `..._domain_events`,
  `..._membership_state_events` (ADD VALUE), `ScanSlot` (semáforo atômico, 3.7).
- Decisão 4.6: `_bmad-output/implementation-artifacts/decisions/automation-engine-4-6.md` (§7 delega
  encadeamento/ciclos/dead-letter à 4.7).
