#!/usr/bin/env bash
#
# test-gates-autenticados.sh — REGRESSÃO do gates-autenticados.sh (host/local; Docker), em ambiente
# DESCARTÁVEL. Sobe o stack real (db+migrate+provision+api+web), PROVISIONA um Admin de teste com
# credencial FIXTURE conhecida (não é segredo real) e roda o gate contra ele, provando GATES_AUTH_OK.
# A credencial de teste chega ao script por STDIN (pipe) — os mesmos `read -s` do caminho interativo —,
# nunca por argv/arquivo. Guarda anti-host: só roda em ambiente limpo.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-gates-autenticados.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
GA="${RAIZ}/scripts/ops/l6/gates-autenticados.sh"
[ -f "${GA}" ] || { echo "STOP: gates-autenticados.sh não encontrado"; exit 1; }
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ] \
   || docker volume ls -q 2>/dev/null | grep -q "^${AUTORIZADO}_"; then
  echo "STOP: recursos do project ${AUTORIZADO} JÁ EXISTEM — este teste só roda em ambiente LIMPO."; exit 1
fi

# Credenciais FIXTURE de teste (descartáveis; jamais um segredo real).
ADMIN_EMAIL_FX="admin@staging.giraffedev.cloud"
ADMIN_PW_FX="senha_gate_123456"

PROJ="${AUTORIZADO}"
WORK=$(mktemp -d /tmp/giraffe-gauth.XXXXXX)
ENVF="${WORK}/.env"
dc() {
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${RAIZ}" \
    -f "${RAIZ}/docker-compose.yml" -f "${RAIZ}/docker-compose.migrate.yml" "$@"
}
# shellcheck disable=SC2329  # invocada indiretamente pelo trap EXIT abaixo
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

echo "== build + up (db, migrate, provision, api, web) — pode levar alguns minutos =="
dc build db api web migrate >"${WORK}/build.log" 2>&1 || { echo "STOP: build falhou"; tail -25 "${WORK}/build.log"; exit 1; }
dc up -d db >/dev/null 2>&1
CT_DB=$(dc ps -q db)
for _ in $(seq 1 60); do [ "$(docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break; sleep 1; done
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -25 "${WORK}/mig"; exit 1; }
PROVISION_ORG_NAME="Org AUTH" PROVISION_ADMIN_EMAIL="${ADMIN_EMAIL_FX}" PROVISION_ADMIN_NAME="Admin" PROVISION_ADMIN_PASSWORD="${ADMIN_PW_FX}" \
  dc run --rm --no-deps -e PROVISION_ORG_NAME -e PROVISION_ADMIN_EMAIL -e PROVISION_ADMIN_NAME -e PROVISION_ADMIN_PASSWORD provision >"${WORK}/prov" 2>&1 \
  || { echo "STOP: provision falhou"; tail -25 "${WORK}/prov"; exit 1; }
dc up -d api web >/dev/null 2>&1
CT_API=$(dc ps -q api)

echo "== aguarda a API responder /health =="
pronta=0
for _ in $(seq 1 60); do
  if docker exec "${CT_API}" node -e 'fetch("http://127.0.0.1:3001/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then pronta=1; break; fi
  sleep 2
done
[ "${pronta}" = "1" ] || { echo "STOP: API não respondeu /health a tempo"; dc logs --tail 40 api; exit 1; }

echo "== roda gates-autenticados.sh (credencial fixture via stdin) =="
if printf '%s\n%s\n' "${ADMIN_EMAIL_FX}" "${ADMIN_PW_FX}" | PROJ="${AUTORIZADO}" bash "${GA}" >"${WORK}/ga.out" 2>&1; then
  sed 's/^/    /' "${WORK}/ga.out"
  if grep -q "GATES_AUTH_OK" "${WORK}/ga.out"; then echo; echo "GATES_AUTH_REGRESSAO_OK"; exit 0; fi
  echo; echo "GATES_AUTH_REGRESSAO_FALHOU (exit 0 sem marcador)" >&2; exit 1
else
  sed 's/^/    /' "${WORK}/ga.out"
  echo; echo "GATES_AUTH_REGRESSAO_FALHOU" >&2; exit 1
fi
