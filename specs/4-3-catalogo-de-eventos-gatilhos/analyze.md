# Analyze — Story 4.3 (consistência cross-artefato)

Verificação não-destrutiva entre spec.md, plan.md, tasks.md e a fonte autoritativa (epics §1324–1349).

## Cobertura dos critérios de aceite → testes

| CA | Descrição | Teste(s) | Status |
|---|---|---|---|
| CA1 | só Eventos do catálogo aprovado | `event-catalog.core.test.ts`; `automations-http` (EVENTO_FORA_DO_CATALOGO) | coberto |
| CA2 | Card criado só na submissão aprovada; triagem pendente não | `public-submissions-http` (pendente=0, aprovado=1); `cards-http` (interno=1) | coberto |
| CA3 | sem duplicidade (retry/rejeitado/no-op) | `cards-http` (retry=1); `domain-events-emission` (P2002); `domain-events-rls` (UNIQUE) | coberto |
| CA4 | envelope canônico mínimo, minimizado, sem outro Pipe/Org | `event-envelope.core.test.ts`; `domain-events-rls` (isolamento) | coberto |

## Testes adversariais obrigatórios → evidência

| # | Prova | Teste |
|---|---|---|
| (a) | envelope bem-formado + versionado | `event-envelope.core.test.ts` |
| (b) | emissão opt-in same-tx; rollback reverte | `domain-events-emission.test.ts` |
| (c) | append-only (UPDATE/DELETE negados), cross-tenant, FK composta, RLS FORCE+WITH CHECK | `domain-events-rls.test.ts` |
| (d) | minimização/sanitização (sem PII/segredo) | `event-envelope.core.test.ts` (minimizarPayload) |
| (e) | catálogo fixo/completo; extensões declaradas | `event-catalog.core.test.ts` |
| (f) | eventId determinístico (idempotência) | `event-envelope.core.test.ts`; `domain-events-emission.test.ts`; `domain-events-rls.test.ts` |

## Consistência de invariantes

- `Card ≠ Registro`, `Pipe ≠ Database`: `DomainEvent` é source-agnóstico (resourceType polimórfico), não reusa
  entidades de domínio. OK.
- Sem GRANT de DELETE/UPDATE em `DomainEvent` (append-only). OK (migration + teste).
- `CARD_MOVED` não duplicado (ancorado a `MovementEvent`). OK (débito DEB-4-3-OUTBOX-UNIFICACAO registrado).
- Enforcement não quebra o núcleo puro 4.1 (`automations.core.test.ts` intocado); testes de serviço migrados
  para `CARD_CREATED`. OK.

## Riscos residuais / débitos

- **DEB-4-3-OUTBOX-UNIFICACAO**: dois outboxes até 4.6 reconciliar o consumo.
- **DEB-4-3-EMISSAO-INCREMENTAL**: 15 dos 16 tipos ainda sem produtor fiado (AD-11 — emitem com seus
  consumidores). O helper e o catálogo já existem como contrato pronto.
- Drill de fase vermelha (WITH CHECK/FK/GRANT) é MANUAL em banco descartável, registrado no PR — não
  versionado (mesma prática de `automations-rls`).

## Veredito

Sem lacuna material entre a Story, o spec, o plano e os testes. Gate de Arquitetura resolvido por derivação
(decisão registrada). Pronto para implementação → gates → PR.
