# Checklist — Story 4.3

## Contrato / catálogo
- [ ] Catálogo NÚCLEO = 16 tipos exatos da Story §1328–1337 (nem mais, nem menos).
- [ ] Pontos de extensão E5/E6 declarados; `EMAIL_RECEIVED` marcado indisponível; extensões NÃO selecionáveis.
- [ ] `exigirEventoNoCatalogo` fail-closed: tipo desconhecido ou de extensão → rejeita.
- [ ] CARD_MOVED ancorado a `MovementEvent`; NÃO re-emitido em `DomainEvent` (sem duplicidade).

## Envelope
- [ ] Campos mínimos presentes (eventId, eventType, schemaVersion, organizationId, pipeId?, resource*, actorId,
      origin, occurredAt, correlationId, causationId?, executionChainId?, payload).
- [ ] `eventId` determinístico (uuidv5) — mesmo fato → mesmo id; fatos distintos → ids distintos.
- [ ] `schemaVersion` carimbado pelo servidor, estável.
- [ ] `payload` minimizado: sem `valores`/PII/segredo/chave (allowlist AD-30).

## Isolamento (invariante-mãe)
- [ ] RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE) em `DomainEvent`.
- [ ] GRANT append-only (SELECT, INSERT); sem UPDATE/DELETE — prova por fase vermelha (permission denied).
- [ ] FK composta `(orgId, pipeId) → Pipe(orgId, id)` rejeita pipeId cross-tenant.
- [ ] `DomainEvent` em `MODELOS_AUDITADOS`.
- [ ] Toda escrita por tx com contexto; `orgId` nunca do cliente.

## Emissão
- [ ] Same-tx: rollback do fato reverte o Evento (não há Evento sem fato).
- [ ] Card criado (interno + público aprovado) emite CARD_CREATED; triagem pendente NÃO.
- [ ] Retry idempotente (não duplica); no-op/rejeitado não emitem.
- [ ] Emissão nunca 500 sob concorrência (P2002/P2028 → tx rollback / idempotente).

## Gates
- [ ] pre-implementation-check / safe-implementation / context7-check / security-check / observability-check /
      migration-check (drill + rollback).
- [ ] lint, typecheck, test (API, integração real), build verdes. CI verde no SHA.
