# Checklist — D-06: rate limiter de autenticação robusto sob rajada concorrente

> Derivado dos 8 critérios de `gates/1-5/summary.md` e do `plan.md`. Marcado só com evidência de execução
> real (Constitution X). PostgreSQL real, sem mock.
>
> **Decisão final:** resolvido pelo **upgrade** (nativo atômico no 1.6.23); `customStorage` removido. Todas as
> provas exercitam o Better Auth **nativo**. Ver `plan.md` §Resolução final e `docs/04-operacao/d-06-rate-limiter-historico.md`.

## Correção (comportamento) — store NATIVO
- [x] N=24 concorrentes a `/api/auth/*` com pool restrito → **zero 500** (`rate-limit-concurrency.test.ts`) (SC-D06-1).
- [x] Excesso → **429** com `X-Retry-After` (`rate-limit-native.test.ts`) (SC-D06-2).
- [x] Contagem consistente: contador do balde == nº de tentativas (`rate-limit-native.test.ts`) (SC-D06-3).
- [x] Requisição dentro do limite **não** é negada indevidamente (as G2_MAX primeiras não são 429) (R3).

## Robustez / fail-closed
- [x] Backing store indisponível → **negado** (5xx, nunca 2xx) — `rate-limit-native.test.ts`, instância isolada (SC-D06-4).
- [x] Persistência preservada: contador no PostgreSQL sobrevive a restart e é compartilhado entre réplicas (invariante G2 — nativo `storage:'database'`, já em `login-http.test.ts`).

## Observabilidade / PII
- [x] Observabilidade separa **429 (limite)** de **5xx (falha)** — caminhos distintos; `concurrency` afirma zero 5xx no normal (SC-D06-8).
- [x] Sem PII: e-mail/senha do login ausentes do stdout (`rate-limit-native.test.ts`) (SC-D06-5).

## Prova de teste
- [x] Teste HTTP **concorrente** com PostgreSQL real, AppModule em porta efêmera (`rate-limit-concurrency.test.ts`) (SC-D06-6).
- [x] **Fase vermelha real** (store não-atômico VAZA > max) provada em `rate-limit-native.test.ts` (SC-D06-7).

## Escopo / arquitetura
- [x] Sem migration/DDL; sem GRANT novo; `key @unique` reusado; `auth.factory.ts` idêntico à `main` (nativo).
- [x] Sem Redis, sem `@nestjs/throttler`, sem `orgId` no contador.
- [x] Sem tocar identidade/sessão, `client-ip.ts`, `/health`/`/ready`.
- [x] `customStorage` REMOVIDO — nada acrescentado ao runtime; `kernel/auth/` sem código de rate limit custom.

## Gates
- [x] context7-check (better-auth 1.6.23 instalado — nativo atômico) · revisão independente · gates proporcionais ao diff.
- [x] Suíte verde · commit-check aprovado · PR #27 aberto contra `main`.
