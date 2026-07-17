#!/usr/bin/env bash
#
# reset-admin-password.sh — RESET CONTROLADO da senha do Admin do STAGING, via one-shot (imagem
# migrate, papel migrator). Chama `prisma/reset-admin-password.mjs`, que atualiza SÓ a credencial do
# Account por e-mail (Better Auth). NÃO recria o tenant. NÃO toca papéis/Chatwoot/produção.
#
# O e-mail e a senha chegam ao container por env HERDADO (`-e RESET_ADMIN_EMAIL -e RESET_ADMIN_PASSWORD`
# SEM valor no argumento) — nunca em `ps`/log/arquivo. Se RESET_ADMIN_PASSWORD não for informada, o
# .mjs gera uma senha forte e a imprime UMA vez (capture com segurança, NÃO cole no relatório).
#
# GUARDA DE AMBIENTE: recusa qualquer e-mail fora de `@staging.giraffedev.cloud` (o .mjs também recusa).
#
# Recebe DIR/REDE do prepara-fase-b.sh.
#
# Uso:  DIR=... REDE=... RESET_ADMIN_EMAIL="admin@staging.giraffedev.cloud" \
#         bash scripts/ops/l6/reset-admin-password.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
DIR="${DIR:?defina DIR= (saída de prepara-fase-b.sh)}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh)}"
: "${RESET_ADMIN_EMAIL:?defina RESET_ADMIN_EMAIL (e-mail do Admin de staging)}"

stop() { echo "STOP: $*" >&2; exit 1; }
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
test -f "${DIR}/docker-compose.migrate.yml" || stop "docker-compose.migrate.yml ausente em DIR=${DIR}"
test -f "${DIR}/apps/api/prisma/reset-admin-password.mjs" || stop "reset-admin-password.mjs ausente no commit implantado (DIR)"

# Guarda de ambiente também no wrapper (defesa em profundidade).
case "${RESET_ADMIN_EMAIL}" in
  *@staging.giraffedev.cloud) ;;
  *) stop "RESET_ADMIN_EMAIL fora do domínio de staging — recusado" ;;
esac

export RESET_ADMIN_EMAIL
# RESET_ADMIN_PASSWORD é OPCIONAL: se exportada pelo chamador, é herdada; se não, o .mjs gera.

# Override efêmero de rede (mesmo do migrate/provision): conecta o one-shot à REDE real do stack.
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

echo "== reset da senha do Admin (${RESET_ADMIN_EMAIL}) — one-shot, papel migrator =="
docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${DIR}" \
  -f "${DIR}/docker-compose.yml" -f "${DIR}/docker-compose.migrate.yml" -f "${NET}" \
  run --rm --no-deps -e RESET_ADMIN_EMAIL -e RESET_ADMIN_PASSWORD -e BETTER_AUTH_SECRET \
  provision node prisma/reset-admin-password.mjs

echo
echo "RESET_ADMIN_DONE — se uma senha foi gerada acima, guarde-a agora; não será exibida de novo."
