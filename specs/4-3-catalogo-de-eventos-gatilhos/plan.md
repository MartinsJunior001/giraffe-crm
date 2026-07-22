# Plan — Story 4.3: Catálogo de Eventos (gatilhos)

## Gate de Arquitetura (RESOLVIDO por DERIVAÇÃO — não invenção)

O gate declarado (epics §1347): "**formato/entrega do envelope canônico e versionamento de schema =
Arquitetura**". Decisão **derivada do precedente + Architecture Spine**, sem escolha nova → sem
`EXTERNAL_BLOCKER`. Decisão registrada em
`_bmad-output/implementation-artifacts/decisions/domain-event-envelope-4-3.md`.

### D1 — Persistir o Evento (outbox `DomainEvent`) ou só contrato?

**Decisão: PERSISTIR** um outbox canônico `DomainEvent`, e fiar a emissão CARD_CREATED nos dois sítios de
criação de Card. Justificativa:
- **AD-13** manda "registro do evento confiável de forma atômica — ex.: **Outbox**"; **AD-18** faz o motor ser
  "disparado por **eventos de integração pós-transação**". O outbox é o mecanismo prescrito pela Spine.
- Os critérios de aceite **CA2/CA3** testam SEMÂNTICA DE EMISSÃO real (aprovado emite, pendente não, retry não
  duplica). Sem persistência + fiação de um produtor, CA2/CA3 são improváveis — "emissão opt-in
  pós-persistência" viraria promessa não testada.
- É a **generalização** do precedente `MovementEvent` (2.16), que o próprio 4.3 diz generalizar.
- **Não é substrato especulativo** (AD-11): tem consumidor concreto AGORA (CA2/CA3) e a jusante (motor 4.6);
  a generalidade do envelope é MANDATÓRIA (AD-13/D-4), não "por precaução".

**Contra-argumento considerado e rejeitado:** entregar só catálogo+envelope+contrato (sem tabela/fiação) —
rejeitado porque falha CA2/CA3 e deixa o teste adversarial (b) sem lastro real.

### D2 — Nova tabela `DomainEvent` vs. reusar `MovementEvent`

**Decisão: nova tabela source-agnóstica `DomainEvent`** (não reusar/renomear `MovementEvent`, que é frozen 2.16
e destrutivo migrar). `MovementEvent` permanece como o outbox especializado de CARD_MOVED; o catálogo o
**ancora** (sem duplicar linhas — Story §1339 "sem duplicidade técnica indevida"). CARD_MOVED **não** é
re-emitido em `DomainEvent`. Débito `DEB-4-3-OUTBOX-UNIFICACAO`: o motor (4.6) decide se lê os dois outboxes
ou unifica. Nome source-agnóstico (não `AutomationEvent`) porque o evento é fato do domínio PRODUTOR (Card/
Registro), consumível por Automação (E4) E Notificação (E5) — AD-13 distingue "evento de domínio/integração",
não "de automação".

### D3 — Envelope: campos e versionamento

Derivado de `movement-event.core.ts` (2.16) + D-4 + AD-13. `schemaVersion` (coluna `version`, default 1)
versiona o CONTRATO do envelope — carimbado pelo servidor, nunca do cliente (como `Automation.configSchemaVersion`).
`eventId = uuidv5(NS_DOMAIN_EVENT, ${eventType}:${orgId}:${resourceId}:${correlationId})` — determinístico →
idempotência (`@@unique([orgId, eventId])`). uuidv5 via SHA-1 do `node:crypto` (sem dependência nova — mesmo
`uuidV5` de 2.16, extraído/reusado). `payload` minimizado (allowlist AD-30): só IDs/metadados; NUNCA `valores`.

### D4 — Enforcement do catálogo

No SERVIÇO de Automação (`automations.service.ts` create + `automation-lifecycle.service.ts` edit/duplicate/
activate `validar()`), NÃO no núcleo puro `automation-config.ts` (que 4.1 deixou deliberadamente estrutural —
seus testes usam `tipo:'X'`). Função pura nova `exigirEventoNoCatalogo(tipo)` (fail-closed) chamada após
`validarConfiguracao`. Consequência: testes de serviço 4.1/4.2 que usam `quando.tipo` placeholder (`'T'`/`'A'`/
`'CARD_CRIADO'`) passam a usar `CARD_CREATED` (canônico). Núcleo puro 4.1 (`automations.core.test.ts`) intocado.

## Estrutura de arquivos

```
apps/api/src/domain-events/            (NOVO — domain-neutral, sem ciclo; espelha o padrão agnóstico de files/)
  event-catalog.ts                     (puro: catálogo + exigirEventoNoCatalogo)
  event-envelope.ts                    (puro: uuidV5 + montarEnvelope + schemaVersion + minimização)
  domain-event-emission.ts             (helper same-tx: emitirEventoDeDominio(tx, contexto, dados))
apps/api/prisma/schema.prisma          (+ model DomainEvent)
apps/api/prisma/migrations/20260727120000_domain_events/migration.sql
apps/api/src/kernel/db/tenant-context.ts (+ 'DomainEvent' em MODELOS_AUDITADOS)
apps/api/src/pipes/cards/card-submission.service.ts   (fiação CARD_CREATED)
apps/api/src/pipes/public-submissions/converter-submissao.ts (fiação CARD_CREATED)
apps/api/src/pipes/automations/automations.service.ts        (enforcement catálogo)
apps/api/src/pipes/automations/automation-lifecycle.service.ts (enforcement catálogo)
```

## Riscos e mitigações

- **Blast radius em 2.7/2.8/4.1/4.2 (frozen):** mudança ADITIVA (uma linha de emissão na tx existente; uma
  chamada de enforcement). Regressão coberta pelas suítes existentes desses domínios + testes novos.
- **Idempotência sob concorrência:** `eventId` determinístico + unique; P2002/P2028 → tx rollback → sem
  duplicata (mesma defesa de 2.7/2.16). Nunca 500.
- **PII no envelope:** `payload` por allowlist; `valores` nunca entram (teste adversarial (d)).

## Gates aplicáveis (risco ALTO)

pre-implementation-check → safe-implementation → context7-check (Prisma 6.19.3 / NestJS 11) →
security-check → observability-check → migration-check (há migration; drill + rollback). Testes de integração
REAL PostgreSQL (RLS, append-only, cross-tenant, FK composta, emissão same-tx). CI verde no SHA.
