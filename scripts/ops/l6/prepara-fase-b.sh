#!/usr/bin/env bash
#
# L6 / staging provisório — PREPARAÇÃO da Fase B. SOMENTE LEITURA.
#
# Não migra, não provisiona, não escreve no stack, não remove nada. Descobre e imprime os valores
# que a Fase B exige, e PARA em qualquer ambiguidade em vez de adivinhar.
#
# Contexto: o Coolify remove o diretório do artifact após o deploy, então o compose e o Dockerfile
# não existem mais no host. Este script reconstrói o material de build clonando o repositório oficial
# e fazendo checkout DETACHED do commit EFETIVAMENTE IMPLANTADO — descoberto nos labels do container
# `api`, nunca presumido como HEAD da `main` (a `main` anda; o container não).
#
# Segredos: o `.env` do Coolify é lido EXCLUSIVAMENTE pelo Docker Compose via `--env-file`. Este
# script não copia, não imprime, não faz `source` nem `grep` de valores. Usa `config --services`
# (que lista apenas nomes), jamais `config` completo, que renderizaria os valores interpolados.
#
# Rede: NÃO é escolhida por nome nem por label de projeto — isso presumiria que Coolify e Compose
# concordam sobre o nome, que é justamente a premissa que o Plano B não pode ter. A rede é a que o
# container `db` tem EFETIVAMENTE conectada COM O ALIAS `db`, confirmada também no `api`. Exatamente
# uma candidata, ou para.
#
# Uso:  bash scripts/ops/l6/prepara-fase-b.sh
# Saída: SHA_IMPLANTADO, LABEL_FONTE, DIR, COMMIT, REDE, SERVICOS

set -euo pipefail

PROJ=enl623bli2h2ub5kmu4ygktd
ENVF="/data/coolify/applications/${PROJ}/.env"
REPO=https://github.com/MartinsJunior001/giraffe-crm.git

stop() {
  echo "STOP: $*" >&2
  exit 1
}

container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

# ---------------------------------------------------------------------------
# 1. Pré-condições
# ---------------------------------------------------------------------------
test -f "${ENVF}" || stop "arquivo de ambiente ausente em ${ENVF}"

CT_API=$(container_de api)
CT_DB=$(container_de db)
[ -n "${CT_API}" ] || stop "container 'api' do projeto ${PROJ} não encontrado"
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"

# ---------------------------------------------------------------------------
# 2. SHA implantado — descoberto, nunca presumido
#
# Dois labels podem carregar o MESMO SHA; isso não é ambiguidade. Só SHAs DISTINTOS param o script.
# Um SHA de git tem 40 hexadecimais; um digest de imagem tem 64, e as fronteiras de palavra do awk
# impedem que um trecho de 40 dentro de um de 64 case por engano.
#
# Quatro fontes, em ordem. A execução de 2026-07-16 provou que a fonte 1 (labels do container) vem
# VAZIA neste Coolify — por isso as demais existem:
#
#   1. labels do CONTAINER api
#   2. labels da IMAGEM do api (`org.opencontainers.image.revision`, quando o build a grava)
#   3. ambiente do CONTAINER — SOMENTE variáveis cujo NOME remeta a commit/revision/git.
#      O filtro por nome não é zelo: um segredo de 40 hexadecimais (`LOGIN_HMAC_SECRET`, por
#      exemplo) casaria o padrão de SHA e seria impresso como se fosse um. O nome é o que separa
#      "identificador de build" de "segredo".
#   4. SHA_STAGING= informado pelo operador (lido da UI do Coolify → aba Deployments), para quando
#      o host não carrega essa informação em lugar nenhum. NÃO é presunção: é entrada explícita, e
#      passa exatamente pelas mesmas validações contra o repositório oficial.
#
# Se as fontes discordarem entre si, o script PARA. Nunca cai para a HEAD da main.
# ---------------------------------------------------------------------------
FONTES=""

adicionar_fonte() { # $1 = rótulo da origem, $2 = candidato
  if echo "$2" | grep -qE '^[0-9a-f]{40}$'; then
    FONTES="${FONTES}$1 $2"$'\n'
  fi
}

while read -r nome valor; do
  [ -n "${nome:-}" ] && adicionar_fonte "label-container:${nome}" "${valor}"
done < <(
  docker inspect -f '{{range $k,$v := .Config.Labels}}{{$k}} {{$v}}{{"\n"}}{{end}}' "${CT_API}" |
    awk 'NF==2 && $2 ~ /^[0-9a-f]{40}$/'
)

IMG=$(docker inspect -f '{{.Image}}' "${CT_API}")
while read -r nome valor; do
  [ -n "${nome:-}" ] && adicionar_fonte "label-imagem:${nome}" "${valor}"
done < <(
  docker inspect -f '{{range $k,$v := .Config.Labels}}{{$k}} {{$v}}{{"\n"}}{{end}}' "${IMG}" 2>/dev/null |
    awk 'NF==2 && $2 ~ /^[0-9a-f]{40}$/'
)

