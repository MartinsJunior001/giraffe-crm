# Gates — Story 2.7 (submissão interna do Formulário inicial e criação do Card)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src` + `test`): ✅ exit 0.
- **format:check** (Prettier): ✅ exit 0.
- **lint** (`eslint apps/api`): ✅ exit 0.
- **build** (api): ✅ exit 0.
- **testes** (suíte cheia da API, série): ✅ **48 arquivos, 428 testes** — inclui 2.7 (submission 7, cards-http 9,
  cards-rls 7, cards-authz 4 = 27) e regressão 2.1–2.6 sem alteração. Os 4 testes a mais que a versão inicial (23)
  vêm dos achados da revisão: congelamento (AD-12), 1ª Fase entre várias, concorrência de idempotência e `Card`
  sem UPDATE.

## migration-check
Migration versionada `20260714140000_cards`: novas tabelas `Card` e `CardHistory`. RLS ENABLE+FORCE, 4 policies
por `current_org_id()` cada, WITH CHECK em INSERT/UPDATE, FKs CASCADE. **`Card`: GRANT SELECT/INSERT — sem UPDATE
(sem consumidor na 2.7; a 2.9/2.11 acrescenta) e sem DELETE**; **`CardHistory`: GRANT SELECT/INSERT — sem
UPDATE/DELETE** (append-only). Aplicada por `db:migrate` (não no boot). Rollback = revert + drop; só adição,
nenhuma alteração destrutiva. `db:status` limpo. (A migration não estava mergeada; o GRANT UPDATE de `Card` foi
removido em revisão e revogado no banco vivo para manter arquivo↔banco em sincronia.)

## security-check
- **Sem exclusão / append-only:** runtime sem GRANT DELETE em `Card`; sem UPDATE/DELETE em `CardHistory` — provado
  em `cards-rls` (permission denied) **e por mutação** (GRANT UPDATE temporário em `CardHistory` → teste vermelho
  → revoke).
- **Isolamento:** RLS ENABLE+FORCE; cross-tenant e sem-contexto atingem 0 linhas / negam; WITH CHECK barra INSERT
  com `orgId` alheio (`createMany`, sem RETURNING).
- **Autorização:** deny-by-default; submeter exige OPERAR o Pipe (Admin da Org / Admin do Pipe / Membro); Viewer
  403; sem acesso 404; C3/CASL intocado. Ativa o poder do Membro do Pipe (antes dormente).
- **Atomicidade sem bypass:** transação interativa com contexto no client raiz; RLS/WITH CHECK valem dentro dela.
- **Anti-mass-assignment:** allowlist na validação (só `Field.id` do snapshot); chave desconhecida → 400.
  `orgId`/`actorId` do contexto, nunca do cliente. Seleção por `id`, nunca rótulo.
- **Idempotência:** estrutural (`@@unique([orgId, formId, idempotencyKey])`); retry → Card existente, nunca
  duplica — provado por HTTP e por mutação (dedup desligado → teste vermelho → revert). Conflito reconhece
  **P2002 e P2028** (contenção da tx) → caminho idempotente/409, **nunca 500** (Edge-H1); regressão de
  concorrência: 6 submissões paralelas → 1 Card, 1 evento, só 201/409.
- **Privilégio com teste de escopo:** o GRANT de `Card` foi reduzido a SELECT+INSERT (a Story só cria Card) — sem
  UPDATE sem consumidor; um teste em `cards-rls` prova UPDATE de Card → `permission denied`.

## observability-check
- `Card`/`CardHistory` em `MODELOS_AUDITADOS`; a criação emite eventos de auditoria (ator/Org/ação/recurso/
  resultado) para Card e CardHistory. Logs sanitizados (Pino); **os `valores` submetidos NUNCA são logados**. Sem
  PII de titular.

## lgpd-check
- Os `valores` submetidos podem conter dado de titular — ficam em JSONB org-scoped sob RLS, **nunca em log/erro/
  resposta de auditoria** (só metadados). `CardHistory.summary` é resumo sem PII desnecessária. `actorId` é
  referência de ator para auditoria. Retenção segue o ciclo de vida do Card (arquivar é `state`, 2.11; sem
  exclusão definitiva).

## performance-check
- Submeter: resolução de poder (por `id`/índices), leitura do Form (`@@index([orgId, pipeId])`), da FormVersion
  (`@@unique`), da 1ª Fase ativa (`@@index([orgId, pipeId, state, position])`) + 2 INSERTs numa transação curta.
  Validação em memória contra o snapshot (limites defensivos). Sem N+1, sem varredura. `@@index([orgId, pipeId,
  phaseId])` prepara a superfície do Kanban (2.9).

## Veredito
Todos os gates aplicáveis **verdes**; sem regressão. Pronto para revisão independente e commit.
