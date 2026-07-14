# Plan — D-05: agendador da coleta de lixo antiabuso

> Risco NORMAL. Fonte: `spec.md`. **Sem migration.** Preserva `limparExpirados` (não reescreve).

## Decisão de mecanismo
- **Cron externo** dispara `pnpm --filter @giraffe/api db:cleanup`. **Não** in-app, **não** no boot.
  Justificativa: evita `@nestjs/schedule` (stack nova) e mantém a regra "etapa controlada, não no boot"
  (igual às migrations). A ativação vive no Coolify (runbook), fora do código.
- **Lock: `pg_try_advisory_xact_lock(chave)`**. Escolhido sobre `pg_try_advisory_lock` (sessão) porque o
  Prisma **agrupa conexões** (pool): um lock de sessão adquirido numa conexão e liberado noutra vazaria.
  O lock de **transação** é adquirido e liberado na MESMA conexão da transação e some no commit/rollback —
  sem `unlock` manual, sem vazamento pelo pool. Uma chave `bigint` constante e única identifica a coleta.

## Semântica do lock
`limparExpiradosComLock()` abre **uma** transação e nela:
1. `SELECT pg_try_advisory_xact_lock(${CHAVE_LOCK_CLEANUP}) AS obtido`.
2. Se `obtido = false` → outra coleta roda agora → **pula**: loga `auth.antiabuse.cleanup.skipped`,
   retorna `{ pulado: true }` sem tocar as tabelas.
3. Se `obtido = true` → roda os mesmos DELETEs de `limparExpirados` **dentro da transação** e retorna as
   contagens. O lock cai no commit.

`limparExpirados()` **permanece intacta** (chamada direta continua válida e testada). A nova
`limparExpiradosComLock()` é a que o comando/cron usa.

## Onde vive o código
- **`LoginFailureService.limparExpiradosComLock()`** (novo método, testável com PostgreSQL real). Reusa
  a mesma janela/consultas; não duplica a regra de expiração (chama a lógica dentro da transação).
- **`scripts/db-cleanup.mjs`** (script de ops que o cron chama): passa a adquirir o mesmo
  `pg_try_advisory_xact_lock` com a **mesma chave** antes dos DELETEs; se não obtém, imprime "pulado" e
  sai 0. Mantém a duplicação mínima já existente (o script é glue de ops, não importa o Nest), com
  comentário cruzando a constante da chave.
- **Sem** alteração de schema/RLS/identidade.

## Chave do advisory lock
Constante `CHAVE_LOCK_CLEANUP` (`bigint`) definida e comentada; a MESMA no serviço e no script. Valor
arbitrário fixo (ex.: derivado de um rótulo estável), documentado.

## Índice em `RateLimit.lastRequest` — avaliado, NÃO materializado
O DELETE da coleta filtra `RateLimit.lastRequest` e `LoginFailure.windowStart`. `LoginFailure` já tem
`LoginFailure_windowStart_idx`; `RateLimit` **não** tem índice em `lastRequest`. Um índice ajudaria a
coleta sob volume — **mas** exige migration/DDL, e há uma Story CORE mexendo em schema em paralelo. Por
isso: **não** crio o índice aqui (não é indispensável para a correção do lock; a coleta é correta sem
ele). Registrado como necessidade a **serializar** com a Story CORE. Ver relatório final.

## Sequência (red-green)
1. Teste de concorrência que **falha sem o lock** (duas coletas rodam juntas) → implementar o lock →
   verde (uma roda, a outra pula).
2. Teste de falha não silenciosa (erro propaga; comando sai != 0).
3. Preservar os testes existentes de expiração/idempotência (não tocá-los).
4. Runbook em `docs/04-operacao/agendamento-coleta-antiabuso.md`.
5. Gates: security/observability/lgpd-check.

## Constitution / arquitetura
Regra "não no boot" (migrations/ops como etapa controlada). Sem antecipar escopo (sem `@nestjs/schedule`).
Sem PII em log (a coleta nunca loga chave/IP). `kernel/auth` = fronteira técnica.
