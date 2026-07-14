# Checklist — Story 2.7

- [x] `Card` e `CardHistory` org-scoped; RLS ENABLE+FORCE; policies por `current_org_id()`; WITH CHECK.
- [x] `Card`: GRANT **só SELECT/INSERT** na 2.7 (sem UPDATE — sem consumidor ainda; sem DELETE) — provado em `cards-rls`.
- [x] Concorrência: P2002 **e** P2028 → caminho idempotente/409, nunca 500 (Edge-H1) — regressão paralela determinística.
- [x] Definição congelada (AD-12): republicar não muda o Card criado; nova submissão usa a versão corrente — provado.
- [x] `CardHistory`: GRANT SELECT/INSERT, **sem UPDATE/DELETE** (append-only) — provado em `cards-rls` + mutação.
- [x] Idempotência estrutural `@@unique([orgId, formId, idempotencyKey])`; retry → mesmo Card (nunca duplica).
- [x] Criação atômica (INSERT Card + INSERT CardHistory) em transação com contexto no client raiz.
- [x] Só Formulário **publicado** recebe submissão (`publishedVersion` não nulo); não publicado → 409.
- [x] Card nasce na 1ª Fase ativa; referencia `formVersionId` (definição congelada — AD-12).
- [x] `valores` validados contra o snapshot (allowlist, tipo, Seleção por `id`); chave desconhecida → 400.
- [x] Valor ausente permitido (sem obrigatoriedade em `Field`); limites defensivos (string/payload).
- [x] Autorização "operar o Pipe" (Membro submete — poder ativado; Viewer 403; sem acesso 404).
- [x] `Card`/`CardHistory` em `MODELOS_AUDITADOS`; auditoria emitida; **`valores` nunca em log** (sem PII).
- [x] Sem materializar Formulário de Fase, movimentação, ciclo de vida do Card nem upload de Arquivo (gated).
- [x] Gates verdes (typecheck/format/lint/build/testes); 3 mutações provadas (allowlist, dedup, imutabilidade).
