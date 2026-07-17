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

### Passo 4 e 5 — Migrations one-shot + gate de zero pendências
```bash
DIR="$DIR" REDE="$REDE" bash scripts/ops/l6/migrate-oneshot.sh
```
Aplica as migrations (etapa controlada, giraffe_migrator/AD-32, nunca no boot) e roda o **gate**: o
`prisma migrate status` sai `≠0` se houver pendência/drift, e o script converte isso no veredito
**`MIGRATE_ONESHOT_OK`** (zero pendentes) ou **falha** (`MIGRATE_ONESHOT_FALHOU`, exit 1 — não
prossiga). Só com `MIGRATE_ONESHOT_OK` avance ao passo 6.

### Passo 6 — Provisionar tenant/Admin (senha não exposta)
```bash
DIR="$DIR" REDE="$REDE" \
  PROVISION_ORG_NAME="<org>" PROVISION_ADMIN_EMAIL="<email>" \
  bash scripts/ops/l6/provision-tenant.sh
```
Se a senha for **gerada**, ela sai **uma vez** — capture com segurança e **não** cole no relatório.

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
Espere: `giraffe_app` BYPASSRLS=`f`/SUPER=`f`; RLS `t`/FORCE `t` nas organizacionais; policies por
tabela; `DELETE` a giraffe_app = 0 nas append-only; `Account` só `SELECT`; UPDATE de `Card`
column-scoped; migrations aplicadas sem rollback; 1 Organization e ≥1 Membership ADMIN ACTIVE.

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

## Gates de segurança (invioláveis)

- **Nunca** imprimir/colar segredos ou senha do Admin no relatório.
- **Não** fixar `TRUSTED_PROXY_IPS` no IP dinâmico; **fechar o D-01** (hop autenticado) antes do
  veredito final — ver `_bmad-output/implementation-artifacts/tech-d01-hop-web-api-autenticado.md`.
- **Não** tocar no Chatwoot nem em produção. Monitorar recursos da VPS durante backup/restore.
- Todo script aqui é read-only ou controlado; nenhum faz DELETE, deploy ou remove o stack.

## SHA-256 dos scripts (confirme antes de executar)

Gere no host com `sha256sum scripts/ops/l6/*.sh` e compare com o commit desta branch. Os valores
canônicos desta versão estão no corpo do PR que introduz este runbook.
