#!/usr/bin/env bash
#
# test-restore-verify.sh — REGRESSÃO do restore-verify.sh (rode no host; usa Docker, não toca o
# staging). Prova três contratos que o bug de 2026-07-17 violava:
#   Caso 1: dump VAZIO FIEL (origem 0 tabelas / MODE=pre) é APROVADO (RESTORE_OK).
#   Caso 2: manifest DIVERGENTE (diz pós com 5 tabelas) sobre o mesmo dump vazio fica VERMELHO.
#   Caso 3: dump PÓS FIEL (schema + RLS/FORCE + Organization/Membership + migration) é APROVADO,
#           exercitando a contagem de identificadores CamelCase ("Organization"/"Membership").
# Se qualquer caso falhar, o script sai !=0.
#
# Uso:  bash scripts/ops/l6/test-restore-verify.sh
#
set -euo pipefail

AQUI=$(cd "$(dirname "$0")" && pwd)
RV="${AQUI}/restore-verify.sh"
[ -f "${RV}" ] || { echo "STOP: restore-verify.sh não encontrado em ${AQUI}" >&2; exit 1; }

WORK=$(mktemp -d /tmp/giraffe-rvtest.XXXXXX)
SRC="giraffe-rvtest-src-$$-$(date +%s)"
SRC3="giraffe-rvtest-src3-$$-$(date +%s)"

cleanup() {
  for c in "${SRC}" "${SRC3}"; do
    case "${c}" in
      giraffe-rvtest-src*) docker rm -f "${c}" >/dev/null 2>&1 || true ;;
      *) echo "RECUSA: nome de origem inesperado ('${c}')" >&2 ;;
    esac
  done
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

PW="t_$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 20)"
FALHAS=0

sobe_pg() { # $1 = nome do container. Espera por `select 1` (não pg_isready — ver nota no restore-verify).
  docker run -d --rm --name "$1" -e POSTGRES_PASSWORD="${PW}" -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
  for _ in $(seq 1 60); do
    if [ "$(docker exec "$1" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ]; then return 0; fi
    sleep 1
  done
  echo "STOP: banco de teste '$1' não ficou pronto" >&2; exit 1
}

# ---------------------------------------------------------------------------------------------------
# Origem VAZIA (casos 1 e 2)
# ---------------------------------------------------------------------------------------------------
sobe_pg "${SRC}"
DUMP="${WORK}/vazio.dump"
docker exec "${SRC}" pg_dump -U postgres -d giraffe -Fc > "${DUMP}"
SHA=$(sha256sum "${DUMP}" | awk '{print $1}')
cat > "${DUMP}.manifest" <<EOF
DUMP_SHA256=${SHA}
DUMP_BYTES=$(wc -c < "${DUMP}")
CREATED_UTC=test
MODE=pre
ORIGIN_TABLES_PUBLIC=0
ORIGIN_MIGRATIONS_APPLIED=0
ORIGIN_RLS_FORCE_TABLES=0
ORIGIN_POLICIES=0
ORIGIN_APP_DELETE_GRANTS=0
ORIGIN_ORGANIZATIONS=0
ORIGIN_MEMBERSHIPS_ADMIN_ACTIVE=0
EOF

echo "== Caso 1: dump vazio FIEL (MODE=pre, 0=0) → RESTORE_OK =="
if bash "${RV}" "${DUMP}" >"${WORK}/c1.out" 2>&1 && grep -q "VEREDITO=RESTORE_OK" "${WORK}/c1.out"; then
  echo "  PASSOU"
else
  echo "  FALHOU (esperava RESTORE_OK):"; sed 's/^/    /' "${WORK}/c1.out"; FALHAS=$((FALHAS+1))
fi

echo "== Caso 2: manifest DIVERGENTE (pós, 5 tabelas) sobre dump vazio → VERMELHO =="
cp "${DUMP}.manifest" "${WORK}/mut.manifest"
sed -i 's/^MODE=pre/MODE=pos/; s/^ORIGIN_TABLES_PUBLIC=0/ORIGIN_TABLES_PUBLIC=5/' "${WORK}/mut.manifest"
if bash "${RV}" "${DUMP}" "${WORK}/mut.manifest" >"${WORK}/c2.out" 2>&1; then
  echo "  FALHOU (esperava exit !=0 / RESTORE_FALHOU):"; sed 's/^/    /' "${WORK}/c2.out"; FALHAS=$((FALHAS+1))
elif grep -qE "VEREDITO=RESTORE_FALHOU|DIVERGE" "${WORK}/c2.out"; then
  echo "  PASSOU (vermelho como esperado)"
else
  echo "  FALHOU (saiu !=0 mas sem divergência clara):"; sed 's/^/    /' "${WORK}/c2.out"; FALHAS=$((FALHAS+1))
fi

# ---------------------------------------------------------------------------------------------------
# Origem PÓS (caso 3): schema mínimo com CamelCase, RLS/FORCE, policy, migration e 1 Admin.
# ---------------------------------------------------------------------------------------------------
echo "== Caso 3: dump PÓS FIEL (schema + Organization + migration) → RESTORE_OK =="
sobe_pg "${SRC3}"
docker exec -i "${SRC3}" psql -U postgres -d giraffe -q >/dev/null 2>&1 <<'SQL'
create table "Organization"(id int primary key);
alter table "Organization" enable row level security;
alter table "Organization" force row level security;
create policy p on "Organization" using (true);
insert into "Organization" values (1);
create table "Membership"(id int, role text, state text);
insert into "Membership" values (1,'ADMIN','ACTIVE');
create table _prisma_migrations(id text primary key, finished_at timestamptz default now(), rolled_back_at timestamptz);
insert into _prisma_migrations(id) values ('m1');
SQL
DUMP3="${WORK}/pos.dump"
docker exec "${SRC3}" pg_dump -U postgres -d giraffe -Fc > "${DUMP3}"
SHA3=$(sha256sum "${DUMP3}" | awk '{print $1}')
q3() { docker exec "${SRC3}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
T=$(q3 "select count(*) from pg_tables where schemaname='public'")
RF=$(q3 "select count(*) from pg_class where relkind='r' and relnamespace='public'::regnamespace and relforcerowsecurity")
PO=$(q3 "select count(*) from pg_policies where schemaname='public'")
cat > "${DUMP3}.manifest" <<EOF
DUMP_SHA256=${SHA3}
DUMP_BYTES=$(wc -c < "${DUMP3}")
CREATED_UTC=test
MODE=pos
ORIGIN_TABLES_PUBLIC=${T}
ORIGIN_MIGRATIONS_APPLIED=1
ORIGIN_RLS_FORCE_TABLES=${RF}
ORIGIN_POLICIES=${PO}
ORIGIN_APP_DELETE_GRANTS=0
ORIGIN_ORGANIZATIONS=1
ORIGIN_MEMBERSHIPS_ADMIN_ACTIVE=1
EOF
docker rm -f "${SRC3}" >/dev/null 2>&1 || true
if bash "${RV}" "${DUMP3}" >"${WORK}/c3.out" 2>&1 && grep -q "VEREDITO=RESTORE_OK" "${WORK}/c3.out"; then
  echo "  PASSOU"
else
  echo "  FALHOU (esperava RESTORE_OK):"; sed 's/^/    /' "${WORK}/c3.out"; FALHAS=$((FALHAS+1))
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "REGRESSAO_OK"; else echo "REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
