# Runbook — Fase B do staging provisório (L6)

Procedimento **versionado** para concluir o staging provisório do Giraffe CRM no Coolify, executado
**por SSH no host** (não há SSH autônomo do agente). Cada script é read-only ou controlado, curto e
validado (`bash -n` + shellcheck + SHA-256). A topologia já foi **aprovada como nativa** (Coolify
gerencia a rede; db/api sem porta/domínio/router Traefik; risco lateral residual do proxy aceito só
para staging). **Produção continua proibida**; multi-rede custom permanece bloqueador de produção.

## Pré-condições

- Topologia nativa aprovada (inspeção 2026-07-17: API `10.0.4.4`, DB `10.0.4.3`, sem porta/router).
- App no Coolify `running:healthy`; HTTPS estável.
- Acesso SSH ao host com Docker. O `.env` do Coolify é lido **só** pelo Compose via `--env-file`.

## Integridade dos scripts

Antes de executar cada script, confirme o SHA-256 (a tabela final deste runbook lista os valores).
Padrão: `echo "<sha>  /caminho/script.sh" | sha256sum -c -`.

## Sequência

### Passo 1 — Preparação (read-only)
Descobre o **SHA implantado**, reconstrói o material de build clonando o commit implantado em `DIR`,
e descobre a **REDE** do stack (padrão nativo: a rede gerenciada onde `db`/`api` estão, sem exigir
`Internal=true`).
```bash
eval "$(bash scripts/ops/l6/prepara-fase-b.sh)"   # define SHA_IMPLANTADO, DIR, REDE, SERVICOS
export DIR REDE
echo "DIR=$DIR  REDE=$REDE"
```
Se o script **parar** (ambiguidade de SHA/rede), siga a instrução que ele imprime — nunca presuma.

### Passo 2 — Backup real pré-migration (read-only no banco)
```bash
bash scripts/ops/l6/backup-pre-migration.sh
```
Gera o dump **e** um `MANIFEST` sanitizado (SHA-256 + contagens da origem, sem PII). Guarde `ARQUIVO`,
`MANIFEST` e `SHA256`. O `MODE` é derivado do estado real: **0 tabelas ⇒ `pre`** (vazio esperado,
porque as migrations só rodam no passo 4). Um backup só vale se for restaurável — é o passo 3 que prova.

### Passo 3 — Restore efetivo em banco descartável + comparação origem × restaurado
```bash
bash scripts/ops/l6/restore-verify.sh <ARQUIVO_do_passo_2>   # lê o .manifest ao lado
```
Não exige schema fixo: **compara** o restaurado com o manifest. No `MODE=pre`, **0 na origem e 0
restaurado = fiel** → `VEREDITO=RESTORE_OK`. No `MODE=pos`, a comparação é **estrita** (tabelas,
migrations, RLS/FORCE, policies, grants, tenant + sanidade ≥1). Divergência → `RESTORE_FALHOU`
(vermelho). O container de verificação é efêmero, com **guarda de nome** (`giraffe-restore-check-*`),
removido no fim — **nunca** toca o database `giraffe` nem o container do banco.

> **GATE:** não prossiga para as migrations (passo 4) enquanto o restore pré-migration não retornar
> `VEREDITO=RESTORE_OK`.

**Regressão do próprio verificador** (opcional, mas recomendada uma vez):
```bash
bash scripts/ops/l6/test-restore-verify.sh   # espera REGRESSAO_OK
```
Prova que um dump vazio fiel passa e que um manifest divergente fica vermelho.

### Passo 4 e 5 — Migrations one-shot + verificação NO DB REAL por label
```bash
DIR="$DIR" REDE="$REDE" bash scripts/ops/l6/migrate-oneshot.sh
```
Aplica as migrations (etapa controlada, giraffe_migrator/AD-32, nunca no boot). **Correção do falso
verde (cenário D):** o veredito **não** confia mais só no que o one-shot vê. Antes de aplicar, prova
que o container alcançado por `db:5432` na REDE é o **mesmo cluster** que o **db real por label**
(compara `system_identifier`) — se divergir, **aborta** (`DIVERGÊNCIA DE CLUSTER`) sem migrar; e exige
**exatamente 1** container `db` do projeto. Depois de aplicar, **verifica de fora** (docker exec no db
real por label): `MIGRATE_ONESHOT_OK` só sai se `apply` exit 0 **e** `status` sem pendências **e**
`_prisma_migrations` = nº de migrations esperado **e** `Account`/`AuthCredential` presentes **no db
real**. Caso contrário `MIGRATE_ONESHOT_FALHOU` (exit 1). Só com `MIGRATE_ONESHOT_OK` avance ao passo 6.
Regressão: `bash scripts/ops/l6/test-migrate-verify.sh` → `MIGRATE_VERIFY_REGRESSAO_OK`.

