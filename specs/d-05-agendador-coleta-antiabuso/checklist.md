# Checklist — D-05: agendador da coleta de lixo antiabuso

> Marcado só com evidência de execução real (Constitution X). PostgreSQL real.

## Lock / concorrência
- [ ] Com o lock retido por outra sessão, a coleta **pula** (não roda os DELETEs) e loga
  `auth.antiabuse.cleanup.skipped` (SC-D05-3).
- [ ] Liberado o lock, a coleta **roda** e remove o expirado (SC-D05-3).
- [ ] Lock é de **transação** (`pg_try_advisory_xact_lock`) — cai sozinho, não vaza pelo pool.
- [ ] Script e serviço usam a **mesma** chave (`427050006`).

## Preservação (não reescrever)
- [ ] `limparExpirados` intacta; testes de expiração (SC-D05-1) e idempotência (SC-D05-2) seguem verdes.
- [ ] Idempotência com lock: 2ª passada não ressuscita nem re-apaga (SC-D05-2).

## Falha / observabilidade
- [ ] Falha de banco **propaga** (não silenciosa); comando sai != 0 (SC-D05-4).
- [ ] Eventos sem PII (nem IP, nem chave, nem e-mail).

## Agendamento / governança
- [ ] Comando versionado (`db:cleanup`) — **não** no boot do container.
- [ ] Runbook com intervalo, dono e ativação no Coolify marcada **PENDENTE** (SC-D05-5).
- [ ] **Sem** migration; **sem** `@nestjs/schedule`.

## Gates
- [ ] security-check · observability-check · lgpd-check · suíte verde · commit-check · PR (sem merge).
