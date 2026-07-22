# Decisão de Arquitetura — Envelope canônico e outbox de Evento (Story 4.3)

> **Status:** DERIVADA do precedente e da Architecture Spine (AD-11/AD-13/AD-18/AD-30) + D-4. **Não** cria
> formato novo do nada; **não** altera a Architecture Spine (artefato controlado) — instancia o que ela deixa
> em aberto ("mecanismo concreto de Outbox, idempotência e controle de concorrência por domínio" — Spine
> §"Seed / implementação"). Registrada para sobreviver à troca de sessão (PR não é onde decisão de arquitetura
> mora). Autoridade: gate epics §1347 delega "formato/entrega do envelope canônico e versionamento = Arquitetura".

## Contexto

A Story 4.3 entrega o **catálogo de Eventos (gatilhos)**, o **envelope canônico versionado** e a **emissão
opt-in pós-persistência**. O gate pede a decisão do formato/entrega do envelope e do versionamento de schema.

## Precedentes reusados (derivação, não invenção)

1. **`MovementEvent` (2.16)** — `movement-event.core.ts`: outbox append-only do evento canônico de
   movimentação, `eventId` uuidv5 determinístico, `payload` minimizado, contrato opt-in INERTE. A 4.3
   **generaliza** este contrato para o catálogo completo.
2. **`MembershipEvent` (8.4)** — mesmo envelope (eventId, orgId, actor, occurredAt, type+version, correlation,
   payload) append-only.
3. **D-4** (`epic-8-gate-decisions-d1-d4.md`) — baseline do envelope: `auditEventId·schemaVersion·orgId·
   categoria·operação·resultado·occurredAt·correlationId·ref-ator·ref-recurso·metadados sanitizados`.
4. **AD-13** — Outbox: "alteração principal + registro do evento confiável de forma atômica"; envelope carrega
   "id único, Organização, ator/origem, timestamp, tipo+versão, correlação" e é idempotente.
5. **AD-30** — minimização: "valores antes/depois só quando aprovados/necessários"; nunca PII/segredo.

## Decisões

### DEC-1 — Persistir outbox `DomainEvent` nesta Story (não só contrato)
AD-13 prescreve o outbox; CA2/CA3 testam emissão real. Consumidor concreto AGORA (CA2/CA3) + jusante (motor
4.6). Não é substrato especulativo (AD-11): a generalidade do envelope é mandatória, não "por precaução". Fia
CARD_CREATED nos dois sítios de criação de Card (2.7/2.8); os outros 15 tipos ficam DECLARADOS no catálogo
(contrato) e emitem com seus consumidores (AD-11).

### DEC-2 — Tabela nova, source-agnóstica `DomainEvent`
Não reusar/renomear `MovementEvent` (frozen, migração destrutiva). CARD_MOVED permanece em `MovementEvent`; o
catálogo o ancora, sem duplicar linha (Story §1339). Nome source-agnóstico: o evento é fato do domínio
PRODUTOR, consumível por E4 e E5. Débito **DEB-4-3-OUTBOX-UNIFICACAO** (4.6 reconcilia consumo).

### DEC-3 — Envelope e versionamento
`eventId = uuidv5(NS_DOMAIN_EVENT, "${eventType}:${orgId}:${resourceId}:${correlationId}")` (SHA-1 do
`node:crypto`, sem dependência nova). `schemaVersion` (coluna `version`, default 1) versiona o contrato,
carimbado pelo servidor. `@@unique([orgId, eventId])` → idempotência. `payload` minimizado por allowlist
(AD-30). FK composta tenant-safe `(orgId, pipeId) → Pipe(orgId, id)` (F-A1/DEB-TENANT-COMPOSITE-FK-RETROFIT).
Recurso principal por `resourceType`/`resourceId` (polimórfico, sem FK — isolado por RLS+orgId, validado
in-tx pelo produtor; mesma natureza do payload por ID).

### DEC-4 — Enforcement do catálogo no serviço, não no núcleo puro 4.1
`automation-config.ts` (4.1) fica estrutural (seus testes usam `tipo:'X'`); `exigirEventoNoCatalogo` (puro,
novo) é chamado no `validar()` dos serviços de Automação (create 4.1 + lifecycle 4.2). Consequência: testes de
serviço 4.1/4.2 migram o placeholder de `quando.tipo` para `CARD_CREATED`.

## Consequências / débitos

- **DEB-4-3-OUTBOX-UNIFICACAO**: dois outboxes (`MovementEvent` + `DomainEvent`) até 4.6 reconciliar o consumo.
- **DEB-4-3-EMISSAO-INCREMENTAL**: 15 dos 16 tipos do catálogo ainda sem produtor fiado — emitem com seus
  consumidores (4.6+), por AD-11. O helper `emitirEventoDeDominio` já existe (contrato pronto).
