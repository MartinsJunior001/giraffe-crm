# Specification Analysis Report — Story 3.7

**Escopo:** consistência entre `spec.md`, `plan.md`, `tasks.md` e a Constituição/ADR-001. Read-only. 2026-07-17.

## Achados

| ID | Categoria | Severidade | Local | Resumo | Recomendação |
|----|-----------|-----------|-------|--------|--------------|
| A1 | Dependência | INFO | tasks T001 | O pré-requisito antiabuso (T001) está no `tasks.md` mas é entregue por **branch/PR separada** mergeada antes. | Manter T001 como marco de dependência, não como task do diff da 3.7 (já anotado). |
| A2 | Cobertura | INFO | spec FR-017 | Rate limit de upload aparece nos FR mas não como AC do épico (o épico põe rate limit forte no público, que é 3.8). | 3.7 entrega o **primitivo** (semáforo/rate) consumível; o rate limit do canal público é 3.8. Sem conflito. |
| A3 | Terminologia | LOW | vários | "expurgo" (spec/ADR) × "purge" (código). | Padronizar "expurgo" na doc pt-BR; `purgedAt` no schema é aceitável (convenção de coluna). |

Nenhum achado CRITICAL/HIGH. Nenhum conflito com a Constituição ou a ADR-001.

## Cobertura Requisito → Task

| FR | Task(s) | FR | Task(s) |
|----|---------|----|---------|
| FR-001 desacoplado | T026 | FR-011 allowlist magic bytes | T010 |
| FR-002 gate off default | T004,T015 | FR-012 limites (10) | T004,T010,T024 |
| FR-003/004 quarentena/fail-closed | T010–T017 | FR-013 remoção lógica | T022 |
| FR-005 veredito composto | T012 | FR-014 expurgo | T022,T023 |
| FR-006 antivírus fail-closed | T013,T017 | FR-015 FileScan imutável | T005,T006,T016 |
| FR-007 download sessão | T018,T019 | FR-016 RLS/auditoria | T005,T006,T016 |
| FR-008 sem acesso cruzado | T020,T021 | FR-017 antiabuso kernel | T001,T009 |
| FR-009 permissão herda | T015,T018,T026 | FR-018 logs sanitizados | T027 |
| FR-010 validação server | T010,T025 | FR-019 dev/CI isolado | T003 |

**Cobertura: 19/19 FR (100%).** SC-001..006 cobertos por testes de mutação (T016,T017,T019,T021,T023,T025).

## Alinhamento com a Constituição
- Isolamento pelo banco, GRANT como fronteira, deny-by-default, fail-closed AD-28, sem exclusão física, kernel sem regra de negócio, sem tocar host do Chatwoot — todos refletidos no plano e nas tasks. **PASS.**

## Métricas
- Requisitos: 19 FR · Tasks: 28 (T001 é dependência externa) · Cobertura: 100% · Ambiguidades: 0 bloqueantes (C1–C4 resolvidos) · CRITICAL: 0.

## Próximas ações
- Sem CRITICAL/HIGH → apto a implementar após: (1) merge da tech story antiabuso; (2) `pre-implementation-check` APROVADO; (3) `context7-check` do SDK S3/ClamAV.
