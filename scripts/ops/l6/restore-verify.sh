#!/usr/bin/env bash
#
# restore-verify.sh — Passos 3 e 7 da Fase B. RESTORE efetivo de um dump num PostgreSQL DESCARTÁVEL
# e comparação ORIGEM × RESTAURADO pelo manifest gerado no backup. NÃO toca o banco de staging real.
#
# O que corrige (regressão do dono 2026-07-17): um backup PRÉ-migration é de um banco VAZIO (0
# tabelas — as migrations são o passo 4). Um restore FIEL desse dump também dá 0 tabelas, e isso é
# APROVADO. A verificação não é "tem schema?", e sim "o restaurado bate com a origem registrada no
# manifest?":
#   • MODE=pre: origem 0 tabelas e restaurado 0 tabelas ⇒ RESTORE_OK (fiel). Vazio NÃO passa
#     automático: se a origem dizia N>0 e o restore deu 0, é DIVERGÊNCIA (vermelho).
#   • MODE=pos: exige schema/migrations/RLS-FORCE/policies/grants/tenant e as contagens ESSENCIAIS
#     iguais às da origem, além de sanidade estrita (migrations>0, RLS-FORCE>0, ≥1 Organization).
#
# Segurança: o container de verificação é efêmero, sem volume/porta, e removido no fim COM GUARDA DE
# NOME (só remove 'giraffe-restore-check-*'; NUNCA toca o container do banco nem o database 'giraffe').
#
# Uso:  bash scripts/ops/l6/restore-verify.sh /caminho/para/backup.dump [/caminho/para/manifest]
#
set -euo pipefail

DUMP="${1:?uso: restore-verify.sh <arquivo.dump> [manifest]}"
MANIFEST="${2:-${DUMP}.manifest}"
[ -f "${DUMP}" ] || { echo "STOP: dump não encontrado: ${DUMP}" >&2; exit 1; }
[ -f "${MANIFEST}" ] || { echo "STOP: manifest não encontrado: ${MANIFEST} (rode o backup atualizado)" >&2; exit 1; }

NAME="giraffe-restore-check-$$-$(date +%s)"
ERRLOG=$(mktemp /tmp/giraffe-restore.XXXXXX.err)

cleanup() {
  # GUARDA DE NOME: só removemos o descartável que ESTE script criou. Nunca 'giraffe' nem o db real.
  case "${NAME}" in
    giraffe-restore-check-*) docker rm -f "${NAME}" >/dev/null 2>&1 || true ;;
    *) echo "RECUSA: nome de container inesperado ('${NAME}') — nada removido" >&2 ;;
  esac
  rm -f "${ERRLOG}" 2>/dev/null || true
}
trap cleanup EXIT

# --- Manifest (fonte da verdade da ORIGEM) ---------------------------------------------------------
# Lê só chaves conhecidas (allowlist), ignorando comentários. Nada é executado do manifest.
manifest_val() { grep -E "^$1=" "${MANIFEST}" | head -1 | cut -d= -f2- | tr -d '[:space:]'; }
M_SHA=$(manifest_val DUMP_SHA256)
MODE=$(manifest_val MODE)
O_TABLES=$(manifest_val ORIGIN_TABLES_PUBLIC)
O_MIG=$(manifest_val ORIGIN_MIGRATIONS_APPLIED)
O_RLSF=$(manifest_val ORIGIN_RLS_FORCE_TABLES)
O_POL=$(manifest_val ORIGIN_POLICIES)
O_APPDEL=$(manifest_val ORIGIN_APP_DELETE_GRANTS)
O_ORGS=$(manifest_val ORIGIN_ORGANIZATIONS)
O_MEMB=$(manifest_val ORIGIN_MEMBERSHIPS_ADMIN_ACTIVE)
[ -n "${MODE}" ] && [ -n "${O_TABLES}" ] || { echo "STOP: manifest incompleto/ilegível" >&2; exit 1; }

# --- Integridade: o dump é o que o manifest descreve? ----------------------------------------------
SHA_ATUAL=$(sha256sum "${DUMP}" | awk '{print $1}')
[ "${SHA_ATUAL}" = "${M_SHA}" ] || { echo "STOP: SHA-256 do dump difere do manifest (dump adulterado ou manifest de outro dump)" >&2; exit 1; }

# --- Banco DESCARTÁVEL -----------------------------------------------------------------------------
PW="v_$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 20)"
docker run -d --rm --name "${NAME}" \
  -e POSTGRES_PASSWORD="${PW}" -e POSTGRES_DB=giraffe \
  postgres:16-alpine >/dev/null

# Espera por uma query REAL (`select 1`), não `pg_isready`: o entrypoint do postgres sobe em modo
# init, roda scripts e REINICIA — `pg_isready` pega a janela intermediária e a query seguinte falha
# com "the database system is shutting down". `select 1` só retorna 1 no servidor final, pronto.
pronto=""
for _ in $(seq 1 60); do
  if [ "$(docker exec "${NAME}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ]; then pronto=1; break; fi
  sleep 1
done
[ -n "${pronto}" ] || { echo "STOP: banco descartável não ficou pronto" >&2; exit 1; }

