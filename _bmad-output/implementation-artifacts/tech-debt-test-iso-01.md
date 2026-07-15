# TEST-ISO-01 — Isolamento de testes de integração entre arquivos

> Dívida técnica aberta em 2026-07-14 (durante a Story 2.13). Prioridade: baixa (causa raiz **corrigida**;
> resta só o aceite formal). **Não bloqueia** Stories de feature — o CI serial (`test:ci`) é verde e
> determinístico e a raiz da flakiness foi removida.

## Sintoma (original)
`test/pipe-access-http.test.ts` (Story 2.2) falhava de forma **intermitente** sob o paralelismo de arquivos do
CI: o **Admin da Org (ANA)** recebia **403 transiente** ao criar Pipe/grant (`expected 201/200, got 403`), em
vez da autorização esperada. Reproduzia em paralelo, **nunca** em série.

## Causa raiz (CONFIRMADA e CORRIGIDA)
Investigação read-only (2026-07-14) confirmou o mecanismo com certeza. Havia **duas** causas independentes:

1. **Fixture global mutável — `card-access-rls.test.ts` (Story 2.10).** O arquivo **reusava a conta global de
   ANA** (`11111111-…`) e criava para ela uma **segunda Membership ACTIVE na Org C**, persistente do `beforeAll`
   ao `afterAll`. Nessa janela, ANA tinha **2 Orgs ativas**. Quando outro arquivo paralelo (ex.: `pipe-access-http`)
   resolvia o contexto de ANA **sem** `x-org-id`, o `OrgContextResolver` via `ativas.length === 2` e negava
   (`negar(..., 'múltiplas Organizações e nenhuma indicada')`) → **403**. Em série não havia sobreposição, daí o
   verde determinístico. O cap de `connection_limit` não mudava nada porque o problema é de **dado compartilhado**,
   não de pool.
   - **Correção:** `card-access-rls.test.ts` passou a usar uma **conta descartável** (`const CONTA = randomUUID()`
     + `migrator.account.create`), espelhando o irmão `pipe-grants-rls.test.ts`. Removida no `afterAll`. Foi o
     **único** arquivo que reusava uma conta-fixture do seed num vínculo persistente (grep confirmou: os demais
     writes em ANA/BRUNO são todos `rejects.toThrow()` — negados pela RLS, não persistem; DIANA/HEITOR/IRIS/GIL/
     FABIO são contas dedicadas).

2. **`testTimeout` apertado — surgiu ao serializar.** A execução serial (`--no-file-parallelism`) roda os ~63
   arquivos num único worker por ~420s; sob essa carga sustentada, testes HTTP que fazem um **login real** (hashing
   de senha do better-auth ~2s) + setup multi-etapa + transação interativa estouravam o teto **default de 5s** do
   Vitest de forma flaky (`card-access-http`, `publication-http`). Não é regressão de produto — é o teto de teste.
   - **Correção:** `testTimeout: 20000` e `hookTimeout: 30000` em `apps/api/vitest.config.ts` (os testes levam ~5s
     no pior caso; 20s dá folga determinística).

**Falsificado:** esgotamento de pool de conexão — o cap `connection_limit=5` **não** eliminou o flaky (PR #50),
e foi **revertido**.

## Estado atual (aplicado)
- CI roda a suíte da API em **série**: `pnpm test:ci` = `vitest run --no-file-parallelism` — estado-alvo do
  isolamento (integração PostgreSQL serial), agora **determinístico e verde** (validado em 2 execuções seriais
  completas: 539/539).
- As duas causas raiz estão corrigidas (test-only; nenhuma mudança de código de produto).

## Aceite para restaurar o paralelismo pleno
- **≥ 20 execuções PARALELAS consecutivas verdes** da suíte cheia (sem `--no-file-parallelism`). Com a raiz
  removida, espera-se verde estável; falta apenas rodar o aceite formal.

## Restauração alvo (pós-aceite)
Paralelismo **por grupos**: testes **unitários** (puros, sem banco) em paralelo; testes de **integração
PostgreSQL** em série (ou com o isolamento por arquivo que já foi aplicado, permitindo paralelismo seguro).

## Guarda permanente
Regra registrada no CLAUDE.md (seção de testes): **nunca reusar Ana/Bruno/Carla/Eva do seed em um
`membership.create` que persista** — são fixtures de LEITURA. Cada arquivo que escreve usa a Org C com conta
descartável (`randomUUID`).
