# Tasks — Story 4.3 (ordem de dependência)

1. **T1** — `domain-events/event-catalog.ts` (puro): catálogo NÚCLEO (16) + extensões E5/E6 + `EMAIL_RECEIVED`
   indisponível + `exigirEventoNoCatalogo(tipo)` fail-closed + metadados de ancoragem/pipe por tipo.
2. **T2** — `domain-events/event-envelope.ts` (puro): `uuidV5`, `NS_DOMAIN_EVENT`, `SCHEMA_VERSION_ENVELOPE`,
   `montarEnvelope(dados)`, minimização de payload.
3. **T3** — schema.prisma: `model DomainEvent` (append-only, FK composta a Pipe, unique(orgId,eventId)).
4. **T4** — migration `20260727120000_domain_events`: CreateTable + índices + FKs + RLS ENABLE/FORCE + policies
   + GRANT SELECT,INSERT. Rollback documentado (DROP TABLE reversível).
5. **T5** — tenant-context.ts: `'DomainEvent'` em `MODELOS_AUDITADOS`.
6. **T6** — `domain-events/domain-event-emission.ts`: `emitirEventoDeDominio(tx, contexto, dados)` same-tx.
7. **T7** — fiação CARD_CREATED em `card-submission.service.ts` (2.7) e `converter-submissao.ts` (2.8).
8. **T8** — enforcement do catálogo em `automations.service.ts` + `automation-lifecycle.service.ts` (`validar`).
9. **T9** — atualizar testes 4.1/4.2 que usam `quando.tipo` placeholder → `CARD_CREATED`.
10. **T10** — testes novos: `event-catalog.core.test.ts` (e), `event-envelope.core.test.ts` (a,d,f),
    `domain-events-rls.test.ts` (c: append-only, cross-tenant, FK composta, GRANT, fase vermelha),
    `domain-events-emission.test.ts` (b,CA2,CA3: same-tx, rollback, pública pendente×aprovada, retry).
11. **T11** — gates (security/observability/migration) + lint/typecheck/test/build + commits atômicos + PR.
