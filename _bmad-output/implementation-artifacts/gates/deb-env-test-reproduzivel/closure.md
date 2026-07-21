# Closure — DEB-TEST-CI-LOCAL-ORQUESTRACAO + DEB-ENV-TEST-REPRODUZIVEL

**Ambos os débitos: RESOLVIDOS.** Fechados pelo **PR #131** (`tech/deb-env-test-reproduzivel`),
integrado ao `main` no merge `--no-ff` **`dd7ed8087b2a60ef047a9aecdf0e30c1a7625811`**.

## Origem

Os dois débitos foram **diagnosticados por experimento** durante a TECH-S1 e registrados no gate
`gates/tech-s1/evidencia-execucao.md` (§5) e no `gates/deb-env-test-reproduzivel/pre-implementation-check.md`.
Eram a causa de o `pnpm test:ci` na raiz falhar **localmente** enquanto o CI ficava verde.

## DEB-TEST-CI-LOCAL-ORQUESTRACAO — RESOLVIDO

- **Era:** o root `test:ci` (`pnpm -r test:ci`) rodava api e web **concorrentes**; sob a carga
  combinada, os workers de fork em jsdom da web estouravam o timeout de inicialização
  (`Failed to start forks worker`) **antes** de qualquer asserção.
- **Correção (PR #131):** o root `test:ci` passou a rodar as suítes em **sequência**
  (`pnpm --filter @giraffe/api test:ci && pnpm --filter @giraffe/web test:ci`).
- **Condição de fechamento (a raiz e as suítes isoladas produzirem resultado equivalente e
  reproduzível): SATISFEITA.** Validado localmente com banco descartável — api **115 arq/1009
  testes** + web **20/137**, todos verdes, **zero** `Failed to start forks worker`. No `main dd7ed80`,
  o CI (job "Testes", 1ª execução com a orquestração serial) rodou a suíte serial verde: **api 116
  arquivos + web 21 arquivos**, sem timeout de worker.

## DEB-ENV-TEST-REPRODUZIVEL — RESOLVIDO

- **Era:** sem destino de teste declarado, a suíte apontava para o `.env` de desenvolvimento, que
  podia mirar o banco de **outra lane** → `P1000: Authentication failed` mascarado como dezenas de
  falhas de teste.
- **Correção (PR #131):**
  - `scripts/test-preflight.mjs` — checa o banco (`db:status`, read-only) **antes** da suíte e emite
    mensagem acionável por causa (P1000/P1001/migration), sanitizando a URL. Exposto como
    `pnpm test:local` (= preflight + `test:ci`). **Fora do caminho do CI.**
  - `apps/api/.env.test.example` — versionado, **sem segredos** (placeholders `CHANGE_ME`),
    documenta o banco descartável reprodutível.
  - `.gitignore` — exceção `!.env.*.example`, sem a qual o `.env.*` silenciaria o próprio exemplo
    (`.env`/`.env.test` reais seguem ignorados).
- **Condição de fechamento (suíte local e CI usarem configuração equivalente): SATISFEITA na
  prática** — o mesmo `test:ci` serial roda local (com banco descartável do `.env.test.example`) e
  em CI. A isolação plena por `.env.test` dedicado permanece como follow-up **opcional** já
  registrado no gate; a **causa da dor** (P1000 mascarado, run local não reprodutível) está
  eliminada: o preflight transforma o P1000 numa mensagem única e o `.env.test.example` dá o caminho
  reprodutível.

## Evidência

- **PR #131** — MERGED. Merge commit `dd7ed8087b2a60ef047a9aecdf0e30c1a7625811`.
- **CI do PR #131:** 5/5 SUCCESS (Qualidade, Testes, Containers, Arquivos, Segurança).
- **CI do `main dd7ed80`** (1ª execução com o `test:ci` serial): **5/5 SUCCESS** — run
  `29847541214`. Job "Testes" verde com a suíte serial (api 116 + web 21 arquivos).
- **Escopo do #131:** tooling de teste apenas (`package.json`, `.gitignore`,
  `scripts/test-preflight.mjs`, `apps/api/.env.test.example`, gate). **Sem** migration, schema,
  código de aplicação, nem alteração de `.github/workflows/ci.yml`.

## Rastreio

- Não há entrada de sprint-status para estes itens — são **débitos**, não Stories; a closure é este
  registro de gate. Nenhuma alteração de `sprint-status.yaml` é aplicável.
- Declaração original: `gates/tech-s1/evidencia-execucao.md` §5.
