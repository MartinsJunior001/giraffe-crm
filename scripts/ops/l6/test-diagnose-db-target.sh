#!/usr/bin/env bash
#
# test-diagnose-db-target.sh — REGRESSÃO do diagnose-db-target.sh (host/local; Docker). Prova que uma
# falha em [1] NÃO impede [2]/[3] e que o veredito é SEMPRE emitido. Monta o ambiente pelo MESMO
# `docker compose` do host (o `db` roda o bootstrap; migrate + provision criam o Account) e roda o
# diagnóstico com a senha do giraffe_app ERRADA de propósito ([1] deve dar QUERY_FAIL categoria=AUTH).
#
# GUARDA ANTI-HOST: o teste usa o project autorizado como namespace do compose; por isso ABORTA se já
# houver QUALQUER recurso (container/volume) desse project — ou seja, só roda em ambiente LIMPO, nunca
# no host do staging.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-diagnose-db-target.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
DIAG="${RAIZ}/scripts/ops/l6/diagnose-db-target.sh"
[ -f "${DIAG}" ] || { echo "STOP: diagnose-db-target.sh não encontrado"; exit 1; }

# GUARDA ANTI-HOST: ambiente precisa estar limpo do project autorizado.
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ] \
   || docker volume ls -q 2>/dev/null | grep -q "^${AUTORIZADO}_"; then
  echo "STOP: recursos do project ${AUTORIZADO} JÁ EXISTEM — este teste só roda em ambiente LIMPO (nunca no host)."
  exit 1
fi

WORK=$(mktemp -d /tmp/giraffe-diagtest.XXXXXX)
ENVF_REAL="${WORK}/.env"
ENVF_DIAG="${WORK}/.env.diag"
EMAIL="admin@staging.giraffedev.cloud"
REDE="${AUTORIZADO}_default"

dc() {
  docker compose -p "${AUTORIZADO}" --env-file "${ENVF_REAL}" --project-directory "${RAIZ}" \
    -f "${RAIZ}/docker-compose.yml" -f "${RAIZ}/docker-compose.migrate.yml" "$@"
}
cleanup() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  docker network rm "${REDE}" >/dev/null 2>&1 || true
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

gen() { head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24; }
APP_OK=$(gen)
cat > "${ENVF_REAL}" <<EOF
POSTGRES_PASSWORD=$(gen)
MIGRATOR_PASSWORD=$(gen)
APP_PASSWORD=${APP_OK}
BETTER_AUTH_SECRET=$(gen)$(gen)
LOGIN_HMAC_SECRET=$(gen)$(gen)
WEB_PUBLIC_ORIGIN=http://localhost:3000
EOF
# .env do diagnóstico: MIGRATOR igual, mas APP_PASSWORD ERRADA (força [1]=AUTH).
sed "s/^APP_PASSWORD=.*/APP_PASSWORD=$(gen)_errada/" "${ENVF_REAL}" > "${ENVF_DIAG}"

FALHAS=0

echo "== build + sobe db (bootstrap) + migrate + provision =="
dc build migrate provision >"${WORK}/build.log" 2>&1 || { echo "STOP: build falhou"; tail -20 "${WORK}/build.log"; exit 1; }
dc up -d db >/dev/null 2>&1
for _ in $(seq 1 60); do
  CT=$(dc ps -q db 2>/dev/null)
  [ -n "${CT}" ] && [ "$(docker exec "${CT}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break
  sleep 1
done
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -20 "${WORK}/mig"; exit 1; }
PROVISION_ORG_NAME="Org Diag" PROVISION_ADMIN_EMAIL="${EMAIL}" PROVISION_ADMIN_NAME="Admin" PROVISION_ADMIN_PASSWORD="senha_diag_123456" \
  dc run --rm --no-deps -e PROVISION_ORG_NAME -e PROVISION_ADMIN_EMAIL -e PROVISION_ADMIN_NAME -e PROVISION_ADMIN_PASSWORD provision >"${WORK}/prov" 2>&1 \
  || { echo "STOP: provision falhou"; tail -20 "${WORK}/prov"; exit 1; }

echo "== roda o diagnóstico com APP_PASSWORD ERRADA (esperado: [1] AUTH, [2]/[3] OK, veredito) =="
PROJ="${AUTORIZADO}" REDE="${REDE}" ENVF="${ENVF_DIAG}" RESET_ADMIN_EMAIL="${EMAIL}" \
  bash "${DIAG}" >"${WORK}/diag.out" 2>&1
RC_DIAG=$?

# Extrai o status (QUERY_OK/QUERY_FAIL...) da 1ª linha de status após cada marcador de bloco.
status_bloco() { awk -v m="-- \\\[$1\\\]" '$0 ~ m {f=1; next} f && /QUERY_(OK|FAIL)/ {print; exit}' "${WORK}/diag.out"; }
B1=$(status_bloco 1); B2=$(status_bloco 2); B3=$(status_bloco 3)

echo "  [1]: ${B1}"
echo "  [2]: ${B2}"
echo "  [3]: ${B3}"

echo "== checagens =="
if [ "${RC_DIAG}" -eq 0 ]; then echo "  ok: diagnóstico saiu 0 (não abortou)"; else echo "  FALHOU: diagnóstico saiu ${RC_DIAG}"; FALHAS=$((FALHAS+1)); fi
if printf '%s' "${B1}" | grep -q "QUERY_FAIL categoria=AUTH"; then echo "  ok: [1] QUERY_FAIL AUTH"; else echo "  FALHOU: [1] esperado QUERY_FAIL AUTH, veio '${B1}'"; FALHAS=$((FALHAS+1)); fi
if printf '%s' "${B2}" | grep -q "QUERY_OK"; then echo "  ok: [2] QUERY_OK (continuou apesar de [1])"; else echo "  FALHOU: [2] esperado QUERY_OK, veio '${B2}'"; FALHAS=$((FALHAS+1)); fi
if printf '%s' "${B3}" | grep -q "QUERY_OK"; then echo "  ok: [3] QUERY_OK (continuou)"; else echo "  FALHOU: [3] esperado QUERY_OK, veio '${B3}'"; FALHAS=$((FALHAS+1)); fi
if grep -q "== veredito (sempre emitido) ==" "${WORK}/diag.out"; then echo "  ok: veredito emitido mesmo com [1] falho"; else echo "  FALHOU: veredito ausente"; FALHAS=$((FALHAS+1)); fi
if grep -qiE "password|@db:5432|APP_PASSWORD=" "${WORK}/diag.out"; then echo "  FALHOU: possível vazamento (senha/DSN) na saída"; FALHAS=$((FALHAS+1)); else echo "  ok: nenhuma senha/DSN na saída"; fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "DIAG_REGRESSAO_OK"; else echo "DIAG_REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
