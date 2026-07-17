#!/usr/bin/env bash
#
# inventory-scope.sh — READ-ONLY. Inventaria containers, redes e volumes SÓ do project UUID autorizado
# (seleção pela LABEL/nome EXATO, nunca pelo texto "giraffe"). Prova que existe EXATAMENTE um serviço
# `db` do projeto e mostra em quais redes ele está (onde `db:5432` pode resolver) — para localizar em
# qual banco/container o ciclo anterior operou. NÃO altera nada; não imprime senha/DSN/PII.
#
# Uso:  bash scripts/ops/l6/inventory-scope.sh
#
set -uo pipefail

PROJ_AUTORIZADO="enl623bli2h2ub5kmu4ygktd"
PROJ="${PROJ:-${PROJ_AUTORIZADO}}"
if [ "${PROJ}" != "${PROJ_AUTORIZADO}" ]; then
  echo "STOP: PROJ='${PROJ}' != UUID autorizado ('${PROJ_AUTORIZADO}') — fora do escopo." >&2
  exit 2
fi

echo "== inventário do project ${PROJ} (READ-ONLY, por label/nome EXATO) =="

echo "-- containers (label com.docker.compose.project=${PROJ}) --"
docker ps -a --filter "label=com.docker.compose.project=${PROJ}" \
  --format '  {{.Names}}  service={{.Label "com.docker.compose.service"}}  status={{.Status}}' 2>/dev/null || true

echo "-- exatamente 1 container db? --"
mapfile -t DBS < <(docker ps -aq --filter "label=com.docker.compose.project=${PROJ}" --filter "label=com.docker.compose.service=db" 2>/dev/null)
echo "  containers db do projeto: ${#DBS[@]}  ($([ "${#DBS[@]}" -eq 1 ] && echo OK || echo ATENCAO))"

if [ "${#DBS[@]}" -ge 1 ]; then
  CT="${DBS[0]}"
  echo "-- redes do container db (nome + Internal + se coolify-proxy está nela) --"
  while IFS= read -r n; do
    [ -n "${n}" ] || continue
    interna=$(docker network inspect -f '{{.Internal}}' "${n}" 2>/dev/null || echo '?')
    subnet=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "${n}" 2>/dev/null || echo '?')
    proxy=$(docker network inspect -f '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' "${n}" 2>/dev/null | grep -ci 'coolify-proxy' || true)
    echo "  ${n}  Internal=${interna}  subnet=${subnet}  coolify-proxy=$([ "${proxy}" -gt 0 ] 2>/dev/null && echo sim || echo nao)"
  done < <(docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}{{$n}}{{"\n"}}{{end}}' "${CT}" 2>/dev/null)

  echo "-- aliases do db em cada rede (onde 'db' resolve) --"
  docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}  rede={{$n}} aliases=[{{range $c.Aliases}}{{.}} {{end}}]{{"\n"}}{{end}}' "${CT}" 2>/dev/null || true

  echo "-- volume de dados do db (persistência) --"
  vol=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "${CT}" 2>/dev/null || true)
  echo "  volume=${vol:-'(nenhum/anônimo)'}"

  echo "-- system_identifier do cluster (identidade sanitizada) --"
  sid=$(docker exec "${CT}" psql -U postgres -d giraffe -tAc "select system_identifier from pg_control_system()" 2>/dev/null | tr -d '[:space:]')
  echo "  system_id=${sid:-'?'}  migrations_finalizadas=$(docker exec "${CT}" psql -U postgres -d giraffe -tAc "select case when to_regclass('public._prisma_migrations') is null then 0 else (select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null) end" 2>/dev/null | tr -d '[:space:]')"
fi

echo "-- volumes do projeto (prefixo EXATO ${PROJ}_) --"
docker volume ls -q 2>/dev/null | grep "^${PROJ}_" | sed 's/^/  /' || echo "  (nenhum volume com prefixo ${PROJ}_)"

echo "-- redes do projeto (prefixo EXATO ${PROJ}) --"
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${PROJ}(_|$)" | sed 's/^/  /' || echo "  (nenhuma rede com prefixo ${PROJ})"

echo "== fim (nenhuma alteração — só leitura, escopo restrito ao UUID) =="
