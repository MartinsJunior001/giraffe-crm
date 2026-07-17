#!/usr/bin/env bash
#
# backup-pre-migration.sh — Passo 2 da Fase B. BACKUP real do banco de staging, ANTES de migrar.
#
# READ-ONLY no banco: `pg_dump` não altera dados. Roda DENTRO do container `db` (via `docker exec`,
# como o superusuário `postgres` do container — nunca o `giraffe_app`/`giraffe_migrator`), em formato
# custom (`-Fc`): comprimido e restaurável seletivamente por `pg_restore`. Salva no host, imprime o
# SHA-256 do arquivo e a contagem de tabelas como evidência — NUNCA imprime dados/segredos.
#
# Uso:  bash scripts/ops/l6/backup-pre-migration.sh
#       OUT_DIR=/caminho PROJ=<uuid> bash scripts/ops/l6/backup-pre-migration.sh
#
set -euo pipefail

PROJ="${PROJ:-enl623bli2h2ub5kmu4ygktd}"
OUT_DIR="${OUT_DIR:-/tmp/giraffe-l6-backup}"

stop() { echo "STOP: $*" >&2; exit 1; }

container_de() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJ}" \
    --filter "label=com.docker.compose.service=$1"
}

CT_DB=$(container_de db)
[ -n "${CT_DB}" ] || stop "container 'db' do projeto ${PROJ} não encontrado"

mkdir -p "${OUT_DIR}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="${OUT_DIR}/giraffe-pre-migration-${TS}.dump"

# `-Fc` para stdout, redirecionado ao host. Sem `-f` dentro do container: nada é escrito no volume
# do banco. Falha honesta: `set -o pipefail` + o teste de tamanho abaixo pegam um dump truncado.
docker exec "${CT_DB}" pg_dump -U postgres -d giraffe -Fc > "${DUMP}"

SIZE=$(wc -c < "${DUMP}")
[ "${SIZE}" -gt 0 ] || stop "dump vazio — backup NÃO confiável"

SHA=$(sha256sum "${DUMP}" | awk '{print $1}')
# Contagem de tabelas do schema public — evidência de conteúdo, sem expor nenhum dado.
NT=$(docker exec "${CT_DB}" psql -U postgres -d giraffe -tAc \
  "select count(*) from pg_tables where schemaname='public'" | tr -d '[:space:]')

echo "BACKUP_OK"
echo "ARQUIVO=${DUMP}"
echo "BYTES=${SIZE}"
echo "SHA256=${SHA}"
echo "TABELAS_PUBLIC=${NT}"
echo
echo "Guarde ARQUIVO e SHA256. O passo 3 (restore-verify.sh) prova que este dump é restaurável"
echo "num banco descartável ANTES de qualquer migration tocar o staging."