while read -r par; do
  nome=${par%%=*}
  valor=${par#*=}
  adicionar_fonte "env:${nome}" "${valor}"
done < <(
  docker inspect -f '{{range .Config.Env}}{{.}}{{"\n"}}{{end}}' "${CT_API}" |
    grep -iE '^[A-Za-z0-9_]*(COMMIT|REVISION|GIT_SHA|GITSHA)[A-Za-z0-9_]*='
)

if [ -n "${SHA_STAGING:-}" ]; then
  adicionar_fonte "operador:SHA_STAGING" "${SHA_STAGING}"
fi

DISTINTOS=$(echo "${FONTES}" | awk 'NF{print $2}' | sort -u | grep -c . || true)

if [ "${DISTINTOS}" != "1" ]; then
  echo "STOP: ${DISTINTOS} SHA(s) distintos entre as fontes de descoberta." >&2
  if [ "${DISTINTOS}" = "0" ]; then
    echo "O host não carrega o commit implantado em label nem em ambiente." >&2
    echo "Leia o commit na UI do Coolify (Deployments) e reexecute informando-o:" >&2
    echo "  SHA_STAGING=<sha40> bash \$0" >&2
    echo "Fontes inspecionadas (somente NOMES, nenhum valor):" >&2
    docker inspect -f '{{range $k,$v := .Config.Labels}}{{$k}}{{"\n"}}{{end}}' "${CT_API}" |
      sed '/^$/d' | sort -u | sed 's/^/  label-container: /' >&2
    docker inspect -f '{{range .Config.Env}}{{.}}{{"\n"}}{{end}}' "${CT_API}" |
      cut -d= -f1 | sed '/^$/d' | sort -u | sed 's/^/  env: /' >&2
  else
    echo "${FONTES}" | awk 'NF{print "  " $1 " -> " $2}' >&2
  fi
  exit 1
fi

SHA=$(echo "${FONTES}" | awk 'NF{print $2}' | head -1)
LABEL_FONTE=$(echo "${FONTES}" | awk 'NF{print $1}' | head -1)

# ---------------------------------------------------------------------------
# 3. Clone oficial + checkout detached do commit implantado
#
# Clone COMPLETO de propósito: `--depth 1` não permite checkout de um SHA arbitrário.
# `GIT_TERMINAL_PROMPT=0` faz o clone FALHAR em vez de pedir credencial — nenhum token do Coolify
# é procurado ou reutilizado.
# ---------------------------------------------------------------------------
DIR=$(mktemp -d /tmp/giraffe-l6.XXXXXXXX)
REPO_DIR="${DIR}/repo"

GIT_TERMINAL_PROMPT=0 git clone -q "${REPO}" "${REPO_DIR}" ||
  stop "clone falhou ou pediu credencial (repositório privado?)"

[ "$(git -C "${REPO_DIR}" cat-file -t "${SHA}" 2>/dev/null)" = "commit" ] ||
  stop "o SHA implantado não é um commit deste repositório oficial"

git -C "${REPO_DIR}" checkout -q --detach "${SHA}"

[ "$(git -C "${REPO_DIR}" remote get-url origin)" = "${REPO}" ] || stop "remote não é o oficial"
[ "$(git -C "${REPO_DIR}" rev-parse HEAD)" = "${SHA}" ] || stop "HEAD difere do SHA implantado"
[ -z "$(git -C "${REPO_DIR}" status --porcelain)" ] || stop "working tree suja após o checkout"
git -C "${REPO_DIR}" merge-base --is-ancestor "${SHA}" origin/main ||
  stop "o SHA implantado não é ancestral de origin/main"

# Os arquivos são conferidos DEPOIS do checkout: precisam existir NESSE commit, não na main.
for arquivo in \
  docker-compose.yml \
  docker-compose.migrate.yml \
  apps/api/Dockerfile \
  apps/api/prisma/provision-tenant.mjs; do
  test -f "${REPO_DIR}/${arquivo}" || stop "${arquivo} ausente no commit implantado"
done

MIG="${REPO_DIR}/docker-compose.migrate.yml"
grep -qE '^[[:space:]]*migrate:[[:space:]]*$' "${MIG}" || stop "sem o serviço 'migrate' nesse commit"
grep -qE '^[[:space:]]*provision:[[:space:]]*$' "${MIG}" || stop "sem o serviço 'provision' nesse commit"

# ---------------------------------------------------------------------------
# 4. Rede — pelo alias `db` efetivamente conectado, não pelo nome
# ---------------------------------------------------------------------------
REDES=$(
  docker inspect \
    -f '{{range $n,$c := .NetworkSettings.Networks}}{{$n}} {{range $c.Aliases}}{{.}},{{end}}{{"\n"}}{{end}}' \
    "${CT_DB}" | awk 'NF==2 && $2 ~ /(^|,)db(,|$)/ {print $1}' | sort -u
)
QTD_REDE=$(echo "${REDES}" | grep -c . || true)

if [ "${QTD_REDE}" != "1" ]; then
  echo "STOP: ${QTD_REDE} rede(s) com o alias 'db' no container db — ambíguo." >&2
  echo "${REDES}" | sed '/^$/d' | sed 's/^/  candidata: /' >&2
  exit 1
fi

REDE=$(echo "${REDES}" | head -1)

docker inspect -f '{{range $n,$c := .NetworkSettings.Networks}}{{$n}}{{"\n"}}{{end}}' "${CT_API}" |
  grep -qx "${REDE}" || stop "o container api NÃO está na rede ${REDE}"

# ---------------------------------------------------------------------------
# 5. Serviços declarados — `config --services` NUNCA renderiza valores
# ---------------------------------------------------------------------------
SERVICOS=$(
  docker compose -p "${PROJ}" --env-file "${ENVF}" --project-directory "${REPO_DIR}" \
    -f "${REPO_DIR}/docker-compose.yml" -f "${MIG}" config --services |
    tr '\n' ',' | sed 's/,$//'
)

echo "SHA_IMPLANTADO=${SHA}"
echo "LABEL_FONTE=${LABEL_FONTE}"
echo "DIR=${REPO_DIR}"
echo "COMMIT=$(git -C "${REPO_DIR}" rev-parse HEAD)"
echo "REDE=${REDE}"
echo "SERVICOS=${SERVICOS}"
