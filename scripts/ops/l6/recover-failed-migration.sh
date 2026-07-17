#!/usr/bin/env bash
#
# recover-failed-migration.sh — Recupera a migration inicial falha (P3018) APÓS a causa ter sido
# remediada (giraffe_app reconciliado). PROVA o estado físico antes de agir:
#
#   • ZERO objetos parciais (rollback transacional completo) ⇒ marca a migration como ROLLED-BACK
#     (via db-migrate.mjs resolve-rolled-back, papel migrator) para que o migrate seguinte a reaplique.
#   • QUALQUER objeto parcial ⇒ NÃO marca nada: bloqueia fail-closed e manda ensaiar o down.sql em
#     banco descartável (recuperação específica), porque marcar rolled-back com objetos vivos mentiria.
#
# NUNCA marca `--applied`. NUNCA mexe em dados nem no backup pré-migration aprovado. Exige a causa
# remediada (giraffe_app presente). Recebe DIR/REDE do prepara-fase-b.sh (para o one-shot).
#
# Uso:  DIR=... REDE=... bash scripts/ops/l6/recover-failed-migration.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
MIGRATION="${MIGRATION:-20260712000000_init_tenancy_rls}"
DIR="${DIR:?defina DIR= (saída de prepara-fase-b.sh)}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh)}"

stop() { echo "STOP: $*" >&2; exit 1; }
container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
test -f "${DIR}/docker-compose.migrate.yml" || stop "docker-compose.migrate.yml ausente em DIR=${DIR}"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }

# Pré-condição: a causa da P3018 tem de estar remediada.
[ "$(q "select count(*) from pg_roles where rolname='giraffe_app'")" = "1" ] \
  || stop "giraffe_app ainda AUSENTE — rode reconcile-app-role.sh antes (a causa da P3018 não foi remediada)"

# PROVA do estado físico: inventário dos objetos da migration.
OBJ_TAB=$(q "select count(*) from information_schema.tables where table_schema='public' and table_name in ('Account','Organization','Membership')")
OBJ_TYP=$(q "select count(*) from pg_type where typname in ('MembershipRole','MembershipState')")
OBJ_FUN=$(q "select count(*) from pg_proc where proname in ('current_org_id','current_account_id')")
OBJ_POL=$(q "select count(*) from pg_policies where schemaname='public' and tablename in ('Organization','Membership')")
OBJ_TOTAL=$((OBJ_TAB + OBJ_TYP + OBJ_FUN + OBJ_POL))
echo "OBJETOS_PARCIAIS_TOTAL=${OBJ_TOTAL} (tabelas=${OBJ_TAB} tipos=${OBJ_TYP} funcoes=${OBJ_FUN} policies=${OBJ_POL})"

if [ "${OBJ_TOTAL}" != "0" ]; then
  echo "RECOVER_BLOCKED_PARCIAL — há ${OBJ_TOTAL} objeto(s) parcial(is) da migration." >&2
  echo "  NÃO é seguro marcar rolled-back (o estado físico não corresponde). Recuperação específica:" >&2
  echo "  1) ENSAIE o down.sql em banco descartável (restore-verify usa o backup; aqui use o down.sql" >&2
  echo "     autoritativo apps/api/prisma/rollback/${MIGRATION}.down.sql, que é idempotente/IF EXISTS);" >&2
  echo "  2) só então aplique-o no staging pelo papel migrator e re-rode este script (deve dar 0)." >&2
  exit 1
fi

# Estado da linha: só marca rolled-back se estiver FAILED (finished_at NULL, rolled_back_at NULL).
if [ "$(q "select count(*) from information_schema.tables where table_schema='public' and table_name='_prisma_migrations'")" = "0" ]; then
  stop "_prisma_migrations ausente — nada a recuperar por este caminho"
fi
FINISHED=$(q "select coalesce(finished_at::text,'NULL') from _prisma_migrations where migration_name='${MIGRATION}'")
ROLLEDBACK=$(q "select coalesce(rolled_back_at::text,'NULL') from _prisma_migrations where migration_name='${MIGRATION}'")
if [ "${FINISHED}" != "NULL" ]; then
  stop "a migration ${MIGRATION} não está em estado FAILED (finished_at=${FINISHED}) — não marcar rolled-back"
fi
if [ "${ROLLEDBACK}" != "NULL" ]; then
  echo "RECOVER_OK (idempotente) — ${MIGRATION} já estava marcada rolled-back; siga para o migrate."
  exit 0
fi

# Override efêmero de rede (mesmo do migrate-oneshot): conecta o one-shot à REDE real do stack.
NET="${DIR}/docker-compose.l6net.yml"
cat > "${NET}" <<EOF
networks:
  l6stack:
    external: true
    name: ${REDE}
services:
  migrate:
    networks: [l6stack]
  provision:
    networks: [l6stack]
EOF

echo "estado físico provado: ZERO objetos parciais + migration FAILED. Marcando rolled-back…"
docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${DIR}" \
  -f "${DIR}/docker-compose.yml" -f "${DIR}/docker-compose.migrate.yml" -f "${NET}" \
  run --rm --no-deps migrate node ../../scripts/db-migrate.mjs resolve-rolled-back "${MIGRATION}"

# Confirma a marca.
ROLLEDBACK2=$(q "select coalesce(rolled_back_at::text,'NULL') from _prisma_migrations where migration_name='${MIGRATION}'")
[ "${ROLLEDBACK2}" != "NULL" ] || stop "resolve executado mas rolled_back_at ainda NULL — investigar (fail-closed)"

echo "RECOVER_OK — ${MIGRATION} marcada rolled-back (estado físico limpo comprovado)."
echo "Próximo: DIR/REDE + migrate-oneshot.sh (aplica do zero e exige zero pendências)."
