# Checklist — Story 5.3

## Isolamento (invariante-mãe)
- [ ] RLS ENABLE+FORCE nas duas tabelas; policies select/insert/update/delete por `current_org_id()`.
- [ ] WITH CHECK no INSERT **e** no UPDATE (impede inserir/mover linha cross-tenant).
- [ ] Toda query por `withTenantContext`/`definirContextoOrg`; nenhum `where orgId` manual.
- [ ] `orgId`/`organizationId` fora do payload/resposta; nunca do cliente.
- [ ] Ambas em `MODELOS_AUDITADOS`.
- [ ] Fase vermelha provada (quebrar WITH CHECK/GRANT → teste falha).

## GRANT como fronteira
- [ ] `Notification` = SÓ SELECT/INSERT (append-only; sem UPDATE/DELETE) — provado (permission denied).
- [ ] `NotificationRecipient` = SELECT/INSERT + UPDATE só (readAt/availabilityState/updatedAt); sem DELETE.
- [ ] `notificationId`/`recipient*`/`orgId`/`dedupeKey`/`deliveredAt` → sem UPDATE (permission denied).

## Idempotência
- [ ] `@@unique([orgId, sourceEventId, type])` (conteúdo) + `@@unique([orgId, dedupeKey])` (destinatário).
- [ ] Reprocesso do mesmo Evento → sem duplicidade; conteúdo congelado não sobrescrito.
- [ ] Múltiplos papéis → mesma pessoa (Membership) → sem duplicidade.
- [ ] P2002/P2028 → idempotente, nunca 500.

## Sanitização (fail-closed)
- [ ] `params` sem payload bruto/token/segredo/URL/PII desnecessária.
- [ ] `<script>`/HTML em valor → escapado (não ecoado cru) — provado.
- [ ] Chaves fora da allowlist (`__proto__`/`constructor`/formato) → descartadas.
- [ ] Valores não-escalares (objeto/array) → descartados; tetos aplicados.

## Estado derivado
- [ ] `readAt` persistido; `lido` derivado por `estaLida` (nunca booleano persistido).
- [ ] `marcarComoLida` idempotente (guarda otimista sobre `readAt=null`).

## Recorte / anti-especulação
- [ ] Sem rota HTTP de criação (produtor = sistema) nem de leitura (5.4).
- [ ] Sem catálogo de tipos/produtores concretos (5.6/5.7/E8); sem tempo-real (5.5).
- [ ] Consumidor concreto = teste E2E do serviço (não um tipo/produtor inventado).
- [ ] Guard/`ability.ts` (C3) intocado.

## Migration
- [ ] Aditiva (2 tabelas + enum novos); reversível (rollback drill).
- [ ] Slot `20260801120000` livre.
