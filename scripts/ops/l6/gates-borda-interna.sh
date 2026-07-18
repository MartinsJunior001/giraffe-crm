#!/usr/bin/env bash
#
# gates-borda-interna.sh — Gate de BORDA/operação da Fase B. Prova, POR DENTRO da rede do stack,
# que a API PRIVADA responde /health e /ready (200 + contrato de payload exato) e que a Web responde
# /healthz e a casca. READ-ONLY: não altera nada, não reinicia, não publica porta. Usa o Node do
# próprio runtime de cada container (fetch nativo) para não puxar imagem extra nem abrir superfície.
#
# Complementa a prova EXTERNA (curl de fora, feita à parte): 3001/5432/5434 fechadas ao público e
# /health|/ready dando 404 pelo domínio (a API não vaza pelo proxy — só a Web é roteável).
#
# Uso (no host do Coolify, com acesso ao Docker):
#   bash scripts/ops/l6/gates-borda-interna.sh
#   PROJ=<uuid> bash scripts/ops/l6/gates-borda-interna.sh
#
set -uo pipefail  # sem -e: acumulamos falhas e SEMPRE emitimos o veredito.

# GUARDA DE ESCOPO: só o project autorizado; seleção por label EXATA (nunca pelo texto "giraffe").
PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
stop() { echo "STOP: $*" >&2; exit 2; }
[ "${PROJ}" = "${PROJ_AUTORIZADO}" ] || stop "PROJ='${PROJ}' != UUID autorizado — fora do escopo."

sel() { docker ps -q \
  --filter "label=com.docker.compose.project=${PROJ}" \
  --filter "label=com.docker.compose.service=$1" 2>/dev/null; }

mapfile -t APIS < <(sel api)
mapfile -t WEBS < <(sel web)
[ "${#APIS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container 'api' RUNNING do projeto ${PROJ}; encontrados ${#APIS[@]}."
[ "${#WEBS[@]}" -eq 1 ] || stop "esperado EXATAMENTE 1 container 'web' RUNNING do projeto ${PROJ}; encontrados ${#WEBS[@]}."
CT_API="${APIS[0]}"
CT_WEB="${WEBS[0]}"

FALHAS=0
ok()    { echo "  ok: $*"; }
falha() { echo "  FALHA: $*"; FALHAS=$((FALHAS+1)); }

# probe(container, url): imprime DUAS linhas — status HTTP e corpo (whitespace colapsado, 300 chars).
# Usa o Node do container-alvo; loopback (127.0.0.1) prova a porta interna sem depender de DNS/alias.
probe() {
  docker exec "$1" node -e '
    fetch(process.argv[1])
      .then(async (r) => { const t = (await r.text()).replace(/\s+/g, " ").slice(0, 300); console.log(r.status); console.log(t); })
      .catch((e) => { console.log("000"); console.log(String(e && e.message || e)); });
  ' "$2" 2>/dev/null
}

# Contrato de saúde: 200 + JSON com EXATAMENTE {"status":"ok"} (o payload público não pode vazar
# versão/host/env — o mesmo assert do smoke.mjs).
check_ok() { # nome, container, url
  local nome="$1" ct="$2" url="$3" st body
  { IFS= read -r st; IFS= read -r body; } < <(probe "$ct" "$url")
  st="${st:-000}"; body="${body:-}"
  if [ "$st" = "200" ] && [ "$body" = '{"status":"ok"}' ]; then
    ok "${nome} → HTTP 200 {\"status\":\"ok\"}"
  else
    falha "${nome} → HTTP ${st} corpo=${body}"
  fi
}

check_2xx() { # nome, container, url — a casca: qualquer 2xx (corpo é HTML)
  local nome="$1" ct="$2" url="$3" st
  { IFS= read -r st; IFS= read -r _; } < <(probe "$ct" "$url")
  st="${st:-000}"
  case "$st" in 2??) ok "${nome} → HTTP ${st}";; *) falha "${nome} → HTTP ${st} (esperado 2xx)";; esac
}

echo "== Gate de borda interna — API privada + Web (READ-ONLY) =="

echo "-- [1] estado dos containers do stack --"
for pair in "api:${CT_API}" "web:${CT_WEB}"; do
  svc="${pair%%:*}"; cid="${pair#*:}"
  state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo '?')
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$cid" 2>/dev/null || echo '?')
  restarts=$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo '?')
  echo "    ${svc}: estado=${state} health=${health} restarts=${restarts}"
  if [ "$state" = "running" ]; then ok "${svc} running"; else falha "${svc} NÃO running (estado=${state})"; fi
done

echo "-- [2] API privada (loopback interno) --"
check_ok  "API /health (liveness)"  "$CT_API" "http://127.0.0.1:3001/health"
check_ok  "API /ready (readiness — consulta o banco)" "$CT_API" "http://127.0.0.1:3001/ready"

echo "-- [3] Web (liveness + casca) --"
check_ok  "WEB /healthz (liveness local, não toca a API)" "$CT_WEB" "http://127.0.0.1:3000/healthz"
check_2xx "WEB / (casca navegável)" "$CT_WEB" "http://127.0.0.1:3000/"

echo "-- [4] BFF Web→API alcança a API pela rede do stack (nome de serviço 'api') --"
check_ok  "WEB→api:3001/health (rota interna do BFF)" "$CT_WEB" "http://api:3001/health"

echo
if [ "${FALHAS}" -eq 0 ]; then
  echo "GATES_BORDA_OK"
  exit 0
else
  echo "GATES_BORDA_FALHOU (${FALHAS} verificação(ões) reprovada(s))" >&2
  exit 1
fi
