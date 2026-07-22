# Gate — observability-check — Story 8.5

**Status: APROVADO**

## Sinais

- **Evento canônico** `MembershipEvent` (SUSPENDED/REACTIVATED) — trilha durável, transacional
  (append-only), correlacionável por `correlationId`.
- **Auditoria manual** (Pino, `event: 'audit'`) por mutação: `Membership` (update), `MembershipEvent`
  (create), e — quando houver — `CardGrant`/`CardResponsavel` (update). Só metadados sanitizados.
- **Negações** já observáveis pelo `OrgContextResolver` (`context.denied` / `context.preferencia_descartada`)
  e pelo `AuthzGuard` — reusadas, não duplicadas.

## Health/probes

Sem novos endpoints de infra; `/health`/`/ready`/`/healthz` inalterados. Nenhum segredo/PII em log.

## Correlação

`correlationId` liga evento ↔ UPDATE de estado ↔ revogações da MESMA transação — investigação de
incidente reconstrói a operação inteira.
