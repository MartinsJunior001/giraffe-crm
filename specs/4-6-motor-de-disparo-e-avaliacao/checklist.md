# Checklist — Story 4.6 (risco ALTO)

## Isolamento & GRANT
- [ ] `AutomationExecution`/`AutomationActionResult` com RLS ENABLE **e** FORCE.
- [ ] WITH CHECK no INSERT **e** no UPDATE (impede mover linha p/ outra Org).
- [ ] FK composta tenant-safe `(orgId, automationId)`/`(orgId, executionId)` (F-A1).
- [ ] GRANT Execução = SELECT/INSERT + UPDATE **column-scoped** (estado/lease/attempt/errorCode) — **sem DELETE**.
- [ ] GRANT Result = **só** SELECT/INSERT (append-only) — **sem UPDATE/DELETE**.
- [ ] Fase vermelha provada: UPDATE de `eventId`/`automationId` → `permission denied`; DELETE → `permission denied`.
- [ ] Ambas em `MODELOS_AUDITADOS`.
- [ ] Toda query por `withTenantContext`/`definirContextoOrg`; nenhum `where orgId` como única defesa; `orgId` nunca do cliente.

## Idempotência & at-least-once
- [ ] Dedup Execução `@@unique(orgId,eventId,automationId,automationVersionId)`.
- [ ] Dedup Ação `@@unique(orgId,executionId,actionIndex)`.
- [ ] Colisão P2002/P2028 ⇒ idempotente/409 — **nunca 500**.
- [ ] Reprocessar o mesmo evento não cria 2ª Execução; Ação concluída não repete.
- [ ] Crash (lease vencida) retomado sem efeito duplo.

## Autorização (RISCO ALTO)
- [ ] Executa por `resultado.permitido` (L-1) — **nunca** por `exigeConfirmacaoHumana`.
- [ ] Principal construído da **versão congelada**; capacidade/recurso fora da allowlist ⇒ recusa (não-ampliação).
- [ ] **M-1**: `recordId`/`linkedRecordIds` só de Registros vinculados a Card do Pipe proprietário; cross-Pipe/Database recusado.
- [ ] **SC-2101/2102** revalidados na execução de `CARD_ASSIGN_RESPONSIBLE` sob RLS.
- [ ] Guard/`ability.ts` (C3) **não** tocados.

## Ordem & efeitos parciais
- [ ] Ações da mesma Automação na ordem `entao`; falha ⇒ seguintes `BLOCKED_PRIOR_FAILURE`.
- [ ] Efeitos anteriores permanecem (sem rollback entre Ações); Execução = `PARTIAL`.
- [ ] Automações distintas independentes.

## Observabilidade & LGPD
- [ ] Ledger/log **sem** `valores`/PII/segredo/stack (só ids/estados/errorCode sanitizado — AD-30).
- [ ] Auditoria manual (FR-214) nas escritas de tx raiz.

## Migration
- [ ] Aditiva; `db:migrate`; `.down` DROP ×2 com drill executado; sem alterar tabela existente; sem backfill.
