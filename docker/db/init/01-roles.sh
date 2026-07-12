#!/bin/bash
# Bootstrap de papéis — executado UMA vez pelo entrypoint do PostgreSQL, como superusuário,
# antes de qualquer migration (AD-6).
#
# Criar papel exige privilégio de superusuário; nem `giraffe_migrator` nem `giraffe_app`
# podem fazê-lo. Por isso este passo vive aqui, fora da migration: é bootstrap de
# infraestrutura, não evolução de schema.
#
# É um `.sh` e não um `.sql` porque as senhas vêm do AMBIENTE. Um `.sql` não interpola
# variáveis, e o resultado seria credencial fixa no repositório — sem caminho de override,
# a mesma senha previsível acabaria valendo em produção. Em produção os papéis são
# provisionados pelo cofre/infra (AD-31); os defaults abaixo servem só ao `compose up` local.
set -euo pipefail

MIGRATOR_PASSWORD="${MIGRATOR_PASSWORD:-giraffe_migrator_pw}"
APP_PASSWORD="${APP_PASSWORD:-giraffe_app_pw}"

# `--set` passa as senhas como variáveis do psql, e `:'var'` as insere já entre aspas e
# escapadas. Interpolar com "$VAR" direto no SQL abriria injeção via senha.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=migrator_password="$MIGRATOR_PASSWORD" \
  --set=app_password="$APP_PASSWORD" <<-'EOSQL'
    -- Papel de MIGRATION: dono do schema. NUNCA usado em requisição.
    CREATE ROLE giraffe_migrator LOGIN PASSWORD :'migrator_password';

    -- Papel de APLICAÇÃO (runtime).
    --   NOSUPERUSER  — não é superusuário
    --   NOBYPASSRLS  — NÃO pode contornar Row-Level Security (AD-6)
    --   NOCREATEDB / NOCREATEROLE — sem privilégio administrativo
    -- Também NÃO será dono de nenhuma tabela: o dono contorna RLS por padrão, e é por isso
    -- que `FORCE ROW LEVEL SECURITY` sozinho não bastaria.
    CREATE ROLE giraffe_app LOGIN PASSWORD :'app_password'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

    -- O migrator é dono do banco/schema; o app apenas se conecta.
    ALTER DATABASE giraffe OWNER TO giraffe_migrator;
    GRANT CONNECT ON DATABASE giraffe TO giraffe_app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname giraffe <<-'EOSQL'
    ALTER SCHEMA public OWNER TO giraffe_migrator;
    GRANT USAGE ON SCHEMA public TO giraffe_app;

    -- Sem privilégio de DDL para a aplicação. Os GRANTs de DML nas tabelas são concedidos
    -- pela migration, junto com as policies de RLS.
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EOSQL
