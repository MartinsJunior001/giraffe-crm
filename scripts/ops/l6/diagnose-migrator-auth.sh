#!/usr/bin/env bash
#
# diagnose-migrator-auth.sh — READ-ONLY. Diagnostica o P1000 (falha de autenticação do
# giraffe_migrator) no staging, SEM expor segredos. Não altera nada, não migra, não provisiona.
#
# NUNCA imprime: valor de senha, hash, DSN, token. Só reporta presença/flags/veredito. O teste de
# autenticação passa a senha ao container por env HERDADO (`-e PGPASSWORD` sem valor, dentro de um
# subshell), então ela não aparece em `ps`, em log nem em arquivo.
#
# Uso:  bash scripts/ops/l6/diagnose-migrator-auth.sh
#       PROJ=<uuid> ENVF=/caminho/.env bash scripts/ops/l6/diagnose-migrator-auth.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
ENVF="${ENVF:-/data/coolify/applications/${PROJ}/.env}"

stop() { echo "STOP: $*" >&2; exit 1; }
container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"
test -f "${ENVF}" || stop "env-file ausente: ${ENVF}"

q() { docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc "$1" | tr -d '[:space:]'; }

echo "== diagnóstico de autenticação do giraffe_migrator (READ-ONLY) =="

# 1) MIGRATOR_PASSWORD presente e NÃO-vazio no .env — sem imprimir o valor (grep -q não ecoa).
if grep -qE '^MIGRATOR_PASSWORD=.+' "${ENVF}"; then MP_PRESENTE=sim; else MP_PRESENTE=nao; fi
echo "MIGRATOR_PASSWORD_NO_ENV=${MP_PRESENTE}"

# 2) O papel existe?
ROLE_EXISTE=$(q "select count(*) from pg_roles where rolname='giraffe_migrator'")
if [ "${ROLE_EXISTE}" = "1" ]; then ROLE=sim; else ROLE=nao; fi
echo "ROLE_GIRAFFE_MIGRATOR_EXISTE=${ROLE}"

# 3) Atributos SEGUROS do papel (nunca a senha/hash).
if [ "${ROLE_EXISTE}" = "1" ]; then
  echo "CANLOGIN=$(q "select rolcanlogin from pg_roles where rolname='giraffe_migrator'")"
  echo "SUPERUSER=$(q "select rolsuper from pg_roles where rolname='giraffe_migrator'")"
  echo "BYPASSRLS=$(q "select rolbypassrls from pg_roles where rolname='giraffe_migrator'")"
  echo "TABELAS_OWNED_PUBLIC=$(q "select count(*) from pg_tables where schemaname='public' and tableowner='giraffe_migrator'")"
fi

# 4) Teste de AUTENTICAÇÃO. Conecta pelo IP NÃO-loopback do container (não 127.0.0.1): a regra
#    `host all all 127.0.0.1/32 trust` do pg_hba aceitaria QUALQUER senha e mascararia o drift; o IP
#    de rede cai em `host all all all scram-sha-256`, que exige a senha de verdade. A senha vive só
#    dentro do subshell (env herdado, `-e PGPASSWORD` sem valor) — nunca em `ps`/log/arquivo.
AUTH=AUTH_FAIL
if [ "${MP_PRESENTE}" = "sim" ] && [ "${ROLE_EXISTE}" = "1" ]; then
  IPDB=$(docker exec "${CT_DB}" hostname -i | awk '{print $1}')
  if (
        P=$(sed -n 's/^MIGRATOR_PASSWORD=//p' "${ENVF}" | head -1)
        [ -n "${P}" ] || exit 1
        export PGPASSWORD="${P}"
        docker exec -e PGPASSWORD "${CT_DB}" \
          psql -U giraffe_migrator -d giraffe -h "${IPDB}" -tAc 'select 1' >/dev/null 2>&1
     ); then AUTH=AUTH_OK; fi
fi
echo "AUTENTICACAO=${AUTH}"

# 5) Volume + confronto com o init SQL (o bootstrap 00-roles.sql cria o papel a partir de
#    MIGRATOR_PASSWORD, SÓ na 1ª criação do volume; um volume pré-existente guarda a senha ANTIGA).
MOUNT=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "${CT_DB}" 2>/dev/null || true)
echo "VOLUME_DADOS=${MOUNT:-desconhecido} (persistente entre redeploys — bootstrap não roda de novo)"

echo
if [ "${MP_PRESENTE}" = "sim" ] && [ "${ROLE_EXISTE}" = "1" ] && [ "${AUTH}" = "AUTH_FAIL" ]; then
  echo "VEREDITO=DRIFT_CONFIRMADO"
  echo "  O papel existe (bootstrap já rodou num volume anterior) e a senha do .env ATUAL não autentica:"
  echo "  a senha gravada no volume difere da de MIGRATOR_PASSWORD vigente. Reparo controlado:"
  echo "  scripts/ops/l6/repair-migrator-password.sh"
elif [ "${AUTH}" = "AUTH_OK" ]; then
  echo "VEREDITO=OK — a autenticação funciona; o P1000 não é drift de senha do migrator."
elif [ "${MP_PRESENTE}" = "nao" ]; then
  echo "VEREDITO=SEM_SENHA_NO_ENV — MIGRATOR_PASSWORD ausente/vazio; corrija o .env (não é reparo de banco)."
elif [ "${ROLE_EXISTE}" = "nao" ]; then
  echo "VEREDITO=SEM_PAPEL — giraffe_migrator não existe; o bootstrap não rodou (não criar papel aqui)."
else
  echo "VEREDITO=INCONCLUSIVO — ver os campos acima."
fi
echo "== fim (nenhuma alteração) =="
