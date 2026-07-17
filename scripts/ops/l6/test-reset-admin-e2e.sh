#!/usr/bin/env bash
#
# test-reset-admin-e2e.sh — PROVA end-to-end do reset da senha do Admin (host/local; Docker; não toca
# o staging). Constrói a imagem migrate, aplica o schema, provisiona um Admin com a senha A, reseta
# para a senha B e prova:
#   1. o reset roda e reporta sucesso;
#   2. o hash da credencial MUDOU (A -> B);
#   3. o Better Auth VALIDA a senha B e REJEITA a senha A (verify real);
#   4. o tenant NÃO foi recriado (mesmas contagens de Organization/Account/Membership);
#   5. a guarda de ambiente recusa e-mail fora de @staging.giraffedev.cloud.
# Nenhuma senha em texto e nenhum hash cru são impressos (comparação por md5 truncado).
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-reset-admin-e2e.sh
#
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
cd "${RAIZ}"

SUF="$$-$(date +%s)"
NET="l6reset-net-${SUF}"
DB="l6reset-db-${SUF}"
IMG="l6reset-migrate-${SUF}"
WORK=$(mktemp -d /tmp/giraffe-reset.XXXXXX)
SECRET="test-secret-$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)"
EMAIL="admin@staging.giraffedev.cloud"
SENHA_A="senha_ANTIGA_aaa111"
SENHA_B="senha_NOVA_bbb222xx"

cleanup() {
  docker rm -f "${DB}" >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
  docker rmi "${IMG}" >/dev/null 2>&1 || true
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

FALHAS=0
MURL="postgresql://giraffe_migrator:mig_reset@${DB}:5432/giraffe?schema=public"
sql() { docker exec "${DB}" psql -U postgres -d "${1}" -v ON_ERROR_STOP=1 -q -c "${2}" >/dev/null; }
qdb() { docker exec "${DB}" psql -U postgres -d giraffe -tAc "${1}" | tr -d '[:space:]'; }
# `-i` para que o heredoc do check [3] (node --input-type=module) chegue ao stdin do container; é
# inócuo para os demais comandos (que não leem stdin).
run_img() { docker run -i --rm --network "${NET}" -e MIGRATION_DATABASE_URL="${MURL}" -e BETTER_AUTH_SECRET="${SECRET}" "$@"; }

echo "== build da imagem migrate — pode levar alguns minutos =="
docker build -f apps/api/Dockerfile --target migrate -t "${IMG}" . >"${WORK}/build.log" 2>&1 \
  || { echo "STOP: build falhou"; tail -30 "${WORK}/build.log"; exit 1; }

docker network create "${NET}" >/dev/null
docker run -d --rm --name "${DB}" --network "${NET}" -e POSTGRES_PASSWORD=super_reset -e POSTGRES_DB=giraffe postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  [ "$(docker exec "${DB}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break
  sleep 1
done
# Ambos os papéis presentes (senão o migrate falha em P3018) + ownership.
sql giraffe "CREATE ROLE giraffe_migrator LOGIN PASSWORD 'mig_reset' NOSUPERUSER NOBYPASSRLS NOCREATEROLE"
sql postgres "ALTER DATABASE giraffe OWNER TO giraffe_migrator"
sql giraffe "ALTER SCHEMA public OWNER TO giraffe_migrator"
sql giraffe "CREATE ROLE giraffe_app LOGIN PASSWORD 'app_reset' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT"
sql giraffe "GRANT CONNECT ON DATABASE giraffe TO giraffe_app"
sql giraffe "GRANT USAGE ON SCHEMA public TO giraffe_app"

echo "== schema (migrate deploy) =="
run_img "${IMG}" node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -20 "${WORK}/mig"; exit 1; }

echo "== provisiona Admin (senha A) =="
run_img -e PROVISION_ORG_NAME="Org Reset" -e PROVISION_ADMIN_EMAIL="${EMAIL}" -e PROVISION_ADMIN_NAME="Admin Reset" -e PROVISION_ADMIN_PASSWORD="${SENHA_A}" \
  "${IMG}" node prisma/provision-tenant.mjs >"${WORK}/prov" 2>&1 || { echo "STOP: provision falhou"; tail -20 "${WORK}/prov"; exit 1; }

ACC=$(qdb "select id from \"Account\" where email='${EMAIL}'")
hash_md5() { qdb "select left(md5(password),16) from \"AuthCredential\" where \"userId\"='${ACC}' and \"providerId\"='credential'"; }
HASH_A=$(hash_md5)
ORGS0=$(qdb "select count(*) from \"Organization\""); ACCS0=$(qdb "select count(*) from \"Account\""); MEMB0=$(qdb "select count(*) from \"Membership\"")

echo "== [1] reset para a senha B =="
if run_img -e RESET_ADMIN_EMAIL="${EMAIL}" -e RESET_ADMIN_PASSWORD="${SENHA_B}" "${IMG}" node prisma/reset-admin-password.mjs >"${WORK}/reset" 2>&1 \
   && grep -q "RESETADA" "${WORK}/reset"; then echo "  PASSOU"; else echo "  FALHOU:"; sed 's/^/    /' "${WORK}/reset"; FALHAS=$((FALHAS+1)); fi

echo "== [2] o hash da credencial MUDOU =="
HASH_B=$(hash_md5)
if [ -n "${HASH_A}" ] && [ "${HASH_A}" != "${HASH_B}" ]; then echo "  PASSOU"; else echo "  FALHOU (hash não mudou)"; FALHAS=$((FALHAS+1)); fi

echo "== [3] Better Auth valida a senha B e rejeita a A (verify real) =="
VER=$(run_img -e CHK_EMAIL="${EMAIL}" -e CHK_NEW="${SENHA_B}" -e CHK_OLD="${SENHA_A}" "${IMG}" node --input-type=module 2>"${WORK}/ver.err" <<'JS'
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
if echo "${VER}" | grep -q "VERIFY NEW_OK OLD_FAIL"; then echo "  PASSOU (${VER})"; else echo "  FALHOU (${VER}):"; sed 's/^/    /' "${WORK}/ver.err"; FALHAS=$((FALHAS+1)); fi

echo "== [4] tenant NÃO recriado (contagens iguais) =="
ORGS1=$(qdb "select count(*) from \"Organization\""); ACCS1=$(qdb "select count(*) from \"Account\""); MEMB1=$(qdb "select count(*) from \"Membership\"")
if [ "${ORGS0}" = "${ORGS1}" ] && [ "${ACCS0}" = "${ACCS1}" ] && [ "${MEMB0}" = "${MEMB1}" ]; then
  echo "  PASSOU (org=${ORGS1} account=${ACCS1} membership=${MEMB1})"
else
  echo "  FALHOU (antes ${ORGS0}/${ACCS0}/${MEMB0} != depois ${ORGS1}/${ACCS1}/${MEMB1})"; FALHAS=$((FALHAS+1))
fi

echo "== [5] guarda de ambiente: e-mail fora de staging é RECUSADO =="
if run_img -e RESET_ADMIN_EMAIL="admin@example.com" -e RESET_ADMIN_PASSWORD="qualquer_senha_123" "${IMG}" node prisma/reset-admin-password.mjs >"${WORK}/guard" 2>&1; then
  echo "  FALHOU (deveria recusar):"; sed 's/^/    /' "${WORK}/guard"; FALHAS=$((FALHAS+1))
else
  echo "  PASSOU (recusado)"
fi

echo
if [ "${FALHAS}" -eq 0 ]; then echo "RESET_E2E_OK"; else echo "RESET_E2E_FALHOU (${FALHAS})" >&2; exit 1; fi
