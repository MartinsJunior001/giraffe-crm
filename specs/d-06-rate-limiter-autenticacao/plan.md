# Plan — D-06: rate limiter de autenticação robusto sob rajada concorrente

> Risco NORMAL (robustez/disponibilidade; o defeito é **fail-closed** — não toca isolamento/authz).
> Fonte: `spec.md` + `gates/d-06/pre-implementation-check.md` (APROVADO COM RESSALVAS) + os 8 critérios de
> `gates/1-5/summary.md`. **Sem nova migration** (ver "Decisão de schema").

## Decisão de mitigação (a ressalva (a) do pre-check, resolvida com evidência)

**Opção escolhida: (1) `customStorage` com `consume` atômico no PostgreSQL.** As opções (2) Redis e
(3) pool/backpressure foram descartadas:

- **(2) Redis — descartada.** Introduz infra e ponto de falha novos e **não está operacional no projeto**
  (nem `secondaryStorage` configurado, nem serviço no Compose). O dossiê e o pre-check condicionam Redis a
  "decisão arquitetural registrada"; antecipá-lo violaria a proibição de abstração especulativa
  (Constitution II / `kernel/README.md`). Só se justificaria se o PostgreSQL **não** atendesse — e ele
  atende (evidência abaixo).
- **(3) Pool + backpressure — descartada.** Trata o sintoma (contenção do pool), não a causa (uma
  transação por requisição). Sob rajada maior o 500 volta (R2 do pre-check). Não fecha o critério 1 de
  forma estável.
