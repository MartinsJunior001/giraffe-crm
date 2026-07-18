#!/usr/bin/env bash
#
# test-gates-borda.sh — REGRESSÃO do gates-borda-interna.sh (host/local; Docker), em ambiente
# DESCARTÁVEL. Sobe o stack real pelo mesmo `docker compose` (db+migrate+api+web) e prova:
#   Caso 1 — stack apto: gates-borda-interna.sh → GATES_BORDA_OK (health/ready/healthz/casca/BFF).
#   Caso 2 — /ready=503 com o BANCO INDISPONÍVEL: para o db e prova que /ready cai para 503 (a API
#            declara corretamente que não alcança o banco) enquanto /health SEGUE 200 (liveness não
#            depende do banco — conexão preguiçosa por decisão). Esta é a prova de /ready=503 que o
#            dono exigiu em ambiente ISOLADO/descartável, jamais no banco compartilhado do staging.
# Guarda anti-host: recusa rodar se o project autorizado já existir (só ambiente limpo).
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-gates-borda.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
GB="${RAIZ}/scripts/ops/l6/gates-borda-interna.sh"
[ -f "${GB}" ] || { echo "STOP: gates-borda-interna.sh não encontrado"; exit 1; }
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ] \
   || docker volume ls -q 2>/dev/null | grep -q "^${AUTORIZADO}_"; then
  echo "STOP: recursos do project ${AUTORIZADO} JÁ EXISTEM — este teste só roda em ambiente LIMPO."; exit 1
fi

PROJ="${AUTORIZADO}"
WORK=$(mktemp -d /tmp/giraffe-gbtest.XXXXXX)
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

echo "== build + up (db, migrate, api, web) — pode levar alguns minutos =="
dc build db api web migrate >"${WORK}/build.log" 2>&1 || { echo "STOP: build falhou"; tail -25 "${WORK}/build.log"; exit 1; }
dc up -d db >/dev/null 2>&1
CT_DB=$(dc ps -q db)
for _ in $(seq 1 60); do [ "$(docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break; sleep 1; done
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -25 "${WORK}/mig"; exit 1; }
dc up -d api web >/dev/null 2>&1
CT_API=$(dc ps -q api)

echo "== aguarda a API responder /health (loop) =="
pronta=0
for _ in $(seq 1 60); do
  if docker exec "${CT_API}" node -e 'fetch("http://127.0.0.1:3001/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then pronta=1; break; fi
  sleep 2
done
[ "${pronta}" = "1" ] || { echo "STOP: API não respondeu /health a tempo"; dc logs --tail 40 api; exit 1; }

FALHAS=0

echo "== Caso 1 — stack apto → GATES_BORDA_OK =="
if PROJ="${AUTORIZADO}" bash "${GB}" >"${WORK}/gb.out" 2>&1; then
  if grep -q "GATES_BORDA_OK" "${WORK}/gb.out"; then echo "  PASSOU"; else echo "  FALHOU (exit 0 sem marcador)"; FALHAS=$((FALHAS+1)); fi
else
  echo "  FALHOU (esperava GATES_BORDA_OK):"; grep -E "FALHA:|GATES_BORDA" "${WORK}/gb.out" | sed 's/^/    /'; FALHAS=$((FALHAS+1))
fi

echo "== Caso 2 — banco indisponível: /ready→503 e /health→200 =="
dc stop db >/dev/null 2>&1
# status HTTP de /ready e /health com o db parado, lido pelo Node do próprio container da API.
st_ready=$(docker exec "${CT_API}" node -e 'fetch("http://127.0.0.1:3001/ready").then(r=>{console.log(r.status)}).catch(()=>console.log("000"))' 2>/dev/null | tr -d '[:space:]')
st_health=$(docker exec "${CT_API}" node -e 'fetch("http://127.0.0.1:3001/health").then(r=>{console.log(r.status)}).catch(()=>console.log("000"))' 2>/dev/null | tr -d '[:space:]')
echo "    /ready=${st_ready}  /health=${st_health}  (db parado)"
if [ "${st_ready}" = "503" ]; then echo "  PASSOU (/ready=503)"; else echo "  FALHOU (/ready=${st_ready}, esperado 503)"; FALHAS=$((FALHAS+1)); fi
if [ "${st_health}" = "200" ]; then echo "  PASSOU (/health=200 mesmo com o banco fora)"; else echo "  FALHOU (/health=${st_health}, esperado 200)"; FALHAS=$((FALHAS+1)); fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "GATES_BORDA_REGRESSAO_OK"; else echo "GATES_BORDA_REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
