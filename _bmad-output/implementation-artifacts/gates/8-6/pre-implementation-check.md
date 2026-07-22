# pre-implementation-check — Story 8.6

**Status: APROVADO.**

## Escopo e sequência
- BMAD/epics.md §682–698 é a fonte; Spec Kit consolidado em `specs/8-6-…` (spec/plan/tasks/checklist/
  analyze). Decisões D-1..D-4 já aprovadas (não reabrir).

## Reuso vs. novo (sem antecipar escopo)
- **Reusa:** `StepUpService` (1.12), `AbilityCache` (1.6), contrato puro `membership-contract.ts` (2.10),
  evento `MembershipEvent` (8.4), padrão de tx interativa no client raiz (`definirContextoOrg` +
  `SELECT … FOR UPDATE`), DTO/UUID de `membership-role.dto.ts`.
- **Novo mínimo:** núcleo puro de remoção, serviço, duas rotas, valor de enum `REMOVED`, REVOKE DELETE.
- **Não** reabre os núcleos de papel (8.4) nem estado (8.5); **não** toca guard/`ability.ts` (C3).

## Migration (etapa controlada)
- Aditiva (`ADD VALUE`) + `REVOKE DELETE ON "Membership"` — fecha DEB-MEMBERSHIP-EVENT-CASCADE. Drill de
  rollback documentado (migration-check.md). Nenhum consumidor de runtime de DELETE em `Membership`
  (grep vazio em `apps/api/src/`). Fila de migrations: slot 20260725120000 livre.

## Riscos e mitigação
- **Último Admin sob concorrência (D-2):** lock+recount na tx; teste concorrente real com alvos distintos.
- **REVOKE quebra testes fundacionais que codificavam o grant antigo:** reconciliados para o invariante
  mais forte (permission denied); faxina por migrator. NÃO é consumidor legítimo — é scaffolding do grant
  removido. Prova de fase vermelha registrada.
- **Regenerar o Prisma client** após `ADD VALUE` (senão `type: 'REMOVED'` não tipa).

## Gates aplicáveis (risco ALTO)
context7 · security · observability · migration (drill+rollback) · lgpd · integração real (PostgreSQL) ·
lint/typecheck/build · QA cruzada · CI no SHA exato.

**Decisão: APROVADO** — prosseguir para `safe-implementation`.
