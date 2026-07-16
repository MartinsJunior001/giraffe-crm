# Specification Quality Checklist: Ciclo de vida e catálogo de Databases (Story 3.1)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *nota: por convenção do repo, esta spec é técnica e cita padrões internos (RLS, GRANT, CASL, helpers) deliberadamente, como as specs 2.1/2.14; o público são stakeholders técnicos*
- [x] Focused on user value and business needs (manter bases estruturadas separadas dos processos)
- [x] Written for stakeholders (técnicos, padrão do repo)
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (ambiguidades resolvidas por default em Clarifications; D1 marcada para confirmação do dono)
- [x] Requirements are testable and unambiguous (FR-3.1-1..6 com códigos HTTP e estados definidos)
- [x] Success criteria are measurable (CA1-CA6 verificáveis; idempotência/isolamento com resultados definidos)
- [x] Acceptance scenarios are defined (CA1-CA6, mapeados a AC1-AC5 da story md)
- [x] Edge cases are identified (renomear em arquivado, arquivar/restaurar idempotente, cross-tenant, contexto ausente, sem DELETE)
- [x] Scope is clearly bounded (Fora de escopo explícito; contrato futuro da somente-leitura declarado)
- [x] Dependencies and assumptions identified (Rastreabilidade + Decisões de design + Assunções)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (criar/renomear/arquivar/restaurar/listar/obter)
- [x] Feature meets measurable outcomes defined in acceptance scenarios
- [x] No implementation details leak beyond the repo's established convention

## Notes

- **D1 (renomear em `ARCHIVED` → 409)** é a única decisão que merece confirmação do dono: a epics enumerou as
  operações bloqueadas sob arquivamento sobre **dados dependentes** (Registro/Formulário/Campo/arquivo/vínculo)
  **sem nomear `renomear`**. O default adotado é o conservador (bloquear), coerente com "integralmente somente
  leitura" e provendo consumidor concreto à regra já na 3.1. Alternativa (permitir renomear metadado) não muda o
  restante do escopo.
- **D2 (somente-leitura sobre dados dependentes = contrato futuro)** não é ambiguidade: é aplicação direta de
  AD-11/Constitution II e do precedente da 2.1 (trava por Cards ativos → 2.11).
