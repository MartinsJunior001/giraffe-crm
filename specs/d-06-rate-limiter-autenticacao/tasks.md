# Tasks — D-06: rate limiter de autenticação robusto sob rajada concorrente

> Fonte: `spec.md` + `plan.md` + `clarify.md`. Risco NORMAL. Sem migration.
>
> **Decisão final (ver `plan.md` §Resolução final):** resolvido pelo **upgrade** ao better-auth 1.6.23
> (nativo já atômico); o `customStorage` foi **removido**. As tarefas abaixo estão marcadas conforme a
> entrega FINAL — as provas exercitam o store **nativo**.

## Phase 1: Fase vermelha real

- [x] **T001** `apps/api/test/rate-limit-concurrency.test.ts`: `AppModule` em porta efêmera com **pool
  restrito** (`connection_limit=1&pool_timeout=5`); **N=24** concorrentes a `/api/auth/*`. Reproduz a
  contenção que produzia 500 na versão ANTIGA; no store **nativo 1.6.23** termina com **zero 500**. [SC-D06-1/6]
- [x] **T005** Fase vermelha da **atomicidade** em `rate-limit-native.test.ts`: um `consumeIngenuo`
  (read-depois-write, NÃO importa o código de produção) VAZA > max sob concorrência — prova que a
  atomicidade é o que segura o limite; o nativo (atômico) não vaza. [SC-D06-7]

## Phase 2: Resolução por UPGRADE (customStorage REMOVIDO)

- [x] **T002/T003** `auth.factory.ts` mantém `rateLimit.storage: 'database'` **nativo** (idêntico à `main`);
  `rate-limit-storage.ts` e `rate-limit-storage.test.ts` **apagados**; `auth.module.ts` sem dependência do
  store custom. Nenhuma referência residual (verificado por busca). [C1 — pivô registrado]

## Phase 3: Provas contra o nativo (verde + fail-closed)

- [x] **T004** `rate-limit-native.test.ts`: **G2_MAX** permitidas, 21ª → **429 com `X-Retry-After`**;
  contador do balde consistente com o nº de tentativas. [SC-D06-2/3]
- [x] **T006** Fail-closed: instância isolada com banco inacessível (porta fechada) → **5xx**, nunca 2xx —
  o nativo nega quando o storage falha, jamais concede. (Parallel-safe: não toca o banco compartilhado.) [SC-D06-4/8]
- [x] **T007** Sem PII: login com e-mail/senha distintos, stdout capturado → ambos **ausentes** do log. [SC-D06-5]

## Phase 4: Gates

- [x] **T008** `context7-check` (better-auth 1.6.23 instalado — nativo atômico confirmado na fonte),
  revisão independente focalizada, gates proporcionais ao diff. Suíte verde. `commit-check` → `commit`.
  PR #27 contra `main`.
