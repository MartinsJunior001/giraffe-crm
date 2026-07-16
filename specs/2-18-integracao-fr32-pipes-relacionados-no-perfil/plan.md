# Plano — Integração FR-32: Pipes relacionados no Perfil (Story 2.18)

## Contexto técnico

- **Stack:** NestJS 11 · Prisma 6 · PostgreSQL 16 · Vitest 4. Read-side puro; **sem migration, sem GRANT novo**. Reusa `PipesService`/`PipeGrant`/`Membership` (2.1/2.2).

## Serviço

- `PipesService.listarRelacionados(): PipeRelacionadoVisao[]`:
  - Admin da Org (`contexto.papel === 'ADMIN'`) → `pipe.findMany` (todos, ordenados por `createdAt`), poder `gerenciar`.
  - Não-Admin → `membershipIdAtual`; `pipeGrant.findMany({ membershipId, state: 'ACTIVE' })` com o Pipe relacionado; papel efetivo do `role`. Sem grants → `[]`.
  - Projeção `{ id, name, state, poder }` (`orgId` fora da fronteira).
- Helper `poderDoRole(role): Poder` (`ADMIN→gerenciar`, `MEMBER→operar`, `VIEWER→ler`), espelhando `resolverPoderNoPipe`.

## Controller

- `GET /pipes/related` em `PipesController`, `@Requer('ler','Pipe')`, declarada **antes** de `@Get(':id')` (evita colisão com o param no Express).

## Testes (PostgreSQL real)

- `pipes-related-http.test.ts`: Admin vê todos com `gerenciar`; VIEWER-concedido vê só o seu com `ler`; sem grant → `[]`; Pipe sem acesso não aparece e segue **404** em `GET /pipes/:id` (CA3, listar não concede); `orgId` não vaza.

## Gates

`pre-implementation-check` · `security-check` · `observability-check` · `commit-check`. CI serial em runner limpo = gate autoritativo da suíte cheia.
