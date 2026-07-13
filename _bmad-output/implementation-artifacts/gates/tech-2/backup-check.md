# backup-check — tech-2 (provisionamento de tenant)

## Superfície
A rotina apenas **cria** linhas (Organization/Account/Membership/AuthCredential). **Sem DDL**, sem
alteração de schema, sem destruição de dados.

## Risco de perda de dados
- **Nenhum.** A rotina não apaga nem sobrescreve nada: é idempotente e **não** sobrescreve credencial
  existente. Uma 2ª execução é um no-op seguro.
- Não há migration nova → nada a reverter em `prisma/migrations`/`prisma/rollback`.

## Reversão do 1º tenant (procedimento manual controlado)
Se for necessário desfazer um provisionamento (ex.: dado de teste em staging), o procedimento é manual,
com o papel **migrator**, e **com contexto de RLS**:

1. `SELECT set_config('app.current_org_id', '<orgId>', true);` (numa transação)
2. `DELETE FROM "Membership" WHERE "orgId" = '<orgId>';`
3. `DELETE FROM "Organization" WHERE "id" = '<orgId>';`
4. Fora do contexto (Account é global): `DELETE FROM "AuthCredential" WHERE "userId" = '<accountId>';`
   e `DELETE FROM "Account" WHERE "id" = '<accountId>';`

O `orgId` é **determinístico** a partir do slug (`idOrganizacaoParaSlug(slug)`), então é reproduzível
sem consultar o banco. O teste de integração usa exatamente esse procedimento no `afterAll` (limpeza).

**Decisão (Constitution II):** **não** implementar um "desprovisionamento" automático — não há consumidor
concreto; a reversão é operação rara de ops, documentada aqui.

## Backup
Provisionar o 1º tenant é uma operação de ops pontual. A política de backup do banco (L6 — recuperação)
cobre o estado resultante; a rotina não altera essa política nem a estratégia de restore.

## Veredito
**APROVADO** — a rotina só cria, é idempotente e não sobrescreve; sem risco de perda de dados; reversão
manual documentada; sem migration a reverter.
