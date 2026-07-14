# Checklist — D-06: rate limiter de autenticação robusto sob rajada concorrente

> Derivado dos 8 critérios de `gates/1-5/summary.md` e do `plan.md`. Marcado só com evidência de execução
> real (Constitution X). PostgreSQL real, sem mock.

## Correção (comportamento)
- [ ] N≥16 concorrentes a `/api/auth/*` com pool restrito → **zero 500** indevido (SC-D06-1).
- [ ] Todo excesso → **429** com `X-Retry-After`; nenhum caminho escapa da contagem (SC-D06-2).
- [ ] Contagem consistente sob concorrência: exatamente `max` requisições allowed, resto barrado (SC-D06-3).
- [ ] Requisição legítima (dentro do limite) **não** é negada indevidamente (R3).

## Robustez / fail-closed
- [ ] Backing store indisponível → **negado** (nunca concede sessão) (SC-D06-4).
- [ ] Persistência preservada: contador sobrevive a restart e é compartilhado entre réplicas (invariante G2 — já em `login-http.test.ts`).

## Observabilidade / PII
- [ ] Observabilidade separa **429 (limite)** de **500 (falha)** — evento `auth.ratelimit.store_error` distinto (SC-D06-8).
- [ ] Sem PII no log do limiter/erro: nem IP, nem corpo, nem chave HMAC (SC-D06-5).

## Prova de teste
- [ ] Teste HTTP **concorrente** com PostgreSQL real, AppModule em porta efêmera (SC-D06-6).
- [ ] **Fase vermelha real** provada (falha na config atual) + **mutação** que devolve o vermelho (SC-D06-7).

## Escopo / arquitetura
- [ ] Sem migration/DDL; sem GRANT novo; `key @unique` reusado.
- [ ] Sem Redis, sem `@nestjs/throttler`, sem `orgId` no contador.
- [ ] Sem tocar identidade/sessão, `client-ip.ts`, `/health`/`/ready`.
- [ ] `kernel/auth/` = fronteira técnica; nenhuma regra de negócio adicionada.

## Gates
- [ ] context7-check (versão instalada) · security-check · observability-check · performance-check · lgpd-check (leve).
- [ ] Suíte cheia verde · commit-check aprovado · PR aberto (sem merge).
