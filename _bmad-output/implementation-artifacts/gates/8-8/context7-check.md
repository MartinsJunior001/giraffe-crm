# context7-check — Story 8.8

**Status: APROVADO.** Baseline: `apps/api/package.json` — `@prisma/client`/`prisma` **6.19.3**,
`@nestjs/common`/`@nestjs/core` **^11**.

## Prisma 6.19.3 — paginação por cursor (MCP Context7 `/prisma/web`)
- Confirmado o padrão usado: `findMany({ take, skip: 1, cursor: { <campoÚnico> }, orderBy: [ {occurredAt:
  'desc'}, {id:'desc'} ] })`. Best practice documentada: **incluir um campo único (id) como tiebreaker no
  sort e no cursor** para paginação estável sobre coluna não-única (timestamp). Bate exatamente com o
  desenho (`audit-read.service.ts`). Também confirmado: `orderBy` em **array** para ordenação multi-campo
  determinística.
- Fonte: docs `orm/prisma-client/queries/pagination` e `orm/.../reading-data` (Cursor-based pagination).

## NestJS 11
- `@Requer('administrar','Organizacao')` + `AuthzGuard` e `@Query()` para o objeto de query são padrões já
  em uso no repositório (`members.controller`, `record-history.controller`). Nenhuma API nova; sem risco de
  assinatura inventada.

## Divergência
- Nenhuma divergência entre a documentação e o plano. Nenhuma API inventada.
