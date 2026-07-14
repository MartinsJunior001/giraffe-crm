# Gates — Story 2.12 (Marcos por Fase e override por Card)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src`+`test`): ✅ exit 0.
- **format:check** (Prettier): ✅ (6 arquivos reformatados e reconferidos).
- **lint** (`eslint .`): ✅ exit 0.
- **build** (`nest build`): ✅ exit 0.
- **testes** (suíte cheia, série `--no-file-parallelism`): **539 passed / 539** (63 arquivos) — inclui a 2.12
  (phase-milestones-core 13, phase-milestones-http 5, phase-milestones-rls 6 = **24**) e toda a regressão 2.1–2.11.
  **Zero vermelhos** (os 2 ambientais `login-http`/`sessao` foram estabilizados pelo PR #46, já em `main`).

## migration-check
- **Migration `20260714180000_phase_milestones`:** `CREATE TYPE CardPhaseEntryOrigin`; `ALTER "Phase" ADD` 6 colunas
  de config (3 durações `Int?` em minutos + 3 `fieldId?` de override) + CHECK de ordenação/não-negatividade
  (tolerante a NULL); `CREATE TABLE "CardPhaseEntry"` (RLS ENABLE+FORCE, 4 policies WITH CHECK, FKs CASCADE, índice
  `(orgId,cardId,enteredAt)`); **BACKFILL** idempotente da 1ª entrada de cada Card existente; `GRANT SELECT, INSERT
  ON "CardPhaseEntry"` (append-only — sem UPDATE/DELETE). Aplicada com `db:migrate` (deploy).
- **Ordem crítica:** o backfill roda **antes** de ENABLE/FORCE RLS — sob FORCE, um INSERT do dono seria barrado por
  `current_org_id()` NULL (sem contexto de requisição na migração). Verificado (migration aplicou limpa).
- **Reversível/segura:** aditiva (nenhuma coluna/tabela removida; `Phase` intocada nos dados existentes; colunas
  novas nuláveis). **Rollback:** DROP TABLE "CardPhaseEntry" + DROP das 6 colunas de `Phase` + DROP TYPE + DROP
  CONSTRAINT — nenhum dado pré-existente destruído (a referência de entrada é dado novo desta Story). **Backup:** não
  requer (sem transformação destrutiva de dado existente; o backfill só INSERE).

## security-check
- **CardPhaseEntry é append-only pelo banco:** provado em `phase-milestones-rls` — runtime SELECT+INSERT ok; UPDATE e
  DELETE → `permission denied`. "Sem alteração retroativa do histórico" é do GRANT, não da ausência de rota.
- **Isolamento:** entrada de outra Org → 0 linhas na leitura (RLS); INSERT com `orgId` alheio → barrado pelo WITH
  CHECK (`createMany`, sem RETURNING mascarante). Testado.
- **Autorização (C3 congelado):** configurar = `exigirGerenciarPipe` (Membro→403; sem acesso→404); ler config =
  `resolverPoderNoPipe`; ler base do Card = `exigirLerCard` (2.10). Testado (HTTP 403/404/200).
- **Override por `Field.id`** (AD-12), nunca rótulo; Campo de override validado como DATE/DATETIME do Formulário
  inicial (Campo de outro tipo/alheio → 400).
- **Sem vazamento:** `orgId` fora de todos os payloads (asserção); `valores` (PII) lidos só para o cálculo do
  override, nunca devolvidos nem logados.

## observability-check
- A criação do Card já emite `CardHistory.CREATED` (2.7/2.8); a 1ª entrada é gravada na MESMA transação — não há
  Card sem sua referência de entrada. Auditoria manual (FR-214) registra `create CardPhaseEntry` na tx raiz (nos dois
  sítios de criação). `CardPhaseEntry` em `MODELOS_AUDITADOS`.
- A 2.12 **não** adiciona novo `type` ao `CardHistory` (a taxonomia de movimentação/reentrada é 2.14): a referência
  de entrada É o histórico estruturado das entradas.

## Não-retroatividade / snapshot
- Mudar a config da Fase não recalcula Cards já na Fase (snapshot congelado na entrada — D-OA1=A). Provado por
  teste HTTP (Card antigo mantém base vazia; Card novo reflete a config). "Sem recálculo retroativo silencioso"
  (epics §945/§951) por construção.
