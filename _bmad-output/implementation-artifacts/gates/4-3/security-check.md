# security-check — Story 4.3

**Status:** APROVADO (pendente evidência de execução da suíte — anexada no PR).

## Multi-tenant / isolamento
- `DomainEvent` RLS ENABLE+FORCE + WITH CHECK no INSERT **e** UPDATE (migration). Prova: `domain-events-rls`.
- Toda escrita por tx com contexto (`definirContextoOrg`); nenhum `where orgId` manual como defesa única.
- `orgId` nunca aceito do cliente (produtores usam `contexto.orgId`; rotas de Automação não recebem orgId).
- FK COMPOSTA tenant-safe `(orgId, pipeId) → Pipe(orgId, id)` — rejeita pipeId cross-tenant (prova positiva e
  negativa). `resourceId` polimórfico sem FK: isolado por RLS+orgId, validado in-tx pelo produtor.

## GRANT como fronteira (append-only)
- Runtime tem SÓ `SELECT, INSERT` em `DomainEvent`. UPDATE **e** DELETE negados (`permission denied`) — prova
  em `domain-events-rls`. Imutabilidade do evento canônico garantida pelo BANCO.

## Minimização / vazamento (AD-30)
- `payload` por allowlist (`minimizarPayload`): descarta chaves fora da lista e valores não-primitivos —
  `valores`/PII/segredo nunca entram, mesmo sob erro do produtor. Prova: `event-envelope.core`.
- Envelope não expõe dado de outro Pipe/Org (isolamento RLS + pipeId coerente com catálogo).
- Logs de auditoria (FR-214) só metadados (`create`/`DomainEvent`), nunca payload/valores.

## Idempotência / concorrência (sem 500)
- `eventId` determinístico + `@@unique([orgId, eventId])`. Retry faz rollback integral da tx (P2002/P2028) —
  nunca duplica, nunca 500. Prova: `cards-http` (retry=1), `domain-events-emission` (P2002), `domain-events-rls`.

## Guard/CASL
- C3 congelado: nenhuma mudança em `ability.ts`/`ability.factory.ts`. Enforcement do catálogo é fino, no
  serviço (DBT-AUTHZ-01), não no guard.

## Veredito
Sem finding CRITICAL/HIGH. Superfície aditiva, append-only, tenant-safe. APROVADO.
