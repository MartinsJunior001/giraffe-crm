#!/usr/bin/env bash
#
# provision-tenant.sh — Passo 6 da Fase B. Provisiona o 1º tenant (Organização) e o Admin, pela
# imagem one-shot (papel giraffe_migrator — único que INSERE em Organization; AD-6).
#
# SEGREDO / SENHA: se PROVISION_ADMIN_PASSWORD NÃO for informada, o provision-tenant.mjs GERA uma
# senha forte e a imprime UMA vez no stdout do container. Essa é a única vez que ela aparece.
#   → Capture-a de forma segura (cofre/gerenciador). NÃO cole a saída deste passo no relatório.
# Os dados do tenant chegam pela CONFIGURAÇÃO (ambiente), nunca por `-e` na linha de comando.
#
# Recebe do prepara-fase-b.sh:  DIR (clone do commit implantado), REDE (rede do stack).
# Obrigatórios do tenant:       PROVISION_ORG_NAME, PROVISION_ADMIN_EMAIL.
# Opcionais:                    PROVISION_ORG_SLUG, PROVISION_ADMIN_NAME, PROVISION_ADMIN_PASSWORD.
#
# Uso:  DIR=... REDE=... PROVISION_ORG_NAME="..." PROVISION_ADMIN_EMAIL="..." \
#         bash scripts/ops/l6/provision-tenant.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"
DIR="${DIR:?defina DIR= (saída de prepara-fase-b.sh)}"
REDE="${REDE:?defina REDE= (saída de prepara-fase-b.sh)}"
: "${PROVISION_ORG_NAME:?defina PROVISION_ORG_NAME (nome da Organização)}"
: "${PROVISION_ADMIN_EMAIL:?defina PROVISION_ADMIN_EMAIL (e-mail do Admin)}"

stop() { echo "STOP: $*" >&2; exit 1; }
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"
test -f "${DIR}/docker-compose.migrate.yml" || stop "docker-compose.migrate.yml ausente em DIR=${DIR}"

# Mesmo override efêmero de rede do migrate (idempotente — sobrescreve).
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

echo "== [6] provisionando tenant/Admin (one-shot, giraffe_migrator) =="
echo "   Org=${PROVISION_ORG_NAME}  AdminEmail=${PROVISION_ADMIN_EMAIL}"
echo "   ATENÇÃO: se a senha for gerada, ela sai UMA vez abaixo — capture com segurança, NÃO cole no relatório."
echo

# As variáveis PROVISION_* já estão no ambiente deste shell; o Compose as repassa ao serviço
# `provision` porque o docker-compose.migrate.yml as declara com `${...:-}`. Nada é passado por `-e`.
docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${DIR}" \
  -f "${DIR}/docker-compose.yml" -f "${DIR}/docker-compose.migrate.yml" -f "${NET}" \
  run --rm --no-deps provision

echo
echo "PROVISION_DONE — se uma senha foi gerada acima, guarde-a agora; ela não será exibida de novo."
