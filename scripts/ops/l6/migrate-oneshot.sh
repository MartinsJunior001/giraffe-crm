#!/usr/bin/env bash
#
# migrate-oneshot.sh — Passos 4 e 5 da Fase B. Aplica as migrations pela ETAPA CONTROLADA (one-shot
# conteinerizado, papel giraffe_migrator — AD-6/AD-32) e emite MIGRATE_ONESHOT_OK **só** com prova NO
# DB REAL por label, de FORA do container one-shot.
#
# CORREÇÃO da causa-raiz do FALSO VERDE (cenário D): o veredito antigo confiava apenas no exit do
# `deploy`/`status` DENTRO do one-shot (conexão `db:5432` na REDE). Se essa conexão resolvesse para
# outro cluster, o one-shot aplicava lá, o status dizia "up to date" lá, e o db real por label ficava
# vazio — MIGRATE_ONESHOT_OK falso. Agora, ANTES de aplicar, provamos que o one-shot alcança o MESMO
# cluster que o db real (comparando `system_identifier`); e DEPOIS, verificamos no db real (por label,
# via docker exec — fora do one-shot) que as migrations foram aplicadas e as tabelas existem.
#
# Recebe do prepara-fase-b.sh:  DIR (clone do commit implantado), REDE (rede do stack).
# Opcionais: PROJ (uuid — mas SÓ o autorizado passa), ENVF (.env do Coolify).
#
# Uso:  DIR=... REDE=... bash scripts/ops/l6/migrate-oneshot.sh
#
set -uo pipefail

# ── GUARDA DE ESCOPO ──────────────────────────────────────────────────────────────────────────────
PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
DIR="${DIR:?defina DIR= (saída de prepara-fase-b.sh)}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh)}"

stop() { echo "STOP: $*" >&2; exit 1; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
test -f "${DIR}/docker-compose.yml" || stop "compose ausente em DIR=${DIR}"
test -f "${DIR}/docker-compose.migrate.yml" || stop "docker-compose.migrate.yml ausente em DIR=${DIR}"

# Exatamente UM container db do projeto (por label EXATA, nunca pelo texto "giraffe").
mapfile -t DBS < <(docker ps -aq \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=db" 2>/dev/null)
[ "${#DBS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container db do projeto ${PROJ}; encontrados ${#DBS[@]}."
CT_DB="${DBS[0]}"

MIGPW=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
[ -n "${MIGPW}" ] || stop "MIGRATOR_PASSWORD ausente no .env."

# Consultas no DB REAL (por label), superuser via socket local.
q_ct() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
migs_fin() { q_ct "select case when to_regclass('public._prisma_migrations') is null then 0 else (select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null) end"; }
tem() { [ "$(q_ct "select case when to_regclass('public.\"$1\"') is null then 0 else 1 end")" = "1" ]; }
estado() {
  echo "  current_database=$(q_ct 'select current_database()') current_schema=$(q_ct 'select current_schema()') current_user=$(q_ct 'select current_user')"
  echo "  to_regclass Account=$(q_ct "select coalesce(to_regclass('public.\"Account\"')::text,'NULL')") AuthCredential=$(q_ct "select coalesce(to_regclass('public.\"AuthCredential\"')::text,'NULL')")"
  echo "  migrations_finalizadas=$(migs_fin) server_id(sanitizado)=${ID_REAL}"
}

# ── PROVA DE MESMO CLUSTER (antes de aplicar) ─────────────────────────────────────────────────────
# system_identifier é único por cluster PostgreSQL. Se o db alcançado pelo one-shot (db:5432 na REDE)
# não for o mesmo cluster que o db real por label, ABORTA — jamais aplica num cluster e valida noutro.
ID_REAL=$(q_ct "select system_identifier from pg_control_system()")
ID_ONESHOT=$(export PGPASSWORD="${MIGPW}"; docker run --rm --network "${REDE}" -e PGPASSWORD postgres:16-alpine \
  psql -h db -p 5432 -U giraffe_migrator -d giraffe -tAc "select system_identifier from pg_control_system()" 2>/dev/null | tr -d '[:space:]')
[ -n "${ID_REAL}" ] || stop "não obtive system_identifier do db real por label."
[ -n "${ID_ONESHOT}" ] || stop "não obtive system_identifier do db alcançado por db:5432 na REDE (o one-shot não alcança o db?)."
if [ "${ID_REAL}" != "${ID_ONESHOT}" ]; then
  stop "DIVERGÊNCIA DE CLUSTER: o one-shot alcança db:5432 (id=${ID_ONESHOT}) ≠ db real por label (id=${ID_REAL}). NÃO migrar — corrija a REDE/topologia."
fi
echo "prova de destino: one-shot e db real por label são o MESMO cluster (system_id confere)."

# Override efêmero de rede: conecta o one-shot à REDE real do stack.
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
dc() {
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${DIR}" \
    -f "${DIR}/docker-compose.yml" -f "${DIR}/docker-compose.migrate.yml" -f "${NET}" "$@"
}

ESPERADO=$(find "${DIR}/apps/api/prisma/migrations" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
echo
echo "== estado do db real ANTES do migrate (migrations esperadas: ${ESPERADO}) =="
estado

echo
echo "== [4] aplicando migrations (one-shot, giraffe_migrator) =="
dc run --rm --build --no-deps migrate; APPLY_RC=$?

echo
echo "== [5] status de pendências (dentro do one-shot) =="
STATUS_OUT=$(dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs status 2>&1); STATUS_RC=$?
printf '%s\n' "${STATUS_OUT}"

echo
echo "== estado do db real DEPOIS do migrate =="
estado

# ── VEREDITO — só OK com verificação EXTERNA no db real por label ─────────────────────────────────
REAL_MIGS=$(migs_fin)
echo
echo "verificação externa (db real por label): apply_rc=${APPLY_RC} status_rc=${STATUS_RC} migrations=${REAL_MIGS}/esperado=${ESPERADO} Account=$(tem Account && echo sim || echo NAO) AuthCredential=$(tem AuthCredential && echo sim || echo NAO)"

if [ "${APPLY_RC}" -eq 0 ] && [ "${STATUS_RC}" -eq 0 ] \
   && [ "${REAL_MIGS}" = "${ESPERADO}" ] && [ "${ESPERADO}" -gt 0 ] \
   && tem Account && tem AuthCredential; then
  echo "MIGRATE_ONESHOT_OK — migrations aplicadas NO DB REAL por label (${REAL_MIGS}/${ESPERADO}), zero pendências, Account/AuthCredential presentes."
else
  echo "MIGRATE_ONESHOT_FALHOU — a verificação externa NO DB REAL não bateu (apply/status/contagem/tabelas)." >&2
  echo "  NÃO prossiga ao provisionamento; o schema NÃO está confirmado no db real por label." >&2
  exit 1
fi
