# pre-implementation-check — Story 4.3

**Status:** APROVADO
**Risco:** ALTO (contrato canônico foundational + multi-tenant + migration).

## Contexto verificado
- Deps done: 4.1 (Automation/quando.tipo estrutural), 2.16 (MovementEvent/opt-in), 3.4 (Record), 3.9 (vínculo).
- Precedentes lidos: `movement-event.core.ts`, `card-movement.service.ts`, `MembershipEvent`, D-4, AD-13/18/30.
- Gate de Arquitetura resolvido por DERIVAÇÃO (não invenção) — `decisions/domain-event-envelope-4-3.md`.

## Verificação documental (context7-check)
- Prisma 6.19.3: transação interativa (`$transaction(async tx)`) com rollback on-throw e P2002 confirmados via
  Context7 (`/prisma/web`) — padrão idêntico ao já usado por 2.7/2.16. Sem API nova.
- NestJS 11: sem superfície nova (helpers puros + edição de serviços existentes). Sem provider/módulo novo.

## Decisões-chave (menor mudança correta)
- Persistir outbox `DomainEvent` (AD-13) + fiar CARD_CREATED nos 2 sítios de criação de Card; demais tipos =
  contrato (AD-11). Não reusar/renomear MovementEvent (frozen). Enforcement do catálogo no serviço, não no
  núcleo puro 4.1.

## Impacto
- Migration aditiva (nova tabela, sem backfill, reversível por DROP TABLE).
- Edição aditiva em `card-submission.service.ts`, `converter-submissao.ts`, `automations.service.ts`,
  `automation-lifecycle.service.ts`, `tenant-context.ts`, `schema.prisma`.
- Testes de serviço 4.1/4.2 migram `quando.tipo` placeholder → `CARD_CREATED` (núcleo puro intocado).

## Veredito
APROVADO para implementação com os gates de risco ALTO (security/observability/migration + integração real).
