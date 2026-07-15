# Implementation Plan: Movimentação e regras de transição (Story 2.14)

**Branch**: `story/2-14-movimentacao-e-regras-de-transicao` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/2-14-movimentacao-e-regras-de-transicao/spec.md`

## Summary

Permitir que um usuário autorizado **mova um Card para outra Fase ativa do mesmo Pipe**, materializando o
**serviço central de movimentação** (o **1º UPDATE de `Card.phaseId`** em runtime) e o **contrato de preflight de
transição** com validadores registráveis, sobre o qual 2.15/E4/E5 se integram **sem recriar** a movimentação. A
operação é **atômica**: UPDATE de `phaseId` (guarda otimista) + `registrarEntradaNaFase(origin='MOVE')` + INSERT
`CardHistory{MOVED}` numa **única transação interativa no client raiz** (`definirContextoOrg`). Havendo bloqueio de
preflight, **nada** é movimentado. Marcos/saúde são recalculados **por leitura** (a nova `CardPhaseEntry` vira a
entrada atual) — sem persistir, sem agendador, sem evento de saúde.

## Technical Context

**Language/Version**: TypeScript estrito (`strict` + `noUncheckedIndexedAccess`, `tsconfig.base.json`); Node 24 (`.nvmrc`)

**Primary Dependencies**: NestJS 11 (API); Prisma 6.19.3 (ORM, client estendido `withTenantContext`); `@casl/ability` 7 (substrato de autorização — **congelado**, guarda fina no serviço via `pipe-authz`)

**Storage**: PostgreSQL 16 (host `127.0.0.1:5434` em dev). RLS + FORCE ROW LEVEL SECURITY como invariante-mãe; dois papéis (`giraffe_app` runtime / `giraffe_migrator` dono do schema). `CardHistory.type` é `String` (schema:614) — `MOVED` é novo valor, **sem** migration de enum.

**Testing**: Vitest 4 (`test/**/*.test.ts`), integração contra PostgreSQL **real**; suíte da API em SÉRIE no CI (`pnpm test:ci` = `vitest run --no-file-parallelism`)

**Target Platform**: Linux server (containerizado); runtime NestJS atrás de proxy

**Project Type**: Web service (monorepo pnpm workspaces — `apps/api` NestJS + `apps/web` Next.js). Esta Story toca **apenas `apps/api`**.

**Performance Goals**: Sem meta nova de throughput; a movimentação é uma transação curta (1 UPDATE + 2 INSERTs). Sem N+1 (lê Card + Fases num conjunto mínimo de queries sob contexto).

**Constraints**: Transação interativa no **client raiz** (o client estendido recusa `$transaction`); guarda otimista no UPDATE; conflito reconhece **P2002 e P2028** → **409, nunca 500**; nenhuma rota aceita `orgId`/`phaseId` de outra Org do cliente; `valores`/`orgId` seguem **sem** GRANT de UPDATE.

**Scale/Scope**: 1 migration (GRANT additivo), 1 núcleo puro, 1 serviço + 1 controller + 1 DTO, 1 helper reusado, 3 arquivos de teste. Nenhuma tabela nova.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Sequência oficial (Doc Base → BMAD → Spec Kit → Implementação):** ✅ BMAD `create-story` e Spec Kit `specify`+`checklist` concluídos; este `plan` prossegue a sequência; `tasks`/`analyze` e o gate `pre-implementation-check` **precedem** qualquer código.
- **Sem antecipar escopo / sem abstração especulativa:** ✅ o contrato de preflight nasce com **validadores built-in concretos** (consumidores reais); o ponto de extensão é documentado, **não** um registry/DI vazio (D1). `registrarEntradaNaFase(origin='MOVE')` ganha **chamador concreto** agora (AD-11).
- **Isolamento multi-tenant é do banco:** ✅ `Card`/`CardHistory`/`CardPhaseEntry` já têm RLS+FORCE+WITH CHECK; nenhuma policy nova; o `WITH CHECK` do UPDATE barra mover a linha para outra Org. Toda query por `withTenantContext`/client raiz com `definirContextoOrg`.
- **GRANT é fronteira de segurança:** ✅ a migration acrescenta **só** `GRANT UPDATE ("phaseId")` (column-scoped, additivo ao da 2.11); `valores`/`orgId` **jamais** recebem UPDATE; sem DELETE. Teste prova a **fase vermelha** (quebra antes, concede depois).
- **Autorização deny-by-default, C3/`ability.ts` congelado:** ✅ guarda fina no serviço (`exigirOperarCard` + `podeMover`), sem tocar guard/`ability.ts` (DBT-AUTHZ-01).
- **AD-13 (mutação principal + evento na mesma transação):** ✅ UPDATE + entrada + evento `MOVED` atômicos; auditoria manual (FR-214).
- **Verificação documental (context7-check):** ✅ requerido antes de codificar (Prisma 6.19.3 `updateMany`/transação interativa, NestJS 11) — executado no início da implementação, não do planejamento.
- **Artefatos autoritativos não editados pela implementação:** ✅ PRD/UX/Architecture/`epics.md` intactos; `sprint-status.yaml` e status da Story só pelo workflow BMAD.

**Resultado:** PASS — nenhuma violação; **Complexity Tracking** não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/2-14-movimentacao-e-regras-de-transicao/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 (decisões D1–D5 consolidadas)
├── data-model.md        # Fase 1 (entidades tocadas + transição de estado)
├── quickstart.md        # Fase 1 (roteiro de validação executável)
├── contracts/           # Fase 1 (contrato de preflight + contrato HTTP)
│   ├── transition-preflight.contract.md
│   └── move-card.http.md
├── checklists/
│   └── requirements.md  # (specify/checklist — já existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── migrations/
│       └── <timestamp>_card_movement/
│           └── migration.sql          # NEW — GRANT UPDATE ("phaseId") ON "Card" (additivo; sem enum, sem policy)
├── src/pipes/
│   ├── cards/
│   │   ├── movement/                  # NEW subdomínio (espelha lifecycle/, phase-entry/, access/)
│   │   │   ├── transition-preflight.ts        # NEW — núcleo PURO (tipo ValidadorDeTransicao + built-ins)
│   │   │   ├── card-movement.service.ts       # NEW — orquestra autz + preflight + transação atômica
│   │   │   ├── card-movement.controller.ts    # NEW — rota POST mover
│   │   │   └── card-movement.dto.ts           # NEW — { destinoPhaseId, confirmado, idempotencyKey? }
│   │   └── phase-entry/
│   │       └── card-phase-entry.ts    # UNCHANGED — registrarEntradaNaFase já aceita origin='MOVE' (ganha chamador)
│   ├── pipe-authz.ts                  # UPDATE (se justificado) — exigirMoverCard = exigirOperarCard + podeMover
│   └── pipes.module.ts                # UPDATE — registra service + controller
└── test/
    ├── card-move-rls.test.ts          # NEW — fase vermelha do GRANT; cross-tenant negado; valores/orgId sem UPDATE
    ├── transition-preflight.test.ts   # NEW — unit puro dos validadores + composição
    └── card-move-http.test.ts         # NEW — feliz, bloqueio, 403/404, concorrência, idempotência
```

**Structure Decision**: Web service — a Story vive **inteiramente** em `apps/api`, no novo subdomínio
`src/pipes/cards/movement/`, espelhando os subdomínios já existentes de Card (`lifecycle/`, `phase-entry/`,
`access/`). O **núcleo puro** (`transition-preflight.ts`) fica separado do serviço, seguindo o padrão
`card-lifecycle.transitions.ts` / `phase-milestones.core.ts`. Nenhuma regra de domínio no frontend; `apps/web`
**não é tocado** nesta Story (o consumo de UI da movimentação não está no escopo — epics/§977).

## Complexity Tracking

> Não se aplica — Constitution Check = PASS sem violações.
