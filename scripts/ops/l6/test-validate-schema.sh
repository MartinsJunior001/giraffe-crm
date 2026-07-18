#!/usr/bin/env bash
#
# test-validate-schema.sh — REGRESSÃO do validate-schema-rls.sh (host/local; Docker). Monta o schema
# real pelo mesmo `docker compose` (db+migrate+provision) e prova os quatro casos que o dono pediu:
#   Caso 1 — recovery HISTÓRICO válido (rolled_back + reaplicação finalizada) → VALIDATE_SCHEMA_RLS_OK.
#   Caso 2 — FALHA pendente real (finished NULL & rolled_back NULL) → VALIDATE_SCHEMA_RLS_FALHOU.
#   Caso 3 — migration recuperada SEM reaplicação (rolled_back sem finished posterior) → FALHOU.
#   Caso 4 — RLS/FORCE removido de uma organizacional → FALHOU.
# Cada caso muta, valida e RESTAURA (banco de teste descartável). Guarda anti-host.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-validate-schema.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
VS="${RAIZ}/scripts/ops/l6/validate-schema-rls.sh"
[ -f "${VS}" ] || { echo "STOP: validate-schema-rls.sh não encontrado"; exit 1; }
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ] \
   || docker volume ls -q 2>/dev/null | grep -q "^${AUTORIZADO}_"; then
  echo "STOP: recursos do project ${AUTORIZADO} JÁ EXISTEM — este teste só roda em ambiente LIMPO."; exit 1
fi

PROJ="${AUTORIZADO}"
WORK=$(mktemp -d /tmp/giraffe-vstest.XXXXXX)
ENVF="${WORK}/.env"
dc() {
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${RAIZ}" \
    -f "${RAIZ}/docker-compose.yml" -f "${RAIZ}/docker-compose.migrate.yml" "$@"
}
cleanup() { dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "${WORK}" 2>/dev/null || true; }
trap cleanup EXIT

gen() { head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24; }
cat > "${ENVF}" <<EOF
POSTGRES_PASSWORD=$(gen)
MIGRATOR_PASSWORD=$(gen)
APP_PASSWORD=$(gen)
BETTER_AUTH_SECRET=$(gen)$(gen)
LOGIN_HMAC_SECRET=$(gen)$(gen)
WEB_PUBLIC_ORIGIN=http://localhost:3000
EOF

echo "== build + db (bootstrap) + migrate + provision (schema real) — pode levar alguns minutos =="
dc build migrate provision >"${WORK}/build.log" 2>&1 || { echo "STOP: build falhou"; tail -20 "${WORK}/build.log"; exit 1; }
dc up -d db >/dev/null 2>&1
CT=$(dc ps -q db)
for _ in $(seq 1 60); do [ "$(docker exec "${CT}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break; sleep 1; done
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -20 "${WORK}/mig"; exit 1; }
PROVISION_ORG_NAME="Org VS" PROVISION_ADMIN_EMAIL="admin@staging.giraffedev.cloud" PROVISION_ADMIN_NAME="Admin" PROVISION_ADMIN_PASSWORD="senha_vs_123456" \
  dc run --rm --no-deps -e PROVISION_ORG_NAME -e PROVISION_ADMIN_EMAIL -e PROVISION_ADMIN_NAME -e PROVISION_ADMIN_PASSWORD provision >"${WORK}/prov" 2>&1 || { echo "STOP: provision falhou"; tail -20 "${WORK}/prov"; exit 1; }

psql_do() { docker exec "${CT}" psql -U postgres -d giraffe -q -c "$1" >/dev/null 2>&1; }
MIG_INI="20260712000000_init_tenancy_rls"
FALHAS=0
roda() { PROJ="${AUTORIZADO}" bash "${VS}" >"${WORK}/out" 2>&1; }
espera_ok()    { if grep -q "VALIDATE_SCHEMA_RLS_OK" "${WORK}/out"; then echo "  PASSOU"; else echo "  FALHOU (esperava OK). Falhas:"; grep "FALHA:" "${WORK}/out" | sed 's/^/    /'; FALHAS=$((FALHAS+1)); fi; }
espera_falhou(){ if grep -q "VALIDATE_SCHEMA_RLS_FALHOU" "${WORK}/out"; then echo "  PASSOU"; else echo "  FALHOU (esperava FALHOU):"; tail -4 "${WORK}/out"; FALHAS=$((FALHAS+1)); fi; }

echo "== Caso base + [1] recovery histórico válido (rolled_back + reaplicação) → OK =="
# Insere uma linha rolled_back para a init (a finished original permanece) = histórico legítimo.
psql_do "insert into _prisma_migrations(id, checksum, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count) values ('hist-ok','c','${MIG_INI}', now(), null, now(), 0)"
roda; espera_ok
psql_do "delete from _prisma_migrations where id='hist-ok'"

echo "== [2] falha pendente real (finished NULL & rolled_back NULL) → FALHOU =="
psql_do "insert into _prisma_migrations(id, checksum, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count) values ('pend','c','99999999999999_fake_pending', now(), null, null, 0)"
roda; espera_falhou
psql_do "delete from _prisma_migrations where id='pend'"

echo "== [3] migration recuperada SEM reaplicação (rolled_back, sem finished) → FALHOU =="
psql_do "insert into _prisma_migrations(id, checksum, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count) values ('norereap','c','88888888888888_only_rolledback', now(), null, now(), 0)"
roda; espera_falhou
psql_do "delete from _prisma_migrations where id='norereap'"

echo "== [4] RLS/FORCE removido de uma organizacional (Organization) → FALHOU =="
psql_do 'alter table "Organization" no force row level security'
roda; espera_falhou
psql_do 'alter table "Organization" force row level security'

echo "== reconfirma base sem mutações → OK =="
roda; espera_ok

echo
if [ "${FALHAS}" -eq 0 ]; then echo "VALIDATE_REGRESSAO_OK"; else echo "VALIDATE_REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
