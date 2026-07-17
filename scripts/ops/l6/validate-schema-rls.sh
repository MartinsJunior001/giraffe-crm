#!/usr/bin/env bash
#
# validate-schema-rls.sh — Passo 8 da Fase B. Validação READ-ONLY (só SELECT) do banco de staging:
# schema, RLS ENABLE+FORCE, contagem de policies, GRANTs do runtime (giraffe_app), migrations
# aplicadas e presença do tenant. NÃO altera nada e NÃO imprime PII (só contagens/flags).
#
# Uso:  bash scripts/ops/l6/validate-schema-rls.sh
#       PROJ=<uuid> bash scripts/ops/l6/validate-schema-rls.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
stop() { echo "STOP: $*" >&2; exit 1; }

container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"

# Todo acesso é SELECT, como o superusuário do container. Read-only por construção.
q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '\r'; }

echo "== Validação read-only — schema / RLS / grants / tenant =="
echo

echo "-- [1] papéis (AD-6) --"
echo "  giraffe_app: BYPASSRLS=$(q "select rolbypassrls from pg_roles where rolname='giraffe_app'") SUPERUSER=$(q "select rolsuper from pg_roles where rolname='giraffe_app'")  (esperado: f / f)"
echo "  giraffe_migrator existe: $(q "select count(*) from pg_roles where rolname='giraffe_migrator'")  (esperado: 1)"
echo

echo "-- [2] RLS ENABLE+FORCE por tabela (organizacionais esperadas t/t) --"
q "select '  '||relname||'  rls='||relrowsecurity||'  force='||relforcerowsecurity
   from pg_class where relkind='r' and relnamespace='public'::regnamespace
   and relname not like '\_prisma%' order by relname"
echo

echo "-- [3] policies por tabela (deny-by-default exige policies) --"
q "select '  '||tablename||': '||count(*)||' policies' from pg_policies
   where schemaname='public' group by tablename order by tablename"
echo

echo "-- [4] GRANTs do runtime giraffe_app (fronteira de segurança) --"
echo "  DELETE concedidos a giraffe_app (esperado 0 nas append-only; ver runbook): $(q "select count(*) from information_schema.role_table_grants where grantee='giraffe_app' and privilege_type='DELETE'")"
echo "  privilégios em Account (esperado só SELECT): $(q "select coalesce(string_agg(privilege_type,','),'(nenhum)') from information_schema.role_table_grants where grantee='giraffe_app' and table_name='Account'")"
echo "  UPDATE em Card (esperado column-scoped — ver colunas):"
q "select '    '||column_name from information_schema.column_privileges where grantee='giraffe_app' and table_name='Card' and privilege_type='UPDATE' order by column_name"
echo

echo "-- [5] migrations (Prisma) --"
echo "  aplicadas (finished, sem rollback): $(q "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")"
echo "  em falha/rollback (esperado 0): $(q "select count(*) from _prisma_migrations where rolled_back_at is not null or finished_at is null")"
echo

echo "-- [6] tenant provisionado (contagens, SEM PII) --"
echo "  Organizations: $(q "select count(*) from \"Organization\"")"
echo "  Memberships ADMIN ACTIVE: $(q "select count(*) from \"Membership\" where role='ADMIN' and state='ACTIVE'")"
echo "  Accounts: $(q "select count(*) from \"Account\"")"
echo
echo "== fim — nenhuma alteração (somente SELECT) =="
