#!/usr/bin/env bash
#
# validate-schema-rls.sh — Passo 8 da Fase B. Validação READ-ONLY (só SELECT) do banco de staging, com
# VEREDITO inequívoco (VALIDATE_SCHEMA_RLS_OK / VALIDATE_SCHEMA_RLS_FALHOU + exit code). NÃO altera nada;
# não imprime PII (só contagens/flags). Diferencia HISTÓRICO de recovery (rolled_back_at IS NOT NULL,
# com reaplicação posterior finalizada) de FALHA pendente real (finished_at IS NULL AND rolled_back_at
# IS NULL). Valida RLS ENABLE+FORCE nas organizacionais e a allowlist de tabelas GLOBAIS sem RLS.
#
# Uso:  bash scripts/ops/l6/validate-schema-rls.sh
#       ESPERADO_MIGRATIONS=19 PROJ=<uuid> bash scripts/ops/l6/validate-schema-rls.sh
#
set -uo pipefail  # sem -e: acumulamos falhas e SEMPRE emitimos o veredito.

# GUARDA DE ESCOPO: só o project autorizado; seleção por label EXATA (nunca pelo texto "giraffe").
PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
ESPERADO_MIGRATIONS="${ESPERADO_MIGRATIONS:-19}"
stop() { echo "STOP: $*" >&2; exit 2; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."

mapfile -t DBS < <(docker ps -aq \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=db" 2>/dev/null)
[ "${#DBS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container db do projeto ${PROJ}; encontrados ${#DBS[@]}."
CT_DB="${DBS[0]}"

# Tabelas GLOBAIS por design (sem RLS): identidade/auth/antiabuso + resolução de tenant pré-contexto.
GLOBAIS_SQL="'Account','AuthCredential','AuthSession','AuthVerification','LoginFailure','PublicFormRoute','RateLimit'"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" 2>/dev/null | tr -d '\r'; }
FALHAS=0
ok()    { echo "  ok: $*"; }
falha() { echo "  FALHA: $*"; FALHAS=$((FALHAS+1)); }

echo "== Validação read-only — schema / RLS / grants / migrations / tenant =="

echo "-- [1] papéis (AD-6) --"
APP_BYPASS=$(q "select rolbypassrls from pg_roles where rolname='giraffe_app'")
APP_SUPER=$(q "select rolsuper from pg_roles where rolname='giraffe_app'")
if [ "${APP_BYPASS}" = "f" ] && [ "${APP_SUPER}" = "f" ]; then ok "giraffe_app sem BYPASSRLS/SUPER"; else falha "giraffe_app BYPASSRLS=${APP_BYPASS} SUPER=${APP_SUPER} (esperado f/f)"; fi
if [ "$(q "select count(*) from pg_roles where rolname='giraffe_migrator'")" = "1" ]; then ok "giraffe_migrator existe"; else falha "giraffe_migrator ausente"; fi

echo "-- [2] RLS ENABLE+FORCE (organizacionais) e allowlist de globais --"
q "select '    '||relname||' rls='||relrowsecurity||' force='||relforcerowsecurity from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname not like '\_prisma%' order by relname"
ORG_SEM=$(q "select coalesce(string_agg(relname,','),'') from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname not like '\_prisma%' and relname not in (${GLOBAIS_SQL}) and (not relrowsecurity or not relforcerowsecurity)")
if [ -z "${ORG_SEM}" ]; then ok "todas as organizacionais com RLS ENABLE+FORCE"; else falha "organizacionais SEM RLS/FORCE: ${ORG_SEM}"; fi
INESP=$(q "select coalesce(string_agg(relname,','),'') from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname not like '\_prisma%' and not relrowsecurity and relname not in (${GLOBAIS_SQL})")
if [ -z "${INESP}" ]; then ok "nenhuma tabela sem RLS fora da allowlist de globais"; else falha "tabelas sem RLS INESPERADAS (RLS removido?): ${INESP}"; fi
# Global por DESIGN, explicitamente (o dono pediu): PublicFormRoute e RateLimit sem RLS.
# relrowsecurity::text rende 'true'/'false' (não 't'/'f'). Global por design => 'false'.
PFR=$(q "select coalesce((select relrowsecurity::text from pg_class where relname='PublicFormRoute' and relnamespace='public'::regnamespace),'ausente')")
RL=$(q "select coalesce((select relrowsecurity::text from pg_class where relname='RateLimit' and relnamespace='public'::regnamespace),'ausente')")
if [ "${PFR}" = "false" ]; then ok "PublicFormRoute global por design (sem RLS)"; else falha "PublicFormRoute rls=${PFR} (esperado global sem RLS = false)"; fi
if [ "${RL}" = "false" ]; then ok "RateLimit global por design (sem RLS)"; else falha "RateLimit rls=${RL} (esperado global sem RLS = false)"; fi

echo "-- [3] policies por tabela (informativo) --"
q "select '    '||tablename||': '||count(*)||' policies' from pg_policies where schemaname='public' group by tablename order by tablename"

echo "-- [4] GRANTs do runtime giraffe_app --"
# DELETE é permitido por design SÓ em tabelas de sessão/antiabuso/membership. Em qualquer append-only
# (Card/CardHistory/FormVersion/Record/…) seria um risco. Allowlist de DELETE:
DEL_ALLOW="'AuthSession','AuthVerification','LoginFailure','Membership','RateLimit'"
DEL_INESP=$(q "select coalesce(string_agg(table_name,','),'') from information_schema.role_table_grants where grantee='giraffe_app' and privilege_type='DELETE' and table_name not in (${DEL_ALLOW})")
if [ -z "${DEL_INESP}" ]; then ok "DELETE de giraffe_app só nas tabelas esperadas (sessão/antiabuso/membership)"; else falha "DELETE INESPERADO de giraffe_app (append-only?): ${DEL_INESP}"; fi
ACC_PRIV=$(q "select coalesce(string_agg(distinct privilege_type,','),'(nenhum)') from information_schema.role_table_grants where grantee='giraffe_app' and table_name='Account'")
if [ "${ACC_PRIV}" = "SELECT" ]; then ok "Account só SELECT p/ giraffe_app"; else falha "Account privilégios=${ACC_PRIV} (esperado só SELECT)"; fi
CARD_COL=$(q "select count(*) from information_schema.column_privileges where grantee='giraffe_app' and table_name='Card' and privilege_type='UPDATE'")
CARD_TAB=$(q "select count(*) from information_schema.role_table_grants where grantee='giraffe_app' and table_name='Card' and privilege_type='UPDATE'")
if [ "${CARD_COL:-0}" -gt 0 ] 2>/dev/null && [ "${CARD_TAB:-0}" = "0" ]; then ok "UPDATE de Card column-scoped (${CARD_COL} colunas)"; else falha "UPDATE de Card NÃO column-scoped (cols=${CARD_COL} tabela=${CARD_TAB})"; fi

echo "-- [5] migrations (histórico recuperado ≠ falha pendente) --"
FIN=$(q "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")
PEND=$(q "select count(*) from _prisma_migrations where finished_at is null and rolled_back_at is null")
HIST=$(q "select count(*) from _prisma_migrations where rolled_back_at is not null")
HIST_SEM_REAP=$(q "select count(distinct m1.migration_name) from _prisma_migrations m1 where m1.rolled_back_at is not null and not exists (select 1 from _prisma_migrations m2 where m2.migration_name=m1.migration_name and m2.finished_at is not null and m2.rolled_back_at is null)")
echo "    finalizadas=${FIN}  historico_rolled_back=${HIST}  nao_resolvidas=${PEND}  historico_sem_reaplicacao=${HIST_SEM_REAP}"
if [ "${FIN}" = "${ESPERADO_MIGRATIONS}" ]; then ok "migrations finalizadas = ${ESPERADO_MIGRATIONS}"; else falha "migrations finalizadas=${FIN} (esperado ${ESPERADO_MIGRATIONS})"; fi
if [ "${PEND}" = "0" ]; then ok "zero migrations não resolvidas (nenhuma falha pendente real)"; else falha "migrations NÃO resolvidas=${PEND} (falha pendente real: finished NULL & rolled_back NULL)"; fi
if [ "${HIST_SEM_REAP}" = "0" ]; then ok "todo histórico rolled-back tem reaplicação finalizada"; else falha "${HIST_SEM_REAP} migration(s) rolled-back SEM reaplicação finalizada"; fi

echo "-- [6] tenant provisionado (contagens, SEM PII) --"
ORGS=$(q "select count(*) from \"Organization\"")
ADM=$(q "select count(*) from \"Membership\" where role='ADMIN' and state='ACTIVE'")
echo "    Organizations=${ORGS}  Memberships_ADMIN_ACTIVE=${ADM}  Accounts=$(q "select count(*) from \"Account\"")"
if [ "${ORGS}" = "1" ]; then ok "1 Organization"; else falha "Organizations=${ORGS} (esperado 1)"; fi
if [ "${ADM:-0}" -ge 1 ] 2>/dev/null; then ok "${ADM} Membership ADMIN ACTIVE"; else falha "Membership ADMIN ACTIVE=${ADM} (esperado ≥1)"; fi

echo
if [ "${FALHAS}" -eq 0 ]; then
  echo "VALIDATE_SCHEMA_RLS_OK"
  exit 0
else
  echo "VALIDATE_SCHEMA_RLS_FALHOU (${FALHAS} verificação(ões) reprovada(s))" >&2
  exit 1
fi
