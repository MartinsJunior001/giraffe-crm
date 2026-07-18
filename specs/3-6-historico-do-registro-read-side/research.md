# Research — Story 3.6

## context7-check

- **Prisma 6.19.3** (`package.json`): `findMany` com `cursor`/`skip`/`take`/`orderBy` composto e `select` (projeção)
  — API estável já usada no read-side do Kanban (2.9) e do Histórico do Card (2.17). Sem novidade de assinatura; a
  paginação por cursor determinístico `[createdAt, id]` já é o padrão consolidado da base. Nenhuma consulta raw é
  necessária (diferente da 3.5, que precisava de `orderBy` sobre path JSON) — o Histórico ordena por colunas nativas
  (`createdAt`, `id`).
- **NestJS 11**: `@Controller`/`@Get`/`@Param`/`@Query` + decorator `@Requer` (CASL grosso). Padrão idêntico ao
  `card-history.controller.ts`.
- Fonte primária: documentação oficial do Prisma Client (cursor pagination) e o código já em produção na base
  (`card-history-read.service.ts`). Não há divergência entre a doc atual e o plano.

## Precedentes na base (reuso, não reinvenção)

- `apps/api/src/pipes/cards/history/card-history-read.service.ts` — molde direto (allowlist, cursor +1, teto 100,
  `exigirLerCard`). A 3.6 troca o gate para `exigirLerDatabase` e a tabela para `recordHistory`.
- `apps/api/src/databases/database-authz.ts` — `exigirLerDatabase` (404 não-enumerante) já existe (3.2).
- `apps/api/src/databases/records/records.controller.ts` — prefixo de rota `databases/:databaseId/records/...`.
- `apps/api/src/pipes/cards/kanban.dto.ts` — `parseCursor`/`parseLimite` (a copiar para `databases/`, sem acoplar).

## Decisões

- **Rota** sob `databases/:databaseId/records/:recordId/history` (não resolver `databaseId` a partir do Record): o
  prefixo já carrega o Database, a autz fica direta e reconferimos que o Record pertence ao Database (404 se não).
- **Sem raw**: colunas nativas ordenam; sem risco de injeção; `findMany` basta.
- **Projeção**: `SELECT_EVENTO = { id, type, summary, actorId, createdAt }`; mapear `createdAt → occurredAt`.
