# Plan — Story 3.6 — Histórico do Registro (read-side)

## Abordagem

Espelhar o read-side do Histórico do Card (2.17) no domínio de Registro. Read-side puro: **zero** migration/GRANT.

## Componentes

1. **`record-history.dto.ts`** (novo) — `parseCursor(unknown): string | null` e `parseLimite(unknown): number`
   (default 50; teto aplicado no serviço). Validação manual sanitizada (Constitution II — sem class-validator),
   espelho de `kanban.dto.ts`. Mantém `databases/` desacoplado de `pipes/`.

2. **`record-history-read.service.ts`** (novo) — `RecordHistoryReadService`:
   - `verHistorico(databaseId, recordId, cursor, limite): Promise<PaginaHistorico>`.
   - `exigirLerDatabase(db, contexto, databaseId)` → 404 não-enumerante sem acesso.
   - Reconferir Registro ∈ Database: `db.record.findFirst({ where: { id: recordId, databaseId }, select: { id: true } })` → 404 se null (não-enumerante; cobre Record inexistente/de outra Org via RLS).
   - `db.recordHistory.findMany({ where: { recordId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: SELECT_EVENTO, take: min(max(limite,1),100)+1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })`.
   - Projeção allowlist → `{ id, type, summary, actorId, occurredAt }`; `proximoCursor` = id do último se houver +1.

3. **`record-history.controller.ts`** (novo) — `@Controller('databases/:databaseId/records/:recordId')`,
   `@Requer('ler','Database')`, `@Get('history')`. `validarIdRota` para `databaseId`/`recordId`; `parseCursor`/`parseLimite`.

4. **`databases.module.ts`** — registrar `RecordHistoryController` + `RecordHistoryReadService`.

## Segurança

- Autorização por acesso atual (gate = Database dono); histórico não concede acesso.
- Projeção allowlist: `orgId`/`recordId` fora; sem binário/chave/URL (não existem em `RecordHistory`; a allowlist
  blinda futuras colunas de arquivo em 3.8).
- RLS por `withTenantContext`; nenhum `where orgId` manual.

## Testes

- `record-history-read-rls.test.ts`: cross-tenant invisível (Registro de outra Org → 404/0 eventos); contagem
  escopada ao Registro visível.
- `record-history-read-http.test.ts`: AC1 (timeline), AC2 (projeção sem `orgId`/`recordId`), AC3 (404 sem acesso),
  AC4 (ator sem acesso atual → 404), AC5 (correção append-only visível — dois eventos), AC6 (cursor + teto), AC7
  (isolamento por Org).

## Gates de conclusão

typecheck/lint/format; testes-alvo em PostgreSQL real; regressão 3.4/3.5; suíte serial; SC-206 N/A (sem migration);
security/observability/lgpd-check; migration/backup-check N/A.
