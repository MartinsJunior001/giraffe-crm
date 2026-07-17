# Gate T001 — Pré-código da Story 3.5

Data: 2026-07-16 · Branch: `story/3-5-visualizacao-e-navegacao-de-registros` (off `origin/main` @ ba412d7)

## context7-check (obrigatório antes de codificar)

- **Prisma 6.19.3 — filtro JSON nativo:** confirmado no Context7 (`/prisma/web`) — `where: { valores: { path:
  ['<fieldId>'], equals|string_contains|gt|gte|lt|lte } }` no PostgreSQL (comparação com escalar). Cobre os
  filtros mínimos do épico.
- **`orderBy` sobre path JSON:** **não** suportado nativamente → ordenação por Campo via **raw parametrizado**
  (`ORDER BY "valores"->>$fieldId`).
- **Raw sob RLS:** `withTenantContext` embrulha operações de modelo, não `$queryRaw`; rodar o raw por
  `$transaction([...definirContextoOrg(prisma, ctx), $queryRaw])` (mesmo primitivo, client raiz) aplica a RLS.
  Fonte: `tenant-context.ts`.
- **Conclusão:** sem tecnologia nova; filtro nativo + ordenação raw parametrizada sob o primitivo de contexto,
  reuso de padrões verdes (2.6/2.9/3.4). Registro em `specs/.../research.md`.

## pre-implementation-check

- **Sequência oficial:** BMAD create-story ✅ (story `ready-for-dev`), Spec Kit completo ✅. Baseline `ba412d7`
  (3.4 `done`).
- **Dependências `done`:** 3.4 (`Record`, `exigirLerDatabase`, `RecordVisao`/`podeEditar`), 3.3 (Campos da
  definição), 2.9 (padrão de leitura/projeção), 2.6 (`definirContextoOrg`). ✅
- **Sem antecipar escopo:** grupos complexos/filtros salvos/visualizações/fórmulas/agregações, Histórico read-side
  (3.6), vínculo (3.9), filtro de Arquivo (3.7/3.8) — **fora**. ✅
- **Sem migration/GRANT:** read-side puro; runtime segue `SELECT`. ✅
- **Isolamento:** RLS vigente em `Record`; raw sob `definirContextoOrg`; nenhum bypass. Query totalmente
  parametrizada + allowlist (sem injeção). ✅
- **Guard C3 congelado:** autz fina no serviço; `ability.ts`/`authz.guard.ts` não tocados. ✅

## Veredito

**APROVADO.** Autorizado a implementar (T002+).
