# Tasks — Story 4.4: Catálogo de Condições + avaliação AND

Ordem por dependência. `[x]` concluído.

## Fundação (gate de Arquitetura)
- [x] T1 — Consolidar o gate (fuso oficial + semântica de comparação) por DERIVAÇÃO em
  `decisions/condition-evaluation-4-4.md`; confirmar que não há escolha nova (sem `EXTERNAL_BLOCKER`).
- [x] T2 — Exportar `categoriaDeCampo(type)` de `record-query.core.ts` (aditivo, fonte única do mapeamento).

## Núcleo puro
- [x] T3 — `condition-snapshot.ts`: contrato `SnapshotAvaliacao`/`CardSnapshot`/`RecordSnapshot`/`CampoSnapshotDef`
  documentando a montagem sob RLS pela 4.6.
- [x] T4 — `condition-catalog.ts`: 7 tipos (5 domínios), operadores por tipo, `exigirCondicoesNoCatalogo` fail-closed.
- [x] T5 — `condition-eval.core.ts`: `avaliarCondicoes` (AND, determinístico, fail-closed; reusa `categoriaDeCampo`).

## Enforcement de configuração (integração)
- [x] T6 — `automations.service.ts` (`criar`): `validar` chama `exigirCondicoesNoCatalogo` → 400 `CONDICAO_FORA_DO_CATALOGO`.
- [x] T7 — `automation-lifecycle.service.ts` (`editar`/`duplicar`/`ativar`): idem.

## Testes
- [x] T8 — `condition-catalog.core.test.ts`: catálogo fixo/completo + enforcement (CA1).
- [x] T9 — `condition-eval.core.test.ts`: provas (a)–(g) → CA2–CA7.
- [x] T10 — `automations-http.test.ts`: bloco `CONDICAO_FORA_DO_CATALOGO` (config-time real).

## Gates e verificação
- [x] T11 — `context7-check` (Prisma 6.19.3 JSON/`orderBy`; NestJS 11) — sem nova superfície de API na 4.4 pura.
- [x] T12 — Gates: `pre-implementation-check`, `security-check`, `observability-check`, `migration-check` (N/A).
- [ ] T13 — `pnpm lint`, `typecheck`, `test` (API, integração real), `build` verdes.
- [ ] T14 — `commit-check` → commit atômico → PR.

## Fora do escopo (AD-11 — sem consumidor concreto)
- Motor que monta o snapshot sob RLS e chama o avaliador (4.6).
- Catálogo de Ações (4.5), encadeamento (4.7), trilha de Execuções (4.8), persistência do resultado.
