#!/usr/bin/env bash
#
# reconcile-migrator-role.sh — Reconciliação de BOOTSTRAP do giraffe_migrator no STAGING, para volumes
# que NÃO executaram `00-roles.sql` (o entrypoint do postgres só roda o initdb.d na 1ª criação; um
# volume pré-existente fica sem os papéis). Reproduz FIELMENTE a parte do giraffe_migrator da fonte
# autoritativa `apps/api/prisma/bootstrap/00-roles.sql` (chamada por `docker/db/init/01-roles.sh`):
#
#   • CREATE ROLE giraffe_migrator LOGIN     (SOMENTE se ausente)
#   • ALTER ROLE ... LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE   (sem superuser/BYPASSRLS — a fonte
#     não os concede) e a senha de MIGRATOR_PASSWORD
#   • ALTER DATABASE giraffe OWNER TO giraffe_migrator
#   • ALTER SCHEMA public   OWNER TO giraffe_migrator
#
# NÃO toca giraffe_app, postgres, Chatwoot nem produção (fora do escopo por decisão do dono). NÃO
# migra, NÃO provisiona. IDEMPOTENTE POR ASPECTO: cada mudança só é aplicada se o estado divergir;
# uma 2ª execução não altera nada e termina verde. A senha nunca aparece em `ps`/log/arquivo (env
# herdado + `\getenv` + `SET log_statement='none'`). Fail-closed na revalidação final.
#
# Uso:  bash scripts/ops/l6/reconcile-migrator-role.sh
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
grep -qE '^MIGRATOR_PASSWORD=.+' "${ENVF}" || stop "MIGRATOR_PASSWORD ausente/vazio no .env — não reconciliar às cegas"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
psql_do() { docker exec "${CT_DB}" psql -U postgres -d giraffe -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }

MUDOU=0

# 1) CRIAR somente se ausente (só LOGIN; atributos/senha vêm a seguir).
if [ "$(q "select count(*) from pg_roles where rolname='giraffe_migrator'")" != "1" ]; then
  psql_do "CREATE ROLE giraffe_migrator LOGIN"
  echo "papel giraffe_migrator CRIADO (estava ausente)"
  MUDOU=1
fi

# 2) ATRIBUTOS autoritativos: LOGIN + NOSUPERUSER + NOBYPASSRLS + NOCREATEROLE  ⇒ (canlogin,super,bypassrls,createrole) = t,f,f,f
ATTR=$(q "select left(rolcanlogin::text,1)||left(rolsuper::text,1)||left(rolbypassrls::text,1)||left(rolcreaterole::text,1) from pg_roles where rolname='giraffe_migrator'")
if [ "${ATTR}" != "tfff" ]; then
  psql_do "ALTER ROLE giraffe_migrator WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE"
  echo "atributos reconciliados (${ATTR} -> tfff)"
  MUDOU=1
fi

# 3) OWNERSHIP do database e do schema public.
if [ "$(q "select pg_get_userbyid(datdba) from pg_database where datname='giraffe'")" != "giraffe_migrator" ]; then
  psql_do "ALTER DATABASE giraffe OWNER TO giraffe_migrator"
  echo "owner do database giraffe -> giraffe_migrator"
  MUDOU=1
fi
if [ "$(q "select pg_get_userbyid(nspowner) from pg_namespace where nspname='public'")" != "giraffe_migrator" ]; then
  psql_do "ALTER SCHEMA public OWNER TO giraffe_migrator"
  echo "owner do schema public -> giraffe_migrator"
  MUDOU=1
fi

# 4) SENHA: só (re)aplica se a auth SCRAM pela rede real falhar. Senha nunca exposta.
IPDB=$(docker exec "${CT_DB}" hostname -i | awk '{print $1}')
auth_ok() {
  ( P=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
    [ -n "${P}" ] || exit 1
    export PGPASSWORD="${P}"
    docker exec -e PGPASSWORD "${CT_DB}" psql -U giraffe_migrator -d giraffe -h "${IPDB}" -tAc 'select 1' >/dev/null 2>&1 )
}
if ! auth_ok; then
  MIGRATOR_PASSWORD_SRC=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
  [ -n "${MIGRATOR_PASSWORD_SRC}" ] || stop "senha lida vazia"
  export MIGRATOR_PASSWORD_SRC
  docker exec -i -e MIGRATOR_PASSWORD_SRC "${CT_DB}" psql -U postgres -d giraffe -v ON_ERROR_STOP=1 <<'SQL'
SET log_statement = 'none';
\getenv p MIGRATOR_PASSWORD_SRC
ALTER ROLE giraffe_migrator WITH LOGIN PASSWORD :'p';
SQL
  unset MIGRATOR_PASSWORD_SRC
  echo "senha do giraffe_migrator (re)aplicada a partir do .env"
  MUDOU=1
fi

# 5) REVALIDAÇÃO final (fail-closed).
ROLE_FINAL=$([ "$(q "select count(*) from pg_roles where rolname='giraffe_migrator'")" = "1" ] && echo sim || echo nao)
ATTR_FINAL=$(q "select left(rolcanlogin::text,1)||left(rolsuper::text,1)||left(rolbypassrls::text,1)||left(rolcreaterole::text,1) from pg_roles where rolname='giraffe_migrator'")
if auth_ok; then AUTH=AUTH_OK; else AUTH=AUTH_FAIL; fi
echo "ROLE_EXISTE=${ROLE_FINAL}  ATRIBUTOS=${ATTR_FINAL}(esperado tfff)  AUTENTICACAO=${AUTH}"
[ "${ROLE_FINAL}" = "sim" ] && [ "${ATTR_FINAL}" = "tfff" ] && [ "${AUTH}" = "AUTH_OK" ] \
  || stop "reconciliação incompleta — ROLE_OK/atributos/AUTH_OK não satisfeitos (fail-closed)"

if [ "${MUDOU}" = "0" ]; then
  echo "RECONCILE_OK (idempotente — nada a alterar; ROLE_OK + AUTH_OK)"
else
  echo "RECONCILE_OK (aplicado; ROLE_OK + AUTH_OK). Próximo: repetir o migrate one-shot e exigir zero pendências."
fi
