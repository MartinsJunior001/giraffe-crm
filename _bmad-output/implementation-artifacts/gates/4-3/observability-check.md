# observability-check — Story 4.3

**Status:** APROVADO

## Auditoria (FR-214 / AD-30)
- `DomainEvent` acrescentado a `MODELOS_AUDITADOS` (`tenant-context.ts`): INSERT e tentativa negada por RLS
  entram na trilha. Sem UPDATE/DELETE (GRANT).
- Os dois produtores fiados (`card-submission.service`, `converter-submissao`) rodam em tx raiz (não passam
  pela extensão) e auditam manualmente `create`/`DomainEvent` — só metadados (ator, orgId, ação, recurso,
  resultado, timestamp), NUNCA o payload/valores.

## Sanitização de logs (AD-29)
- Nenhum log novo carrega payload de evento, `valores` ou PII. A emissão não loga o envelope.
- O `payload` do próprio envelope é minimizado por allowlist (defesa em profundidade contra vazamento).

## Correlação
- Todo Evento carrega `correlationId` (base do `eventId` determinístico) e `eventId` — rastreabilidade da
  operação preservada (AD-13). `causationId`/`executionChainId` reservados para o encadeamento (4.7).

## Health/readiness
- Sem impacto: nenhuma dependência externa nova, nenhum boot-time I/O. Tabela nova coberta pela sonda de
  readiness existente (schema aplicado por `db:migrate`).

## Veredito
APROVADO — trilha de integração observável e sanitizada; sem vazamento em log.
