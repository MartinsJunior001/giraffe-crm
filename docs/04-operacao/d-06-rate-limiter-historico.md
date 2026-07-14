# D-06 — Rate limiter de autenticação sob rajada concorrente — histórico e resolução

> **Status: RESOLVIDO.** Resolvido por **UPGRADE + TESTES REAIS + REVISÃO INDEPENDENTE** — não "pela versão"
> sozinha. Este documento registra o débito, a causa, a evidência de fase vermelha e verde, os testes que
> impedem regressão e por que **não** mantivemos código customizado.

## 1. Comportamento defeituoso anterior (o que o débito descrevia)

O D-06 (dossiê L6) descrevia o rate limiter de autenticação (G2, por IP) com `storage: 'database'` do Better
Auth **abrindo uma transação por requisição** (`incrementOne → _transactionWithCallback`). Sob **rajada
concorrente** contra a mesma chave, com o pool de conexões apertado, as transações competiam entre si e parte
das respostas virava **HTTP 500** — em vez do **429** correto. O efeito é duplo:

- **Disponibilidade:** picos de login legítimo (ou um ataque) degradavam para erro de servidor.
- **Corretude do limite:** um caminho read-depois-write (get→decide→set) **vaza** — sob N concorrentes, mais
  de `max` requisições podem ser lidas com o contador baixo, decidir "permitido" e só então incrementar,
  ultrapassando o limite.

O débito é **fail-closed** por natureza: o pior caso é negar acesso (500), nunca conceder sessão indevida —
por isso foi classificado como **risco NORMAL** (robustez/disponibilidade), sem tocar isolamento ou authz.

## 2. Versão anterior (onde o defeito vivia) × versão que resolveu

| | Versão | Comportamento do `storage: 'database'` |
|---|---|---|
| **Anterior (defeituosa)** | Better Auth **anterior a 1.6.17** (upstream) | `incrementOne` abria transação por requisição; sem `consume` atômico → 500 sob contenção e vazamento por corrida. |
| **Resolvedora** | Better Auth **1.6.23** (fixada no projeto) | `storage: 'database'` já é **atômico**: `readRow` + `incrementOne` com guarda `count < max` + **retry otimista** (janela fixa). O `consume` estrito foi adicionado em 1.6.17. |

> Nota de honestidade: este repositório **nunca embarcou** uma versão defeituosa — adotou o Better Auth já em
> **1.6.23** (Story 1.4). A premissa do D-06 refletia o comportamento de uma versão **upstream anterior**. A
> "resolução pelo upgrade" significa: **fixar deterministicamente 1.6.23** (com o store nativo atômico) e
> **provar** que o defeito descrito não se manifesta nesta versão — em vez de escrever um store custom para um
> bug que a versão instalada já não tem.

Versão fixada: `apps/api/package.json` → `"better-auth": "^1.6.23"`; travada em `pnpm-lock.yaml`
(`better-auth@1.6.23`). O container de produção usa exatamente esta versão (mesmo lockfile, `--frozen-lockfile`).

## 3. Evidência da fase VERMELHA (a proteção importa)

A atomicidade é o que segura o número. `apps/api/test/rate-limit-native.test.ts` inclui uma **demonstração
vermelha determinística**: um `consumeIngenuo` (read-depois-write, com uma janela de TOCTOU explícita via
`setImmediate`) — **deliberadamente não-atômico e sem importar nenhum código de produção** — é disparado com
`N=40` concorrentes contra `max=10`. Resultado: **mais de `max` requisições são liberadas** (vazamento). Isso
prova que, se a proteção atômica fosse removida ou simulada como não-atômica, o limite seria ultrapassado.

O eixo de **disponibilidade** (500 sob contenção) da versão antiga é reproduzido pela mesma montagem que hoje
fica verde: `rate-limit-concurrency.test.ts` roda com pool restrito (`connection_limit=1&pool_timeout=5`), o
cenário que produzia o 500 na transação-por-requisição.

## 4. Evidência da fase VERDE (contra o Better Auth nativo de produção)

Pela porta da frente — **HTTP real, `AppModule` de produção, PostgreSQL real, sem mock e sem código custom**:

