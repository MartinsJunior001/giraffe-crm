# context7-check — Story 1.2

**Status: APROVADO**

Verificação documental das tecnologias efetivamente declaradas no projeto, antes de escrever
código. Baseline: o que está fixado em `package.json` / `pnpm-lock.yaml` / `docker-compose.yml`
— não o que a memória do modelo supõe.

| Tecnologia            | Versão no projeto | O que precisava ser confirmado |
| --------------------- | ----------------- | ------------------------------ |
| Prisma / `@prisma/client` | **6.19.2** (fixada, sem `^`) | API de Client Extensions (`$extends`, `Prisma.defineExtension`, `query.$allModels.$allOperations`); `output` obrigatório no generator (exigido no Prisma 7); comportamento de `$transaction([...])` |
| PostgreSQL            | **16** (`postgres:16-alpine`) | Semântica de `USING` vs `WITH CHECK`; `FORCE ROW LEVEL SECURITY`; `set_config(..., is_local)`; bypass de row security por ações referenciais (cascade) e por constraints únicas |
| NestJS                | **11**            | `OnModuleDestroy`, `enableShutdownHooks`, injeção do `Logger` do `nestjs-pino` (módulo `@Global`) |

## Achados que mudaram a implementação

1. **A documentação oficial do Prisma sobre RLS sugere uma `bypass_rls_policy`.** É
   explicitamente **proibida** pelo AD-6 e **não** foi adotada. Seguir o exemplo oficial teria
   introduzido um caminho de bypass alcançável em runtime.

2. **`USING` não protege `INSERT`.** Só `WITH CHECK` protege. Uma policy escrita apenas com
   `USING` aceitaria um `INSERT` com `orgId` alheio — e a linha ficaria invisível para quem a
   inseriu, o que faz o bug parecer "funcionando". As policies são separadas por operação por
   causa disso.

3. **Ações referenciais (`ON DELETE CASCADE`) rodam com bypass de row security.** Documentado
   no PostgreSQL. Foi o que transformou o `GRANT DELETE` em `Account` (tabela sem RLS) num
   caminho de escrita cross-tenant — ver `security-check`, achado S2.

4. **Constraints únicas também não passam por policy.** Daí o oráculo de existência via
   `Organization.slug` / `Account.email` — registrado como risco aceito.

5. **`set_config(..., true)`** é transaction-local. Com `false`, o contexto persiste na
   **conexão**, que volta ao pool. Este é o vazamento clássico de RLS com pool, e é silencioso.
   Há teste dedicado.

## Fonte

MCP do Context7 (`resolve-library-id` → `query-docs`) para Prisma e NestJS; documentação
oficial do PostgreSQL 16 (capítulo de Row Security Policies) para os pontos 2, 3 e 4 — que são
comportamento do banco, não de biblioteca.

Nenhuma assinatura, opção de configuração ou versão foi inventada. Onde a documentação oficial
contradisse o plano (ponto 1), a divergência foi registrada e a decisão de arquitetura
prevaleceu sobre o exemplo do fornecedor.