- **(1) `customStorage.consume` — escolhida.** Elimina a **causa raiz**: a instrução deixa de abrir uma
  transação por requisição (`incrementOne` → `_transactionWithCallback`) e passa a ser um **único**
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` — o mesmo padrão atômico que o `LoginFailureService`
  (G1) já usa e que a base já confia. Persiste no PostgreSQL (sobrevive a restart, compartilhado entre
  réplicas — invariante do G2 que os testes de `login-http` já cobrem). Menor mudança de infra, sem stack
  nova.

### Evidência de que o PostgreSQL atende (Context7 + código)

- Context7 `/better-auth/better-auth` (`packages/core/src/types/init-options.ts`, instalado 1.6.23):
  `BetterAuthRateLimitStorage.consume?(key, { window, max }) => Promise<{ allowed, retryAfter }>`.
  `consume` foi adicionado em **1.6.17** exatamente "for strict concurrent enforcement"; sem ele, o
  storage cai no `get`/`set` (a corrida atual). A referência de implementação atômica do próprio Better
  Auth (`secondary-storage`) usa um `increment` de janela fixa — reproduzimos a mesma semântica em SQL.
- A tabela `RateLimit` já tem `key @unique` (`schema.prisma` §182) — alvo de `ON CONFLICT` sem DDL.
- O papel de runtime `giraffe_app` já tem `SELECT, INSERT, UPDATE, DELETE` em `RateLimit`
  (migration `20260713000000_auth_e_antiabuso` §125) — nenhum GRANT novo.

## Decisão de schema/migration (ressalva (b) resolvida)

**Nenhuma migration.** O upsert atômico usa a `UNIQUE(key)` existente; não precisa de coluna nem índice
novos. `migration-check` **não** se aplica (não há DDL). Registrado para a Story CORE que mexe em
schema em paralelo: **D-06 não toca `schema.prisma` nem cria migration** — zero risco de conflito/serialização.

## Semântica do contador (janela fixa, igual à referência do Better Auth)

`consume(key, { window, max })` numa instrução:
- `lastRequest` (epoch ms, `BigInt`) marca **a abertura da janela**.
- Se `lastRequest <= agora - window*1000` (janela vencida) → `count = 1`, `lastRequest = agora` (reabre).
- Senão → `count = count + 1`, `lastRequest` inalterado (janela fixa a partir da 1ª requisição).
- `RETURNING "count"`; `allowed = count <= max`; `retryAfter = allowed ? null : window`.

Isto preserva os invariantes que `login-http.test.ts` (G2) já exige: 20 passam, a 21ª é 429; contador no
banco sobrevive a restart e é compartilhado entre réplicas.

## Fail-closed e observabilidade (critérios 4 e 8)

- **Caminho normal:** uma instrução, sem transação → sob N≥16 concorrentes **não há 500** por contenção.
- **Store indisponível (DB caído):** `consume` registra um evento estruturado **distinto**
  (`auth.ratelimit.store_error`, sem PII) e **relança** — o Better Auth responde 500, isto é, acesso
  **negado** (fail-closed: nunca concede sessão). Relançar em vez de devolver `allowed:false` mantém a
  separação do critério 8: **429 = limite legítimo, 500 = falha interna** — a defesa não se confunde com o
  defeito. (Confirmar na fonte instalada que o rate limiter propaga o erro e **não** faz fail-open.)
- Sem PII (critério 5): a chave do `RateLimit` é `${ip}|${rota}`; o log do erro carrega só `event` e
  `rota`, nunca IP nem corpo. Sanitização Pino já vigente.

## Touch-points (arquivos)

- **Novo:** `apps/api/src/kernel/auth/rate-limit-storage.ts` — `criarRateLimitStorage(prisma, logger)`
  com `get`/`set`/`consume`. Fronteira técnica (kernel), sem regra de negócio.
- **Alterado:** `apps/api/src/kernel/auth/auth.factory.ts` — trocar `storage: 'database'` por
  `customStorage: criarRateLimitStorage(...)`; manter `window`/`max`/`customRules` idênticos.
- **Alterado:** `apps/api/src/kernel/auth/auth.module.ts` — passar o `logger` ao factory (se necessário).
- **Novo teste:** `apps/api/test/rate-limit-concurrency.test.ts` — HTTP concorrente, PostgreSQL real.
- **Sem** alteração de schema, migration, RLS, identidade/sessão, `client-ip.ts`, `/health`/`/ready`.

## Sequência (red-green-refactor)

1. Escrever o teste concorrente que **falha hoje** (fase vermelha real): N≥16 paralelos a
   `/api/auth/sign-in/email` com pool restrito → hoje aparece 500.
2. Implementar `customStorage.consume` atômico; ligar no factory.
3. Verde: zero 500, excesso → 429, contagem consistente, legítima passa.
4. **Mutação:** desligar a atomicidade (voltar a `storage:'database'` ou trocar consume por get/set) e
   confirmar que o teste volta a falhar.
5. Fail-closed: store indisponível → negado (não concede); log distingue 429 de 500.
6. Gates: `context7-check` (refeito com versão instalada), `security-check`, `observability-check`,
   `performance-check`, `lgpd-check` (leve, IP).

## Riscos e mitigações

- **R2 (sintoma≠causa):** endereçada pela escolha (1), que remove a transação por requisição; provado por
  vermelho→verde + mutação, não por ausência anedótica de erro.
- **R3 (falso 429 para legítimo):** teste afirma que a requisição legítima **não** é negada.
- **R5 (PII/IP em log):** o log do erro não inclui IP; só `event`/`rota`.
- **Fail-open acidental:** confirmar na fonte instalada que um throw no `consume` vira 500 (negação), não
  concessão; se o Better Auth fizesse fail-open, a mitigação teria de negar explicitamente.

## Divergência registrada (context7-check com a versão instalada) — ESCALAR

Ao refazer o `context7-check` contra o **better-auth 1.6.23 instalado** (não só a doc), a leitura da fonte
(`dist/api/rate-limiter/index.mjs`, `createDatabaseStorageWrapper`) mostrou que o modo `storage:'database'`
**já implementa um `consume` atômico** nesta versão: `readRow` + `incrementOne` com guarda
`count < max` + retry otimista. **Não** é mais o "abre uma transação por requisição
(`incrementOne → _transactionWithCallback`)" que o débito D-06 descreveu — isso era de um better-auth
**anterior**. Ou seja, a premissa original do D-06 (500 por transação-por-requisição) já foi, em boa
parte, endereçada pelo **upgrade** do better-auth para 1.6.23.

**Evidência empírica (experimento descartável, não commitado):** sob rajada concorrente ao login com pool
starvado, `storage:'database'` (1.6.23) e o `customStorage` produziram a **mesma** distribuição de status
em todos os pontos testados (ambos limpos com pool folgado; ambos 500 sob starvation extrema
`connection_limit=1&pool_timeout=1&N=80`, porque aí o gargalo são as OUTRAS queries do login, não o rate
limiter). Não achei um ponto que isolasse o rate limiter como causa única do 500 nesta versão.

**Decisão:** manter o `customStorage.consume` — ele é (a) o que o dossiê/spec/pre-check e a tarefa
direcionam explicitamente, e (b) um **refino real**: **uma** instrução / **um** round-trip, sem
read-depois-write e sem recursão de retry, o que reduz a pressão no pool sob concorrência (exatamente o
eixo do D-06). Não é a correção de um bug crítico de transação-por-requisição — esse já não existe no
1.6.23. **Escalado** para decisão humana: se o time considerar o ganho marginal insuficiente diante do
código extra, basta reverter uma linha no factory para `storage:'database'` (a suíte continua provando a
correção do comportamento). O invariante que os testes fixam (atomicidade: exatamente `max`; sem 500 por
contenção; fail-closed; 429≠500) vale para qualquer das duas.

## Constitution / arquitetura

AD-4/AD-5 (kernel é fronteira técnica; sem regra de negócio). Sem antecipar escopo (sem Redis, sem
`@nestjs/throttler`). Deny-by-default preservado (o limiter só nega mais cedo, nunca concede). Contador
`RateLimit` é global por IP, fora da RLS organizacional (AD-10-adjacente) — não introduzir `orgId`.