# Recria só os NOMES dos papéis para que GRANTs/policies do dump apliquem sem ruído de role ausente.
docker exec "${NAME}" psql -U postgres -d postgres -q \
  -c "do \$\$ begin create role giraffe_app; exception when duplicate_object then null; end \$\$;" \
  -c "do \$\$ begin create role giraffe_migrator; exception when duplicate_object then null; end \$\$;" \
  >/dev/null 2>&1 || true

# Restore efetivo (mantém privileges/policies; sem owner, que aqui é irrelevante).
docker exec -i "${NAME}" pg_restore -U postgres -d giraffe --no-owner < "${DUMP}" 2>"${ERRLOG}" || true

# --- Contagens do RESTAURADO (mesma coleta defensiva do backup) ------------------------------------
# to_regclass recebe uma STRING (nunca referencia a relação no parse) — assim contar tabelas que
# podem não existir não quebra o SELECT antes do short-circuit.
q() { docker exec "${NAME}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
existe() { [ "$(q "select count(*) from information_schema.tables where table_schema='public' and table_name='$1'")" != "0" ]; }
contagens() {
  local tables rlsf pol appdel mig orgs memb
  tables=$(q "select count(*) from pg_tables where schemaname='public'")
  rlsf=$(q "select count(*) from pg_class where relkind='r' and relnamespace='public'::regnamespace and relforcerowsecurity")
  pol=$(q "select count(*) from pg_policies where schemaname='public'")
  appdel=$(q "select count(*) from information_schema.role_table_grants where grantee='giraffe_app' and privilege_type='DELETE'")
  if existe '_prisma_migrations'; then
    mig=$(q "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")
  else mig=0; fi
  if existe 'Organization'; then orgs=$(q "select count(*) from \"Organization\""); else orgs=0; fi
  if existe 'Membership'; then
    memb=$(q "select count(*) from \"Membership\" where role='ADMIN' and state='ACTIVE'")
  else memb=0; fi
  echo "${tables}|${mig}|${rlsf}|${pol}|${appdel}|${orgs}|${memb}"
}

IFS='|' read -r R_TABLES R_MIG R_RLSF R_POL R_APPDEL R_ORGS R_MEMB < <(contagens)

# --- Comparação origem × restaurado ----------------------------------------------------------------
FALHAS=0
cmp_eq() { # rótulo, esperado, obtido
  if [ "${2}" != "${3}" ]; then echo "  DIVERGE ${1}: origem=${2} restaurado=${3}"; FALHAS=$((FALHAS+1));
  else echo "  ok ${1}: ${3}"; fi
}
ge1() { # rótulo, obtido (exige >=1)
  if [ "${2:-0}" -ge 1 ] 2>/dev/null; then echo "  ok ${1}: ${2}";
  else echo "  FALTA ${1}: ${2} (esperado >=1)"; FALHAS=$((FALHAS+1)); fi
}

echo "RESTORE_VERIFY (MODE=${MODE})"
echo "LINHAS_ERROR_NO_RESTORE=$(grep -ciE 'error:' "${ERRLOG}" 2>/dev/null || echo 0) (GRANTs a papéis sem login no ambiente de verificação são esperados)"

if [ "${MODE}" = "pre" ]; then
  # Fiel = origem e restaurado descrevem o MESMO banco vazio.
  cmp_eq TABELAS "${O_TABLES}" "${R_TABLES}"
  cmp_eq MIGRATIONS "${O_MIG}" "${R_MIG}"
  cmp_eq POLICIES "${O_POL}" "${R_POL}"
  cmp_eq ORGANIZATIONS "${O_ORGS}" "${R_ORGS}"
else
  # Pós-migration: comparação estrita de TODAS as contagens essenciais + sanidade mínima.
  cmp_eq TABELAS "${O_TABLES}" "${R_TABLES}"
  cmp_eq MIGRATIONS "${O_MIG}" "${R_MIG}"
  cmp_eq RLS_FORCE "${O_RLSF}" "${R_RLSF}"
  cmp_eq POLICIES "${O_POL}" "${R_POL}"
  cmp_eq APP_DELETE_GRANTS "${O_APPDEL}" "${R_APPDEL}"
  cmp_eq ORGANIZATIONS "${O_ORGS}" "${R_ORGS}"
  cmp_eq MEMBERSHIPS_ADMIN_ACTIVE "${O_MEMB}" "${R_MEMB}"
  # Sanidade estrita: um backup pós-migration TEM de ter schema, migrations, FORCE RLS e ≥1 Org.
  ge1 SCHEMA_TABELAS "${R_TABLES}"
  ge1 MIGRATIONS_APLICADAS "${R_MIG}"
  ge1 RLS_FORCE_TABELAS "${R_RLSF}"
  ge1 ORGANIZATIONS "${R_ORGS}"
fi

echo
if [ "${FALHAS}" -eq 0 ]; then
  echo "VEREDITO=RESTORE_OK"
else
  echo "VEREDITO=RESTORE_FALHOU (${FALHAS} divergência(s))" >&2
  echo "---- primeiras linhas de erro do pg_restore ----" >&2
  head -20 "${ERRLOG}" >&2
  exit 1
fi
