-- ============================================================================
-- BOOTSTRAP DE PAPÉIS — pré-requisito das migrations (AD-6).
--
-- Executado por um papel ADMINISTRATIVO (superusuário, ou `rds_superuser` e
-- equivalentes em banco gerenciado). Nem `giraffe_migrator` nem `giraffe_app`
-- conseguem executá-lo: criar papel exige privilégio administrativo. Por isso
-- este passo NÃO é uma migration do Prisma — é bootstrap de infraestrutura, e
-- fica versionado aqui, ao lado das migrations, em vez de existir apenas dentro
-- do entrypoint do container.
--
-- O `docker-entrypoint-initdb.d` roda UMA única vez, e só quando o diretório de
-- dados está vazio. Depender só dele significava: volume preexistente, banco
-- gerenciado ou qualquer PostgreSQL não criado por este Compose ficavam SEM os
-- papéis — e a migration, que faz `GRANT ... TO giraffe_app`, morria com
-- `role "giraffe_app" does not exist`. Este arquivo é o mesmo em todos os
-- ambientes; o que muda é quem o executa.
--
-- É IDEMPOTENTE: rodar de novo não falha e reaplica senha e atributos (o que
-- torna a rotação de credencial um replay deste script, não um procedimento à
-- parte).
--
-- Uso:
--   psql -v ON_ERROR_STOP=1 \
--        --set=migrator_password="$MIGRATOR_PASSWORD" \
--        --set=app_password="$APP_PASSWORD" \
--        --set=db_name=giraffe \
--        -f apps/api/prisma/bootstrap/00-roles.sql
--
-- As senhas entram como variáveis do psql (`:'var'`), que as insere já entre
-- aspas e escapadas. Interpolar "$VAR" direto no SQL abriria injeção via senha.
-- Elas NUNCA têm valor padrão: credencial ausente deve falhar, não virar uma
-- senha conhecida e previsível.
-- ============================================================================

\if :{?migrator_password} \else \echo 'ERRO: defina -v migrator_password' \quit 1 \endif
\if :{?app_password}      \else \echo 'ERRO: defina -v app_password'      \quit 1 \endif
\if :{?db_name}           \else \echo 'ERRO: defina -v db_name'           \quit 1 \endif

-- Papel de MIGRATION: dono do schema. NUNCA usado para servir requisição.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'giraffe_migrator') THEN
    CREATE ROLE giraffe_migrator LOGIN;
  END IF;
END
$$;
ALTER ROLE giraffe_migrator WITH LOGIN PASSWORD :'migrator_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEROLE;

-- Papel de APLICAÇÃO (runtime).
--   NOSUPERUSER  — não é superusuário
--   NOBYPASSRLS  — NÃO pode contornar Row-Level Security (AD-6)
--   NOCREATEDB / NOCREATEROLE — sem privilégio administrativo
--   NOINHERIT    — não herda privilégio de papel do qual venha a ser membro
--
-- Também NÃO será dono de nenhuma tabela: o dono contorna as policies por padrão,
-- e é por isso que `FORCE ROW LEVEL SECURITY` sozinho não bastaria. As duas coisas
-- precisam valer juntas — há teste que verifica ambas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'giraffe_app') THEN
    CREATE ROLE giraffe_app LOGIN;
  END IF;
END
$$;
ALTER ROLE giraffe_app WITH LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

-- O migrator é dono do banco/schema; o app apenas se conecta.
ALTER DATABASE :"db_name" OWNER TO giraffe_migrator;
GRANT CONNECT ON DATABASE :"db_name" TO giraffe_app;

ALTER SCHEMA public OWNER TO giraffe_migrator;
GRANT USAGE ON SCHEMA public TO giraffe_app;

-- Sem privilégio de DDL para a aplicação. Os GRANTs de DML nas tabelas são
-- concedidos pela migration, junto com as policies — e são mínimos por decisão.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
