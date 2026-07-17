# Gate T001 — Pré-código da Story 3.4

Data: 2026-07-16 · Branch: `story/3-4-ciclo-de-vida-do-registro-historico-write-side` (off `origin/main` @ 4e60ee4)

## context7-check (obrigatório antes de codificar)

- **Prisma 6.19.3** — tratamento de `P2002` (violação de unicidade) via `Prisma.PrismaClientKnownRequestError`
  (`code === 'P2002'`) confirmado no Context7 (`/prisma/web`). A base já tem o reconhecedor `isConflitoDePublicacao`
  (P2002 **e** P2028), reusado por 2.6/2.7/2.8 e verde no CI. Transação interativa (`$transaction(async tx …)`)
  sob contexto de tenant roda no **client raiz** (`definirContextoOrg`) — padrão de 2.6/2.7/2.11. GRANT
  column-scoped, RLS e índice único parcial são **raw SQL** na migration (Prisma não os exprime no schema),
  idênticos a 2.7/2.11/3.1.
- **NestJS 11** — controllers/módulos por padrão já vigente (3.2/3.3). `@Requer('ler','Database')` grosso +
  guarda fina no serviço (DBT-AUTHZ-01).
- **Conclusão:** nenhuma tecnologia/assinatura nova; todos os primitivos são reuso de padrões verdes. Fonte
  registrada em `specs/.../research.md`.

## pre-implementation-check

- **Sequência oficial:** BMAD create-story ✅ (story file `ready-for-dev`), Spec Kit completo ✅ (specify/clarify/
  plan/checklist/tasks/analyze). Baseline `4e60ee4` (3.3 `done`).
- **Dependências `done`:** 3.3 (Formulário de Database publicável), 3.2 (`database-authz`), 2.7 (`submission.ts`,
  padrão de submissão), 2.11 (ciclo de vida), 2.6 (`definirContextoOrg`). ✅
- **Sem antecipar escopo:** listagem/tabela (3.5), read-side (3.6), arquivo (3.7/3.8), vínculo (3.9), Automação
  (E4) — todos **fora**, sem abstração especulativa. ✅
- **Artefatos autoritativos:** `sprint-status` alterado só pelo passo BMAD autorizado, na branch da Story. PRD/
  epics/Spine **não** editados. ✅
- **Isolamento (invariante-mãe):** `Record`/`RecordHistory` replicam RLS ENABLE+FORCE + WITH CHECK + GRANT como
  fronteira, em `MODELOS_AUDITADOS`. Nenhum bypass de RLS. ✅
- **Guard C3 congelado:** autz fina no serviço; `ability.ts`/`authz.guard.ts` não tocados. ✅

## Veredito

**APROVADO.** Pré-condições satisfeitas; reuso máximo de padrões verificados; escopo congelado. Autorizado a
implementar (T002+).
