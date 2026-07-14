# Spec — D-05: agendador da coleta de lixo antiabuso (`db:cleanup`)

> Débito de staging **D-05**, lote **L6 — Hardening**. Risco NORMAL (operacional; não toca
> isolamento/authz/identidade). Fontes: `l6-hardening-staging-dossie.md` §D-05, `gates/1-4/summary.md` §11.
> Baseline: `scripts/db-cleanup.mjs`, `LoginFailureService.limparExpirados` (já idempotente e testado).

## Contexto
A **rotina** de coleta já existe, é idempotente e testada: `LoginFailureService.limparExpirados()` e o
comando `pnpm --filter @giraffe/api db:cleanup` (`scripts/db-cleanup.mjs`). Ela apaga apenas contadores
`LoginFailure`/`RateLimit` **fora** da janela de 15 min — um contador ainda válido (ataque em curso)
nunca é tocado. O que falta é o **agendamento** periódico e uma trava que impeça **duas coletas
concorrentes** de correrem juntas.

## Problema a resolver
1. Não há disparo periódico versionado da coleta — sob volume de produção as tabelas crescem sem uma
   varredura regular (baixa urgência funcional; exigido antes de volume de produção).
2. Duas execuções concorrentes (dois crons sobrepostos, ou um cron + uma execução manual) rodariam os
   mesmos DELETEs ao mesmo tempo — desperdício e contenção evitáveis. Falta um **lock**.

## Decisão de mecanismo (resolvida no `plan`)
- **Cron/scheduler operacional externo** disparando `pnpm --filter @giraffe/api db:cleanup`, **NÃO** um
  scheduler in-app e **NÃO** no boot do container (mesma regra das migrations — etapa controlada). Isso
  evita adicionar `@nestjs/schedule` (dependência/stack nova) e mantém "uma única verdade" de
  provisionamento.
- **Lock por `pg_try_advisory_xact_lock`** (advisory lock de transação, auto-liberado no fim da
  transação — não vaza pelo pool). Se o lock não é obtido, a execução **pula** silenciosamente (log
  estruturado), não falha.

## Fora do escopo (não-objetivos)
- Reescrever `limparExpirados` (preservada — idempotente e testada).
- Ativar o agendamento no Coolify (é ação de Infra/Ops; **código pronto ≠ ativado**).
- Adicionar `@nestjs/schedule` ou scheduler in-process.
- Índice novo em `RateLimit.lastRequest` (avaliado; ver `plan.md` — **não** materializado nesta tarefa
  para não abrir migration em paralelo à Story CORE).

## Comportamento esperado (contrato)
- A coleta com lock roda os mesmos DELETEs de `limparExpirados` quando obtém o lock.
- Duas coletas concorrentes: **uma** roda, a outra **pula** (sem erro, log distinto).
- Idempotência preservada: 2ª passada apaga 0, não ressuscita contador válido.
- Falha real (banco caído no meio) **não é silenciosa**: erro sobe/loga, `exit != 0` no script.
- Observável: reusa o evento `auth.antiabuse.cleanup`; a execução pulada emite
  `auth.antiabuse.cleanup.skipped`. Sem PII.

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-D05-1** — Expiração correta: só o que está fora da janela some (já coberto — preservado).
- **SC-D05-2** — Idempotência: 2ª execução apaga 0 e não ressuscita (já coberto — preservado).
- **SC-D05-3** — Concorrência: com o lock retido por outra sessão, a coleta **pula** (não roda os
  DELETEs); liberado o lock, roda. Fase vermelha: sem o lock, as duas rodam.
- **SC-D05-4** — Falha não silenciosa: erro de banco no meio propaga (não é engolido) e o comando sai
  com código != 0.
- **SC-D05-5** — Documentado: runbook com intervalo sugerido, dono operacional e passo de ativação no
  Coolify (explicitamente **pendente**).

## Gates obrigatórios
security-check (sem segredo/PII em log; papel de runtime) · observability-check (evento distinto para
skip) · lgpd-check (leve — sem PII). **Sem migration** (sem DDL).

## Governança
Rascunho de Spec Kit; não inscreve o débito em `sprint-status.yaml`/`epics.md`. Não marca D-05 como
resolvido — segue bloqueador visível até a ativação no Coolify (fora deste worktree).
