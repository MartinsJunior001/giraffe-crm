#!/usr/bin/env bash
#
# test-recover-cluster.sh — REGRESSÃO do recover-failed-migration.sh (host/local; Docker). Reproduz o
# FALSO RECOVERY do ciclo anterior (resolve-rolled-back rodou noutro cluster; o db real ficou FAILED) e
# prova que o gate de identidade de cluster o bloqueia. Também prova o bloqueio por objeto parcial.
#   Caso 1 (falso recovery): db real por label é um cluster; `db:5432` da REDE resolve para OUTRO
#           cluster (impostor). O recover deve ABORTAR ("DIVERGÊNCIA DE CLUSTER") ANTES do resolve.
#   Caso 2 (objeto parcial, mesmo cluster): migration FAILED + tabela Account presente no db real →
#           RECOVER_BLOCKED_PARCIAL (não marca rolled-back com objetos vivos).
# Nenhum resolve é executado (os dois param antes). Guarda anti-host: só ambiente LIMPO.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-recover-cluster.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
MIG="20260712000000_init_tenancy_rls"
RC="${RAIZ}/scripts/ops/l6/recover-failed-migration.sh"
[ -f "${RC}" ] || { echo "STOP: recover-failed-migration.sh não encontrado"; exit 1; }

if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ]; then
  echo "STOP: já há containers do project ${AUTORIZADO} — este teste só roda em ambiente LIMPO (nunca no host)."; exit 1
fi

SUF="$$-$(date +%s)"
NET="rctest-net-${SUF}"
REALDB="rctest-real-${SUF}"
FAKEDB="rctest-fake-${SUF}"
REALDB2="rctest-real2-${SUF}"
WORK=$(mktemp -d /tmp/giraffe-rctest.XXXXXX)
ENVF="${WORK}/.env"
MIGPW="mig_$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)"

cleanup() {
  docker rm -f "${REALDB}" "${FAKEDB}" "${REALDB2}" >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

espera_pg() { for _ in $(seq 1 60); do [ "$(docker exec "$1" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && return 0; sleep 1; done; return 1; }
mig_failed() { # $1 = container: cria _prisma_migrations com a init FAILED
  docker exec -i "$1" psql -U postgres -d giraffe -q >/dev/null 2>&1 <<SQL
create table if not exists _prisma_migrations(id text primary key, migration_name text, started_at timestamptz default now(), finished_at timestamptz, rolled_back_at timestamptz, applied_steps_count int default 0);
insert into _prisma_migrations(id, migration_name) values ('t1','${MIG}') on conflict do nothing;
SQL
}

printf 'MIGRATOR_PASSWORD=%s\n' "${MIGPW}" > "${ENVF}"
docker network create "${NET}" >/dev/null
FALHAS=0

echo "== Caso 1: db real por label ≠ cluster de db:5432 (impostor) → STOP DIVERGÊNCIA DE CLUSTER =="
docker run -d --rm --name "${REALDB}" \
  --label com.docker.compose.project="${AUTORIZADO}" --label com.docker.compose.service=db \
  --network "${NET}" --network-alias realdb -e POSTGRES_PASSWORD=x -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
docker run -d --rm --name "${FAKEDB}" \
  --network "${NET}" --network-alias db -e POSTGRES_PASSWORD=y -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
if espera_pg "${REALDB}" && espera_pg "${FAKEDB}"; then :; else echo "  STOP: dbs não subiram"; exit 1; fi
docker exec "${FAKEDB}" psql -U postgres -d giraffe -q -c "create role giraffe_migrator login password '${MIGPW}'" >/dev/null 2>&1 || true
out1=$(PROJ="${AUTORIZADO}" REDE="${NET}" DIR="${RAIZ}" ENVF="${ENVF}" bash "${RC}" 2>&1); rc1=$?
if [ "${rc1}" -ne 0 ] && printf '%s' "${out1}" | grep -q "DIVERGÊNCIA DE CLUSTER"; then
  echo "  PASSOU (abortou por divergência de cluster, sem resolve)"
else
  echo "  FALHOU (rc=${rc1}):"; printf '%s\n' "${out1}" | tail -5; FALHAS=$((FALHAS+1))
fi
docker rm -f "${REALDB}" "${FAKEDB}" >/dev/null 2>&1 || true

echo "== Caso 2: mesmo cluster + objeto parcial (Account) → RECOVER_BLOCKED_PARCIAL =="
docker run -d --rm --name "${REALDB2}" \
  --label com.docker.compose.project="${AUTORIZADO}" --label com.docker.compose.service=db \
  --network "${NET}" --network-alias db -e POSTGRES_PASSWORD=x -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
espera_pg "${REALDB2}" || { echo "  STOP: db não subiu"; exit 1; }
docker exec "${REALDB2}" psql -U postgres -d giraffe -q \
  -c "create role giraffe_migrator login password '${MIGPW}'" \
  -c "create role giraffe_app login" \
  -c 'create table "Account"(id int)' >/dev/null 2>&1 || true
mig_failed "${REALDB2}"
out2=$(PROJ="${AUTORIZADO}" REDE="${NET}" DIR="${RAIZ}" ENVF="${ENVF}" bash "${RC}" 2>&1); rc2=$?
if [ "${rc2}" -ne 0 ] && printf '%s' "${out2}" | grep -q "RECOVER_BLOCKED_PARCIAL"; then
  echo "  PASSOU (bloqueou por objeto parcial, sem resolve)"
else
  echo "  FALHOU (rc=${rc2}):"; printf '%s\n' "${out2}" | tail -6; FALHAS=$((FALHAS+1))
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "RECOVER_CLUSTER_REGRESSAO_OK"; else echo "RECOVER_CLUSTER_REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
