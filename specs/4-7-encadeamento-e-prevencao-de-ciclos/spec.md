# Spec — Story 4.7: Encadeamento e prevenção robusta de execução cíclica

**Épico:** 4 (Automação) · **Risco:** ALTO (prevenir loops infinitos = proteção contra DoS/exaustão) ·
**Deps:** 4.6 (done) · **FR-21/23 · NFR-7 · AD-18/30.**

## Objetivo

Permitir que uma Ação gere um novo Evento que dispara outra Automação (**encadeamento legítimo**) SEM criar
loop direto (A→A) nem indireto (A→B→A) nem tempestade de execuções. A prevenção é **fail-closed**: um loop que
escapa é pior que um encadeamento legítimo barrado.

## Contrato

### Encadeamento legítimo (§1424)
1. Um executor que gera um novo fato **EMITE** um `DomainEvent` na MESMA tx (AD-13), propagando:
   `executionChainId` (herda a RAIZ da cadeia), `causationId` (o `eventId` do gatilho) e `chainDepth`
   (profundidade-do-pai + 1). Emissores da Fase 1: `RECORD_CREATE`/`RECORD_CREATE_RELATED` ⇒ `RECORD_CREATED`;
   `CARD_ASSIGN_RESPONSIBLE` (com mudança) ⇒ `CARD_RESPONSIBLE_CHANGED`.
2. O motor enfileira o Evento-filho: a Execução-filha herda `executionChainId` e incrementa `chainDepth`.

### Prevenção (NFR-7, AD-18) — consultada ANTES de enfileirar/processar a Execução-filha
3. **Profundidade máxima** (`MAX_CHAIN_DEPTH=10`): `chainDepth > MAX` ⇒ barra (`DEPTH_EXCEEDED`), não executa.
4. **Assinatura de visita determinística** (`sha256(automationId:versão:eventType:resourceId)`): a MESMA
   assinatura na MESMA cadeia (índice único `AutomationChainVisit(orgId, executionChainId, signature)`) ⇒
   re-visita ⇒ barra (`CYCLE_DETECTED`). Detecta A→A (direto) e A→B→A (indireto). `eventId` distingue
   redelivery (não é ciclo) de re-visita (é ciclo). **Sem falso positivo**: mesma Automação em cadeias distintas
   OU alvos distintos NÃO colide.
5. **Dedup por `eventId`** (4.6) continua, mas **não substitui** a prevenção de ciclos entre novos Eventos.
6. **Timeouts** (por Ação `30 s`; por Execução `60 s`; **por cadeia `5 min`** — barreira dura no enfileiramento).
7. **Dead-letter**: a Execução barrada é persistida em `HALTED_BY_LIMIT` (terminal, não reivindicável) com
   `lastErrorCode` sanitizado. **Só a cadeia afetada** para; outras seguem. Sem loop silencioso (§1432).

## Critérios de aceite (integração real — PostgreSQL)

- **CA1** — Ação gera novo Evento ⇒ dispara outra Automação, propaga `executionChainId`, define `causationId`,
  incrementa a profundidade. `[teste (a)]`
- **CA2** — Assinatura já executada na cadeia reaparece ⇒ NÃO executa (bloqueia A→A e A→B→A), sem depender só
  da dedup por `eventId`. `[testes (b), (c)]`
- **CA3** — Cadeia atinge profundidade/timeout/dedup ⇒ SÓ a cadeia afetada é interrompida, com motivo
  registrado (sem loop silencioso); outras cadeias seguem. `[testes (d), (f), (i)]`
- **CA4 (fail-closed)** — assinatura/profundidade ambígua ⇒ barra (não executa). `[core + (f)]`
- **CA5 (sem falso positivo)** — mesma Automação em cadeias distintas OU alvos distintos NÃO é barrada. `[(e), (d)]`
- **CA6 (isolamento)** — a cadeia é por Org: um `executionChainId` nunca cruza tenant. `[rls (g)]`

## Fora do escopo (AD-11)

Trilha read-side / aba "Execuções" (4.8); contrato de extensão de Ações (4.9); driver contínuo multi-réplica
com leader election (`DEB-4-6-DRIVER-CONTINUO`, deferido); re-drive administrativo de dead-letter
(`DEB-4-7-REPROCESSAMENTO`).
