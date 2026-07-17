#!/usr/bin/env bash
#
# diagnose-db-target.sh — READ-ONLY e SANITIZADO. Diagnostica o P2021 (`public."Account"` não existe)
# no reset: descobre se o reset/migrate/provision conectam ao MESMO destino de banco.
#
# ROBUSTEZ (correção): NÃO usa `set -e`. Cada um dos três destinos é sondado de forma INDEPENDENTE —
# uma falha em [1] nunca impede [2]/[3], e o veredito final é SEMPRE emitido. Cada bloco imprime
# `QUERY_OK` (com current_database/schema/user + to_regclass) ou `QUERY_FAIL` com uma categoria
# sanitizada: AUTH | PERMISSION | TABLE_MISSING | NETWORK | CONFIG | UNKNOWN. NUNCA imprime DSN, senha,
# SQL bruto nem PII.
#
# Uso:  REDE=... RESET_ADMIN_EMAIL="admin@staging.giraffedev.cloud" \
#         bash scripts/ops/l6/diagnose-db-target.sh
#
set -uo pipefail  # SEM -e de propósito: os probes tratam os próprios erros e nunca abortam o script.

# ── GUARDA DE ESCOPO (obrigatória) ────────────────────────────────────────────────────────────────
# Só o projeto Coolify giraffe-crm / staging-temporario é autorizado. Recursos são selecionados SEMPRE
# pela label EXATA `com.docker.compose.project=<UUID>` — NUNCA pelo texto "giraffe" (giraffe_app é só um
# papel PostgreSQL interno, não um projeto). Se o UUID divergir, ABORTA — jamais toca chat_atende,
# Giraffe360, Petshop, Novo projeto, Teste_BMW ou qualquer outro stack do host compartilhado.
PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
if [ "${PROJ}" != "${PROJ_AUTORIZADO}" ]; then
  echo "STOP: PROJ='${PROJ}' != UUID autorizado ('${PROJ_AUTORIZADO}') — fora do escopo, abortando." >&2
  exit 2
fi

ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
REDE="${REDE:-}"
ADMIN_EMAIL="${RESET_ADMIN_EMAIL:-}"

container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1" 2>/dev/null | head -1
}
CT_DB=$(container_de db)
APPPW=""; MIGPW=""
if [ -f "${ENVF}" ]; then
  APPPW=$(sed -n 's/^APP_PASSWORD=//p' "${ENVF}" | head -1)
  MIGPW=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
fi

# Uma única query por destino: 6 campos por '|'. to_regclass devolve NULL (não erro) se a tabela não
# existe — TABLE_MISSING é lido do OUTPUT (Account=NULL), não de um erro. O erro (AUTH/NETWORK/CONFIG/
# PERMISSION) é o que classificamos a partir do stderr.
SQL_INFO="select current_database()||'|'||current_schema()||'|'||current_user||'|'||coalesce(to_regclass('public.\"Account\"')::text,'NULL')||'|'||coalesce(to_regclass('public.\"AuthCredential\"')::text,'NULL')||'|'||(case when to_regclass('public._prisma_migrations') is null then '-1' else (select count(*)::text from _prisma_migrations where finished_at is not null and rolled_back_at is null) end)"

# Classifica o stderr do psql em UMA categoria — sem imprimir o texto bruto.
classificar() { # $1 = arquivo de stderr
  local e; e=$(tr '[:upper:]' '[:lower:]' <"$1" 2>/dev/null)
  if   printf '%s' "$e" | grep -q 'authentication failed\|no password supplied\|password authentication'; then echo AUTH
  elif printf '%s' "$e" | grep -q 'permission denied'; then echo PERMISSION
  elif printf '%s' "$e" | grep -q 'database ".*" does not exist\|role ".*" does not exist'; then echo CONFIG
  elif printf '%s' "$e" | grep -q 'relation ".*" does not exist'; then echo TABLE_MISSING
  elif printf '%s' "$e" | grep -q 'could not connect\|could not translate\|connection refused\|timeout\|no route to host\|name or service not known\|could not resolve'; then echo NETWORK
  else echo UNKNOWN
  fi
}

# Emite um bloco a partir de (rc, stdout, stderrfile). Nunca aborta.
emitir() {
  local rc="$1" out="$2" err="$3"
  if [ "${rc}" -eq 0 ] && [ -n "${out}" ]; then
    local db schema usr acc authc migs
    IFS='|' read -r db schema usr acc authc migs <<<"${out}"
    echo "  QUERY_OK"
    echo "  current_database=${db} current_schema=${schema} current_user=${usr}"
    echo "  to_regclass Account=${acc} AuthCredential=${authc} migrations_finalizadas=${migs}"
  else
    echo "  QUERY_FAIL categoria=$(classificar "${err}")"
  fi
}