**Inventário de escopo (para localizar em qual banco/container algo rodou):**
```bash
bash scripts/ops/l6/inventory-scope.sh   # read-only; só o project UUID autorizado; sem senha/DSN/PII
```

### Passo 6 — Provisionar tenant/Admin (senha não exposta)
```bash
DIR="$DIR" REDE="$REDE" \
  PROVISION_ORG_NAME="<org>" PROVISION_ADMIN_EMAIL="<email>" \
  bash scripts/ops/l6/provision-tenant.sh
```
Se a senha for **gerada**, ela sai **uma vez** — capture com segurança e **não** cole no relatório.

**Reset da senha do Admin (se a senha de uso único se perder):** rodar o provision de novo **não**
reseta (é idempotente e não sobrescreve a credencial). Use o reset dedicado — atualiza **só** a
credencial (`AuthCredential`) do Account por e-mail, com hash do próprio Better Auth, **sem recriar o
tenant** e com guarda de domínio `@staging.giraffedev.cloud`. O script constrói a imagem one-shot a
partir do **repo de trabalho atualizado** (`--build`) — não do commit implantado — e um **gate** prova
que o `reset-admin-password.mjs` está **empacotado** na imagem antes de rodar (evita o
`MODULE_NOT_FOUND` visto quando a imagem não continha o arquivo). Precisa só de `REDE` (não `DIR`):
```bash
git pull --ff-only                                     # o repo de trabalho PRECISA ter o .mjs
REDE="$REDE" RESET_ADMIN_EMAIL="admin@staging.giraffedev.cloud" \
  bash scripts/ops/l6/reset-admin-password.sh          # senha nova sai UMA vez; não cole no relatório
```
Espere `RESET_ADMIN_OK`. A senha nunca aparece em `ps`/log/arquivo (env herdado). Para fixar uma senha
específica em vez de gerar, exporte `RESET_ADMIN_PASSWORD` antes (também herdada, nunca em argumento).
Prova reproduzível pelo mesmo `docker compose run`: `bash scripts/ops/l6/test-reset-admin-e2e.sh` →
`RESET_E2E_OK` (inclui o gate de empacotamento e o verify real NEW_OK/OLD_FAIL do Better Auth).

### Passo 7 — Backup pós-migration + segundo restore descartável
```bash
bash scripts/ops/l6/backup-pre-migration.sh      # agora com schema: MODE=pos no manifest
bash scripts/ops/l6/restore-verify.sh <novo_ARQUIVO>
```
Agora o `MODE=pos`: o restore exige schema, migrations, RLS/FORCE, policies, grants e tenant, com as
contagens **iguais** às da origem. Espere `VEREDITO=RESTORE_OK`.

### Passo 8 — Validar schema, RLS/FORCE, grants e tenant (read-only)
```bash
bash scripts/ops/l6/validate-schema-rls.sh
```
Emite veredito **inequívoco**: `VALIDATE_SCHEMA_RLS_OK` (exit 0) ou `VALIDATE_SCHEMA_RLS_FALHOU` (exit 1).
Verifica: `giraffe_app` `BYPASSRLS=f`/`SUPER=f`; RLS `ENABLE`+`FORCE` em **todas as organizacionais** e a
**allowlist de globais** sem RLS (`Account`/`Auth*`/`LoginFailure`/**`PublicFormRoute`**/**`RateLimit`**
por design — qualquer tabela sem RLS fora dela = falha); `DELETE` a `giraffe_app` = 0; `Account` só
`SELECT`; `UPDATE` de `Card` column-scoped; **exatamente `ESPERADO_MIGRATIONS` (default 19) finalizadas**;
**zero migrations não resolvidas** (`finished NULL & rolled_back NULL`); **todo histórico `rolled_back`
com reaplicação finalizada** (recovery legítimo ≠ falha pendente); 1 Organization e ≥1 Admin ACTIVE.
Regressão: `bash scripts/ops/l6/test-validate-schema.sh` → `VALIDATE_REGRESSAO_OK` (recovery válido /
falha pendente / recuperada sem reaplicação / RLS-FORCE removido). Só com `VALIDATE_SCHEMA_RLS_OK` avance.

