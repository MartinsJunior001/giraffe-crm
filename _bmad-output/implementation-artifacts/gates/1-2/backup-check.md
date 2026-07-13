# backup-check — Story 1.2

**Status: APROVADO**

AD-33 é explícito: **backup concluído não prova recuperabilidade**. O que prova é um restore
testado. Foi o que se fez — e não só do schema: o restore foi verificado quanto ao
**isolamento**, que é o que esta Story entrega.

## Procedimento executado

```bash
pg_dump -U postgres -d giraffe -Fc -f /tmp/g.dump      # 14.960 bytes
dropdb --if-exists giraffe_restore
createdb -O giraffe_migrator giraffe_restore
pg_restore -U postgres -d giraffe_restore /tmp/g.dump  # RESTORE OK, sem erro
```

## O que sobreviveu ao restore

| Verificação                                   | Resultado |
| --------------------------------------------- | --------- |
| Policies                                      | **8** (todas) |
| `FORCE ROW LEVEL SECURITY`                    | `Organization` ✅ · `Membership` ✅ |
| `Account` sem RLS (correto — AD-10)           | ✅ |
| Organizações / Memberships / Accounts         | 3 / 4 / 4 |

## O isolamento continua valendo no banco restaurado

Um restore que traga as tabelas mas perca as policies seria pior que nenhum backup — daria a
sensação de recuperação com o isolamento desligado. Por isso as quatro provas abaixo foram
executadas **contra o banco restaurado**, com o papel `giraffe_app`:

| Cenário                                                     | Resultado |
| ------------------------------------------------------------ | --------- |
| Sem contexto: `SELECT count(*) FROM "Membership"`            | **0** — deny-by-default preservado |
| Contexto Org A + conta do Bruno (o caso que vazava)          | **só linhas da Org A** — a correção sobreviveu |
| `INSERT` de Membership com `orgId` da Org B, no contexto A   | `ERROR: new row violates row-level security policy` |
| `DELETE FROM "Account"` (papel de runtime)                    | `ERROR: permission denied for table Account` |

Ou seja: o backup restaura **os dados e as garantias**.

## Escopo e limites (honestos)

- O que foi exercitado é o backup **lógico** (`pg_dump -Fc`) de um banco de desenvolvimento,
  em container. É o que existe hoje.
- **Não** foi exercitado: PITR, backup gerenciado do provedor, agendamento, retenção,
  criptografia em repouso, ou restore em ambiente separado de produção. Nada disso existe
  ainda — não há ambiente de produção. Fica para a Story/etapa de infraestrutura, e está
  registrado aqui em vez de ser presumido resolvido.
- O dump **contém PII** (`Account.email`). Hoje são dados fictícios de seed. Quando houver dado
  real, o artefato de backup passa a ser um ativo com PII e precisa de tratamento compatível
  (criptografia, controle de acesso, retenção) — registrado no `lgpd-check`.

## Limpeza

O banco de restore e o arquivo de dump foram removidos ao final. Nenhum artefato temporário
ficou no volume.
