#!/usr/bin/env bash
#
# gate-d05-cleanup.sh — Gate do débito D-05 (coleta de lixo antiabuso), EXECUÇÃO MANUAL CONTROLADA no
# staging real. Roda `node /repo/scripts/db-cleanup.mjs` DENTRO do container da API (o mesmo ambiente/
# DATABASE_URL do runtime — papel giraffe_app, que tem DELETE só em LoginFailure/RateLimit) e prova:
#   1. a coleta roda e sai com código 0 (falha de banco NÃO é silenciosa — sairia != 0);
#   2. é IDEMPOTENTE: a 2ª execução apaga 0/0 (nada novo expirou) ou PULA pelo advisory lock.
#
# Só apaga contadores antiabuso JÁ EXPIRADOS (fora da janela de 15 min) — um contador válido (ataque em
# curso) jamais é tocado, e nenhum dado de tenant é afetado. Não imprime PII (o script só loga contagens).
#
# Uso (no host do Coolify):
#   bash scripts/ops/l6/gate-d05-cleanup.sh
#
set -uo pipefail

# Portabilidade: o alvo é o host Linux do Coolify (sem efeito lá). Se este gate for rodado de um Git
# Bash (Windows), impede a conversão automática de `/repo/scripts/...` — argumento do `docker exec` que
# aponta para um caminho DENTRO do container — num caminho Windows (`C:/Program Files/Git/repo/...`).
export MSYS_NO_PATHCONV=1

PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
stop() { echo "STOP: $*" >&2; exit 2; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."

mapfile -t APIS < <(docker ps -q \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=api" 2>/dev/null)
[ "${#APIS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container 'api' RUNNING do projeto ${PROJ}; encontrados ${#APIS[@]}."
CT_API="${APIS[0]}"

FALHAS=0
ok() { echo "  ok: $*"; }
falha() { echo "  FALHA: $*"; FALHAS=$((FALHAS+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "${TMP}" 2>/dev/null || true' EXIT

echo "== Gate D-05 — coleta de lixo antiabuso (execução manual controlada) =="

echo "-- [1] 1ª execução --"
docker exec "${CT_API}" node /repo/scripts/db-cleanup.mjs >"${TMP}/1" 2>&1; rc1=$?
sed 's/^/    /' "${TMP}/1"
if [ "${rc1}" -eq 0 ]; then ok "1ª execução saiu com código 0"; else falha "1ª execução saiu com código ${rc1}"; fi
grep -q '\[cleanup\]' "${TMP}/1" || falha "1ª execução sem o marcador [cleanup] (script não rodou?)"

echo "-- [2] 2ª execução (idempotência) --"
docker exec "${CT_API}" node /repo/scripts/db-cleanup.mjs >"${TMP}/2" 2>&1; rc2=$?
sed 's/^/    /' "${TMP}/2"
if [ "${rc2}" -eq 0 ]; then ok "2ª execução saiu com código 0"; else falha "2ª execução saiu com código ${rc2}"; fi
if grep -q 'pulado' "${TMP}/2"; then
  ok "2ª execução PULOU (advisory lock) — serialização provada"
elif grep -q 'LoginFailure: 0' "${TMP}/2" && grep -q 'RateLimit: 0' "${TMP}/2"; then
  ok "2ª execução IDEMPOTENTE (apagou 0 · 0)"
else
  falha "2ª execução não foi idempotente nem pulou"
fi

echo
if [ "${FALHAS}" -eq 0 ]; then
  echo "D05_CLEANUP_OK"
  exit 0
else
  echo "D05_CLEANUP_FALHOU (${FALHAS} verificação(ões) reprovada(s))" >&2
  exit 1
fi
