#!/usr/bin/env bash
#
# test-gate-d05-cleanup.sh — REGRESSÃO do gate-d05-cleanup.sh (host/local; Docker), em ambiente
# DESCARTÁVEL. Sobe db+migrate+api, insere contadores antiabuso EXPIRADOS e VÁLIDOS, roda o gate e prova:
#   - a 1ª coleta apaga os EXPIRADOS e PRESERVA os válidos (contador em curso jamais é tocado);
#   - a 2ª é idempotente (0/0) — D05_CLEANUP_OK.
# Guarda anti-host: só roda em ambiente limpo.
#
# Uso (a partir da raiz do repo):  bash scripts/ops/l6/test-gate-d05-cleanup.sh
#
set -uo pipefail

RAIZ=$(cd "$(dirname "$0")/../../.." && pwd)
AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
GATE="${RAIZ}/scripts/ops/l6/gate-d05-cleanup.sh"
[ -f "${GATE}" ] || { echo "STOP: gate-d05-cleanup.sh não encontrado"; exit 1; }
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${AUTORIZADO}" 2>/dev/null)" ] \
   || docker volume ls -q 2>/dev/null | grep -q "^${AUTORIZADO}_"; then
  echo "STOP: recursos do project ${AUTORIZADO} JÁ EXISTEM — este teste só roda em ambiente LIMPO."; exit 1
fi

PROJ="${AUTORIZADO}"
WORK=$(mktemp -d /tmp/giraffe-d05test.XXXXXX)
ENVF="${WORK}/.env"
dc() {
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${RAIZ}" \
    -f "${RAIZ}/docker-compose.yml" -f "${RAIZ}/docker-compose.migrate.yml" "$@"
}
# shellcheck disable=SC2329  # invocada indiretamente pelo trap EXIT abaixo
cleanup() { dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "${WORK}" 2>/dev/null || true; }
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

echo "== build + up (db, migrate, api) =="
dc build db api migrate >"${WORK}/build.log" 2>&1 || { echo "STOP: build falhou"; tail -25 "${WORK}/build.log"; exit 1; }
dc up -d db >/dev/null 2>&1
CT_DB=$(dc ps -q db)
for _ in $(seq 1 60); do [ "$(docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc 'select 1' 2>/dev/null | tr -d '[:space:]')" = "1" ] && break; sleep 1; done
dc run --rm --no-deps migrate node ../../scripts/db-migrate.mjs deploy >"${WORK}/mig" 2>&1 || { echo "STOP: migrate falhou"; tail -25 "${WORK}/mig"; exit 1; }
dc up -d api >/dev/null 2>&1
CT_API=$(dc ps -q api)
for _ in $(seq 1 60); do
  docker exec "${CT_API}" node -e 'fetch("http://127.0.0.1:3001/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1 && break
  sleep 2
done

echo "== insere contadores: 2 EXPIRADOS (>15min) + 2 VÁLIDOS (agora) =="
docker exec "${CT_DB}" psql -U postgres -d giraffe -q -c "
  INSERT INTO \"LoginFailure\"(key,\"keyVersion\",count,\"windowStart\") VALUES
    ('exp-lf',1,3, now() - interval '20 minutes'),
    ('val-lf',1,2, now());
  INSERT INTO \"RateLimit\"(id,key,count,\"lastRequest\") VALUES
    ('exp-rl-id','exp-rl',5,(extract(epoch from now())*1000)::bigint - 1200000),
    ('val-rl-id','val-rl',1,(extract(epoch from now())*1000)::bigint);
" >/dev/null 2>&1 || { echo "STOP: insert de fixtures falhou"; exit 1; }

FALHAS=0
ok() { echo "  ok: $*"; }
falha() { echo "  FALHA: $*"; FALHAS=$((FALHAS+1)); }
conta() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

echo "== roda gate-d05-cleanup.sh =="
if PROJ="${AUTORIZADO}" bash "${GATE}" >"${WORK}/gate.out" 2>&1; then
  sed 's/^/    /' "${WORK}/gate.out"
  if grep -q "D05_CLEANUP_OK" "${WORK}/gate.out"; then ok "gate emitiu D05_CLEANUP_OK"; else falha "gate sem D05_CLEANUP_OK"; fi
else
  sed 's/^/    /' "${WORK}/gate.out"; falha "gate falhou (esperava D05_CLEANUP_OK)"
fi

echo "== confere: expirados apagados, VÁLIDOS preservados =="
confere() { # descrição, sql, esperado
  if [ "$(conta "$2")" = "$3" ]; then ok "$1"; else falha "$1 (esperado $3)"; fi
}
confere "LoginFailure expirado apagado"                          "SELECT count(*) FROM \"LoginFailure\" WHERE key='exp-lf'" "0"
confere "RateLimit expirado apagado"                             "SELECT count(*) FROM \"RateLimit\" WHERE key='exp-rl'"    "0"
confere "LoginFailure VÁLIDO preservado (contador em curso)"     "SELECT count(*) FROM \"LoginFailure\" WHERE key='val-lf'" "1"
confere "RateLimit VÁLIDO preservado"                            "SELECT count(*) FROM \"RateLimit\" WHERE key='val-rl'"    "1"

echo
if [ "${FALHAS}" -eq 0 ]; then echo "D05_REGRESSAO_OK"; else echo "D05_REGRESSAO_FALHOU (${FALHAS})" >&2; exit 1; fi
