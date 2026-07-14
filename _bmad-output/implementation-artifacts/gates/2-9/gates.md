# Gates — Story 2.9 (Kanban e espaço operacional do Card)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src` + `test`): ✅ exit 0.
- **format:check** (Prettier): ✅ exit 0.
- **lint** (`eslint apps/api`): ✅ exit 0.
- **build** (api, `nest build`): ✅ exit 0.
- **testes** (suíte cheia da API, série `--no-file-parallelism`): ✅ **54 arquivos, 466 testes** — inclui 2.9
  (kanban-http 9, kanban-authz 4, kanban-rls 4 = 17) e regressão 2.1–2.8 sem alteração. Os 6 testes a mais que a
  versão inicial (11) vêm da revisão: empate de `createdAt`, borda de página exata, entradas inválidas (400),
  capacidades do Viewer no detalhe, Kanban vazio e cursor cross-org.

## migration-check
- **Nenhuma migration.** Fatia **somente leitura** sobre `Card`/`Phase` já materializados (2.7/2.3). Sem schema,
  sem GRANT novo: o runtime já tinha `SELECT` em `Card` e `Phase`; **não** ganhou UPDATE/DELETE. O índice
  `@@index([orgId, pipeId, phaseId])` (criado na 2.7) serve exatamente esta leitura.

## security-check
- **Somente leitura de fato:** três rotas GET, nenhuma escrita. O runtime segue **sem GRANT de UPDATE** em `Card`
  (movimentação é 2.14) — provado em `kanban-rls` (UPDATE de `Card.phaseId` → `permission denied`).
- **Isolamento:** todas as leituras (`phase.findMany`, `card.findMany`, `card.groupBy`) por `withTenantContext`;
  cross-tenant e sem-contexto retornam 0 — provado em `kanban-rls` (incl. o `groupBy` de contagem).
- **Autorização:** `resolverPoderNoPipe` ANTES de qualquer leitura nas 3 rotas; sem acesso → **404 não-enumerante**;
  VIEWER concedido **lê** (leitura ≠ operação); capacidades derivadas do PRÓPRIO poder (administrativas nunca
  reveladas). C3/CASL intocados (DBT-AUTHZ-01). **Fase vermelha provada:** portão desligado → `kanban-authz` vermelho
  (BRUNO sem acesso recebeu 200) → restaurado.
- **Sem vazamento:** `orgId` nunca no payload (asserção de corpo no `kanban-http`); a LISTA do Kanban é enxuta, **sem
  `valores`** (PII só no detalhe); nenhum `valores` em log.
- **Entrada validada:** `pipeId`/`phaseId`/`cardId`/`cursor` são UUID (400 em lixo); `limite` inteiro positivo com
  **teto rígido 100** (page nunca vira take gigante).

## observability-check
- Leituras passam pelo `PinoLogger` real via `withTenantContext` (sinal `rls.denied` preservado). Sem PII em log
  (`valores` nunca logados). Leitura não muta — sem trilha de auditoria de escrita a emitir.

## lgpd-check
- `valores` (possível PII de titular) só saem no **detalhe** de um Card ao qual o principal tem acesso, nunca na
  lista do Kanban nem em log. `orgId` fora da fronteira. Nenhum dado novo persistido.

## performance-check
- **verKanban:** `resolverPoderNoPipe` (por id/índices) + `phase.findMany` (Fases ativas, `@@index([orgId, pipeId,
  state, position])`) + **1** `card.groupBy` para contagem por Fase (**sem N+1** — não é um count por coluna).
- **verColunaCards:** 1 leitura paginada por **cursor determinístico** (`[createdAt, id]`, cursor por `id`), `take`
  com teto 100, consumindo `@@index([orgId, pipeId, phaseId])`. Sem varredura, sem offset crescente.
- **verCard:** `findFirst` do Card + 1 leitura fixa da Fase (nome). Sem N+1.

## Veredito
Todos os gates aplicáveis **verdes**; sem regressão. Pronto para revisão independente (Security/Edge/Acceptance) e
commit.
