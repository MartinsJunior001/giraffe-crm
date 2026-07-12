# Implementation Plan: Modelo multi-tenant e isolamento por RLS (Story 1.2)

**Branch**: `story/1-2-modelo-multi-tenant-e-isolamento-por-rls` · **Date**: 2026-07-12 · **Spec**: `./spec.md`
**Mode**: greenfield sobre a base da Story 1.1 (`done`). Nenhum código escrito nesta fase.

## Summary

Primeira persistência do produto. Entrega o esquema de identidade e tenancy (`Account` global, `Organization`, `Membership` com papel único e estado), o contexto de tenant transaction-local no PostgreSQL, e políticas RLS deny-by-default com `FORCE ROW LEVEL SECURITY`, papéis de banco separados e aplicação **sem** `BYPASSRLS`. Prova o isolamento com testes positivos e negativos contra PostgreSQL real.

## Technical Context

- **Banco**: PostgreSQL (versão a fixar no `context7-check`), compartilhado, RLS como reforço.
- **ORM**: Prisma (versão a fixar) — schema, client e migrations **dentro de `apps/api`**.
- **Contexto**: `set_config('app.current_org_id', …, true)` e `set_config('app.current_account_id', …, true)` — **transaction-local**.
- **Injeção do contexto**: Prisma Client Extension que executa o `set_config` **na mesma transação** da query.
- **Testes**: Vitest (Story 1.1) contra **PostgreSQL real**. RLS não existe em mock — teste com mock é mentira sobre isolamento.
- **Reuso da Story 1.1**: kernel `config/env.ts` (Zod, fail-fast sanitizado), Pino com redaction, `tsconfig` que type-checa testes, `commit-check`.

## Constitution Check

| Princípio | Situação | Nota |
|---|---|---|
| I. Processo antes de código | ✅ | BMAD (Story validada) → Spec Kit → Implementação. Ordem respeitada — corrigindo o desvio da 1.1. |
| II. Só Story aprovada; sem antecipar | ✅ | Só `Account`/`Organization`/`Membership`. Nenhuma entidade de domínio; nenhum `packages/` especulativo. |
| III. Stack canônica + TS estrito | ✅ | PostgreSQL/Prisma do Stack Seed; versões via `context7-check`. |
| IV. Isolamento tenant + deny-by-default | ✅ **é o objeto da Story** | RLS + `FORCE` + app sem `BYPASSRLS` + sem contexto ⇒ negado. |
| V. Account+Membership; distinções | ✅ | Forma B (AD-7). Super Admin ≠ Admin da Org (INV-ADMIN-01) preservado. |
| VI. Segurança/segredos fail-closed | ✅ | Papéis separados; string de conexão nunca em log; sem bypass. |
| VII. Observabilidade sanitizada | ✅ | Organização no log; negação visível; sem PII nem senha. |
| VIII. Fonte única, migração/backup | ✅ | `state` é a fonte única (sem `deletedAt` paralelo); migration controlada com rollback; `backup-check` deixa de ser N/A. |
| IX. LGPD/minimização | ⚠ **primeira PII** | `Account.email` é dado pessoal. `lgpd-check` obrigatório. |
| X. Testes + gates | ✅ | Positivos + negativos contra PG real; `migration-check`/`backup-check` ativados. |
| XI. Preservar artefatos + invariantes | ✅ | Nenhum artefato autoritativo alterado. |

**Resultado**: PASS. Uma atenção material: **IX (LGPD)** — esta é a primeira Story com dado pessoal (`email`), então o `lgpd-check` sai de N/A e passa a ser obrigatório.

## Decisões técnicas

### D1 — Políticas RLS por operação (não uma policy genérica)

`USING` filtra linhas **existentes** (SELECT/UPDATE/DELETE). `WITH CHECK` valida linhas **novas/modificadas** (INSERT/UPDATE). Uma policy só com `USING` **aceita** um `INSERT` com `orgId` alheio — a linha entra e depois fica invisível. Portanto: policies explícitas por operação, com `WITH CHECK` em toda escrita.

### D2 — `Membership` legível pela própria conta (destrava o login da Story 1.4)

`SELECT`: `orgId = current_org **OR** accountId = current_account`.
`INSERT`/`UPDATE`/`DELETE`: `orgId = current_org`.

Sem nenhum dos dois contextos, ambos os lados são `NULL` → negado. Não vaza nada (a conta vê apenas o que é dela) e evita que a Story 1.4 descubra, tarde, que não consegue listar as Organizações do usuário.

### D3 — Dois papéis de banco

