#!/usr/bin/env bash
#
# test-migrate-verify.sh — REGRESSÃO do migrate-oneshot.sh (host/local; Docker). Reproduz o FALSO
# VERDE do cenário D e prova que a correção o pega ANTES de aplicar:
#   Caso 1 (divergência de cluster): o db real por label é um cluster; o `db:5432` da REDE resolve para
#           OUTRO cluster (impostor). O migrate-oneshot deve ABORTAR ("DIVERGÊNCIA DE CLUSTER"), nunca
#           MIGRATE_ONESHOT_OK — é exatamente o caso que emitia o falso verde.
#   Caso 2 (mutação — mais de um db do projeto): dois containers com label service=db do projeto → o
#           migrate-oneshot deve ABORTAR ("EXATAMENTE 1").
# Nenhum apply é feito (o STOP ocorre na prova de destino, antes do build).
#
# GUARDA ANTI-HOST: usa o project autorizado como label; ABORTA se já houver container desse project —
# só roda em ambiente LIMPO, nunca no host do staging.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-migrate-verify.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
MO="${RAIZ}/scripts/ops/l6/migrate-oneshot.sh"
[ -f "${MO}" ] || { echo "STOP: migrate-oneshot.sh não encontrado"; exit 1; }

if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ]; then
  echo "STOP: já há containers do project ${AUTORIZADO} — este teste só roda em ambiente LIMPO (nunca no host)."
  exit 1
fi

SUF="$$-$(date +%s)"
NET="mvtest-net-${SUF}"
REALDB="mvtest-real-${SUF}"
FAKEDB="mvtest-fake-${SUF}"
REALDB2="mvtest-real2-${SUF}"
WORK=$(mktemp -d /tmp/giraffe-mvtest.XXXXXX)
ENVF="${WORK}/.env"
FAKEPW="mig_$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)"

cleanup() {
  docker rm -f "${REALDB}" "${FAKEDB}" "${REALDB2}" >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

espera_pg() { for _ in $(seq 1 60); do [ "$(docker exec "$1" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && return 0; sleep 1; done; return 1; }

printf 'MIGRATOR_PASSWORD=%s\nAPP_PASSWORD=x\nPOSTGRES_PASSWORD=x\nBETTER_AUTH_SECRET=x\nLOGIN_HMAC_SECRET=x\nWEB_PUBLIC_ORIGIN=http://localhost:3000\n' "${FAKEPW}" > "${ENVF}"

docker network create "${NET}" >/dev/null

FALHAS=0

echo "== Caso 1: db real por label ≠ cluster alcançado por db:5432 (impostor) → STOP divergência =="
# db REAL (por label), alias 'realdb' (NÃO 'db') — não é o que db:5432 resolve.
docker run -d --rm --name "${REALDB}" \
  --label com.docker.compose.project="${AUTORIZADO}" --label com.docker.compose.service=db \
  --network "${NET}" --network-alias realdb -e POSTGRES_PASSWORD=x -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
# db IMPOSTOR: alias 'db' na REDE (outro cluster), com giraffe_migrator para a conexão db:5432 funcionar.
docker run -d --rm --name "${FAKEDB}" \
  --network "${NET}" --network-alias db -e POSTGRES_PASSWORD=y -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
if espera_pg "${REALDB}" && espera_pg "${FAKEDB}"; then :; else echo "  STOP: dbs de teste não subiram"; exit 1; fi
docker exec "${FAKEDB}" psql -U postgres -d giraffe -q -c "create role giraffe_migrator login password '${FAKEPW}'" >/dev/null 2>&1 || true

out1=$(PROJ="${AUTORIZADO}" REDE="${NET}" DIR="${RAIZ}" ENVF="${ENVF}" bash "${MO}" 2>&1); rc1=$?
if [ "${rc1}" -ne 0 ] && printf '%s' "${out1}" | grep -q "DIVERGÊNCIA DE CLUSTER"; then
  echo "  PASSOU (abortou por divergência de cluster, sem aplicar)"
else
  echo "  FALHOU (rc=${rc1}):"; printf '%s\n' "${out1}" | tail -5; FALHAS=$((FALHAS+1))
fi
docker rm -f "${FAKEDB}" >/dev/null 2>&1 || true

echo "== Caso 2: mais de um container db do projeto → STOP 'EXATAMENTE 1' =="
docker run -d --rm --name "${REALDB2}" \
  --label com.docker.compose.project="${AUTORIZADO}" --label com.docker.compose.service=db \
  --network "${NET}" -e POSTGRES_PASSWORD=x -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
espera_pg "${REALDB2}" || true
out2=$(PROJ="${AUTORIZADO}" REDE="${NET}" DIR="${RAIZ}" ENVF="${ENVF}" bash "${MO}" 2>&1); rc2=$?
if [ "${rc2}" -ne 0 ] && printf '%s' "${out2}" | grep -qi "EXATAMENTE 1"; then
  echo "  PASSOU (abortou: mais de um db do projeto)"
else
  echo "  FALHOU (rc=${rc2}):"; printf '%s\n' "${out2}" | tail -5; FALHAS=$((FALHAS+1))
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "MIGRATE_VERIFY_REGRESSAO_OK"; else echo "MIGRATE_VERIFY_REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
