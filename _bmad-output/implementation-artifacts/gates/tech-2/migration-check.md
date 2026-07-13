# migration-check — tech-2 (provisionamento de tenant)

## Aplicabilidade
**N/A — a tech-2 não cria, altera nem remove nenhuma migration/DDL.**

## Verificação
- Sem `CREATE/ALTER/DROP TABLE`, sem nova policy de RLS, sem novo GRANT, sem alteração de enum.
- A rotina apenas **insere linhas** (DML) em tabelas já existentes (`Organization`, `Account`,
  `Membership`, `AuthCredential`), com o contexto de RLS correto e pelo papel `migrator`.
- O `schema.prisma` **não** muda; o `generated/prisma` **não** é regenerado.

## Veredito
**N/A / APROVADO** — sem superfície de migration. Nada a versionar em `prisma/migrations` nem em
`prisma/rollback`.
