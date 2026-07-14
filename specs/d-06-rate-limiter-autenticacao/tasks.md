# Tasks — D-06: rate limiter de autenticação robusto sob rajada concorrente

> Fonte: `spec.md` + `plan.md` + `clarify.md`. Risco NORMAL. Sem migration. Ordem red→green→mutação.

## Phase 1: Fase vermelha (o teste que falha hoje)

- [ ] **T001** `apps/api/test/rate-limit-concurrency.test.ts`: subir `AppModule` em porta efêmera com
  **pool restrito** (`?connection_limit=1`) para reproduzir a contenção; disparar **N≥16** requisições
  concorrentes a `POST /api/auth/sign-in/email` sob a MESMA origem/IP; hoje algumas voltam **500**.
  Provar o vermelho antes de implementar. [SC-D06-1/6/7]

## Phase 2: Mitigação (customStorage.consume atômico)

- [ ] **T002** `apps/api/src/kernel/auth/rate-limit-storage.ts`: `criarRateLimitStorage(prisma, logger)`
  com `get`/`set`/`consume`. `consume` = único `INSERT ... ON CONFLICT (key) DO UPDATE ... RETURNING`
  (janela fixa; `count<=max` → allowed). Sem transação por requisição. [C1/C4]
- [ ] **T003** Ligar no `auth.factory.ts`: `rateLimit.customStorage = criarRateLimitStorage(...)`,
  removendo `storage:'database'`; manter `window`/`max`/`customRules`. Ajustar `auth.module.ts` para
  injetar o logger, se preciso. [C1]

## Phase 3: Verde + mutação + fail-closed

- [ ] **T004** Verde: N≥16 concorrentes → **zero 500**; excesso → **429**; contagem consistente
  (nº de allowed == max); requisição legítima **não** é negada. [SC-D06-1/2/3]
- [ ] **T005** **Mutação:** voltar a `storage:'database'` (ou get/set não-atômico) e confirmar que o
  teste volta a falhar (500 ou perda de contagem). Documentar no teste. [SC-D06-7]
- [ ] **T006** Fail-closed: com o backing store indisponível, a requisição é **negada** (sem sessão) e o
  log emite `auth.ratelimit.store_error` distinto do 429. [SC-D06-4/8]
- [ ] **T007** Sem PII: asserção de que o log do limiter/erro não contém IP nem corpo. [SC-D06-5]

## Phase 4: Gates

- [ ] **T008** `context7-check` (refeito com a versão instalada), `security-check`,
  `observability-check`, `performance-check`, `lgpd-check` (leve, IP). Suíte cheia verde
  (`pnpm --filter @giraffe/api test`). `commit-check` → `commit`. PR próprio contra `main` (sem merge).
