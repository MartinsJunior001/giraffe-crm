# Gate T001 — Pré-código — Story 3.6 (Histórico do Registro, read-side)

Data: 2026-07-16 · Branch: `story/3-6-historico-do-registro-read-side` (off `origin/main` @ f738220)

## context7-check

- **Prisma 6.19.3** — `findMany` com `cursor`/`skip:1`/`take`/`orderBy` composto (`[{createdAt:'asc'},{id:'asc'}]`)
  e `select` (projeção): API estável, já em produção no read-side do Kanban (2.9) e do Histórico do Card (2.17).
  **Sem raw** nesta Story (ordena por colunas nativas). Nenhuma divergência doc × plano.
- **NestJS 11** — `@Controller`/`@Get`/`@Param`/`@Query` + `@Requer` (CASL grosso). Padrão idêntico ao
  `card-history.controller.ts`.
- Baseline de versões conferida em `package.json`/lockfile. Fonte: doc oficial do Prisma (cursor pagination) + código
  vigente da base.

## pre-implementation-check

- **Sequência oficial cumprida:** Documentação Base → BMAD (create-story: sprint-status 3-6 → ready-for-dev na branch)
  → Spec Kit (spec/research/plan/data-model/contracts/checklists/tasks/quickstart/analyze) → **agora** implementação.
- **Escopo:** read-side puro sobre `RecordHistory` (3.4). **Sem** migration, **sem** GRANT, **sem** dependência nova,
  **sem** mudança de arquitetura. Não toca guard/`ability.ts` (C3 congelado).
- **Reuso, não reinvenção:** molde = `card-history-read.service.ts` (2.17); autz = `exigirLerDatabase` (3.2); rota sob
  `databases/:databaseId/records/:recordId` (padrão da 3.4/3.5); parsers espelham `kanban.dto`.
- **Invariantes:** `Card ≠ Registro` (domínio distinto, sem reuso de entidade); isolamento por Org (RLS +
  `withTenantContext`); projeção allowlist (AD-15/AD-30); histórico não concede acesso (análogo SC-2105); deny-by-default.
- **Riscos:** MÉDIO. Enumeração mitigada por 404 uniforme; vazamento de coluna futura mitigado por allowlist explícita.

## Veredito

**APROVADO.** Pré-condições satisfeitas; sem bloqueio. Segue para `safe-implementation`.
