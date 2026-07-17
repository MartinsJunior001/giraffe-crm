#!/usr/bin/env bash
#
# migrate-oneshot.sh — Passos 4 e 5 da Fase B. Aplica as migrations pela ETAPA CONTROLADA (one-shot
# conteinerizado, papel giraffe_migrator — AD-6/AD-32) e confirma ZERO pendências. Nunca migra no
# boot; nunca usa o giraffe_app.
#
# Recebe do prepara-fase-b.sh (rode-o antes e exporte):
#   DIR   = clone do commit EFETIVAMENTE implantado (o Coolify apaga o artifact; o prepara o reconstrói)
#   REDE  = rede gerenciada do stack (onde db:5432 resolve) — no padrão nativo, Internal=false
# Opcionais: PROJ (uuid), ENVF (.env do Coolify, lido só pelo Compose via --env-file).
#
# Uso:  DIR=... REDE=... bash scripts/ops/l6/migrate-oneshot.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
DIR="${DIR:?defina DIR= (saída de prepara-fase-b.sh — o clone do commit implantado)}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh — a rede do stack)}"

stop() { echo "STOP: $*" >&2; exit 1; }
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
test -f "${DIR}/docker-compose.yml" || stop "compose ausente em DIR=${DIR}"
test -f "${DIR}/docker-compose.migrate.yml" || stop "docker-compose.migrate.yml ausente em DIR=${DIR}"

# Override EFÊMERO de rede: no padrão nativo o compose.migrate.yml não declara rede, então o one-shot
# entraria na rede default do projeto — que pode NÃO ser a rede que o Coolify usou. Conectamos o
# migrate à REDE real (external, descoberta pelo prepara) para `db:5432` resolver com certeza.
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

echo "== [4] aplicando migrations pendentes (one-shot, giraffe_migrator) =="
dc run --rm --build --no-deps migrate

echo
echo "== [5] conferindo que NÃO há migration pendente (mesma imagem one-shot) =="
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs status

echo
echo "MIGRATE_ONESHOT_DONE — confirme acima o estado 'up to date' / nenhuma pendente."