# Sonda via a REDE do stack (mesmo caminho do migrate/reset). Senha por env HERDADO no subshell.
probe_rede() { # $1=user  $2=senha
  local err out rc
  err=$(mktemp)
  # shellcheck disable=SC2030,SC2031
  out=$(export PGPASSWORD="$2"; docker run --rm --network "${REDE}" -e PGPASSWORD postgres:16-alpine \
        psql -h db -p 5432 -U "$1" -d giraffe -tAc "${SQL_INFO}" 2>"${err}")
  rc=$?
  emitir "${rc}" "${out}" "${err}"
  rm -f "${err}"
}
# Sonda o container db do stack (por label), superuser via socket local.
probe_ct() {
  local err out rc
  err=$(mktemp)
  out=$(docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "${SQL_INFO}" 2>"${err}")
  rc=$?
  emitir "${rc}" "${out}" "${err}"
  rm -f "${err}"
}

echo "== diagnóstico de destino de banco (READ-ONLY, sanitizado, tolerante) =="
echo "destino declarado no compose (host/porta/database/schema, sem credencial):"
echo "  DATABASE_URL           -> host=db porta=5432 database=giraffe schema=public (giraffe_app)"
echo "  MIGRATION_DATABASE_URL -> host=db porta=5432 database=giraffe schema=public (giraffe_migrator)"
echo

echo "-- [1] via DATABASE_URL (giraffe_app) NA REDE --"
if [ -z "${REDE}" ]; then echo "  QUERY_FAIL categoria=CONFIG (REDE não informada)"
elif [ -z "${APPPW}" ]; then echo "  QUERY_FAIL categoria=CONFIG (APP_PASSWORD ausente no .env)"
else probe_rede giraffe_app "${APPPW}"; fi
echo

echo "-- [2] via MIGRATION_DATABASE_URL (giraffe_migrator) NA REDE --"
if [ -z "${REDE}" ]; then echo "  QUERY_FAIL categoria=CONFIG (REDE não informada)"
elif [ -z "${MIGPW}" ]; then echo "  QUERY_FAIL categoria=CONFIG (MIGRATOR_PASSWORD ausente no .env)"
else probe_rede giraffe_migrator "${MIGPW}"; fi
echo

echo "-- [3] via container db do stack (por label, superuser) --"
if [ -z "${CT_DB}" ]; then echo "  QUERY_FAIL categoria=CONFIG (container db por label não encontrado)"
else probe_ct; fi
echo

echo "-- [7] Account do Admin (contagem, sem dados pessoais) --"
if [ -z "${ADMIN_EMAIL}" ]; then
  echo "  (defina RESET_ADMIN_EMAIL para checar o Account do Admin)"
else
  # Consulta parametrizada por :'email' (nunca concatena o e-mail no SQL); só contagem sai.
  if [ -n "${CT_DB}" ]; then
    n_ct=$(docker exec "${CT_DB}" psql -U postgres -d giraffe -tA -v em="${ADMIN_EMAIL}" \
      -c "select case when to_regclass('public.\"Account\"') is null then -1 else (select count(*) from \"Account\" where email=:'em') end" 2>/dev/null | tr -d '[:space:]')
    echo "  no container db (label): Account com esse e-mail = ${n_ct:-'?'} (-1 = tabela ausente)"
  fi
  if [ -n "${REDE}" ] && [ -n "${MIGPW}" ]; then
    # shellcheck disable=SC2030,SC2031
    n_rede=$(export PGPASSWORD="${MIGPW}"; docker run --rm --network "${REDE}" -e PGPASSWORD postgres:16-alpine \
      psql -h db -p 5432 -U giraffe_migrator -d giraffe -tA -v em="${ADMIN_EMAIL}" \
      -c "select case when to_regclass('public.\"Account\"') is null then -1 else (select count(*) from \"Account\" where email=:'em') end" 2>/dev/null | tr -d '[:space:]')
    echo "  via MIGRATION_DATABASE_URL na REDE: Account com esse e-mail = ${n_rede:-'?'} (-1 = tabela ausente)"
  fi
fi
echo

echo "== veredito (sempre emitido) =="
echo "  A (reset no banco errado): [2] Account=NULL mas [3] Account presente."
echo "  B (migrations no banco errado): [3] Account=NULL mas [1]/[2] presente."
echo "  C (schema/search_path): algum current_schema ≠ 'public', ou to_regclass difere por schema."
echo "  D (MIGRATE_ONESHOT_OK falso): migrations_finalizadas=0/-1 e Account=NULL nos três QUERY_OK."
echo "  (categorias de QUERY_FAIL: AUTH | PERMISSION | TABLE_MISSING | NETWORK | CONFIG | UNKNOWN)"
echo "== fim (nenhuma alteração) =="
exit 0
