#!/usr/bin/env bash
#
# test-reset-admin-e2e.sh — PROVA end-to-end do reset da senha do Admin pelo MESMO `docker compose
# run` usado no host (não `docker run` direto — foi o que mascarou o MODULE_NOT_FOUND). Usa o Compose
# do repo (base + migrate); o `db` roda o bootstrap `00-roles.sql` (cria os papéis). Prova:
#   0. reset-admin-password.mjs EMPACOTADO na imagem one-shot (gate de presença);
#   1. reset roda e reporta sucesso;
#   2. o hash da credencial MUDOU (A -> B);
#   3. o Better Auth VALIDA a senha B e REJEITA a A (verify real);
#   4. o tenant NÃO foi recriado (contagens iguais);
#   5. a guarda de ambiente recusa e-mail fora de @staging.giraffedev.cloud.
# Nenhuma senha em texto e nenhum hash cru impressos (comparação por md5 truncado).
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-reset-admin-e2e.sh
#
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
PROJ="l6reset-test-$$-$(date +%s)"
WORK=$(mktemp -d /tmp/giraffe-reset.XXXXXX)
ENVF="${WORK}/.env"
EMAIL="admin@staging.giraffedev.cloud"
SENHA_A="senha_ANTIGA_aaa111"
SENHA_B="senha_NOVA_bbb222xx"

dc() {
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${RAIZ}" \
    -f "${RAIZ}/docker-compose.yml" -f "${RAIZ}/docker-compose.migrate.yml" "$@"
}
cleanup() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

gen() { head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24; }
cat > "${ENVF}" <<EOF
POSTGRES_PASSWORD=$(gen)
MIGRATOR_PASSWORD=$(gen)
APP_PASSWORD=$(gen)
BETTER_AUTH_SECRET=$(gen)$(gen)
LOGIN_HMAC_SECRET=$(gen)$(gen)
WEB_PUBLIC_ORIGIN=http://localhost:3000
EOF

FALHAS=0

echo "== build da imagem one-shot (migrate/provision) — pode levar alguns minutos =="
dc build migrate provision >"${WORK}/build.log" 2>&1 || { echo "STOP: build falhou"; tail -30 "${WORK}/build.log"; exit 1; }

echo "== sobe o db (bootstrap 00-roles.sql cria os papéis) =="
dc up -d db >/dev/null 2>&1
CT=$(dc ps -q db)
[ -n "${CT}" ] || { echo "STOP: container db não subiu"; exit 1; }
for _ in $(seq 1 60); do
  [ "$(docker exec "${CT}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break
  sleep 1
done
qdb() { docker exec "${CT}" psql -U postgres -d giraffe -tAc "${1}" | tr -d '[:space:]'; }

echo "== schema (migrate deploy via compose) =="
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -20 "${WORK}/mig"; exit 1; }

echo "== [0] GATE: reset-admin-password.mjs empacotado na imagem =="
if dc run --rm --no-deps provision sh -c 'test -f prisma/reset-admin-password.mjs' >/dev/null 2>&1; then
  echo "  PASSOU"
else
  echo "  FALHOU: arquivo NÃO empacotado na imagem"; FALHAS=$((FALHAS+1))
fi

echo "== provisiona Admin (senha A) via compose =="
PROVISION_ORG_NAME="Org Reset" PROVISION_ADMIN_EMAIL="${EMAIL}" PROVISION_ADMIN_NAME="Admin Reset" PROVISION_ADMIN_PASSWORD="${SENHA_A}" \
  dc run --rm --no-deps -e PROVISION_ORG_NAME -e PROVISION_ADMIN_EMAIL -e PROVISION_ADMIN_NAME -e PROVISION_ADMIN_PASSWORD \
  provision >"${WORK}/prov" 2>&1 || { echo "STOP: provision falhou"; tail -20 "${WORK}/prov"; exit 1; }

ACC=$(qdb "select id from \"Account\" where email='${EMAIL}'")
hash_md5() { qdb "select left(md5(password),16) from \"AuthCredential\" where \"userId\"='${ACC}' and \"providerId\"='credential'"; }
HASH_A=$(hash_md5)
ORGS0=$(qdb "select count(*) from \"Organization\""); ACCS0=$(qdb "select count(*) from \"Account\""); MEMB0=$(qdb "select count(*) from \"Membership\"")

