# Spec (rascunho) — D-06: rate limiter de autenticação robusto sob rajada concorrente

> **Rascunho de Spec Kit (`specify`)** para o débito de staging **D-06**, do lote **L6 — Hardening**.
> Risco **NORMAL** (robustez/disponibilidade; **não** toca isolamento/authz — o defeito é fail-closed).
> Produzido pelo Planejador L6 **sem escrever código de aplicação**. Precisa passar por
> `clarify → plan → checklist → tasks → analyze` antes de implementar.
> Fontes: `gates/1-5/summary.md` (8 critérios), `_bmad-output/implementation-artifacts/l6-hardening-staging-dossie.md`,
> `gates/d-06/pre-implementation-check.md`. Baseline de libs: `apps/api/package.json`
> (`better-auth ^1.6.23`, `@prisma/client 6.19.3`), API de rate limit confirmada no Context7.

## Contexto
O rate limiter do Better Auth está configurado com `storage: 'database'`
(`apps/api/src/kernel/auth/auth.factory.ts` §119, `modelName: 'RateLimit'`, `window`/`max` por rota, com
`customRules` para `ROTA_LOGIN`). Nesse modo o limiter abre **uma transação por requisição**
(`incrementOne` → `_transactionWithCallback`). Sob rajada **concorrente** a `/api/auth/*`, as transações
competem pelo pool de conexões do PostgreSQL e parte das requisições recebe **HTTP 500** em vez do **429**
correto. É **fail-closed** (nega acesso, nunca concede indevidamente) — **não** é falha de isolamento,
autenticação ou autorização; é robustez/disponibilidade sob carga anômala (ataque de força bruta paralelo
ou concorrência artificial). Herdado da Story 1.4. **Bloqueia `STAGING APPROVED`.**

## Problema a resolver
Sob rajada concorrente a `/api/auth/*`, o limiter deve responder **429** ao excesso e **nunca 500 por
contenção de transação**, mantendo contagem consistente e fail-closed — sem negar requisições legítimas.

## Fora do escopo (não-objetivos)
- **CR-09** (rate limiting de **borda** do `/ready`) — Coolify-dependente; não misturar com esta correção
  sem justificativa arquitetural (restrição ratificada pelo usuário).
- **D-01/D-02** (IPs/CIDR do proxy Coolify) — configuração de borda.
- **D-05** (agendador do `db:cleanup`) — a rotina de coleta já existe; agendá-la é outro débito.
- Alterar identidade/sessão, `disableSignUp`, `requireEmailVerification`, ou a resolução de IP
  (`client-ip.ts`). O IP já chega saneado com valor único ao Better Auth.
- Introduzir `orgId` no contador — `RateLimit`/`LoginFailure` são **globais** por IP (pré-contexto),
  deliberadamente fora da RLS organizacional.
- Adotar `@nestjs/throttler` (não está no projeto) sem decisão arquitetural registrada.

## Opções de mitigação (o `plan` escolhe UMA, com evidência)
Confirmadas contra o Context7 (`/better-auth/better-auth`, doc de rate-limit — `storage` aceita
`memory | database | secondary-storage`; `customStorage` expõe `get`/`set` e um método **atômico opcional**
`consume(key, {window, max}) → { allowed, retryAfter }`; a doc marca a tabela de banco como não
recomendada onde há requisito de consumo atômico):

1. **`customStorage` com `consume` atômico** — implementar o store do limiter com consumo atômico numa
   única instrução (ex.: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), **sem** transação por
   requisição, preservando persistência entre restarts e réplicas. **Menor** mudança de infra. *(Preferida
   como primeira hipótese, a validar.)*
2. **`secondary-storage` (Redis)** — mover o contador para store atômico distribuído. Resolve a contenção
   do pool, mas adiciona **infra e dependência** → exige **decisão arquitetural registrada (AD)** +
   variáveis de ambiente validadas por Zod (`kernel/config/env.ts`).
3. **Pool + backpressure** — dimensionar o pool e adicionar backpressure/enfileiramento. Menos invasivo,
   maior risco de apenas empurrar o limite (aceitável só se o teste concorrente comprovar os critérios).

