#!/usr/bin/env bash
#
# test-reconcile-migrator.sh — REGRESSÃO do reconcile-migrator-role.sh (rode no host; usa Docker, não
# toca o staging). Simula um VOLUME ANTIGO que não executou 00-roles.sql (database giraffe + schema
# public com dados, mas SEM os papéis) e prova:
#   Caso 1: reconcilia -> ROLE_OK + AUTH_OK + RECONCILE_OK.
#   Caso 2: 2ª execução é IDEMPOTENTE (nada a alterar).
#   Caso 3: giraffe_app NÃO é criado/tocado (fora do escopo).
#   Caso 4: atributos autoritativos (tfff = login/no-super/no-bypassrls/no-createrole) e ownership.
#
# Uso:  bash scripts/ops/l6/test-reconcile-migrator.sh
#
set -euo pipefail

AQUI=$(cd "$(dirname "$0")" && pwd)
RC="${AQUI}/reconcile-migrator-role.sh"
[ -f "${RC}" ] || { echo "STOP: reconcile-migrator-role.sh não encontrado em ${AQUI}" >&2; exit 1; }

PROJT="l6t-reconcile"
NAME="l6t-reconcile-db-$$-$(date +%s)"
WORK=$(mktemp -d /tmp/giraffe-rctest.XXXXXX)

cleanup() {
  case "${NAME}" in
    l6t-reconcile-db-*) docker rm -f "${NAME}" >/dev/null 2>&1 || true ;;
    *) echo "RECUSA: nome inesperado ('${NAME}')" >&2 ;;
  esac
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

# Container rotulado como o do Coolify, SEM bootstrap (papéis ausentes).
docker run -d --rm --name "${NAME}" \
  --label com.docker.compose.project="${PROJT}" --label com.docker.compose.service=db \
  -e POSTGRES_PASSWORD=super_x -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  [ "$(docker exec "${NAME}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break
  sleep 1
done
# "Dados antigos" no schema public; papéis giraffe_* AUSENTES.
docker exec "${NAME}" psql -U postgres -d giraffe -q -c 'create table legado(id int);' >/dev/null
printf 'MIGRATOR_PASSWORD=teste_reconcile_999\n' > "${WORK}/.env"

qt() { docker exec "${NAME}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
FALHAS=0

# Pré-condição: papel ausente.
[ "$(qt "select count(*) from pg_roles where rolname='giraffe_migrator'")" = "0" ] \
  || { echo "PRE-CONDIÇÃO FALHOU: giraffe_migrator já existia"; FALHAS=$((FALHAS+1)); }

echo "== Caso 1: reconcilia volume sem papel → ROLE_OK + AUTH_OK =="
if PROJ="${PROJT}" ENVF="${WORK}/.env" bash "${RC}" >"${WORK}/c1.out" 2>&1 \
   && grep -q "AUTENTICACAO=AUTH_OK" "${WORK}/c1.out" && grep -q "RECONCILE_OK" "${WORK}/c1.out"; then
  echo "  PASSOU"
else
  echo "  FALHOU:"; sed 's/^/    /' "${WORK}/c1.out"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 2: 2ª execução IDEMPOTENTE (nada a alterar) =="
if PROJ="${PROJT}" ENVF="${WORK}/.env" bash "${RC}" >"${WORK}/c2.out" 2>&1 \
   && grep -q "RECONCILE_OK (idempotente" "${WORK}/c2.out"; then
  echo "  PASSOU"
else
  echo "  FALHOU (esperava idempotente):"; sed 's/^/    /' "${WORK}/c2.out"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 3: giraffe_app NÃO foi tocado (continua ausente) =="
if [ "$(qt "select count(*) from pg_roles where rolname='giraffe_app'")" = "0" ]; then
  echo "  PASSOU"
else
  echo "  FALHOU: giraffe_app foi criado/tocado"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 4: atributos (tfff) e ownership do schema =="
ATTR=$(qt "select left(rolcanlogin::text,1)||left(rolsuper::text,1)||left(rolbypassrls::text,1)||left(rolcreaterole::text,1) from pg_roles where rolname='giraffe_migrator'")
OWN=$(qt "select pg_get_userbyid(nspowner) from pg_namespace where nspname='public'")
if [ "${ATTR}" = "tfff" ] && [ "${OWN}" = "giraffe_migrator" ]; then
  echo "  PASSOU (atributos=${ATTR}, schema owner=${OWN})"
else
  echo "  FALHOU (atributos=${ATTR} esperado tfff; owner=${OWN} esperado giraffe_migrator)"; FALHAS=$((FALHAS+1))
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "REGRESSAO_OK"; else echo "REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
