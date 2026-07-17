#!/usr/bin/env bash
#
# inspect-topology.sh — Inspeção READ-ONLY da topologia de rede do staging provisório do Giraffe
# CRM no Coolify (trilha L6). NÃO altera absolutamente nada: usa só `docker ... ls/ps/inspect`.
# Nenhuma mutação, nenhum deploy, nenhum restart. Seguro rodar a qualquer momento.
#
# Objetivo: coletar a evidência que só o host dá para fechar o critério D-02 (corrigido): db/api
# podem permanecer na rede gerenciada pelo Coolify DESDE QUE provado que não têm superfície
# pública (sem domínio, sem porta publicada, sem router/label Traefik) e que o migrate/provision
# não expõem nada. As provas de borda (portas 3001/5432/5434 fechadas, HTTPS estável) são feitas
# de fora, por curl; este script cobre o lado de dentro.
#
# Uso (no host do Coolify, como o usuário com acesso ao Docker):
#   bash scripts/ops/l6/inspect-topology.sh
#   APP_UUID=<uuid> bash scripts/ops/l6/inspect-topology.sh   # se o UUID divergir do default
#
set -euo pipefail

APP_UUID="${APP_UUID:-enl623bli2h2ub5kmu4ygktd}"
PROXY_NAME="${PROXY_NAME:-coolify-proxy}"

linha() { printf '%s\n' "------------------------------------------------------------"; }

echo "== Giraffe CRM L6 — inspeção de topologia (READ-ONLY) =="
echo "data:      $(date -u +%FT%TZ)"
echo "host:      $(hostname)"
echo "APP_UUID:  ${APP_UUID}"
echo "docker:    $(docker --version 2>/dev/null || echo 'indisponível')"
linha

# ─────────────────────────────────────────────────────────────────────────────
# 1. Containers do stack: estado, saúde, restarts, redes+IPs, portas, labels Traefik.
# ─────────────────────────────────────────────────────────────────────────────
echo "== [1] Containers do stack =="
mapfile -t CIDS < <(docker ps -aq --filter "label=coolify.applicationId=${APP_UUID}" 2>/dev/null || true)
if [ "${#CIDS[@]}" -eq 0 ]; then
  # Fallback: containers cujo NOME contém o UUID (padrão de nomenclatura do Coolify).
  mapfile -t CIDS < <(docker ps -aq --filter "name=${APP_UUID}" 2>/dev/null || true)
fi
if [ "${#CIDS[@]}" -eq 0 ]; then
  echo "  (!) Nenhum container encontrado por label 'coolify.applicationId=${APP_UUID}' nem por nome."
  echo "      Ajuste APP_UUID ou confira 'docker ps' manualmente."
fi

for cid in "${CIDS[@]}"; do
  name=$(docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##')
  image=$(docker inspect -f '{{.Config.Image}}' "$cid")
  state=$(docker inspect -f '{{.State.Status}}' "$cid")
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$cid")
  restarts=$(docker inspect -f '{{.RestartCount}}' "$cid")
  echo "  ● ${name}"
  echo "      estado:   ${state} / health=${health} / restarts=${restarts}"
  echo "      imagem:   ${image}"
  echo "      redes:"
  docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}        - {{$n}}  ip={{$c.IPAddress}}{{"\n"}}{{end}}' "$cid"
  ports=$(docker inspect -f '{{json .NetworkSettings.Ports}}' "$cid")
  echo "      portas publicadas no host: ${ports}"
  tlabels=$(docker inspect -f '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' "$cid" 2>/dev/null | grep -i 'traefik' || true)
  if [ -n "${tlabels}" ]; then
    echo "      labels Traefik:"
    printf '%s\n' "${tlabels}" | sed 's/^/        /'
  else
    echo "      labels Traefik: (nenhuma) — serviço sem router/service próprio no proxy"
  fi
  linha
done

# ─────────────────────────────────────────────────────────────────────────────
# 2. Redes do stack: Internal? driver? subnet? o coolify-proxy está conectado?
# ─────────────────────────────────────────────────────────────────────────────
echo "== [2] Redes do stack =="
NETS=()
for cid in "${CIDS[@]}"; do
  while IFS= read -r n; do NETS+=("$n"); done < <(docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}{{$n}}{{"\n"}}{{end}}' "$cid")
done
mapfile -t NETS < <(printf '%s\n' "${NETS[@]}" | sort -u | sed '/^$/d')
for n in "${NETS[@]}"; do
  internal=$(docker network inspect -f '{{.Internal}}' "$n" 2>/dev/null || echo '?')
  driver=$(docker network inspect -f '{{.Driver}}' "$n" 2>/dev/null || echo '?')
  subnet=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$n" 2>/dev/null || echo '?')
  echo "  ● ${n}  Internal=${internal}  driver=${driver}  subnet=${subnet}"
  proxy_here=$(docker network inspect -f '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' "$n" 2>/dev/null | grep -i "${PROXY_NAME}" || true)
  if [ -n "${proxy_here}" ]; then
    echo "      → ${PROXY_NAME} CONECTADO a esta rede (conectividade lateral — risco residual)"
  else
    echo "      → ${PROXY_NAME} não conectado"
  fi
done
linha

# ─────────────────────────────────────────────────────────────────────────────
# 3. coolify-proxy: quais redes/IPs ele tem (o que ele ALCANÇA no nível de rede).
# ─────────────────────────────────────────────────────────────────────────────
echo "== [3] ${PROXY_NAME}: redes conectadas =="
if docker inspect "${PROXY_NAME}" >/dev/null 2>&1; then
  docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}  - {{$n}}  ip={{$c.IPAddress}}{{"\n"}}{{end}}' "${PROXY_NAME}"
else
  echo "  (${PROXY_NAME} não encontrado; ajuste PROXY_NAME)"
fi
linha

# ─────────────────────────────────────────────────────────────────────────────
# 4. Migrate/provision: são one-shot (--rm), normalmente NÃO estão rodando. Se algum resquício
#    existir, mostra suas redes/portas; caso contrário, registra que entram na rede default do
#    projeto (a mesma do stack, listada em [2]) e sem porta/domínio por construção do compose.
# ─────────────────────────────────────────────────────────────────────────────
echo "== [4] Serviços one-shot (migrate / provision) =="
mapfile -t ONESHOT < <(docker ps -aq --filter "name=migrate" --filter "name=provision" 2>/dev/null || true)
if [ "${#ONESHOT[@]}" -eq 0 ]; then
  echo "  Nenhum container migrate/provision presente (esperado: são --rm/one-shot)."
  echo "  Por construção do docker-compose.migrate.yml, ambos entram na rede default do projeto"
  echo "  (sem 'networks:' custom), SEM porta publicada e SEM domínio — o migrator só é usado aqui."
else
  for cid in "${ONESHOT[@]}"; do
    name=$(docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##')
    echo "  ● ${name}"
    docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}      rede={{$n}} ip={{$c.IPAddress}}{{"\n"}}{{end}}' "$cid"
    echo "      portas: $(docker inspect -f '{{json .NetworkSettings.Ports}}' "$cid")"
  done
fi
linha

echo "== fim — NENHUMA alteração foi feita (inspeção read-only) =="
