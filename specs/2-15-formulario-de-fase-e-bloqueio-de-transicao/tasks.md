---
description: "Task list — Story 2.15 (Formulário de Fase e bloqueio de transição)"
---

# Tasks: Formulário de Fase e bloqueio de transição (Story 2.15)

**Tests**: REQUERIDOS (PostgreSQL real; fase vermelha do GRANT). **US1** = única user story.

## Phase 1: Setup
- [ ] T001 Gate `pre-implementation-check` + `context7-check` (Prisma: `create`/transação interativa/RLS; NestJS). Só prosseguir se APROVADO.

## Phase 2: Foundational (bloqueia US1)
- [ ] T002 Migration `<ts>_phase_forms`: (a) `ALTER TABLE "Field" ADD COLUMN "required" boolean NOT NULL DEFAULT false`; (b) `ALTER TABLE "Form" ADD COLUMN "requisitoEntrada" boolean NOT NULL DEFAULT false, ADD COLUMN "requisitoSaida" boolean NOT NULL DEFAULT false`; (c) tabela `CardPhaseValues` (orgId, cardId, phaseId, formVersionId, valores JSONB, createdAt, actorId?) + índices; (d) RLS **ENABLE + FORCE**, policies select/insert por `orgId=current_org_id()` com WITH CHECK no INSERT; (e) `GRANT SELECT, INSERT ON "CardPhaseValues" TO giraffe_app` (**sem UPDATE/DELETE**). Sem enum (CardHistory.type String). Reversível.
- [ ] T003 Atualizar `schema.prisma` (Field.required; Form.requisitoEntrada/Saida; model CardPhaseValues) e `prisma generate`; aplicar migration (`db:migrate`) e verificar (`db:status`).
- [ ] T004 `MODELOS_AUDITADOS += 'CardPhaseValues'` em `tenant-context.ts`.
- [ ] T005 [P] Núcleo puro `cards/phase-values/phase-values.core.ts`: `requisitosFaltantes(snapshot, valores): string[]` (Campos `required` do snapshot ausentes/vazios em `valores`). Sem I/O.
- [ ] T006 [P] `forms/snapshot.ts`: capturar `required` em `CampoParaSnapshot`/`CampoSnapshot`/`montarSnapshot`.

## Phase 3: US1 — Formulário de Fase (P1)
- [ ] T007 [US1] Config do modo (`phase-form-config.service`/controller): setar `requisitoEntrada`/`requisitoSaida` do Form PHASE — `exigirGerenciarPipe` (resolve por phase.pipeId). `fields.service`: permitir `required` só em Campo de Form PHASE (gated; 400 no inicial).
- [ ] T008 [US1] `transition-preflight.ts`: estender `ContextoDeTransicao` (aditivo) com `requisitoEntradaOk?`/`requisitoSaidaOk?`; novos validadores `validarRequisitoEntrada`/`validarRequisitoSaida` (bloqueio se flag `false`); compor após os built-in.
- [ ] T009 [US1] `card-movement.dto.ts`: aceitar `valoresDeFase?` (entrada). `card-movement.service.ts`: resolver Form PHASE destino (entrada) + origem (saída), FormVersion **publicada**; validar (`validarSubmissao`+`requisitosFaltantes`); injetar flags no contexto; **estender a tx** com INSERT `CardPhaseValues` (entrada) — rollback integral em falha; P2002/P2028→409.
- [ ] T010 [US1] `phase-values.service`/controller/dto: **salvar** (≠ mover, sem transição) e **corrigir** (fora da Fase corrente; `exigirOperarCard`; append-only novo INSERT + evento `PHASE_VALUES_CORRECTED` antes/depois na mesma tx — AD-13). Leitura dos valores por (Card, Fase) para autorizados.
- [ ] T011 [US1] Registrar serviços/controllers em `pipes.module.ts`.

## Phase 4: Testes (PostgreSQL real; Org C + randomUUID)
- [ ] T012 [P] [US1] `phase-form-core.test.ts` (unit puro): `requisitosFaltantes` (obrigatório presente/ausente/vazio; ignora não-obrigatório); validadores de entrada/saída compondo com `VALIDADORES_PADRAO`.
- [ ] T013 [P] [US1] `phase-values-rls.test.ts`: fase vermelha do GRANT (sem GRANT → INSERT `permission denied`); depois INSERT no contexto ok, cross-tenant negado (WITH CHECK); **UPDATE e DELETE negados** (append-only); isolamento (Org A → 0).
- [ ] T014 [US1] `phase-forms-http.test.ts`: CA1 (obrigatório faltando → bloqueio 409, Card permanece, sem MOVED, valores preservados); CA2 (entrada persiste na mesma tx; falha → sem movimentação parcial); CA3 (saída valida antes); CA4 (salvar não move; correção gera evento antes/depois; valores persistem após sair). Concorrência sem 500.

## Phase 5: Polish
- [ ] T015 `typecheck` + `lint` + `format` (arquivos novos) verdes.
- [ ] T016 `test:ci` (serial) verde.
- [ ] T017 Gates de conclusão: `security-check`, `observability-check`, `migration-check`. Evidência real.
- [ ] T018 `commit-check` → commit(s) atômicos → push → PR → CI → merge → closure (BMAD).

## Dependencies
Setup → Foundational (T002-T006) → US1 (T007-T011) → Testes (T012-T014) → Polish. T002/T003 bloqueiam T009/T013.
T005/T006 bloqueiam T008/T009/T012. T008 bloqueia T009.
