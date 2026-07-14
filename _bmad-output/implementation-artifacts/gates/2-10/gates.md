# Gates — Story 2.10 (acesso, Responsável e concessões de Card)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src` + `test`): ✅ exit 0.
- **format:check** (Prettier): ✅ exit 0 (arquivos da Story reformatados e reconferidos).
- **lint** (`eslint`): ✅ exit 0.
- **build** (api, `nest build`): ✅ exit 0.
- **testes** (suíte cheia da API, série `--no-file-parallelism`): **486 passed / 488** — inclui a 2.10
  (card-access-http 11, card-access-rls 5, membership-contract 6 = **22**) e a regressão 2.1–2.9. Os **2** vermelhos
  (`login-http` "senha jamais aparece nos logs" e `sessao` TS-11) são **pré-existentes e ambientais**, NÃO
  regressão da 2.10 — ver abaixo.

### Os 2 vermelhos são ambientais (prova)
Ambos falham no `expect(tudo.length).toBeGreaterThan(0)`: a captura de log via `process.stdout.write` volta
**vazia** porque, nesta plataforma, o pino escreve **direto no file descriptor** (SonicBoom), contornando a
interceptação — o próprio teste antecipa esse modo de falha no comentário da linha 455. **Prova de independência:**
com as mudanças versionadas da 2.10 guardadas (`git stash`), o teste de `login-http` **continua vermelho** em HEAD
limpo. O diff da 2.10 não toca `app.module`, pino, auth nem sessão. O gate real é o CI (Linux), onde o pino escreve
via stdout. Falha conhecida herdada, fora do escopo da Story.

## migration-check
- **Migration `20260714160000_card_access`:** cria `CardGrant` e `CardResponsavel` (RLS ENABLE+FORCE, 4 policies por
  `current_org_id()` com WITH CHECK em INSERT **e** UPDATE, FKs org/card/membership CASCADE, índice PARCIAL de
  unicidade ativa — 1 concessão ativa por (card, pessoa); 1 Responsável ativo por card), `GRANT SELECT/INSERT/UPDATE`
  **sem DELETE**; `ALTER TABLE "PipeGrant" ADD COLUMN "restritoAoProprio"`. Aplicada com `db:migrate` (deploy). Novas
  tabelas em `MODELOS_AUDITADOS`.
- **Reversível/segura:** aditiva; nenhuma coluna removida; `restritoAoProprio` default `false` (deny-by-default).

## security-check
- **Isolamento:** `CardGrant`/`CardResponsavel` com RLS+FORCE+WITH CHECK — provado em `card-access-rls` (outra Org
  vê 0; sem contexto 0; INSERT `createMany` com orgId alheio barrado; UPDATE que move a linha de Org barrado).
- **GRANT preciso:** runtime pode UPDATE (`state` — revogar/remover) e **não** DELETE (`permission denied`) —
  provado em `card-access-rls`. `Card` **segue sem GRANT de UPDATE** (D-OA2 preserva o append-only).
- **Autorização fina (C3 congelado):** acesso NO CARD compõe papel-de-Pipe + concessão direta + "restrito ao
  próprio" + Responsável-atual; deny-by-default; sem acesso → **404 não-enumerante**; ler-sem-operar → **403**.
  Atribuir/remover Responsável exige **operar o Card** (mais restrito que operar o Pipe — honra o `restritoAoProprio`);
  conceder/revogar/listar exige **gerenciar o Pipe**. **Fase vermelha provada:** desligar o `restritoAoProprio` na
  resolução → o teste do **creator** fica vermelho (creator restrito ganharia 200 em vez de 404) → restaurado.
- **SC-2101/2105:** atribuir Responsável a alvo sem acesso operacional → **400** (não concede acesso); creator e
  histórico **nunca** concedem acesso (provado). SC-2103/2104: concessão escopada a UM Card (grant no Card A não
  vaza para o B — provado).
- **Sem vazamento:** `orgId` fora de `ResponsavelVisao`/`ConcessaoVisao` (asserção de corpo); `valores` (PII) nunca
  tocados aqui; nada sensível em log.

## observability-check
- **Auditoria manual (FR-214)** nos caminhos de transação-raiz (que não passam pela extensão): eventos `audit`
  para `CardGrant`/`CardResponsavel`/`CardHistory`. Cada mutação escreve um evento `CardHistory`
  (RESPONSAVEL_ASSIGNED/CHANGED/REMOVED, ACCESS_GRANTED/ACCESS_REVOKED) na **mesma transação** (AD-13) — provado
  no `card-access-http` (sequência exata dos `type` do Histórico).

## Concorrência / idempotência
- Índice PARCIAL de unicidade ativa (1 Responsável ativo por Card; 1 concessão ativa por (Card, pessoa)); conflito
  reconhece **P2002 e P2028** → 409, **nunca 500** (`isConflito`, simétrico à 2.7). Reatribuir/reconceder/revogar/
  remover são idempotentes (no-op sem novo evento) — provado.
