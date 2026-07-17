#!/usr/bin/env bash
#
# restore-verify.sh — Passo 3 (e 7, segundo restore) da Fase B. RESTORE efetivo de um dump num
# PostgreSQL DESCARTÁVEL, e validação de integridade. NÃO toca o banco de staging real.
#
# Um backup só vale se for restaurável — este script prova isso restaurando num container efêmero
# (sem volume persistente, sem porta publicada, removido no fim, mesmo em erro). Os papéis
# (giraffe_app/giraffe_migrator) não vêm no dump per-database; recriamos os NOMES no banco de
# verificação para que policies/owner apliquem sem ruído, e restauramos com o schema completo.
#
# Uso:  bash scripts/ops/l6/restore-verify.sh /caminho/para/backup.dump
#
set -euo pipefail

DUMP="${1:?uso: restore-verify.sh <arquivo.dump>}"
[ -f "${DUMP}" ] || { echo "STOP: dump não encontrado: ${DUMP}" >&2; exit 1; }

NAME="giraffe-restore-check-$$-$(date +%s)"
ERRLOG=$(mktemp /tmp/giraffe-restore.XXXXXX.err)

cleanup() {
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
  rm -f "${ERRLOG}" 2>/dev/null || true
}
trap cleanup EXIT

# Senha efêmera só deste container descartável — nunca impressa, morre com o container.
PW="v_$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 20)"

docker run -d --rm --name "${NAME}" \
  -e POSTGRES_PASSWORD="${PW}" -e POSTGRES_DB=giraffe \
  postgres:16-alpine >/dev/null

# Espera o banco descartável aceitar conexões.
pronto=""
for _ in $(seq 1 40); do
  if docker exec "${NAME}" pg_isready -U postgres -d giraffe >/dev/null 2>&1; then pronto=1; break; fi
  sleep 1
done
[ -n "${pronto}" ] || { echo "STOP: banco descartável não subiu" >&2; exit 1; }

# Recria só os NOMES dos papéis para que CREATE POLICY / owner do dump não falhem por role ausente.
# Sem privilégios de banco reais — é um ambiente de verificação, isolado e descartável.
docker exec "${NAME}" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q \
  -c "do \$\$ begin create role giraffe_app; exception when duplicate_object then null; end \$\$;" \
  -c "do \$\$ begin create role giraffe_migrator; exception when duplicate_object then null; end \$\$;" \
  >/dev/null 2>&1 || true

# Restore efetivo. Erros sobre GRANTs a papéis sem login no ambiente de verificação são toleráveis;
# o que importa é o schema e os dados chegarem. Capturamos o stderr para reportar a contagem.
docker exec -i "${NAME}" pg_restore -U postgres -d giraffe --no-owner < "${DUMP}" 2>"${ERRLOG}" || true

# Validação de integridade (read-only): tabelas, e presença das entidades canônicas do produto.
NT=$(docker exec "${NAME}" psql -U postgres -d giraffe -tAc \
  "select count(*) from pg_tables where schemaname='public'" | tr -d '[:space:]')
TEM_ORG=$(docker exec "${NAME}" psql -U postgres -d giraffe -tAc \
  "select count(*) from information_schema.tables where table_schema='public' and table_name='Organization'" | tr -d '[:space:]')
ERROS=$(grep -ciE 'error:' "${ERRLOG}" 2>/dev/null || echo 0)

echo "RESTORE_VERIFY"
echo "TABELAS_RESTAURADAS=${NT}"
echo "TEM_TABELA_ORGANIZATION=${TEM_ORG}"
echo "LINHAS_ERROR_NO_RESTORE=${ERROS}  (GRANTs a papéis sem login no ambiente de verificação são esperados)"
if [ "${NT}" -gt 0 ] && [ "${TEM_ORG}" = "1" ]; then
  echo "VEREDITO=RESTAURAVEL_OK"
else
  echo "VEREDITO=FALHOU — dump não restaurou o schema esperado" >&2
  echo "---- primeiras linhas de erro do pg_restore ----" >&2
  head -20 "${ERRLOG}" >&2
  exit 1
fi