### Passo 9 — /health e /ready (pela borda)
```bash
BASE=https://giraffe-crm-staging.2.24.77.65.sslip.io
curl -sS "$BASE/healthz"                          # {"status":"ok"} (liveness da Web)
```
`/health` e `/ready` da **API** não têm rota pública (por design); valide-os de dentro (pela Web/BFF)
ou confirme que a Web — que os consome — está saudável. `/ready` deve dar 200 com o banco apto e 503
quando indisponível (o teste do 503 exige derrubar o db momentaneamente — só se acordado; evita
impacto no host compartilhado).

### Passo 10 — Login/logout, CSRF, cross-tenant, rate limit
Com o tenant provisionado: login real do Admin pela Web; logout; rejeição de CSRF (Origin inválida →
403); isolamento cross-tenant (um tenant não vê recursos de outro) pela borda; rate limit G2. **Não
fixar** `TRUSTED_PROXY_IPS` no IP dinâmico `10.0.4.5` — a confiança correta é o **D-01** (hop Web→API
assinado), que deve fechar **antes do veredito final**.

### Passo 11 — D-05, restart e smoke
Ativar o D-05 (Scheduled Task de limpeza antiabuso); provar lock, idempotência e logs sem PII.
Restart do app; repetir o smoke (`/healthz`, `/login`, `/painel`→307) para confirmar estabilidade.

### Passo 12 — Revisões read-only e veredito
Revisores read-only: Segurança; Rede/Proxy; Migration/Backup; Aceite. Emitir
`STAGING PROVISÓRIO APROVADO` ou `BLOQUEADO` com evidência e uma única solicitação consolidada.

## Troubleshooting — P1000 no migrate (drift de senha do `giraffe_migrator`)

Sintoma: o passo 4 alcança `db:5432` mas o Prisma retorna **P1000** (autenticação inválida do
`giraffe_migrator`). Causa típica: o volume `db-data` sobreviveu a um deploy anterior que criou o
papel com uma senha; o `.env` atual tem outra. O bootstrap (`00-roles.sql`) só roda na **primeira**
criação do volume, então não reconcilia. **Não** retente o migrate nem provisione até resolver.

1. **Diagnóstico (read-only, não expõe segredos):**
   ```bash
   bash scripts/ops/l6/diagnose-migrator-auth.sh
   ```
   Reporta `MIGRATOR_PASSWORD_NO_ENV`, existência e atributos seguros do papel (canlogin/super/
   bypassrls/ownership), `AUTENTICACAO=AUTH_OK|AUTH_FAIL` (testada pelo IP de rede, não 127.0.0.1 —
   que é `trust` e mascararia) e o `VEREDITO`. `DRIFT_CONFIRMADO` = papel existe, senha presente no
   `.env`, mas não autentica.

2. **`VEREDITO=DRIFT_CONFIRMADO`** (papel existe, senha do `.env` não autentica) — **reparo de senha:**
   ```bash
   bash scripts/ops/l6/repair-migrator-password.sh
   ```
   Realinha **apenas a senha** do `giraffe_migrator` ao `.env` (via `\getenv` + env herdado; nunca em
   `ps`/log/arquivo). Preserva os atributos autoritativos (compara antes/depois), é idempotente e
   fail-closed; re-testa a auth e exige `REPAIR_OK`. **Não** cria papel, **não** toca `giraffe_app`,
   `postgres`, Chatwoot nem produção.