- **Zero 500 sob rajada** (`rate-limit-concurrency.test.ts`): `N=24` concorrentes a `/api/auth/*` com pool
  restrito → nenhuma resposta 5xx; o limiter engaja (linha `RateLimit` com `count > 0`).
- **Limite não ultrapassado + 429 + `X-Retry-After`** (`rate-limit-native.test.ts`): `G2_MAX` tentativas do
  mesmo IP passam; a seguinte recebe **429** com header **`X-Retry-After`** > 0.
- **Contador consistente**: o contador do balde `${ip}|${rota}` reflete exatamente o nº de tentativas.
- **Fail-closed diante de falha do banco**: uma instância **isolada** com o banco inacessível (porta fechada)
  responde **5xx** a `/api/auth/*`, **nunca 2xx** — o nativo nega quando o storage falha, jamais concede.
  (Parallel-safe: não revoga GRANT nem toca o banco compartilhado das outras suítes.)
- **Sem PII**: um login com e-mail e senha distintos é disparado com o log ligado; o stdout capturado **não
  contém** o e-mail nem a senha em claro (o serializer do Pino registra headers/URL, não o corpo).

Execução real (Constitution X): `pnpm --filter @giraffe/api exec vitest run test/rate-limit-native.test.ts`
→ **5 passed**; `test/rate-limit-concurrency.test.ts` → verde.

## 5. Testes que impedem regressão

- `apps/api/test/rate-limit-concurrency.test.ts` — SC-D06-1/6 (zero 500 sob concorrência; HTTP+PG reais).
- `apps/api/test/rate-limit-native.test.ts` — SC-D06-2/3/4/5/7 (limite/429/Retry-After; contador; fail-closed;
  sem PII; fase vermelha do não-atômico).

Se uma futura atualização do Better Auth reintroduzir o store não-atômico (ou trocar o comportamento do 429/
fail-closed), estas suítes ficam **vermelhas** — o invariante está preso a teste, não a memória.

## 6. Por que NÃO mantivemos código customizado

Durante a investigação chegou-se a implementar um `customStorage.consume` atômico (`rate-limit-storage.ts`).
O **context7-check contra o 1.6.23 instalado** (leitura da fonte, não só da doc) mostrou que o nativo
`storage: 'database'` **já é atômico** nesta versão — o defeito era de uma versão anterior. O `customStorage`
seria, portanto, **código de manutenção para um ganho marginal** (um round-trip a menos), sem consumidor que
o justificasse.

Manter esse código violaria a **Constitution II** (proibição de abstração/otimização especulativa sem
consumidor concreto — reforçada em `apps/api/src/kernel/README.md`). Decisão: **remover** `rate-limit-storage.ts`
e seu teste, e voltar `auth.factory.ts` ao `storage: 'database'` nativo (idêntico à `main`). Verificação
explícita pós-remoção: (a) busca por referências residuais a `rate-limit-storage`/`customStorage` → **nenhuma**;
(b) `git diff main -- apps/api/src/kernel/auth/` → **vazio** (auth idêntico à main, nativo); (c) nenhuma prova
passa por mock ou pela implementação antiga — todas exercitam o nativo por HTTP real.

## 7. Escopo preservado

D-06 não toca `schema.prisma`, migration, RLS, identidade/sessão, `client-ip.ts` nem `/health`//`/ready`. Sem
Redis, sem `@nestjs/throttler`, sem `orgId` no contador (`RateLimit` é global por IP, fora da RLS
organizacional). Os bloqueadores **CR-09, D-01, D-02 e D-05** permanecem intocados por esta entrega.

## 8. Rastreabilidade

- Spec Kit: `specs/d-06-rate-limiter-autenticacao/{spec,clarify,plan,tasks,analyze,checklist}.md`.
- Config de produção: `apps/api/src/kernel/auth/auth.factory.ts` (`rateLimit.storage: 'database'`, `modelName:
  'RateLimit'`, `window`/`max`/`customRules`).
- Constitution II (sem escopo especulativo) · Constitution X (verde só com execução real).
