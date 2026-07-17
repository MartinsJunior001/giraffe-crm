#!/usr/bin/env bash
#
# repair-migrator-password.sh — Reparo CONTROLADO do drift de senha do giraffe_migrator no STAGING.
#
# Faz UMA coisa: realinha a SENHA do papel giraffe_migrator ao valor de MIGRATOR_PASSWORD do .env.
# NÃO cria papel, NÃO toca giraffe_app/postgres/outros papéis, NÃO altera atributos (login/super/
# bypassrls/ownership), NÃO migra, NÃO provisiona. Idempotente e fail-closed.
#
# A senha nunca aparece em argumento, log nem arquivo novo: chega ao container por env HERDADO
# (`-e MIGRATOR_PASSWORD_SRC` sem valor), é lida pelo psql com `\getenv`, e o `ALTER ROLE` usa o
# placeholder `:'p'` (quoting seguro). A sessão desliga `log_statement` por garantia.
#
# GUARDAS (fail-closed): aborta se MIGRATOR_PASSWORD ausente/vazio, se o papel não existir, se os
# atributos autoritativos mudarem, ou se a autenticação continuar falhando após o ALTER.
#
# Uso:  bash scripts/ops/l6/repair-migrator-password.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"

stop() { echo "STOP: $*" >&2; exit 1; }
container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"

# Fail-closed: só repara com uma senha real no .env.
grep -qE '^MIGRATOR_PASSWORD=.+' "${ENVF}" || stop "MIGRATOR_PASSWORD ausente/vazio no .env — não reparar às cegas"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }
[ "$(q "select count(*) from pg_roles where rolname='giraffe_migrator'")" = "1" ] || \
  stop "giraffe_migrator não existe — não é drift de senha (este script NÃO cria papel)"

# Atributos autoritativos ANTES (para provar preservação).
ANTES=$(q "select rolcanlogin||'/'||rolsuper||'/'||rolbypassrls from pg_roles where rolname='giraffe_migrator'")
echo "atributos_antes(canlogin/super/bypassrls)=${ANTES}"

# --- ALTER só da SENHA -----------------------------------------------------------------------------
# A senha é lida para uma env var do shell e HERDADA pelo container (-e sem valor). O psql a puxa com
# \getenv para uma variável psql e o ALTER usa :'p'. Nada disso aparece em `ps`/log/arquivo.
MIGRATOR_PASSWORD_SRC=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
[ -n "${MIGRATOR_PASSWORD_SRC}" ] || stop "senha lida vazia"
export MIGRATOR_PASSWORD_SRC
docker exec -i -e MIGRATOR_PASSWORD_SRC "${CT_DB}" \
  psql -U postgres -d giraffe -v ON_ERROR_STOP=1 <<'SQL'
SET log_statement = 'none';
\getenv p MIGRATOR_PASSWORD_SRC
ALTER ROLE giraffe_migrator WITH PASSWORD :'p';
SQL
unset MIGRATOR_PASSWORD_SRC

# Atributos DEPOIS — têm de ser IDÊNTICOS (só a senha mudou).
DEPOIS=$(q "select rolcanlogin||'/'||rolsuper||'/'||rolbypassrls from pg_roles where rolname='giraffe_migrator'")
echo "atributos_depois(canlogin/super/bypassrls)=${DEPOIS}"
[ "${ANTES}" = "${DEPOIS}" ] || stop "atributos autoritativos mudaram — ABORTAR (esperado idêntico)"

# Re-teste de autenticação pelo IP NÃO-loopback (a regra 127.0.0.1/32 é trust e mascararia o teste).
# Subshell; senha não vaza.
AUTH=AUTH_FAIL
IPDB=$(docker exec "${CT_DB}" hostname -i | awk '{print $1}')
if (
      P=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
      [ -n "${P}" ] || exit 1
      export PGPASSWORD="${P}"
      docker exec -e PGPASSWORD "${CT_DB}" \
        psql -U giraffe_migrator -d giraffe -h "${IPDB}" -tAc 'select 1' >/dev/null 2>&1
   ); then AUTH=AUTH_OK; fi
echo "AUTENTICACAO_POS_REPARO=${AUTH}"
[ "${AUTH}" = "AUTH_OK" ] || stop "ALTER aplicado mas a autenticação ainda falha — investigar (fail-closed)"

echo "REPAIR_OK — senha do giraffe_migrator alinhada ao .env; atributos preservados; AUTH_OK."
echo "Próximo: repita o migrate one-shot e exija zero migrations pendentes."