3. **`VEREDITO=SEM_PAPEL`** (o papel **não existe** — volume anterior ao `00-roles.sql`, que só roda
   na 1ª criação do volume) — **reconciliação de bootstrap:**
   ```bash
   bash scripts/ops/l6/reconcile-migrator-role.sh
   ```
   Reproduz fielmente a parte do `giraffe_migrator` de `apps/api/prisma/bootstrap/00-roles.sql`:
   `CREATE ROLE ... LOGIN` **só se ausente**; atributos autoritativos `LOGIN NOSUPERUSER NOBYPASSRLS
   NOCREATEROLE` (sem superuser/BYPASSRLS); ownership do `DATABASE giraffe` e do `SCHEMA public`; e a
   senha do `.env`. **Idempotente por aspecto** (2ª execução não altera nada), fail-closed, exige
   `ROLE_OK + AUTH_OK`. **Não** toca `giraffe_app`, `postgres`, Chatwoot nem produção. Regressão:
   `bash scripts/ops/l6/test-reconcile-migrator.sh` (espera `REGRESSAO_OK`).

4. **Após `AUTH_OK` (ou `ROLE_OK + AUTH_OK`):** repita o passo 4 (migrate one-shot) e o passo 5
   (zero pendências).

## Troubleshooting — P3018 na migration inicial (`role "giraffe_app" does not exist`)

Sintoma: o `giraffe_migrator` autentica e o migrate **começa**, mas a 1ª migration
(`20260712000000_init_tenancy_rls`) falha com **P3018 / SQLSTATE 42704** no `GRANT ... TO giraffe_app`
— o mesmo volume antigo também não criou o `giraffe_app`. Nenhuma migration posterior roda até
recuperar esta falha. **Não** provisione, **não** repita o migrate cegamente, **não** use `resolve`
sem provar o estado físico.

1. **Diagnóstico (read-only, prova o estado físico):**
   ```bash
   bash scripts/ops/l6/diagnose-migration-failure.sh
   ```
   Confirma `giraffe_app` ausente, lê a linha da migration em `_prisma_migrations` (sem o campo
   `logs`) e inventaria os objetos da migration. `VEREDITO=RECUPERAVEL_ROLLED_BACK` = causa presente,
   migration FAILED e **zero** objetos parciais (rollback transacional completo). `PARCIAL_REQUER_DOWN_SQL`
   = há objetos parciais (não marcar rolled-back direto).

2. **Reconciliar o `giraffe_app`** (só após a falha comprovada do runtime):
   ```bash
   bash scripts/ops/l6/reconcile-app-role.sh
   ```
   Reproduz a parte do `giraffe_app` de `00-roles.sql`: `CREATE ... LOGIN` só se ausente; atributos
   `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`; `GRANT CONNECT`/`USAGE`; senha
   `APP_PASSWORD`. Idempotente, fail-closed, exige `ROLE_OK + AUTH_OK`. **Não** toca `giraffe_migrator`.

3. **Recuperar a migration falha** (recaptura `DIR`/`REDE` do passo 1 do runbook):
   ```bash
   DIR="$DIR" REDE="$REDE" bash scripts/ops/l6/recover-failed-migration.sh
   ```
   **Gate de identidade de cluster** (obrigatório): antes de qualquer ação, prova que o `db:5432` do
   one-shot e o **db real por label** são o **mesmo cluster** (`system_identifier`); divergiu →
   **STOP `DIVERGÊNCIA DE CLUSTER`** (evita o falso recovery — marcar num cluster e o db real seguir
   FAILED). Guarda de escopo (UUID) e **exatamente 1 db** do projeto. Só marca `rolled-back` (via
   `db-migrate.mjs resolve-rolled-back`, **nunca** `--applied`) se provar **zero** objetos parciais **no
   db real**; com objeto parcial, **bloqueia** (`RECOVER_BLOCKED_PARCIAL`) e manda ensaiar o `down.sql`
   autoritativo em banco descartável. Atua **só** na `20260712000000_init_tenancy_rls`. Confirma
   `rolled_back_at` preenchido **no db real por label**. Preserva o backup. Regressão que reproduz o
   falso recovery: `bash scripts/ops/l6/test-recover-cluster.sh` → `RECOVER_CLUSTER_REGRESSAO_OK`.

4. **Repetir o migrate** (passos 4–5) e exigir **19 migrations finalizadas, zero pendências,
   `Account`/`AuthCredential` presentes no db real e `MIGRATE_ONESHOT_OK`**.

