# Clarify — D-05: agendador da coleta de lixo antiabuso

> Ambiguidades resolvidas antes do `plan`, a partir das fontes autoritativas (dossiê L6, `gates/1-4`,
> código existente). Sem interlocutor humano no worktree; respostas registradas para auditoria.

| # | Ambiguidade | Resolução | Fonte |
|---|---|---|---|
| C1 | Scheduler in-app ou cron externo? | **Cron externo** (`db:cleanup`), **não** in-app e **não** no boot. Evita `@nestjs/schedule` (stack nova) e segue a regra "etapa controlada". | dossiê §D-05; regra migrations |
| C2 | Mecanismo do lock? | **`pg_try_advisory_xact_lock`** (transação) — auto-liberado, não vaza pelo pool. Sobre `pg_try_advisory_lock` (sessão), que exigiria unlock e casaria mal com o pool do Prisma. | `plan.md` §lock |
| C3 | Reescrever `limparExpirados`? | **Não.** Preservada (idempotente e testada). A nova `limparExpiradosComLock` a envolve numa transação com lock; os DELETEs são repetidos ali porque precisam rodar na conexão que detém o lock. | tarefa D-05.1 |
| C4 | Lock bloqueante ou não-bloqueante? | **Não-bloqueante (`try`)**: se outra roda, pula (não enfileira). A coleta é idempotente; enfileirar só empilharia trabalho redundante. | `plan.md` |
| C5 | Ativar no Coolify agora? | **Não.** Código pronto ≠ ativado; a ativação é ação de Infra/Ops (runbook), fora deste worktree. | tarefa D-05.5 |
| C6 | Criar índice em `RateLimit.lastRequest`? | **Não** nesta tarefa — exige migration/DDL e há Story CORE mexendo em schema. Registrado para serializar. | `plan.md` §índice |

## Não-objetivos confirmados
Reescrita de `limparExpirados`, ativação no Coolify, `@nestjs/schedule`, índice novo — todos fora.
