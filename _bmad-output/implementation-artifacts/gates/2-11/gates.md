# Gates — Story 2.11 (Ciclo de vida do Card)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src`+`test`): ✅ exit 0.
- **format:check** (Prettier): ✅ (arquivos reformatados e reconferidos).
- **lint** (ESLint): ✅ exit 0.
- **build** (`nest build`): ✅ exit 0.
- **testes** (suíte cheia, série `--no-file-parallelism`): **513 passed / 515** — inclui a 2.11
  (card-lifecycle-transitions 12, card-lifecycle-http 9, card-lifecycle-rls 6 = **27**) e a regressão 2.1–2.10
  (incl. o detalhe do Kanban 2.9 com o novo `lifecycleState`). Os **2** vermelhos (`login-http`/`sessao`, captura de
  log) são **pré-existentes e ambientais** (pino escreve direto no fd nesta plataforma), provados independentes na
  2.10 (falham em HEAD limpo; CI Linux passa).

## migration-check
- **Migration `20260714170000_card_lifecycle`:** `CREATE TYPE CardLifecycleState`; `ADD lifecycleState DEFAULT
  'ATIVO' NOT NULL` + `ADD previousLifecycleState`; `GRANT UPDATE ("lifecycleState","previousLifecycleState",
  "updatedAt") ON "Card"`. Aplicada com `db:migrate` (deploy).
- **Reversível/segura:** aditiva; default ATIVO (deny-by-default, backfill trivial dos Cards existentes); nenhuma
  coluna removida. **Rollback:** DROP das 2 colunas + REVOKE do GRANT (Card volta a append-only) — nenhum dado
  destruído além do eixo novo. **Backup:** não requer (sem transformação destrutiva de dado existente).

## security-check
- **1º UPDATE de `Card` é column-scoped:** provado em `card-lifecycle-rls` — UPDATE de estado permitido (count 1),
  UPDATE de `phaseId` e de `valores` → `permission denied`. A movimentação (2.14) segue impossível pelo banco.
- **Isolamento:** UPDATE de estado de outra Org casa 0 linhas (RLS filtra); a policy `card_update` (WITH CHECK
  orgId) impede mover a linha de Org.
- **Autorização (C3 congelado):** `exigirOperarCard` (2.10) — sem acesso → 404 não-enumerante; ler-sem-operar →
  403; testado. Transição inválida → 409; concorrência → 409 (guarda otimista), nunca 500.
- **Sem vazamento:** `orgId` fora de `CicloVidaVisao` (asserção de corpo); `valores` nunca tocados/logados.
- **Nota red-phase:** a prova por elevação de privilégio (conceder UPDATE de `phaseId` e ver o teste falhar) foi
  **bloqueada por política de permissão** (corretamente — é a elevação que a Story proíbe). O escopo é provado
  pelas asserções positiva (estado→count 1) **e** negativa (phaseId/valores→permission denied) do teste de RLS.

## observability-check
- Cada transição escreve um evento `CardHistory` (`FINALIZED`/`REOPENED`/`ARCHIVED`/`RESTORED`) na MESMA transação
  (AD-13) — provado no http (sequência exata dos `type`). Auditoria manual (FR-214) para o UPDATE de `Card` e o
  INSERT de `CardHistory` (a tx raiz não passa pela extensão).

## Idempotência / concorrência
Idempotente (pedir o estado atual → 200 sem novo evento — testado). Guarda otimista (`updateMany where
lifecycleState`) + reconsulta → idempotente/409; P2002/P2028 → 409.
