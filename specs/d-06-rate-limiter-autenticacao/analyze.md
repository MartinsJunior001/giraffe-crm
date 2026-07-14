# Analyze — D-06: consistência cruzada dos artefatos

> Análise não-destrutiva de `spec.md` × `plan.md` × `clarify.md` × `tasks.md` × `checklist.md` × código.
> Executada após a geração de tasks. Sem edição de artefatos autoritativos.

## Cobertura dos 8 critérios (spec → tasks → teste)

| Critério | spec (SC) | task | Evidência de teste |
|---|---|---|---|
| 1 — zero 500 sob N≥16 | SC-D06-1 | T001/T004 | `rate-limit-concurrency.test.ts` (N=24 sign-out, pool restrito) |
| 2 — excesso → 429, sem bypass | SC-D06-2 | T004 | `rate-limit-storage.test.ts` (barradas = N−max, retryAfter setado) |
| 3 — contador consistente | SC-D06-3 | T002/T004 | storage: N=40 concorrentes → exatamente `max` permitidas |
| 4 — store down → fail-closed | SC-D06-4 | T006 | storage: `consume` com prisma quebrado **relança** (nega) |
| 5 — sem PII | SC-D06-5 | T007 | storage: chave com IP não aparece no log |
| 6 — HTTP concorrente, PG real | SC-D06-6 | T001 | `rate-limit-concurrency.test.ts` (AppModule real, PG real) |
| 7 — vermelho + mutação | SC-D06-7 | T005 | storage: `consumeIngenuo` (get-set) VAZA > max — a mutação |
| 8 — observabilidade 429≠500 | SC-D06-8 | T006 | evento `auth.ratelimit.store_error` distinto; 429 vem do 429 |

## Consistência

- **Decisão de mitigação** (opção 1, `customStorage.consume`) coerente entre `pre-implementation-check`,
  `spec`, `clarify` (C1) e `plan`. Redis/pool descartados com justificativa. ✅
- **Sem migration** afirmado em `plan`/`clarify` (C6) e verificado no código: usa `key @unique` e GRANTs
  já existentes. Nenhum arquivo em `apps/api/prisma/` alterado. ✅ (elimina conflito com a Story CORE)
- **Escopo**: `client-ip.ts`, identidade/sessão, `/health`/`/ready` intocados; sem Redis, sem
  `@nestjs/throttler`, sem `orgId` no contador. ✅
- **Fronteira técnica**: novo arquivo em `kernel/auth/`, sem regra de negócio. ✅

## Divergências / riscos residuais

- **D-R1** — O teste HTTP usa `/api/auth/sign-out` (balde de contador distinto do `sign-in/email`) para
  **não** desestabilizar `login-http.test.ts` (que compartilha e limpa o balde de login). O trade-off: a
  prova rigorosa de excesso→429 e atomicidade migra para o teste de storage (isolado por chave única). A
  cobertura dos 8 critérios permanece completa entre os dois arquivos. Registrado, não é lacuna.
- **D-R2** — Fase vermelha: (a) a **atomicidade** tem vermelho→verde determinístico — `consumeIngenuo`
  (get-depois-set) VAZA > max, o `consume` atômico segura em `max`; (b) o **500** é reproduzível sob pool
  starvado (`storage:'database'`, `connection_limit=1&pool_timeout=1&N=80` → 500×80). Achado do
  context7-check com a versão instalada: no **better-auth 1.6.23** o modo `storage:'database'` já é
  atômico, então não há um ponto de pool que isole o rate limiter como causa ÚNICA do 500 (as demais
  queries do login dominam a starvation). Ver a **Divergência registrada** em `plan.md` — o `customStorage`
  vira um refino (menos round-trips), escalado para decisão humana. Os invariantes ficam fixados pelos
  testes independentemente da escolha.

## Veredito
Artefatos consistentes; 8 critérios rastreados a testes; sem migration; sem conflito com a Story CORE.
Pronto para implementação sob gates (já implementado neste worktree).
