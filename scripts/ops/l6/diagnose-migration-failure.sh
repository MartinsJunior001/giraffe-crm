#!/usr/bin/env bash
#
# diagnose-migration-failure.sh — READ-ONLY. Diagnostica a falha P3018 da migration inicial
# (`role "giraffe_app" does not exist` no GRANT) e PROVA o estado físico, para decidir a recuperação
# sem adivinhar. Não altera nada. Não imprime o campo `logs` de `_prisma_migrations` (pode conter a
# saída de erro); só timestamps/flags/contagens.
#
# Uso:  bash scripts/ops/l6/diagnose-migration-failure.sh
#       MIGRATION=<nome> PROJ=<uuid> ENVF=/caminho/.env bash scripts/ops/l6/diagnose-migration-failure.sh
#
set -euo pipefail

# GUARDA DE ESCOPO: só o project autorizado; seleção por label EXATA (nunca pelo texto "giraffe").
PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
MIGRATION="${MIGRATION:-20260712000000_init_tenancy_rls}"

stop() { echo "STOP: $*" >&2; exit 1; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."

# Exatamente UM container db do projeto (label EXATA).
mapfile -t DBS < <(docker ps -aq \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=db" 2>/dev/null)
[ "${#DBS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container db do projeto ${PROJ}; encontrados ${#DBS[@]}."
CT_DB="${DBS[0]}"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
existe_tabela() { [ "$(q "select count(*) from information_schema.tables where table_schema='public' and table_name='$1'")" != "0" ]; }

echo "== diagnóstico da falha da migration ${MIGRATION} (READ-ONLY, db real por label) =="
echo "-- identidade do cluster (db real por label, sanitizada) --"
echo "  system_id=$(q "select system_identifier from pg_control_system()")"

echo "-- papéis --"
echo "giraffe_app existe:      $([ "$(q "select count(*) from pg_roles where rolname='giraffe_app'")" = "1" ] && echo sim || echo NAO)  (esperado: NAO — causa da P3018)"
echo "giraffe_migrator existe: $([ "$(q "select count(*) from pg_roles where rolname='giraffe_migrator'")" = "1" ] && echo sim || echo nao)  (esperado: sim — já reconciliado)"

echo "-- linha da migration em _prisma_migrations (sem o campo 'logs') --"
if existe_tabela '_prisma_migrations'; then
  LINHA=$(q "select coalesce(started_at::text,'NULL')||'|'||coalesce(finished_at::text,'NULL')||'|'||coalesce(rolled_back_at::text,'NULL')||'|'||applied_steps_count from _prisma_migrations where migration_name='${MIGRATION}'")
  if [ -n "${LINHA}" ]; then
    IFS='|' read -r STARTED FINISHED ROLLEDBACK STEPS <<EOF
${LINHA}
EOF
    echo "  started_at=${STARTED}"
    echo "  finished_at=${FINISHED}      (NULL = não concluída)"
    echo "  rolled_back_at=${ROLLEDBACK}  (NULL = não marcada como revertida)"
    echo "  applied_steps_count=${STEPS}"
  else
    echo "  (nenhuma linha para ${MIGRATION} — a migration nem chegou a registrar início)"
    FINISHED="AUSENTE"; ROLLEDBACK="AUSENTE"
  fi
else
  echo "  (_prisma_migrations ainda não existe)"
  FINISHED="AUSENTE"; ROLLEDBACK="AUSENTE"
fi

echo "-- inventário de objetos que a migration cria (prova do estado físico) --"
OBJ_TAB=$(q "select count(*) from information_schema.tables where table_schema='public' and table_name in ('Account','Organization','Membership')")
OBJ_TYP=$(q "select count(*) from pg_type where typname in ('MembershipRole','MembershipState')")
OBJ_FUN=$(q "select count(*) from pg_proc where proname in ('current_org_id','current_account_id')")
OBJ_POL=$(q "select count(*) from pg_policies where schemaname='public' and tablename in ('Organization','Membership')")
OBJ_TOTAL=$((OBJ_TAB + OBJ_TYP + OBJ_FUN + OBJ_POL))
echo "  tabelas(Account/Organization/Membership)=${OBJ_TAB}/3  tipos(enum)=${OBJ_TYP}/2  funcoes=${OBJ_FUN}/2  policies=${OBJ_POL}/8"
echo "  OBJETOS_PARCIAIS_TOTAL=${OBJ_TOTAL} (0 = rollback transacional completo)"

echo "-- transação --"
echo "  a migration NÃO tem BEGIN/COMMIT SQL próprio (os BEGIN são blocos DO/plpgsql); o Prisma a"
echo "  envolve numa transação IMPLÍCITA (sem CONCURRENTLY), então a falha tende a rollback completo."
echo "  O down.sql autoritativo (apps/api/prisma/rollback/${MIGRATION}.down.sql) cobre a limpeza se parcial."

echo
if [ "$(q "select count(*) from pg_roles where rolname='giraffe_app'")" != "1" ] \
   && [ "${FINISHED}" = "NULL" ] && [ "${ROLLEDBACK}" = "NULL" ] && [ "${OBJ_TOTAL}" = "0" ]; then
  echo "VEREDITO=RECUPERAVEL_ROLLED_BACK"
  echo "  Causa (giraffe_app ausente) presente; migration em estado FAILED; ZERO objetos parciais."
  echo "  Plano: 1) reconcile-app-role.sh  2) recover-failed-migration.sh (marca rolled-back)  3) migrate."
elif [ "${OBJ_TOTAL}" != "0" ]; then
  echo "VEREDITO=PARCIAL_REQUER_DOWN_SQL"
  echo "  Há ${OBJ_TOTAL} objeto(s) parcial(is): NÃO marcar rolled-back direto. Ensaiar o down.sql em"
  echo "  banco descartável e recuperar fail-closed (ver recover-failed-migration.sh)."
else
  echo "VEREDITO=INCONCLUSIVO — ver os campos acima (estado não bate com o cenário P3018 esperado)."
fi
echo "== fim (nenhuma alteração) =="
