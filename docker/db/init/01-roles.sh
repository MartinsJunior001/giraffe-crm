#!/bin/bash
# Bootstrap de papéis no ambiente de DESENVOLVIMENTO.
#
# Este script não contém SQL: ele apenas executa, como superusuário, o mesmo arquivo
# versionado que o deploy usa — `apps/api/prisma/bootstrap/00-roles.sql`, montado em
# /bootstrap pelo Compose. Uma única definição de papéis para todos os ambientes; o que
# muda é quem a executa. Manter uma cópia do SQL aqui produziria duas verdades, e a que
# vale em produção seria a que ninguém testa.
#
# O entrypoint do PostgreSQL roda este diretório UMA vez, e só com o datadir vazio. É
# suficiente para o `compose up` e insuficiente para qualquer outra coisa — daí o SQL
# ser idempotente e executável à mão (ver README, seção de publicação).
set -euo pipefail

# Sem default: senha ausente deve FALHAR, não virar uma credencial previsível. O Compose
# já exige as variáveis (`${VAR:?}`); esta é a segunda barreira, para o caso de alguém
# executar a imagem fora do Compose.
: "${MIGRATOR_PASSWORD:?defina MIGRATOR_PASSWORD}"
: "${APP_PASSWORD:?defina APP_PASSWORD}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=migrator_password="$MIGRATOR_PASSWORD" \
  --set=app_password="$APP_PASSWORD" \
  --set=db_name="$POSTGRES_DB" \
  -f /bootstrap/00-roles.sql