## Comportamento esperado (contrato)
- `/api/auth/*` continua **sem** `@Requer`/CASL (borda de autenticação, anterior ao contexto).
- Requisição dentro do limite: fluxo normal. Excesso: **429** com `retryAfter`. Falha do backing store:
  **fail-closed** (nega). Nada de **500** por contenção de transação sob N≥16 concorrentes.
- Contagem consistente (sem perda/duplicação de incremento) sob concorrência.
- Requisição **legítima** nunca é negada indevidamente.

## Dados e entidades
- **`RateLimit`** (modelo Better Auth) — fonte de verdade da contagem por IP. A opção escolhida pode
  mantê-lo (com índice/ajuste), substituí-lo por store atômico, ou movê-lo para `secondary-storage`.
- **Global, sem `orgId`, fora da RLS organizacional** — não introduzir isolamento por Org aqui.
- Retenção/coleta permanecem em `db:cleanup` (`limparExpirados`); **agendamento é o D-05**, não este spec.

## Migration e rollback
- Config-only (opções 1/3 sem DDL): rollback = reverter commit.
- Se houver DDL (índice em `RateLimit`): migration versionada + `.down.sql` reversível **testado**;
  serializar com outras migrations ativas (uma única verdade de provisionamento). Aciona **migration-check**.
- Redis (opção 2): rollback restaura a config anterior; documentar desprovisionamento. Contador é efêmero —
  sem perda de dado de domínio.

## Critérios de sucesso (verificáveis, PostgreSQL real) — os 8 de `gates/1-5/summary.md`
- **SC-D06-1** — Sob **N≥16** requisições concorrentes a `/api/auth/*`: **zero 500** indevido.
- **SC-D06-2** — Todo excesso recebe **429**; nenhum caminho escapa da contagem.
- **SC-D06-3** — Contador **consistente** sob concorrência (sem perda/duplicação de incremento).
- **SC-D06-4** — Indisponibilidade do backing store → **fail-closed** (nega, nunca concede).
- **SC-D06-5** — Respostas e logs do limiter **sem PII** (IP tratado conforme política vigente).
- **SC-D06-6** — **Teste HTTP concorrente com PostgreSQL real** (AppModule em porta efêmera) reproduz a
  rajada — não mock.
- **SC-D06-7** — **Fase vermelha real** (o teste falha na config atual) + **mutação** que prova que o teste
  pega a regressão (desligar a mitigação faz o teste voltar a falhar).
- **SC-D06-8** — Observabilidade **separa 429 (limite legítimo) de 500 (falha interna)** — defesa não se
  confunde com defeito.

## Estratégia de testes
Teste de carga concorrente contra `POST /api/auth/sign-in/email` (a variante que a antiga
`sessao.test.ts::TS-10` exercia antes de ser reescrita para `/organizations/current`), N≥16 em paralelo,
pool restrito para reproduzir a contenção. Provar vermelho→verde e a mutação. Asserções separadas para 429,
ausência de 500, passagem da requisição legítima e fail-closed com store indisponível. Dados globais
(`RateLimit`) — se algo tocar dados organizacionais, escrever na **Org C**.

## Segurança / observabilidade / LGPD
Sem bypass de RLS (AD-6) — não aplicável (contador global). Deny-by-default preservado (o limiter só nega
mais cedo, nunca concede). Logs Pino sanitizados; IP conforme política de PII vigente. Distinguir 429 de
500 em métricas/log (SC-D06-8).

## Gates obrigatórios antes de concluir
context7-check (refazer com versão instalada) · security-check · observability-check · performance-check ·
migration-check (**se** houver DDL) · backup-check (se mudar store persistente) · lgpd-check (leve, IP).

## Decisões pendentes (resolver no `clarify`/`plan`)
1. Qual das três opções de mitigação (evidência de que fecha os 8 critérios sem ampliar escopo).
2. Adotar Redis? Se sim, **AD** registrada + env validada (mudança de stack).
3. D-06 é resolvido no app **independentemente** de CR-09 (recomendado — CR-09 é Coolify-dependente e não
   deve bloquear o code-advanceable).

## Governança
Este é um **rascunho**; não inscreve o débito em `sprint-status.yaml`/`epics.md` (feito pelo workflow BMAD
do L6). Não marca D-06 como resolvido — segue bloqueador visível até correção provada.
