# Implementation Plan: Formulário de Fase e bloqueio de transição (Story 2.15)

**Branch**: `story/2-15-formulario-de-fase-e-bloqueio-de-transicao` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

Formulário de Fase configurável (informativo / requisito de entrada / requisito de saída) que se **acopla ao preflight
da 2.14 como `ValidadorDeTransicao`** — sem recriar a movimentação. O requisito de **entrada** valida e **persiste** os
valores da Fase destino numa **nova tabela `CardPhaseValues`** (append-only) **na MESMA transação** da movimentação:
falha → rollback integral, sem movimentação parcial. Validação **exclusivamente contra a `FormVersion` publicada**
(congelada — AD-12). Obrigatoriedade nasce como `Field.required`, capturada no snapshot. Correção posterior é
append-only + evento `PHASE_VALUES_CORRECTED` antes/depois.

## Technical Context

**Language/Version**: TypeScript estrito; Node 24. **Deps**: NestJS 11, Prisma 6.19.3, PostgreSQL 16, Vitest 4.
**Project Type**: Web service — só `apps/api`. **Constraints**: transação interativa no client raiz
(`definirContextoOrg`); guarda otimista + P2002/P2028→409; nenhuma rota aceita `orgId`; sem PII em log.

## Constitution Check — PASS
- Sem antecipação: `CardPhaseValues`/`Field.required`/modo do Form têm consumidor concreto (esta Story). Reusa
  `validarSubmissao` (2.7), Form/Field/FormVersion (2.4-2.6), preflight (2.14) — não reinventa.
- Isolamento pelo banco: `CardPhaseValues` RLS ENABLE+FORCE+WITH CHECK; GRANT **SELECT/INSERT** (append-only), sem
  UPDATE/DELETE. Teste prova a fase vermelha.
- AD-12 (valida só contra FormVersion publicada) · AD-13 (persistência+evento+movimentação na mesma tx) · INV-FORM-01
  (Card.valores ≠ valores de Fase) · C3 congelado (guarda fina no serviço). context7-check antes de codar.

## Project Structure (arquivos)

```text
apps/api/
├── prisma/migrations/<ts>_phase_forms/migration.sql   # NEW: Field.required + Form.requisitoEntrada/Saida
│                                                       #      + tabela CardPhaseValues (RLS/policies/GRANT SELECT,INSERT)
├── src/pipes/
│   ├── forms/
│   │   ├── snapshot.ts                     # UPDATE: capturar `required` no CampoSnapshot
│   │   └── phase-form-config.*             # NEW: configurar modo do Form PHASE (requisitoEntrada/Saida) — config do Pipe
│   ├── cards/
│   │   ├── phase-values/                   # NEW subdomínio
│   │   │   ├── phase-values.core.ts        #   NEW: requisitosFaltantes(snapshot, valores) — puro (usa required)
│   │   │   ├── phase-values.service.ts     #   NEW: salvar (≠ mover) + corrigir (append-only + evento antes/depois)
│   │   │   ├── phase-values.controller.ts  #   NEW
│   │   │   └── phase-values.dto.ts         #   NEW
│   │   └── movement/
│   │       ├── transition-preflight.ts     # UPDATE: ContextoDeTransicao += flags de requisito (aditivo) + validadores
│   │       ├── card-movement.service.ts    # UPDATE: resolve forms PHASE, injeta flags, persiste entrada na tx
│   │       └── card-movement.dto.ts        # UPDATE: aceita valores de Fase (entrada)
│   ├── forms/fields.service.ts             # UPDATE: setar `required` (gated ao contexto PHASE)
│   ├── pipe-authz.ts                        # (reuso exigirGerenciarPipe / exigirOperarCard / exigirMoverCard)
│   ├── pipes.module.ts                     # UPDATE: registra phase-values + phase-form-config
│   └── kernel/db/tenant-context.ts         # UPDATE: MODELOS_AUDITADOS += CardPhaseValues
└── test/
    ├── phase-values-rls.test.ts            # NEW: fase vermelha do GRANT; cross-tenant; sem UPDATE/DELETE
    ├── phase-form-core.test.ts             # NEW: requisitosFaltantes (puro)
    └── phase-forms-http.test.ts            # NEW: CA1-CA4
```

## Fluxo do requisito de ENTRADA (o ponto delicado — CA2)
O `card-movement.service` (2.14): (a) resolve o Form PHASE da **destino** publicado → snapshot; (b) valida os valores
de entrada do request com `validarSubmissao` + `requisitosFaltantes`; (c) injeta `requisitoEntradaSatisfeito` no
`ContextoDeTransicao`; (d) `executarPreflight` com o validador de entrada — bloqueio → 409, nada persistido (CA1);
(e) sem bloqueio, a **tx interativa** ganha o passo **(iv) INSERT CardPhaseValues** junto de UPDATE `phaseId` +
`CardPhaseEntry(MOVE)` + `MOVED`. Falha em qualquer passo → rollback integral (CA2). Reusa `definirContextoOrg`.

## Complexity Tracking — n/a (PASS)
