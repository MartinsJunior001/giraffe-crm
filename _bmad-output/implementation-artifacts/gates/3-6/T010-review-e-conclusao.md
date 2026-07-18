# T010 — Revisão adversarial (4 camadas) e gates de conclusão — Story 3.6

## Contexto da integração

Trabalho da 3.6 preservado (checkpoint `efe2664` + bundle externo) e integrado com `origin/main`
(`b4beae0`, que já traz 3.7/3.8) por **merge normal** `db141df`. Conflitos resolvidos semanticamente:
`sprint-status.yaml` (mantém 3-7/3-8 `done` do main + 3-6 `ready-for-dev` da branch) e
`databases.module.ts` (mantém `RecordHistoryController` da 3.6 **e** `RecordFilesController` da 3.8).

## Gates de qualidade

- **Typecheck (API):** limpo pós-integração.
- **Testes-alvo:** `record-history-read-rls` + `record-history-read-http` → **7/7** (RLS cross-tenant + AC1–AC7).
- **Regressão dos vizinhos:** `records-http`/`records-read-http`/`records-rls` → **17/17**.
- **Suíte serial completa:** `vitest run --no-file-parallelism` → **103 arquivos / 852 testes**, exit 0.

## Revisão adversarial — 4 camadas

**1. Segurança / Autorização.** Autz por **acesso ATUAL** (`exigirLerDatabase`) — histórico nunca concede
(SC-2105); **404 não-enumerante** idêntico para sem-acesso / Registro inexistente / outro Database / outra
Org (RLS). Isolamento cross-tenant provado (teste RLS). **Vetor investigado (AD-30):** a projeção allowlist
protege *colunas*, mas `summary` sai — verifiquei o write-side de arquivos (3.8, `FileEventDispatcher`): o
summary é `"Arquivo anexado (<fileId>)"`, **só a referência `fileId`**, sem `bucketKey`/URL/PII. Nenhum
binário/chave/URL vaza pela timeline. **Sem finding.**

**2. Correção / Edge.** Cursor determinístico `[createdAt, id]` com `take+1`/`skip:1` (sem off-by-one);
`parseLimite` default 50, teto rígido 100 no serviço; `parseCursor` valida UUID (lixo → 400). Eventos de
`type` desconhecido passam pela projeção (string aberta); eventos legados sem `actorId` → `null`. **Sem finding.**

**3. Observabilidade / LGPD.** `RecordHistoryReadService` não loga `summary`/`valores`/PII (só passa o logger
ao `withTenantContext` para a auditoria de acesso). Projeção exclui `orgId`/`recordId`/payload; read-side
puro, sem persistência nova. **Sem finding.**

**4. Aceite / Testes.** AC1–AC7 cobertos (HTTP) + isolamento (RLS); suíte serial verde; typecheck limpo.
`Card ≠ Registro` preservado (DTO/service locais, sem reusar Card). **Sem migration e sem GRANT novo** —
o runtime já tem `SELECT` em `RecordHistory` (append-only desde 3.4).

## Veredito

**0 CRITICAL / 0 HIGH.** A 3.6 é um espelho fiel do Histórico do Card (2.17), já revisado, aplicado ao
domínio distinto de Registro; a integração com 3.7/3.8 não quebrou nada (852/852). Pronta para commit-check,
PR e merge.
