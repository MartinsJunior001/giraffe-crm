# Runbook — agendamento da coleta de lixo antiabuso (`db:cleanup`)

> Operação. Débito **D-05** do lote **L6 — Hardening**. Este documento descreve **como agendar** a coleta
> periódica dos contadores antiabuso. O **código está pronto e testado**; a **ativação no Coolify fica
> PENDENTE** (ação de Infra/Ops) — código pronto ≠ ativado.

## O que a coleta faz

`pnpm --filter @giraffe/api db:cleanup` (`scripts/db-cleanup.mjs`) apaga os contadores antiabuso **já
expirados** — `LoginFailure` (G1) e `RateLimit` (G2) — cujo registro está **fora** da janela de 15 min.
Um contador ainda válido (ataque em curso) **nunca** é tocado. A rotina é **determinística e
idempotente**: rodar duas vezes apaga 0 na segunda.

Sem esse expurgo periódico, um ataque de *spray* com muitos identificadores distintos que nunca
autenticam grava uma linha por identificador que **nunca** é removida — crescimento sem limite das
tabelas. As linhas expiram **logicamente** na janela (deixam de contar); a coleta recupera o **espaço
físico**.

## Por que NÃO roda no boot do container

Mesma regra das migrations: é uma **etapa controlada**, não um efeito colateral do start. Um container
que roda a coleta ao subir transformaria cada réplica e cada restart numa execução concorrente. O
agendamento vive **fora** da aplicação — num cron/scheduler operacional.

## Concorrência: o lock

A coleta é serializada por um **advisory lock de transação** (`pg_try_advisory_xact_lock`, chave
`427050006`). Se duas execuções se sobrepõem (dois crons, ou um cron + uma execução manual), **uma roda
e a outra pula** — sem erro, sem disputar as mesmas linhas. O lock cai sozinho no fim da transação (não
vaza pelo pool). O `scripts/db-cleanup.mjs` e o `LoginFailureService.limparExpiradosComLock` usam a
**mesma chave**, então disputam o mesmo lock.

## Intervalo sugerido

- **A cada 15 min** (alinhado à janela). Aceitável qualquer intervalo entre 5 min e 1 h: a urgência é de
  **espaço**, não de segurança (a expiração lógica já aconteceu na janela). Sob volume alto, aproxime de
  5 min; sob volume baixo, 1 h basta.
- A coleta é barata e idempotente; sobrepor execuções é seguro (o lock protege).

## Ativação no Coolify — PENDENTE (Infra/Ops)

> **Status: NÃO ATIVADO.** O passo abaixo é a ação de Infra/Ops que falta para fechar o D-05 no ambiente.

1. Criar um **Scheduled Task** no serviço da API no Coolify (ou um cron equivalente na infraestrutura),
   com o comando:
   ```bash
   pnpm --filter @giraffe/api db:cleanup
   ```
   ou, se o container roda o `dist`, o equivalente `node scripts/db-cleanup.mjs` com o mesmo ambiente.
2. **Cron sugerido:** `*/15 * * * *` (a cada 15 min).
3. O comando exige `DATABASE_URL` (papel de runtime `giraffe_app`, que tem `DELETE` em `LoginFailure` e
   `RateLimit`) — **as mesmas** variáveis já injetadas no serviço. **Não** usa a credencial do migrator.
4. **Uma única definição** de agendamento (sem segunda verdade). Não duplicar num segundo cron.

## Observabilidade

- Execução normal: log estruturado `auth.antiabuse.cleanup` com as contagens removidas.
- Execução pulada (lock retido): `auth.antiabuse.cleanup.skipped`.
- Nenhum dos dois carrega PII (nem IP, nem chave, nem e-mail).
- **Falha não é silenciosa:** um erro de banco no meio propaga — o comando sai com código **≠ 0**, e o
  agendador do Coolify marca a execução como falha (alarme visível).

## Dono operacional

- **Trilha A / Backend** — dono do comando e do modelo de anti-abuso.
- **Infra / Ops** — dono da ativação e do intervalo no Coolify (o passo PENDENTE acima).

## Verificação manual (uma vez, após ativar)

```bash
# Rodar à mão e conferir o log/contagem:
pnpm --filter @giraffe/api db:cleanup
# Rodar duas vezes seguidas: a 2ª deve apagar 0 (idempotência) ou reportar "pulado" se sobrepôs.
```

No **staging** (execução manual controlada, débito D-05), o gate versionado roda a coleta duas vezes
por `docker exec` no container da API e prova o código 0 + a idempotência, com guarda de escopo:

```bash
bash scripts/ops/l6/gate-d05-cleanup.sh   # → D05_CLEANUP_OK
```

Regressão descartável (prova que expirados são apagados e contadores em curso são preservados):
`scripts/ops/l6/test-gate-d05-cleanup.sh` → `D05_REGRESSAO_OK`.
