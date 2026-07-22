# context7-check — Story 8.4

Baseline: `package.json`/lockfile — Prisma 6.19.3, NestJS 11, Better Auth ~1.6.23.

## Prisma (`/prisma/web`, via MCP Context7)
Consulta: "interactive transaction $transaction async callback with $queryRaw SELECT FOR UPDATE row lock,
Prisma.sql tagged template parameterization". Confirmado:
- **Interactive transaction** `await prisma.$transaction(async (tx) => { … })` para read-modify-write com
  lógica entre operações — usado no serviço (lock → reléitura → guarda otimista → evento).
- **`$queryRaw` tagged template** com binding parametrizado (`${var}`) — usado no `SELECT id FROM
  "Organization" WHERE id = ${orgId}::uuid FOR UPDATE`. Parâmetro é bind, não concatenação.
- **`SELECT … FOR UPDATE`** é o padrão recomendado de row-lock no Postgres (doc confirma FOR UPDATE / SKIP
  LOCKED). Runtime tem `SELECT,UPDATE ON Organization` → privilégio suficiente.
- Opção `isolationLevel`/`timeout` existe se necessário (não foi preciso — o lock serializa).

## Better Auth
Reuso do `StepUpService` (Story 1.12), que encapsula `auth.api.getSession` e `auth.api.verifyPassword`
(1.6.23) — já validado e testado na 1.12. Nenhuma API do Better Auth chamada diretamente na 8.4.

## NestJS 11
Decorators `@Controller/@Patch/@Param/@Body/@Req`, `@Requer` (guard do projeto), DI por construtor —
padrões já usados em todo o `apps/api`. Sem API nova.

**Conclusão:** nenhuma assinatura inventada; o padrão de tx/lock/parametrização bate com a doc atual.
