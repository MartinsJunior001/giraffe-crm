# context7-check — Story 8.6

**Status: APROVADO.** Baseline: Prisma 6.19.3, Better Auth ~1.6.23, NestJS 11 (conforme `package.json`/
lockfile). Fonte: MCP Context7 `/prisma/web` (redirecionado de `/prisma/docs`).

## Consultas e achados

- **Raw SQL em migration (REVOKE, ALTER TYPE ADD VALUE):** a doc confirma que migrations podem conter SQL
  bruto arbitrário (DDL/DML) editado à mão no `migration.sql` ("Customizing migrations", "Update data
  using raw SQL in Prisma migrations"). `REVOKE`/`GRANT` e `ALTER TYPE … ADD VALUE` são DDL padrão do
  PostgreSQL — não são API do Prisma. Confirmado o padrão já usado em 8.5 (ADD VALUE).
- **ALTER TYPE ADD VALUE sob o wrapper transacional do Prisma:** a restrição do PostgreSQL 16 é **usar** o
  valor recém-criado na MESMA transação, não **criá-lo**. Esta migration só adiciona `REMOVED` (não o usa)
  e faz um `REVOKE` — seguro. `IF NOT EXISTS` torna o replay idempotente.
- **Interactive `$transaction(async (tx) => …)` com read-modify-write e `SELECT … FOR UPDATE`:** a doc
  ("Interactive Transactions with Complex Logic") confirma o padrão de ler, decidir e escrever dentro do
  callback — exatamente o lock+recount de D-2. `FOR UPDATE` é lock de linha padrão do PG.
- **Better Auth 1.6.23 / NestJS 11:** nenhuma API nova consumida — o step-up (verifyPassword/getSession)
  e os decorators/guard são reusados sem alteração (8.4/8.5/1.12). Nada a verificar além do já validado.

**Divergência com o plano/arquitetura:** nenhuma. Assinaturas e construtos usados batem com a doc atual.
