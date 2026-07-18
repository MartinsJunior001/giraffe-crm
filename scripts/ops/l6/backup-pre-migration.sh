#!/usr/bin/env bash
#
# backup-pre-migration.sh — Passos 2 e 7 da Fase B. BACKUP real do banco de staging (antes E depois
# de migrar). READ-ONLY: `pg_dump` não altera dados. Roda DENTRO do container `db` (via `docker exec`,
# como o superusuário `postgres` do container), em formato custom (`-Fc`).
#
# Além do dump, grava um MANIFEST sanitizado (só contagens/flags, NUNCA dados/PII) com o SHA-256 do
# dump e as contagens da ORIGEM. É o manifest que o restore-verify.sh usa para comparar origem ×
# restaurado — assim um banco VAZIO pré-migration (0 tabelas) é aprovado quando o restore também dá 0
# (fiel), sem exigir schema que ainda não existe.
#
# Uso:  bash scripts/ops/l6/backup-pre-migration.sh
#       OUT_DIR=/caminho PROJ=<uuid> bash scripts/ops/l6/backup-pre-migration.sh
#
set -euo pipefail

# GUARDA DE ESCOPO: só o project autorizado; seleção por label EXATA (nunca pelo texto "giraffe").
PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
OUT_DIR="${OUT_DIR:-/tmp/giraffe-l6-backup}"

stop() { echo "STOP: $*" >&2; exit 1; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."

# Exatamente UM container db do projeto (label EXATA).
mapfile -t DBS < <(docker ps -aq \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=db" 2>/dev/null)
[ "${#DBS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container db do projeto ${PROJ}; encontrados ${#DBS[@]}."
CT_DB="${DBS[0]}"

# Uma consulta SELECT read-only por chamada. tr remove o \n/espaços do -tA.
q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }

# Contagens da origem. As tabelas que podem NÃO existir (banco vazio pré-migration) são guardadas por
# to_regclass, que recebe uma STRING — nunca referencia a relação no parse (senão o planner falharia
# no CASE antes do short-circuit). Emite 7 campos por '|'.
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

mkdir -p "${OUT_DIR}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="${OUT_DIR}/giraffe-${TS}.dump"
MANIFEST="${DUMP}.manifest"

docker exec "${CT_DB}" pg_dump -U postgres -d giraffe -Fc > "${DUMP}"
SIZE=$(wc -c < "${DUMP}")
[ "${SIZE}" -gt 0 ] || stop "dump vazio (0 bytes) — backup NÃO confiável"
SHA=$(sha256sum "${DUMP}" | awk '{print $1}')

IFS='|' read -r O_TABLES O_MIG O_RLSF O_POL O_APPDEL O_ORGS O_MEMB < <(contagens)

# Modo derivado do estado real da origem: 0 tabelas ⇒ pré-migration (vazio esperado).
if [ "${O_TABLES:-0}" = "0" ]; then MODE=pre; else MODE=pos; fi

{
  echo "# manifest de backup L6 — sanitizado (só contagens/flags, sem PII)"
  echo "DUMP_SHA256=${SHA}"
  echo "DUMP_BYTES=${SIZE}"
  echo "CREATED_UTC=${TS}"
  echo "MODE=${MODE}"
  echo "ORIGIN_TABLES_PUBLIC=${O_TABLES}"
  echo "ORIGIN_MIGRATIONS_APPLIED=${O_MIG}"
  echo "ORIGIN_RLS_FORCE_TABLES=${O_RLSF}"
  echo "ORIGIN_POLICIES=${O_POL}"
  echo "ORIGIN_APP_DELETE_GRANTS=${O_APPDEL}"
  echo "ORIGIN_ORGANIZATIONS=${O_ORGS}"
  echo "ORIGIN_MEMBERSHIPS_ADMIN_ACTIVE=${O_MEMB}"
} > "${MANIFEST}"

echo "BACKUP_OK"
echo "ARQUIVO=${DUMP}"
echo "MANIFEST=${MANIFEST}"
echo "BYTES=${SIZE}"
echo "SHA256=${SHA}"
echo "MODE=${MODE}"
echo "ORIGIN_TABLES_PUBLIC=${O_TABLES}"
echo
echo "Passe ARQUIVO ao restore-verify.sh (ele lê ${MANIFEST##*/} ao lado). No modo 'pre', 0 tabelas na"
echo "origem e 0 restauradas = restore fiel (RESTORE_OK). No modo 'pos', a comparação é estrita."