- `giraffe_migrator`: dono do schema, executa migrations. **Nunca** em requisição.
- `giraffe_app`: runtime. Sem `BYPASSRLS`, sem `SUPERUSER`, **não proprietário** (o dono contorna RLS por padrão — por isso `FORCE` **e** não-propriedade, juntos).

Duas URLs de conexão distintas, ambas validadas no kernel de config com fail-fast.

### D4 — Nenhum caminho de bypass

O exemplo oficial do Prisma sugere `bypass_rls_policy` + `bypassRLS()`. **Rejeitado** — AD-6. Uma flag de bypass alcançável em runtime é a porta dos fundos que a Story existe para fechar.

### D5 — `/ready` passa a checar o banco

Apto → `200 {status:"ok"}`; indisponível → **503**. Payload **sem** campos extras (preserva o AC2 da Story 1.1). `/health` (liveness) não checa banco. Os testes cobrem **os dois** caminhos. Isso **quebra de propósito** o teste/smoke/healthcheck quando o banco cai — a correção certa é cobrir o 503, **não** afrouxar a asserção.

### D6 — Migration como etapa controlada

Versionada, aplicada pelo `giraffe_migrator` como passo separado (AD-32) — **não** no entrypoint do container. O SQL de RLS (policies, `FORCE`, `GRANT`, papéis) vive **na migration**, versionado, nunca aplicado à mão.

## Tratamento do CR2-09 (obrigatório)

**Risco herdado:** o runtime do `apps/api/Dockerfile` copia `/repo/node_modules` e `/repo/apps/api/node_modules`, assumindo que `@giraffe/api` não tem dependência interna de workspace. Com um `packages/`, o pacote interno vira symlink para `/repo/packages/<nome>` — que o estágio de runtime **nunca copia** → build verde, **boot com `MODULE_NOT_FOUND`**.

**Decisão: NÃO introduzir `packages/` nesta Story.** Prisma (schema, client, migrations) fica **dentro de `apps/api`**. Nada nesta Story exige contrato compartilhado com a Web — a Web não fala com o banco. Criar `packages/` aqui seria abstração sem consumidor concreto (Constitution II, AD-4).

**Portanto o CR2-09 permanece dormente — mas a Story não encerra sem provar que o container ainda sobe**, porque o Prisma muda a imagem de qualquer forma:

1. `prisma generate` executado **no build** da imagem;
2. client gerado **e binários de engine** presentes na imagem final (o engine é nativo e específico da plataforma — esquecê-lo produz exatamente um erro de runtime que o build não pega);
3. **teste real de boot do container de produção**, conectando ao banco com o papel `giraffe_app`;
4. `/ready` refletindo a dependência, verificado **no container**.

Isso é a lição direta dos findings F2/F8 da Story 1.1: **build verde não prova boot**.

**Cláusula de reabertura:** se, durante a implementação, a solução exigir um pacote interno de workspace, o **CR2-09 deve ser resolvido nesta Story** — proibido adiar de novo.

## Project Structure

```text
apps/api/
  prisma/schema.prisma            → Account, Organization, Membership
  prisma/migrations/              → DDL + RLS (policies, FORCE, GRANT, papéis) versionados
  prisma/seed.ts                  → duas Organizações (fixture de isolamento)
  src/kernel/config/env.ts        → + DATABASE_URL (app) e MIGRATION_DATABASE_URL
  src/kernel/db/                  → PrismaService + Client Extension (contexto na transação)
  src/health/                     → /ready passa a checar o banco (200 / 503)
  test/                           → isolamento (positivos + negativos), privilégios, /ready
docker-compose.yml                → serviço `db` (healthcheck, volume); api depends_on healthy
```

## Riscos

| Risco | Mitigação |
|---|---|
| Policy sem `WITH CHECK` → escrita cruzada silenciosa | Teste negativo de `INSERT` forjado é **obrigatório** (SC-102) |
| App como dono da tabela → bypass implícito | `FORCE` + papel não-proprietário; teste em `pg_roles` (SC-104) |
| Contexto global vazando no pool | `set_config(..., true)` + contexto dentro da transação; teste de reuso de conexão |
| Teste de RLS com mock → falso verde | PostgreSQL real obrigatório (SC-106) |
| Engine do Prisma ausente na imagem | Teste real de boot do container (SC-107) |
| `/ready` quebrando testes da 1.1 | Cobrir os dois caminhos; **não** afrouxar asserção |

## Complexity Tracking

Nenhuma complexidade além do mínimo. Sem `packages/`, sem entidade de domínio, sem CASL, sem sessão. O kernel ganha `db/` — que tem consumidor concreto imediato (AD-4).
