# Research — Story 3.4 (context7-check + análise de reuso)

## Verificação documental (context7-check — Constitution, gate obrigatório)

Baseline de versões: `package.json`/lockfile — Prisma 6.19.3, NestJS 11, PostgreSQL 16.

- **Prisma — transação interativa + P2002:** confirmado no Context7 (`/prisma/web`) que o tratamento de violação
  de unicidade se dá por `Prisma.PrismaClientKnownRequestError` com `code === 'P2002'` (409/retry). A base já
  possui o reconhecedor `isConflitoDePublicacao` (P2002 **e** P2028 — timeout/rollback de transação interativa),
  reusado por 2.6/2.7/2.8 e **verde no CI**. A 3.4 **reusa** esse reconhecedor; nenhuma assinatura nova.
- **Transação interativa sob contexto de tenant:** o `$transaction(async (tx) => …)` com contexto só roda no
  **client raiz** (`definirContextoOrg` em `tenant-context.ts`) — o client estendido recusa `$transaction`. Padrão
  estabelecido em 2.6/2.7/2.11; a 3.4 usa o mesmo primitivo. Sem API nova.
- **GRANT column-scoped + RLS + índice único parcial:** são **raw SQL** na migration (não API do Prisma) —
  Prisma 6.19.x não exprime GRANT nem índice parcial no schema. Padrão idêntico ao de 2.7 (índice de idempotência)
  e 2.11 (GRANT `UPDATE(coluna)`); confirmado no CLAUDE.md e nas migrations existentes.

**Conclusão do gate:** nenhuma tecnologia nova; todos os primitivos são reuso de padrões já verificados e verdes
em CI (2.6/2.7/2.11/3.1). Fonte: Context7 `/prisma/web` (P2002) + migrations/serviços existentes do repositório.

## Análise de reuso (o núcleo é platform-level)

| Peça a reusar | Origem | Como a 3.4 usa |
|---|---|---|
| `submission.ts` (validação pura contra snapshot) | 2.7 | valida `valores` do Registro contra o snapshot do Formulário de Database publicado (3.3) |
| padrão de `card-submission.service.ts` (tx interativa + INSERT dado + INSERT evento + idempotência) | 2.7 | criação do Registro + `RecordHistory(CREATED)` na mesma tx |
| `isConflitoDePublicacao` (P2002/P2028) | 2.6/2.7 | idempotência/409 na criação, nunca 500 |
| `card-lifecycle.transitions.ts` (núcleo puro) | 2.11 | espelho reduzido a 2 estados em `record-lifecycle.transitions.ts` |
| guarda otimista `updateMany where state=<lido>`→409 | 2.11 | arquivar/restaurar do Registro |
| `definirContextoOrg` (fonte única de contexto no client raiz) | 2.6 | todas as transações da 3.4 |
| resolução da `FormVersion` publicada (Formulário de Database) | 3.3 | resolver a versão vigente na criação |
| `database-authz` (`resolverPoderNoDatabase`) | 3.2 | novo `exigirOperarDatabase` (acorda MEMBER) |
| padrão RLS ENABLE+FORCE + WITH CHECK + `MODELOS_AUDITADOS` | 3.1/3.2 | `Record`/`RecordHistory` |
| padrão `DATABASE_ARQUIVADO` (somente-leitura sob arquivamento) | 3.1 | bloquear operação de Registro sob Database arquivado |

## Diferenças estruturais Card → Record

- **Sem `pipeId`/`phaseId`** (não percorre Fases). Dono = `databaseId`.
- **Sem `FINALIZADO`**: `RecordLifecycleState { ATIVO, ARQUIVADO }` (2 estados) → **sem** `previousLifecycleState`
  (restaurar sempre volta a ATIVO).
- **Idempotência por `[orgId, databaseId, idempotencyKey]`** (escopo por Database, não por Form).
- **GRANT column-scoped** amplia (vs. 2.11) para incluir `valores` (edição) além de `lifecycleState`/`updatedAt`;
  `databaseId`/`formVersionId`/`orgId`/`origin`/`idempotencyKey` seguem **sem** UPDATE (não transferível).