echo "== [1] reset para a senha B (mesmo docker compose run) =="
if RESET_ADMIN_EMAIL="${EMAIL}" RESET_ADMIN_PASSWORD="${SENHA_B}" \
   dc run --rm --no-deps -e RESET_ADMIN_EMAIL -e RESET_ADMIN_PASSWORD provision node prisma/reset-admin-password.mjs >"${WORK}/reset" 2>&1 \
   && grep -q "RESETADA" "${WORK}/reset"; then echo "  PASSOU"; else echo "  FALHOU:"; sed 's/^/    /' "${WORK}/reset"; FALHAS=$((FALHAS+1)); fi

echo "== [2] o hash da credencial MUDOU =="
HASH_B=$(hash_md5)
if [ -n "${HASH_A}" ] && [ "${HASH_A}" != "${HASH_B}" ]; then echo "  PASSOU"; else echo "  FALHOU (hash não mudou)"; FALHAS=$((FALHAS+1)); fi

echo "== [3] Better Auth valida a senha B e rejeita a A (verify real, via compose) =="
VER=$(CHK_EMAIL="${EMAIL}" CHK_NEW="${SENHA_B}" CHK_OLD="${SENHA_A}" \
  dc run --rm -T --no-deps -e CHK_EMAIL -e CHK_NEW -e CHK_OLD provision node --input-type=module 2>"${WORK}/ver.err" <<'JS'
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from './generated/prisma/index.js';
const prisma = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  user: { modelName: 'Account' }, account: { modelName: 'AuthCredential' },
  session: { modelName: 'AuthSession' }, verification: { modelName: 'AuthVerification' },
});
const ctx = await auth.$context;
const acc = await prisma.account.findUnique({ where: { email: process.env.CHK_EMAIL } });
const cred = await prisma.authCredential.findFirst({ where: { userId: acc.id, providerId: 'credential' } });
const okNew = await ctx.password.verify({ hash: cred.password, password: process.env.CHK_NEW });
const okOld = await ctx.password.verify({ hash: cred.password, password: process.env.CHK_OLD });
console.log('VERIFY ' + (okNew ? 'NEW_OK' : 'NEW_FAIL') + ' ' + (okOld ? 'OLD_OK' : 'OLD_FAIL'));
await prisma.$disconnect();
JS
)
if printf '%s' "${VER}" | grep -q "VERIFY NEW_OK OLD_FAIL"; then echo "  PASSOU (${VER})"; else echo "  FALHOU: ${VER}"; cat "${WORK}/ver.err"; FALHAS=$((FALHAS+1)); fi

echo "== [4] tenant NÃO recriado (contagens iguais) =="
ORGS1=$(qdb "select count(*) from \"Organization\""); ACCS1=$(qdb "select count(*) from \"Account\""); MEMB1=$(qdb "select count(*) from \"Membership\"")
if [ "${ORGS0}" = "${ORGS1}" ] && [ "${ACCS0}" = "${ACCS1}" ] && [ "${MEMB0}" = "${MEMB1}" ]; then
  echo "  PASSOU (org=${ORGS1} account=${ACCS1} membership=${MEMB1})"
else
  echo "  FALHOU (antes ${ORGS0}/${ACCS0}/${MEMB0} != depois ${ORGS1}/${ACCS1}/${MEMB1})"; FALHAS=$((FALHAS+1))
fi

echo "== [5] guarda de ambiente: e-mail fora de staging é RECUSADO =="
if RESET_ADMIN_EMAIL="admin@example.com" RESET_ADMIN_PASSWORD="qualquer_senha_123" \
   dc run --rm --no-deps -e RESET_ADMIN_EMAIL -e RESET_ADMIN_PASSWORD provision node prisma/reset-admin-password.mjs >"${WORK}/guard" 2>&1; then
  echo "  FALHOU (deveria recusar)"; FALHAS=$((FALHAS+1))
else
  echo "  PASSOU (recusado)"
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "RESET_E2E_OK"; else echo "RESET_E2E_FALHOU (${FALHAS})" >&2; exit 1; fi
