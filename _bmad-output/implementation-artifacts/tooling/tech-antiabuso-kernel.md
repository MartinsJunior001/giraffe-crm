# Tech Story — Extração do primitivo antiabuso para o kernel

**Tipo:** tarefa técnica (pré-requisito da Story 3.7 — capacidade de arquivos).
**Branch:** `tech/antiabuso-kernel` (base: `main` @ `04e8b21`).
**Decisão de origem:** dono Q2, ratificada na ADR-001 — a 3.7 precisa de rate limit + semáforo de scan,
e ambos devem consumir um módulo `kernel/antiabuso/` genérico. Esta tarefa entrega **só** a extração do
rate limiter; o semáforo/`ScanSlot` é escopo da 3.7.

## O quê

Extrair a **lógica genérica de rate limiting** (contagem atômica por chave numa janela deslizante, sobre a
tabela global `RateLimit`) que estava acoplada à submissão pública (2.8) em
`apps/api/src/pipes/public-submissions/public-rate-limit.ts`, para um novo módulo transversal do kernel:

- `apps/api/src/kernel/antiabuso/rate-limit.ts` — serviço `RateLimiter` (primitivo técnico).
- `apps/api/src/kernel/antiabuso/antiabuso.module.ts` — `@Global()` module que provê/exporta `RateLimiter`.

O `PublicRateLimit` da 2.8 **permanece em `pipes/`** e passa a **consumir** o `RateLimiter` do kernel.

## Por quê

A 3.7 introduz um segundo balde antiabuso (rate limit na extração de arquivos, decisão Q2 da ADR-001) e um
semáforo de scan. Ambos devem reusar o mesmo primitivo atômico sem **importar `pipes/`** (evitar acoplamento
de domínio inverso: `databases/` não deve depender do domínio de Pipes). Extrair o núcleo técnico para o
kernel dá a base compartilhada; cada domínio mantém sua própria política.

## Fronteira kernel × domínio (AD-4/AD-5)

O kernel é fronteira **técnica transversal, sem regra de negócio**. A divisão:

| Responsabilidade | Onde | Justificativa |
| --- | --- | --- |
| Contagem atômica por chave numa janela (upsert `INSERT ... ON CONFLICT ... RETURNING`), fail-closed | `kernel/antiabuso/rate-limit.ts` (`RateLimiter.contar`) | Puramente técnico: não sabe o que conta, não constrói chave, não escolhe janela/teto, não lança HTTP. |
| Chave `pub:<ip>:<publicId>`, janela (10 min), teto (20), resposta **429** + mensagem | `pipes/public-submissions/public-rate-limit.ts` (`PublicRateLimit`) | Política de domínio: o que é "submissão pública", qual o balde, como responder. |

`RateLimiter.contar(chave, politica)` devolve `{ count, excedido }` — **não lança** em excesso; quem decide
a resposta (429, mensagem, auditoria) é o consumidor. Assim o mesmo primitivo serve à 2.8 e aos baldes da
3.7 sem que nenhuma regra de negócio migre para o kernel.

## Como

1. `RateLimiter` (kernel) mantém **exatamente** o mesmo statement atômico que vivia em `PublicRateLimit`
   (upsert com reset de janela via `CASE WHEN lastRequest < inicioJanela`), agora parametrizado por
   `PoliticaRateLimit { janelaMs, teto }` e por `chave`. Fail-closed preservado: erro propaga; ausência de
   linha (impossível pelo `RETURNING`) → tratada como `excedido`.
2. `AntiabusoModule` é `@Global()` (espelha `DbModule`) — consumidor concreto imediato (`PublicRateLimit`) e
   porta única para a 3.7, que está em `databases/` e não pode importar `pipes/`. Registrado em `AppModule`
   logo após `DbModule` (do qual `RateLimiter` depende via `PrismaService`).
3. `PublicRateLimit` troca a dependência de `PrismaService` por `RateLimiter`; a chave, a política e o 429
   ficam nele. `PipesModule` segue registrando `PublicRateLimit` como provider (o `RateLimiter` vem do
   módulo global).

`RateLimit` continua **global e sem RLS** (não pertence a tenant) — nenhuma query dela passa por
`withTenantContext`, exatamente como antes. Nada de migration, schema, GRANT ou entidade nova.

## Escopo — o que NÃO foi feito

- **Sem** tabela `ScanSlot` nem semáforo de scan (é da 3.7). O diretório `kernel/antiabuso/` fica pronto para
  receber o semáforo, mas sem abstração especulativa — só o `RateLimiter`, que tem consumidor concreto hoje.
- **Sem** mudança de comportamento da 2.8: mesma chave, mesma janela, mesmo teto, mesmo 429.
- **Sem** tocar o rate limiter **nativo** do Better Auth (auth chaveia por `${ip}|${path}`; namespaces
  distintos, sem colisão).

## Prova de que a 2.8 seguiu verde

O gate de regressão é o teste de integração real da submissão pública, que exercita o caminho completo pela
nova fronteira:

- `apps/api/test/public-submissions-http.test.ts` → `rate limit: acima do teto por (IP, publicId) → 429`
  (as 20 primeiras submissões 201, a 21ª 429).

Gates executados:

- `pnpm --filter @giraffe/api typecheck` — <preencher>
- `pnpm --filter @giraffe/api lint` — <preencher>
- `pnpm --filter @giraffe/api exec vitest run test/public-submissions-http.test.ts` — <preencher>

## Riscos e decisões

- **Risco de regressão:** baixo. A lógica atômica foi movida verbatim; o único ponto novo é a passagem de
  `janelaMs`/`teto` como parâmetro em vez de constantes locais. Coberto pelo teste de integração da 2.8.
- **Decisão — `contar` retorna em vez de lançar:** mantém o kernel livre de semântica HTTP/domínio; o 429 e a
  mensagem ("muitas submissões") são da submissão pública. Alternativa descartada: o kernel lançar 429
  genérico — acoplaria resposta HTTP a um primitivo técnico e engessaria consumidores não-HTTP futuros.
- **Decisão — módulo `@Global()`:** espelha `DbModule`; evita que `databases/` (3.7) importe `pipes/`.
