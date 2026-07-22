# Spec — Story 4.3: Catálogo de Eventos (gatilhos)

> Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md` §"### Story 4.3 — Catálogo de Eventos (gatilhos)".
> FR-21 · RN-100 · D4.1 · AD-13/AD-30. Deps: 4.1, 2.16, 3.4, 3.9 (todas done). Risco: **ALTO**.

## 1. Objetivo

Entregar o **catálogo oficial fixo e completo da Fase 1** de tipos de Evento (gatilhos), o **envelope canônico
versionado** de todo Evento, e a **emissão opt-in pós-persistência** (o produtor de domínio emite o Evento
canônico DEPOIS de a mudança persistir, na MESMA transação — AD-13). Não implementa avaliação de Condições
(4.4), motor de disparo (4.6), Ações (4.5), encadeamento (4.7) nem trilha de Execuções (4.8).

## 2. Fronteira (o que ESTÁ e o que NÃO está)

**Entrega:**
- Catálogo pure (`event-catalog.ts`): 16 tipos NÚCLEO E4 selecionáveis + pontos de extensão E5/E6 declarados
  como CONTRATO (não selecionáveis até suas Stories). `EMAIL_RECEIVED` explicitamente indisponível.
- Envelope canônico pure (`event-envelope.ts`): generaliza `movement-event.core.ts` (2.16) — `eventId`
  determinístico (uuidv5), `schemaVersion`, contexto declarado por tipo, estado antes/depois minimizado.
- Emissão opt-in pós-persistência (`domain-event-emission.ts`): helper same-tx que grava a linha canônica
  `DomainEvent` (outbox), espelhando `registrarEntradaNaFase`.
- Enforcement do catálogo no serviço de Automação (4.1/4.2): `quando.tipo` fora do catálogo NÚCLEO → 400.
- Fiação da emissão CARD_CREATED nos DOIS sítios de criação de Card (submissão interna 2.7 + conversão
  pública 2.8), na mesma transação da criação.

**NÃO entrega (contrato/AD-11 — sem consumidor concreto agora):**
- Emissão dos outros 15 tipos do catálogo (declarados; emitem incrementalmente com seus consumidores 4.6+).
- Motor/fila/publisher/consumidor (4.6). Avaliação de Condições (4.4). Ações (4.5).
- Implementação dos Eventos de E5/E6 (só os pontos de extensão como contrato).
- CARD_MOVED **não é duplicado**: já materializado em `MovementEvent` (2.16); o catálogo o ancora à tabela
  existente (débito `DEB-4-3-OUTBOX-UNIFICACAO` — 4.6 reconcilia o consumo dos dois outboxes).

## 3. Catálogo — tipos NÚCLEO E4 (fixo/completo, selecionáveis)

| eventType | Ancoragem canônica (fato persistido real) | pipeId | Produtor |
|---|---|---|---|
| `CARD_CREATED` | Card criado (submissão interna aprovada / conversão pública aprovada; triagem pendente NÃO) | sim | 2.7 / 2.8 |
| `CARD_MOVED` | `MovementEvent` (2.16) — entrada/saída de Fase derivam do MESMO evento | sim | 2.14 (existente) |
| `CARD_HEALTH_CHANGED` | mudança efetiva de saúde (atrasado/vencido/expirado) | sim | E7 (futuro) |
| `CARD_FINALIZED` | `CardHistory` FINALIZED (2.11) | sim | 2.11 |
| `CARD_ARCHIVED` | `CardHistory` ARCHIVED (2.11) | sim | 2.11 |
| `CARD_REOPENED` | `CardHistory` REOPENED (2.11) | sim | 2.11 |
| `CARD_RESTORED` | `CardHistory` RESTORED (2.11) | sim | 2.11 |
| `CARD_RESPONSIBLE_CHANGED` | Responsável atribuído/alterado (2.10) | sim | 2.10 |
| `CARD_FIELD_VALUE_CHANGED` | valor de Campo do Card alterado | sim | E2 (futuro) |
| `CARD_RECORD_LINK_CREATED` | vínculo Card↔Registro criado (3.9) | sim | 3.9 |
| `CARD_RECORD_LINK_REMOVED` | vínculo Card↔Registro removido (3.9) | sim | 3.9 |
| `RECORD_CREATED` | Registro criado (3.4) | não | 3.4 |
| `RECORD_ARCHIVED` | Registro arquivado (3.4) | não | 3.4 |
| `RECORD_RESTORED` | Registro restaurado (3.4) | não | 3.4 |
| `RECORD_FIELD_VALUE_CHANGED` | valor de Campo do Registro alterado (3.4) | não | 3.4 |
| `PHASE_FORM_SUBMITTED` | Formulário de Fase submetido (2.15) | sim | 2.15 |

**Pontos de extensão (declarados, NÃO selecionáveis até E5/E6):** `TASK_CREATED`, `TASK_COMPLETED`,
`TASK_OVERDUE` (E5); `EMAIL_SENT` (E6). **Indisponível permanentemente na Fase 1:** `EMAIL_RECEIVED`.

## 4. Envelope canônico (mínimo, versionado)

Campos (baseline D-4 + AD-13 + Story §1339): `eventId` (uuidv5 determinístico), `eventType`, `schemaVersion`,
`organizationId`, `pipeId` (quando aplicável), `resourceType`/`resourceId` (recurso principal), `actorId`,
`origin`, `occurredAt`, `correlationId`, `causationId?`, `executionChainId?` (quando originado por Automação),
`payload` (estado antes/depois MINIMIZADO — só IDs/metadados; NUNCA `valores`/PII/segredo — AD-30).

## 5. Regras de emissão (Story §1339)

1. **Opt-in**: o produtor emite deliberadamente (não automático/implícito); a linha é INERTE (não dispara nada).
2. **Pós-persistência**: só emite após a mudança persistir com sucesso, na MESMA transação (rollback do fato
   reverte o Evento — AD-13).
3. **Tentativa rejeitada não emite**: triagem pendente não cria Card → não emite CARD_CREATED.
4. **Retry não duplica**: `eventId` determinístico + `@@unique([orgId, eventId])` (idempotência).
5. **Mudança sem efeito real não emite**: no-op não alcança o sítio de emissão.
6. **Sem vazamento**: nunca dados de outro Pipe/Organização; `payload` minimizado.

## 6. Isolamento multi-tenant (invariante-mãe)

`DomainEvent` org-scoped: RLS ENABLE+FORCE + `WITH CHECK` no INSERT e UPDATE; GRANT **append-only** (SELECT,
INSERT — sem UPDATE/DELETE); FK composta tenant-safe `(orgId, pipeId) → Pipe(orgId, id)`; `@@unique([orgId,
eventId])`; em `MODELOS_AUDITADOS`. Toda escrita por tx com contexto (`definirContextoOrg`). `orgId` nunca do
cliente.

## 7. Critérios de aceite (mapeados aos testes)

- **CA1** (catálogo): `quando.tipo` fora do catálogo NÚCLEO → 400; extensão E5/E6 não-confirmada → 400.
  → `event-catalog.core.test.ts`, `automations-http` (atualizado).
- **CA2** (Card criado): conversão pública aprovada emite CARD_CREATED; triagem pendente NÃO.
  → `domain-events-emission.test.ts`.
- **CA3** (sem duplicidade): retry/rejeitado/no-op não emitem novo Evento lógico; idempotência por eventId.
  → `domain-events-emission.test.ts`, `event-envelope.core.test.ts`.
- **CA4** (envelope): todo Evento carrega o envelope canônico mínimo, minimizado, sem outro Pipe/Org.
  → `event-envelope.core.test.ts`, `domain-events-rls.test.ts`.
