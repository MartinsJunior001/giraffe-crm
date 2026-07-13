# security-check — Story 1.2

**Status: APROVADO** (após a correção de 4 achados bloqueantes encontrados nesta rodada)

Executado em 2026-07-12, contra o código real e um PostgreSQL real. Todo comando abaixo foi
rodado; nenhum resultado é estimado.

## Achados BLOQUEANTES encontrados e corrigidos

### S1 — Vazamento cross-tenant na policy de leitura de `Membership` (CRITICAL)

A policy era `USING ("orgId" = current_org_id() OR "accountId" = current_account_id())`. Como
`withTenantContext` define **os dois** contextos na mesma transação (é o caminho de produção),
o ramo da conta casava com o vínculo dela em **outra** Organização.

Reproduzido antes da correção:

```
contexto: org=Org A, account=Bruno (membro de A e B)
SELECT id, "orgId" FROM "Membership";
 a1a1a1a1-...-0001 | aaaa... (Org A)
 a1a1a1a1-...-0002 | aaaa... (Org A)
 b1b1b1b1-...-0002 | bbbb... (Org B)   ← LINHA DE OUTRA ORGANIZAÇÃO
```

Corrigido para exclusão mútua: `"orgId" = current_org_id() OR (current_org_id() IS NULL AND
"accountId" = current_account_id())`. Havendo Organização ativa, ela é a única fronteira; o
ramo da conta só existe para o login, que ocorre **antes** de haver Org ativa.

Depois da correção, mesmo cenário: **só linhas da Org A**. E o login continua funcionando
(sem contexto de Org, a conta do Bruno descobre as suas 2 Organizações).

Regressão: `test/rls.test.ts` → "REGRESSÃO: com Org ativa, a conta NÃO arrasta os vínculos
dela em outras Organizações".

### S2 — Escrita cross-tenant por baixo da RLS via cascata de FK (CRITICAL)

`Account` é global e **sem RLS** (AD-10), e o papel de runtime tinha `GRANT DELETE` nela.
Ações referenciais do PostgreSQL (`ON DELETE CASCADE`) rodam com **bypass de row security** —
comportamento documentado. Logo, um `DELETE FROM "Account"` **sem contexto organizacional
nenhum** destruía Memberships em todas as Organizações.

Reproduzido antes da correção (como `giraffe_app`, sem contexto):

```
antes:  Org A = 2 memberships | Org B = 2 memberships
DELETE FROM "Account" WHERE id = <bruno>;   → DELETE 1
depois: Org A = 1 membership  | Org B = 1 membership   ← destruição cross-tenant
```

Corrigido: `GRANT SELECT ON "Account"` apenas. Verificado: `ERROR: permission denied for
table Account`.

### S3 — Runtime podia criar/apagar `Organization` (HIGH)

A Story documenta que o papel de runtime **não** cria Organizações. A policy não impunha isso:
`org_insert` é `WITH CHECK ("id" = current_org_id())`, **auto-satisfazível** — basta definir o
contexto com o UUID que a linha nova vai receber. Reproduzido: `INSERT 0 1`.

Corrigido: `GRANT SELECT, UPDATE ON "Organization"`. Verificado: `ERROR: permission denied`.

### S4 — Credencial padrão insegura no Compose (MEDIUM, mas viola Constitution VI)

`${POSTGRES_PASSWORD:-postgres}`, `${MIGRATOR_PASSWORD:-giraffe_migrator_pw}`,
`${APP_PASSWORD:-giraffe_app_pw}`: um ambiente sem a variável não falhava — subia com senha
conhecida e versionada. Trocado por `${VAR:?}` (falha honesta, dizendo qual falta).

## Verificações executadas

### Papéis de banco

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
  FROM pg_roles WHERE rolname LIKE 'giraffe%';
```

```
     rolname      | rolsuper | rolbypassrls | rolcreatedb | rolcreaterole
------------------+----------+--------------+-------------+---------------
 giraffe_migrator | f        | f            | f           | f
 giraffe_app      | f        | f            | f           | f
```

O papel de runtime **não** é superusuário e **não** tem `BYPASSRLS`. Coberto por teste.

### Propriedade das tabelas

```
   relname    |       dono       | current_user
--------------+------------------+--------------
 Account      | giraffe_migrator | giraffe_app
 Organization | giraffe_migrator | giraffe_app
 Membership   | giraffe_migrator | giraffe_app
```

O dono de uma tabela ignora as policies por padrão; `FORCE RLS` remove esse privilégio. As
duas barreiras valem juntas, e **as duas** são testadas (antes, só o `FORCE` era).

### Privilégio mínimo (o `GRANT` como fronteira de segurança)

```
  table_name  |         privilegios
--------------+-----------------------------
 Account      | SELECT
 Membership   | DELETE,INSERT,SELECT,UPDATE
 Organization | SELECT,UPDATE
```

### Ausência de bypass (AD-6)

`grep -ri "bypass" apps/api/prisma apps/api/src` → nenhuma policy, flag ou caminho de bypass.
O exemplo oficial do Prisma sugere uma `bypass_rls_policy`; ela é **proibida** aqui e não
existe. `FORCE ROW LEVEL SECURITY` está ativo em `Organization` e `Membership`.

### Segredos

- `.env` não é versionado (`.gitignore`); só `.env.example`, sem valores reais.
- `.dockerignore` exclui `**/.env` e `**/.env.*` (exceto `.env.example`) em qualquer profundidade.
- Log da API durante indisponibilidade do banco: `grep -ciE "giraffe_app_pw|postgresql://|password"` → **0 ocorrências**.
- Payload de `/ready` com o banco fora: `{"message":"Service Unavailable","statusCode":503}` —
  sem host, porta, usuário ou stack.
- O runtime **não** recebe `MIGRATION_DATABASE_URL` (o Compose não a passa ao serviço `api`, e
  o schema Zod do runtime não a conhece — há teste que exige a ausência).

### Porta do banco

`127.0.0.1:5434:5432` — não exposta à rede local. Sem o bind explícito, o Docker publicaria em
`0.0.0.0`.

### Container

Usuário **não-root** (`USER node`), sem `.env` na imagem, multi-stage com stage de deps de
produção separado.

## Ressalva registrada (não bloqueante)

Constraints únicas **atravessam a RLS** — é comportamento documentado do PostgreSQL. Como
`Organization.slug` e `Account.email` são únicos globais, um `P2002` confirma que aquele
valor existe em algum lugar da plataforma (sem revelar onde). É um oráculo de existência, não
um vazamento de dados. Fechar isso exige unicidade por Organização ou hashing — decisão que
pertence à Story do cadastro. Registrado no README ("Riscos conhecidos e aceitos").
