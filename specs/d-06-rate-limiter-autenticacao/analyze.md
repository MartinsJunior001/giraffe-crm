# Analyze — D-06: consistência cruzada dos artefatos

> Análise não-destrutiva de `spec.md` × `plan.md` × `clarify.md` × `tasks.md` × `checklist.md` × código.
> Executada após a geração de tasks. Sem edição de artefatos autoritativos.

## Cobertura dos 8 critérios (spec → teste) — CONTRA O STORE NATIVO

> Atualizado após a **decisão final** (ver `plan.md` §Resolução final): o D-06 foi resolvido pelo **upgrade**
> ao better-auth 1.6.23 e o `customStorage` foi **removido**. As provas migraram para dois arquivos que
> exercitam o Better Auth **nativo** de produção; `rate-limit-storage.test.ts` foi apagado.

| Critério | spec (SC) | Evidência de teste (nativo) |
|---|---|---|
| 1 — zero 500 sob N≥16 | SC-D06-1 | `rate-limit-concurrency.test.ts` (N=24 sign-out, pool restrito) |
| 2 — excesso → 429, sem bypass | SC-D06-2 | `rate-limit-native.test.ts` (G2_MAX permitidas, 21ª → 429 + `X-Retry-After`) |
| 3 — contador consistente | SC-D06-3 | `rate-limit-native.test.ts` (contador do balde == nº de tentativas) |
| 4 — store down → fail-closed | SC-D06-4 | `rate-limit-native.test.ts` (instância isolada com banco inacessível → 5xx, nunca 2xx) |
| 5 — sem PII | SC-D06-5 | `rate-limit-native.test.ts` (login com e-mail/senha distintos → ausentes do stdout) |
| 6 — HTTP concorrente, PG real | SC-D06-6 | `rate-limit-concurrency.test.ts` (AppModule real, PG real) |
| 7 — vermelho + mutação | SC-D06-7 | `rate-limit-native.test.ts` (store não-atômico `consumeIngenuo` VAZA > max) |
| 8 — observabilidade 429≠500 | SC-D06-8 | nativo devolve 429 (limite) e 5xx (falha) por caminhos distintos; `concurrency` afirma zero 5xx no caminho normal |

## Consistência

- **Decisão final** (ver `plan.md` §Resolução final): resolvido pelo **upgrade** (nativo atômico no 1.6.23);
  `customStorage` **removido**. Redis/pool seguem descartados com justificativa. A análise da opção 1
  permanece abaixo como registro de auditoria da exploração. ✅
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
Artefatos consistentes; 8 critérios rastreados a testes **contra o store nativo**; sem migration; sem
conflito com a Story CORE. **D-06 RESOLVIDO pelo upgrade** (customStorage removido) — ver
`plan.md` §Resolução final e o histórico em `docs/04-operacao/d-06-rate-limiter-historico.md`.