Prova end-to-end reproduzível (build da imagem migrate; não toca o staging):
`bash scripts/ops/l6/test-recovery-e2e.sh` → espera `RECOVERY_E2E_OK` (P3018 reproduzida → reconcilia
→ recupera → migrate completo → zero pendências → idempotente). Reconciliação isolada do app:
`bash scripts/ops/l6/test-app-role.sh` → `REGRESSAO_OK`.

## Troubleshooting — P2021 no reset (`public."Account"` não existe)

Sintoma: o empacotamento passa, o reset inicia, mas o Prisma retorna **P2021** (`public."Account"` não
existe) — apesar de o migrate ter reportado `MIGRATE_ONESHOT_OK`. Indica **divergência de destino de
banco** (o reset conecta a um lugar sem o schema) ou schema/search_path incorreto. **Nenhuma senha é
gerada** (o preflight aborta antes). **Não** repita o reset nem o provisionamento.

1. **Diagnóstico (read-only, sanitizado):**
   ```bash
   REDE="$REDE" RESET_ADMIN_EMAIL="admin@staging.giraffedev.cloud" \
     bash scripts/ops/l6/diagnose-db-target.sh
   ```
   Sonda **três** pontos de vista sobre `giraffe`, de forma **independente e tolerante** (uma falha em
   `[1]` nunca impede `[2]`/`[3]`): `[1]` `DATABASE_URL` (giraffe_app) na rede, `[2]`
   `MIGRATION_DATABASE_URL` (giraffe_migrator) na rede, `[3]` o container `db` por label. Cada bloco
   emite `QUERY_OK` (com `current_database`/`current_schema`/`current_user`, `to_regclass` de
   `Account`/`AuthCredential`, migrations finalizadas) ou `QUERY_FAIL` com uma **categoria sanitizada**
   (`AUTH`/`PERMISSION`/`TABLE_MISSING`/`NETWORK`/`CONFIG`/`UNKNOWN`) — **sem** DSN/senha/SQL bruto/PII.
   O **veredito é sempre emitido**, mesmo com falhas, e distingue **A** (reset no banco errado), **B**
   (migrations no banco errado), **C** (schema/search_path) e **D** (`MIGRATE_ONESHOT_OK` falso positivo).
   **Guarda de escopo:** o script **aborta** se `PROJ` não for o UUID autorizado (`enl623…`) — seleciona
   recursos só pela **label exata**, nunca pelo texto "giraffe" (`giraffe_app` é papel, não projeto).
   Regressão: `bash scripts/ops/l6/test-diagnose-db-target.sh` → `DIAG_REGRESSAO_OK` (prova `[1]` falho
   com `[2]`/`[3]` seguindo, em ambiente limpo — nunca no host).

2. **Proteção já ativa:** o `reset-admin-password.mjs` roda um **preflight fail-closed** — confirma
   `Account`/`AuthCredential` e o Account do Admin **no destino real** antes de gerar/aplicar qualquer
   senha. Se o destino divergir, aborta com `NENHUMA senha gerada` (nunca uma credencial no banco errado).

3. Corrigida a causa (garantir que reset e migrate usem o mesmo `giraffe`), repita o reset — o preflight
   passa (`preflight OK — destino database=giraffe schema=public`) e então `RESET_ADMIN_OK`.

## Gates de segurança (invioláveis)

- **Nunca** imprimir/colar segredos ou senha do Admin no relatório.
- **Não** fixar `TRUSTED_PROXY_IPS` no IP dinâmico; **fechar o D-01** (hop autenticado) antes do
  veredito final — ver `_bmad-output/implementation-artifacts/tech-d01-hop-web-api-autenticado.md`.
- **Não** tocar no Chatwoot nem em produção. Monitorar recursos da VPS durante backup/restore.
- Todo script aqui é read-only ou controlado; nenhum faz DELETE, deploy ou remove o stack.

## SHA-256 dos scripts (confirme antes de executar)

Gere no host com `sha256sum scripts/ops/l6/*.sh` e compare com o commit desta branch. Os valores
canônicos desta versão estão no corpo do PR que introduz este runbook.
