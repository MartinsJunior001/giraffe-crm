#!/usr/bin/env bash
#
# diagnose-db-target.sh — READ-ONLY e SANITIZADO. Diagnostica o P2021 (`public."Account"` não existe)
# no reset: descobre se o reset/migrate/provision estão conectando ao MESMO destino de banco. NÃO
# imprime DSN, senha nem dados pessoais — só host/porta/database/schema, flags e contagens.
#
# Compara TRÊS pontos de vista sobre o banco, todos via o database `giraffe`:
#   (1) DATABASE_URL         → papel giraffe_app,      conectando por `db:5432` NA REDE do stack;
#   (2) MIGRATION_DATABASE_URL→ papel giraffe_migrator, conectando por `db:5432` NA REDE do stack;
#   (3) CT_DB                 → o container `db` do stack (por label), via `docker exec` (superuser).
# Se (1)/(2) divergirem de (3) — ou se `Account` existir em um e não em outro — a causa fica clara.
#
# Uso:  REDE=... RESET_ADMIN_EMAIL="admin@staging.giraffedev.cloud" \
#         bash scripts/ops/l6/diagnose-db-target.sh
#
set -euo pipefail

# O padrão `( export PGPASSWORD=...; ... )` isola a senha NO subshell de propósito — ela não vaza ao
# shell pai nem aparece em `ps`. O aviso do shellcheck de que a modificação é "local" é exatamente o
# comportamento desejado aqui.
# shellcheck disable=SC2030,SC2031

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh — a rede do stack)}"
ADMIN_EMAIL="${RESET_ADMIN_EMAIL:-}"

stop() { echo "STOP: $*" >&2; exit 1; }
container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"

# Senhas lidas em variáveis (nunca impressas). O compose monta:
#   DATABASE_URL           = postgresql://giraffe_app:${APP_PASSWORD}@db:5432/giraffe?schema=public
#   MIGRATION_DATABASE_URL = postgresql://giraffe_migrator:${MIGRATOR_PASSWORD}@db:5432/giraffe?schema=public
APPPW=$(sed -n 's/^APP_PASSWORD=//p' "${ENVF}" | head -1)
MIGPW=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)

# Consulta via a REDE do stack (mesmo caminho do migrate/reset). Senha por env HERDADO (nunca em ps).
q_rede() { # $1=user  $2=query  (PGPASSWORD já exportado no subshell chamador)
  docker run --rm --network "${REDE}" -e PGPASSWORD postgres:16-alpine \
    psql -h db -p 5432 -U "$1" -d giraffe -tAc "$2" 2>/dev/null | tr -d '[:space:]'
}
# Consulta no container db do stack (por label), superuser via socket local.
q_ct() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }

# Bloco de coleta comum (recebe uma função de query já ligada ao alvo).
coletar() { # $1 = nome do executor de query (q_ct) OU marcador 'rede:<user>'
  local exec_kind="$1"
  local db schema usr acc authc migs
  if [ "${exec_kind}" = "ct" ]; then
    db=$(q_ct "select current_database()"); schema=$(q_ct "select current_schema()"); usr=$(q_ct "select current_user")
    acc=$(q_ct "select coalesce(to_regclass('public.\"Account\"')::text,'NULL')")
    authc=$(q_ct "select coalesce(to_regclass('public.\"AuthCredential\"')::text,'NULL')")
    migs=$(q_ct "select case when to_regclass('public._prisma_migrations') is null then -1 else (select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null) end")
  else
    local user="${exec_kind#rede:}"
    db=$(q_rede "${user}" "select current_database()"); schema=$(q_rede "${user}" "select current_schema()"); usr=$(q_rede "${user}" "select current_user")
    acc=$(q_rede "${user}" "select coalesce(to_regclass('public.\"Account\"')::text,'NULL')")
    authc=$(q_rede "${user}" "select coalesce(to_regclass('public.\"AuthCredential\"')::text,'NULL')")
    migs=$(q_rede "${user}" "select case when to_regclass('public._prisma_migrations') is null then -1 else (select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null) end")
  fi
  echo "  current_database=${db:-'?'}  current_schema=${schema:-'?'}  current_user=${usr:-'?'}"
  echo "  to_regclass Account=${acc:-'?'}  AuthCredential=${authc:-'?'}  migrations_finalizadas=${migs:-'?'}"
}

echo "== diagnóstico de destino de banco (READ-ONLY, sanitizado) =="
echo "destino declarado no compose (host/porta/database/schema, sem credencial):"
echo "  DATABASE_URL            -> host=db porta=5432 database=giraffe schema=public (papel giraffe_app)"
echo "  MIGRATION_DATABASE_URL  -> host=db porta=5432 database=giraffe schema=public (papel giraffe_migrator)"
echo

echo "-- [1] via DATABASE_URL (giraffe_app) NA REDE --"
# shellcheck disable=SC2030,SC2031
if [ -n "${APPPW}" ]; then ( export PGPASSWORD="${APPPW}"; coletar "rede:giraffe_app" ); else echo "  (APP_PASSWORD ausente no .env)"; fi
echo
echo "-- [2] via MIGRATION_DATABASE_URL (giraffe_migrator) NA REDE --"
# shellcheck disable=SC2030,SC2031
if [ -n "${MIGPW}" ]; then ( export PGPASSWORD="${MIGPW}"; coletar "rede:giraffe_migrator" ); else echo "  (MIGRATOR_PASSWORD ausente no .env)"; fi
echo
echo "-- [3] via container db do stack (por label, superuser) --"
coletar "ct"
echo

echo "-- [7] Account do Admin (contagem, sem dados pessoais) --"
if [ -n "${ADMIN_EMAIL}" ]; then
  n_ct=$(q_ct "select case when to_regclass('public.\"Account\"') is null then -1 else (select count(*) from \"Account\" where email='${ADMIN_EMAIL}') end")
  echo "  no container db (label): Account com esse e-mail = ${n_ct} (-1 = tabela ausente)"
  if [ -n "${MIGPW}" ]; then
    # shellcheck disable=SC2030,SC2031
    n_rede=$( export PGPASSWORD="${MIGPW}"; q_rede giraffe_migrator "select case when to_regclass('public.\"Account\"') is null then -1 else (select count(*) from \"Account\" where email='${ADMIN_EMAIL}') end" )
    echo "  via MIGRATION_DATABASE_URL na REDE: Account com esse e-mail = ${n_rede} (-1 = tabela ausente)"
  fi
else
  echo "  (defina RESET_ADMIN_EMAIL para checar o Account do Admin)"
fi

echo
echo "== leitura do veredito =="
echo "  A (reset no banco errado): [2] mostra Account=NULL mas [3] mostra Account presente."
echo "  B (migrations no banco errado): [3] Account=NULL mas [1]/[2] presente (schema noutro destino)."
echo "  C (schema/search_path): current_schema ≠ 'public' em algum ponto, ou to_regclass difere por schema."
echo "  D (MIGRATE_ONESHOT_OK falso): migrations_finalizadas=0/-1 e Account=NULL em TODOS os três."
echo "== fim (nenhuma alteração) =="
