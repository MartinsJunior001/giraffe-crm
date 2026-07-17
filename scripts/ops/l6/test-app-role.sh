#!/usr/bin/env bash
#
# test-app-role.sh — REGRESSÃO do reconcile-app-role.sh (host; Docker; não toca o staging). Simula um
# volume sem papéis e prova:
#   Caso 1: reconcilia giraffe_app -> ROLE_OK + AUTH_OK + RECONCILE_OK.
#   Caso 2: 2ª execução IDEMPOTENTE.
#   Caso 3: giraffe_migrator NÃO é criado/tocado (fora do escopo).
#   Caso 4: atributos (tfffff) + GRANT CONNECT/USAGE.
#
# Uso:  bash scripts/ops/l6/test-app-role.sh
#
set -euo pipefail

AQUI=$(cd "$(dirname "$0")" && pwd)
RC="${AQUI}/reconcile-app-role.sh"
[ -f "${RC}" ] || { echo "STOP: reconcile-app-role.sh não encontrado em ${AQUI}" >&2; exit 1; }

PROJT="l6t-approle"
NAME="l6t-approle-db-$$-$(date +%s)"
WORK=$(mktemp -d /tmp/giraffe-actest.XXXXXX)

cleanup() {
  case "${NAME}" in
    l6t-approle-db-*) docker rm -f "${NAME}" >/dev/null 2>&1 || true ;;
    *) echo "RECUSA: nome inesperado ('${NAME}')" >&2 ;;
  esac
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

docker run -d --rm --name "${NAME}" \
  --label com.docker.compose.project="${PROJT}" --label com.docker.compose.service=db \
  -e POSTGRES_PASSWORD=super_x -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  [ "$(docker exec "${NAME}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break
  sleep 1
done
printf 'APP_PASSWORD=teste_app_777\nMIGRATOR_PASSWORD=irrelevante\n' > "${WORK}/.env"

qt() { docker exec "${NAME}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
FALHAS=0

[ "$(qt "select count(*) from pg_roles where rolname='giraffe_app'")" = "0" ] \
  || { echo "PRE-CONDIÇÃO FALHOU: giraffe_app já existia"; FALHAS=$((FALHAS+1)); }

echo "== Caso 1: reconcilia giraffe_app → ROLE_OK + AUTH_OK =="
if PROJ="${PROJT}" ENVF="${WORK}/.env" bash "${RC}" >"${WORK}/c1.out" 2>&1 \
   && grep -q "AUTENTICACAO=AUTH_OK" "${WORK}/c1.out" && grep -q "RECONCILE_OK" "${WORK}/c1.out"; then
  echo "  PASSOU"
else
  echo "  FALHOU:"; sed 's/^/    /' "${WORK}/c1.out"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 2: 2ª execução IDEMPOTENTE =="
if PROJ="${PROJT}" ENVF="${WORK}/.env" bash "${RC}" >"${WORK}/c2.out" 2>&1 \
   && grep -q "RECONCILE_OK (idempotente" "${WORK}/c2.out"; then
  echo "  PASSOU"
else
  echo "  FALHOU (esperava idempotente):"; sed 's/^/    /' "${WORK}/c2.out"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 3: giraffe_migrator NÃO foi tocado (continua ausente) =="
if [ "$(qt "select count(*) from pg_roles where rolname='giraffe_migrator'")" = "0" ]; then
  echo "  PASSOU"
else
  echo "  FALHOU: giraffe_migrator foi criado/tocado"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 4: atributos (tfffff) + GRANT CONNECT/USAGE =="
ATTR=$(qt "select left(rolcanlogin::text,1)||left(rolsuper::text,1)||left(rolbypassrls::text,1)||left(rolcreatedb::text,1)||left(rolcreaterole::text,1)||left(rolinherit::text,1) from pg_roles where rolname='giraffe_app'")
CONN=$(qt "select has_database_privilege('giraffe_app','giraffe','CONNECT')")
USG=$(qt "select has_schema_privilege('giraffe_app','public','USAGE')")
if [ "${ATTR}" = "tfffff" ] && [ "${CONN}" = "t" ] && [ "${USG}" = "t" ]; then
  echo "  PASSOU (atributos=${ATTR}, CONNECT=${CONN}, USAGE=${USG})"
else
  echo "  FALHOU (atributos=${ATTR} esperado tfffff; CONNECT=${CONN}; USAGE=${USG})"; FALHAS=$((FALHAS+1))
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "REGRESSAO_OK"; else echo "REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
