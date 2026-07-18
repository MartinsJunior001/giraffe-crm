#!/usr/bin/env bash
#
# reset-admin-password.sh — RESET CONTROLADO da senha do Admin do STAGING, pelo MESMO `docker compose
# run` do host (papel migrator). Chama `prisma/reset-admin-password.mjs`, que atualiza SÓ a credencial
# do Account por e-mail (Better Auth). NÃO recria o tenant. NÃO toca papéis/Chatwoot/produção.
#
# CORREÇÃO do MODULE_NOT_FOUND: constrói a imagem one-shot a partir do REPO DE TRABALHO (este clone,
# `main` atualizado — onde o `reset-admin-password.mjs` existe), com `--build`, em vez do commit
# implantado (que pode ser anterior ao arquivo). Um GATE prova que o arquivo está EMPACOTADO na imagem
# antes de rodar — falha clara em vez de MODULE_NOT_FOUND.
#
# O e-mail e a senha chegam ao container por env HERDADO (`-e ...` SEM valor no argumento) — nunca em
# `ps`/log/arquivo. Sem RESET_ADMIN_PASSWORD, o .mjs gera uma senha forte e a imprime UMA vez.
# GUARDA DE AMBIENTE: recusa e-mail fora de `@staging.giraffedev.cloud` (o .mjs também recusa).
#
# Recebe REDE do prepara-fase-b.sh (a rede gerenciada do stack). NÃO usa DIR: o reset roda com o
# código ATUAL (o generated casa com o schema já migrado), não com o commit implantado.
#
# Uso:  REDE=... RESET_ADMIN_EMAIL="admin@staging.giraffedev.cloud" \
#         bash scripts/ops/l6/reset-admin-password.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh — a rede do stack)}"
: "${RESET_ADMIN_EMAIL:?defina RESET_ADMIN_EMAIL (e-mail do Admin de staging)}"

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)

stop() { echo "STOP: $*" >&2; exit 1; }
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
test -f "${RAIZ}/docker-compose.migrate.yml" || stop "docker-compose.migrate.yml ausente em ${RAIZ}"
# GATE de presença na FONTE (o repo de trabalho tem o arquivo? senão, git pull).
test -f "${RAIZ}/apps/api/prisma/reset-admin-password.mjs" \
  || stop "reset-admin-password.mjs ausente na FONTE (${RAIZ}) — faça 'git pull' no repo de trabalho"

# Guarda de ambiente também no wrapper (defesa em profundidade).
case "${RESET_ADMIN_EMAIL}" in
  *@staging.giraffedev.cloud) ;;
  *) stop "RESET_ADMIN_EMAIL fora do domínio de staging — recusado" ;;
esac

export RESET_ADMIN_EMAIL
# RESET_ADMIN_PASSWORD é OPCIONAL: se exportada pelo chamador, é herdada; senão o .mjs gera.

# Override efêmero de rede: conecta o one-shot à REDE real do stack (external).
NET="${RAIZ}/docker-compose.l6net.yml"
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
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${RAIZ}" \
    -f "${RAIZ}/docker-compose.yml" -f "${RAIZ}/docker-compose.migrate.yml" -f "${NET}" "$@"
}

echo "== build da imagem one-shot a partir do repo de trabalho (com o reset) =="
dc build provision

echo "== GATE: reset-admin-password.mjs está EMPACOTADO na imagem? =="
dc run --rm --no-deps provision sh -c 'test -f prisma/reset-admin-password.mjs' \
  || stop "reset-admin-password.mjs NÃO empacotado na imagem one-shot (revise o Dockerfile)"
echo "  ok — arquivo presente na imagem"

echo "== reset da senha do Admin (${RESET_ADMIN_EMAIL}) — one-shot, papel migrator =="
dc run --rm --no-deps -e RESET_ADMIN_EMAIL -e RESET_ADMIN_PASSWORD -e BETTER_AUTH_SECRET \
  provision node prisma/reset-admin-password.mjs

echo
echo "RESET_ADMIN_OK — se uma senha foi gerada acima, guarde-a agora; não será exibida de novo."
