#!/usr/bin/env bash
#
# test-recovery-e2e.sh — PROVA end-to-end (host/local; Docker; não toca o staging) do ciclo completo:
#   1. volume "antigo" com giraffe_migrator mas SEM giraffe_app;
#   2. migrate deploy FALHA com P3018 (`role "giraffe_app" does not exist`);
#   3. estado físico = ZERO objetos parciais (rollback transacional completo);
#   4. reconcilia giraffe_app;
#   5. resolve-rolled-back da migration falha (db-migrate.mjs, NUNCA --applied);
#   6. migrate deploy COMPLETO;
#   7. ZERO migrations pendentes;
#   8. 2ª execução idempotente (nenhuma pendente).
#
# Constrói a imagem `migrate` do repo (o mesmo target do deploy) — leva alguns minutos. Roda tudo numa
# rede docker dedicada e descartável.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-recovery-e2e.sh
#
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
cd "${RAIZ}"

SUF="$$-$(date +%s)"
NET="l6rec-net-${SUF}"
DB="l6rec-db-${SUF}"
IMG="l6rec-migrate-${SUF}"
MIG="20260712000000_init_tenancy_rls"
WORK=$(mktemp -d /tmp/giraffe-e2e.XXXXXX)

cleanup() {
  docker rm -f "${DB}" >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
  docker rmi "${IMG}" >/dev/null 2>&1 || true
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

FALHAS=0
MURL="postgresql://giraffe_migrator:mig_pw_e2e@${DB}:5432/giraffe?schema=public"
run_migrate() { docker run --rm --network "${NET}" -e MIGRATION_DATABASE_URL="${MURL}" "${IMG}" node ../../scripts/db-migrate.mjs "$@"; }
sql() { docker exec "${DB}" psql -U postgres -d "${1}" -v ON_ERROR_STOP=1 -q -c "${2}" >/dev/null; }
qdb() { docker exec "${DB}" psql -U postgres -d giraffe -tAc "${1}" | tr -d '[:space:]'; }

echo "== build da imagem migrate (target do deploy) — pode levar alguns minutos =="
docker build -f apps/api/Dockerfile --target migrate -t "${IMG}" . >"${WORK}/build.log" 2>&1 \
  || { echo "STOP: build da imagem migrate falhou"; tail -30 "${WORK}/build.log"; exit 1; }

docker network create "${NET}" >/dev/null
docker run -d --rm --name "${DB}" --network "${NET}" \
  -e POSTGRES_PASSWORD=super_e2e -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  [ "$(docker exec "${DB}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break
  sleep 1
done

# Volume "antigo": giraffe_migrator (dono do schema) presente; giraffe_app AUSENTE.
sql giraffe "CREATE ROLE giraffe_migrator LOGIN PASSWORD 'mig_pw_e2e' NOSUPERUSER NOBYPASSRLS NOCREATEROLE"
sql postgres "ALTER DATABASE giraffe OWNER TO giraffe_migrator"
sql giraffe "ALTER SCHEMA public OWNER TO giraffe_migrator"

echo "== [1/8] migrate deploy deve FALHAR com P3018 (giraffe_app ausente) =="
if run_migrate deploy >"${WORK}/d1" 2>&1; then
  echo "  FALHOU: o deploy deveria ter falhado"; sed 's/^/    /' "${WORK}/d1"; FALHAS=$((FALHAS+1))
elif grep -qiE 'P3018|does not exist' "${WORK}/d1" && grep -q 'giraffe_app' "${WORK}/d1"; then
  echo "  PASSOU (P3018 reproduzida: role giraffe_app não existe)"
else
  echo "  FALHOU: erro diferente do esperado:"; sed 's/^/    /' "${WORK}/d1"; FALHAS=$((FALHAS+1))
fi

echo "== [2/8] estado físico: ZERO objetos parciais (rollback completo) =="
OBJ=$(qdb "select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('Account','Organization','Membership'))+(select count(*) from pg_type where typname in ('MembershipRole','MembershipState'))+(select count(*) from pg_proc where proname in ('current_org_id','current_account_id'))")
if [ "${OBJ}" = "0" ]; then echo "  PASSOU (0 objetos)"; else echo "  FALHOU: objetos parciais=${OBJ}"; FALHAS=$((FALHAS+1)); fi

echo "== [3/8] reconcilia giraffe_app (causa remediada) =="
sql giraffe "CREATE ROLE giraffe_app LOGIN PASSWORD 'app_pw_e2e' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT"
sql giraffe "GRANT CONNECT ON DATABASE giraffe TO giraffe_app"
sql giraffe "GRANT USAGE ON SCHEMA public TO giraffe_app"
echo "  giraffe_app criado"

echo "== [4/8] resolve-rolled-back da migration falha (nunca --applied) =="
if run_migrate resolve-rolled-back "${MIG}" >"${WORK}/r" 2>&1; then echo "  PASSOU"; else echo "  FALHOU:"; sed 's/^/    /' "${WORK}/r"; FALHAS=$((FALHAS+1)); fi

echo "== [5/8] migrate deploy COMPLETO =="
if run_migrate deploy >"${WORK}/d2" 2>&1; then echo "  PASSOU"; else echo "  FALHOU:"; sed 's/^/    /' "${WORK}/d2"; FALHAS=$((FALHAS+1)); fi

echo "== [6/8] ZERO migrations pendentes (status exit 0) =="
if run_migrate status >"${WORK}/s" 2>&1; then echo "  PASSOU"; else echo "  FALHOU:"; sed 's/^/    /' "${WORK}/s"; FALHAS=$((FALHAS+1)); fi

echo "== [7/8] objetos agora presentes (schema aplicado) =="
OBJ2=$(qdb "select count(*) from information_schema.tables where table_schema='public' and table_name in ('Account','Organization','Membership')")
if [ "${OBJ2}" = "3" ]; then echo "  PASSOU (3 tabelas)"; else echo "  FALHOU: tabelas=${OBJ2}"; FALHAS=$((FALHAS+1)); fi

echo "== [8/8] 2ª execução idempotente (deploy sem pendências) =="
if run_migrate deploy >"${WORK}/d3" 2>&1; then echo "  PASSOU"; else echo "  FALHOU:"; sed 's/^/    /' "${WORK}/d3"; FALHAS=$((FALHAS+1)); fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "RECOVERY_E2E_OK"; else echo "RECOVERY_E2E_FALHOU (${FALHAS})" >&2; exit 1; fi
