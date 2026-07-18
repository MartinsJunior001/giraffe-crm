#!/usr/bin/env bash
#
# reconcile-app-role.sh — Reconciliação de BOOTSTRAP do giraffe_app no STAGING, para o mesmo volume
# antigo que não executou `00-roles.sql`. Reproduz FIELMENTE a parte do giraffe_app da fonte
# autoritativa `apps/api/prisma/bootstrap/00-roles.sql`:
#
#   • CREATE ROLE giraffe_app LOGIN     (SOMENTE se ausente)
#   • ALTER ROLE ... LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT + senha APP_PASSWORD
#   • GRANT CONNECT ON DATABASE giraffe TO giraffe_app
#   • GRANT USAGE   ON SCHEMA public   TO giraffe_app
#
# NÃO concede DML/DDL (isso é da migration) e NÃO é dono de tabela (AD-6). NÃO toca giraffe_migrator,
# postgres, Chatwoot nem produção. NÃO migra, NÃO provisiona. IDEMPOTENTE POR ASPECTO (cada mudança só
# se o estado divergir; 2ª execução não altera nada). Senha nunca em `ps`/log/arquivo (env herdado +
# `\getenv` + `SET log_statement='none'`). Fail-closed na revalidação.
#
# Este é o passo autorizado SÓ APÓS a falha comprovada do runtime (P3018 `role "giraffe_app" does not
# exist` na migration inicial).
#
# Uso:  bash scripts/ops/l6/reconcile-app-role.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"

stop() { echo "STOP: $*" >&2; exit 1; }
container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
grep -qE '^APP_PASSWORD=.+' "${ENVF}" || stop "APP_PASSWORD ausente/vazio no .env — não reconciliar às cegas"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
psql_do() { docker exec "${CT_DB}" psql -U postgres -d giraffe -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }

MUDOU=0

# 1) CRIAR somente se ausente.
if [ "$(q "select count(*) from pg_roles where rolname='giraffe_app'")" != "1" ]; then
  psql_do "CREATE ROLE giraffe_app LOGIN"
  echo "papel giraffe_app CRIADO (estava ausente)"
  MUDOU=1
fi

# 2) ATRIBUTOS: LOGIN + NOSUPERUSER + NOBYPASSRLS + NOCREATEDB + NOCREATEROLE + NOINHERIT
#    ⇒ (canlogin,super,bypassrls,createdb,createrole,inherit) = t,f,f,f,f,f
ATTR=$(q "select left(rolcanlogin::text,1)||left(rolsuper::text,1)||left(rolbypassrls::text,1)||left(rolcreatedb::text,1)||left(rolcreaterole::text,1)||left(rolinherit::text,1) from pg_roles where rolname='giraffe_app'")
if [ "${ATTR}" != "tfffff" ]; then
  psql_do "ALTER ROLE giraffe_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT"
  echo "atributos reconciliados (${ATTR} -> tfffff)"
  MUDOU=1
fi

# 3) GRANTs de acesso (não-DML): CONNECT no database, USAGE no schema public. Idempotentes por checagem.
if [ "$(q "select has_database_privilege('giraffe_app','giraffe','CONNECT')")" != "t" ]; then
  psql_do "GRANT CONNECT ON DATABASE giraffe TO giraffe_app"
  echo "GRANT CONNECT ON DATABASE giraffe -> giraffe_app"
  MUDOU=1
fi
if [ "$(q "select has_schema_privilege('giraffe_app','public','USAGE')")" != "t" ]; then
  psql_do "GRANT USAGE ON SCHEMA public TO giraffe_app"
  echo "GRANT USAGE ON SCHEMA public -> giraffe_app"
  MUDOU=1
fi

# 4) SENHA (APP_PASSWORD): só (re)aplica se a auth SCRAM pela rede real falhar. Nunca exposta.
IPDB=$(docker exec "${CT_DB}" hostname -i | awk '{print $1}')
auth_ok() {
  ( P=$(sed -n 's/^APP_PASSWORD=//p' "${ENVF}" | head -1)
    [ -n "${P}" ] || exit 1
    export PGPASSWORD="${P}"
    docker exec -e PGPASSWORD "${CT_DB}" psql -U giraffe_app -d giraffe -h "${IPDB}" -tAc 'select 1' >/dev/null 2>&1 )
}
if ! auth_ok; then
  APP_PASSWORD_SRC=$(sed -n 's/^APP_PASSWORD=//p' "${ENVF}" | head -1)
  [ -n "${APP_PASSWORD_SRC}" ] || stop "senha lida vazia"
  export APP_PASSWORD_SRC
  docker exec -i -e APP_PASSWORD_SRC "${CT_DB}" psql -U postgres -d giraffe -v ON_ERROR_STOP=1 <<'SQL'
SET log_statement = 'none';
\getenv p APP_PASSWORD_SRC
ALTER ROLE giraffe_app WITH LOGIN PASSWORD :'p';
SQL
  unset APP_PASSWORD_SRC
  echo "senha do giraffe_app (re)aplicada a partir do .env"
  MUDOU=1
fi

# 5) REVALIDAÇÃO final (fail-closed).
ROLE_FINAL=$([ "$(q "select count(*) from pg_roles where rolname='giraffe_app'")" = "1" ] && echo sim || echo nao)
ATTR_FINAL=$(q "select left(rolcanlogin::text,1)||left(rolsuper::text,1)||left(rolbypassrls::text,1)||left(rolcreatedb::text,1)||left(rolcreaterole::text,1)||left(rolinherit::text,1) from pg_roles where rolname='giraffe_app'")
if auth_ok; then AUTH=AUTH_OK; else AUTH=AUTH_FAIL; fi
echo "ROLE_EXISTE=${ROLE_FINAL}  ATRIBUTOS=${ATTR_FINAL}(esperado tfffff)  AUTENTICACAO=${AUTH}"
[ "${ROLE_FINAL}" = "sim" ] && [ "${ATTR_FINAL}" = "tfffff" ] && [ "${AUTH}" = "AUTH_OK" ] \
  || stop "reconciliação incompleta — ROLE_OK/atributos/AUTH_OK não satisfeitos (fail-closed)"

if [ "${MUDOU}" = "0" ]; then
  echo "RECONCILE_OK (idempotente — nada a alterar; ROLE_OK + AUTH_OK)"
else
  echo "RECONCILE_OK (aplicado; ROLE_OK + AUTH_OK). Próximo: recuperar a migration falha e repetir o migrate."
fi
