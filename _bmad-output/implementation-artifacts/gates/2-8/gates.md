# Gates — Story 2.8 (submissão pública controlada e triagem)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src` + `test`): ✅ exit 0.
- **format:check** (Prettier): ✅ exit 0.
- **lint** (`eslint apps/api`): ✅ exit 0.
- **build** (api, `nest build`): ✅ exit 0.
- **testes** (suíte cheia da API, série `--no-file-parallelism`): ✅ **51 arquivos, 449 testes** — inclui 2.8
  (public-submissions-http 11, triage-authz 4, public-submissions-rls 6 = 21) e regressão 2.1–2.7 sem alteração.
  Os testes a mais que a versão inicial (17) vêm da revisão: concorrência de conversão (2), rotação e 429 (2).

## migration-check
Migration versionada `20260714150000_public_submissions`: enums `PublicFormMode`/`CardOrigin`/`SubmissaoPublicaState`;
colunas em `Form` (`publicEnabled`/`publicMode` + CHECK `Form_public_only_initial`: só `PIPE_INITIAL` pode ser
público), `Card.origin`, `PipeGrant.reviewPublicSubmissions`; tabelas novas `SubmissaoPublica` e `PublicFormRoute`.
- **`SubmissaoPublica`** (org-scoped): RLS ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK em INSERT/UPDATE;
  **GRANT SELECT/INSERT/UPDATE — sem DELETE** (preserva por LGPD; não se apaga o dado do titular). FKs CASCADE
  (org/form/version) e SetNull (card).
- **`PublicFormRoute`** (GLOBAL, sem RLS por definição — AD-10, análogo a `Account`): só `publicId` opaco + `orgId` +
  `formId`, **sem PII**; **GRANT SELECT/INSERT/UPDATE — sem DELETE** (revogar é `active=false`; rotacionar é revogar +
  criar novo). A resolução pública ocorre **antes** de qualquer contexto de Organização.
Aplicada por `db:migrate` (não no boot). Só adição, nenhuma alteração destrutiva.

## security-check
- **Isolamento (invariante-mãe):** o `publicId` resolve `(orgId, formId)` pelo mapa global; o serviço **relê o Form
  sob `withTenantContext(orgId)`** exigindo `PIPE_INITIAL` + `publicEnabled` + versão publicada — uma rota envenenada
  (formId de outra Org) é filtrada pela RLS → null → **404 uniforme**. Nenhuma rota aceita `orgId`/`formId`/`pipeId`/
  `formVersionId` do cliente. `SubmissaoPublica` RLS ENABLE+FORCE; cross-tenant/sem-contexto → 0 linhas; WITH CHECK
  barra INSERT com `orgId` alheio (`createMany`, sem RETURNING) — provado em `public-submissions-rls`.
- **404 uniforme (não-enumeração):** formato inválido de `publicId`, rota inexistente, revogada, form não publicado/
  não público e cross-tenant respondem todos **404** idêntico.
- **Autorização da triagem:** capacidade EXPLÍCITA `reviewPublicSubmissions` na `PipeGrant`, **deny-by-default**;
  Admin da Org implícito; demais só por concessão ACTIVE com a capacidade (e `Membership` ACTIVE); sem a capacidade →
  **403**, sem acesso → **404**. Concedível só sob `@Requer('administrar','Pipe')` (Admin da Org). C3/CASL intocado
  (`git diff` vazio em `kernel/authz/`). **Fase vermelha provada:** portão da capacidade desligado → `triage-authz`
  vermelho (Membro sem capacidade recebeu 200) → restaurado.
- **Antiabuso (baseline):** rate limit ATÔMICO por IP confiável + `publicId` (`INSERT ... ON CONFLICT ... RETURNING`),
  fail-closed (precede a escrita), teto 20/10 min → **429** (provado por HTTP). IP do socket / 1º salto atrás de proxy
  confiável, **nunca X-Forwarded-For cru** (`client-ip.ts`). **Arquivo bloqueado no canal público** (AD-28): valor de
  Campo `FILE` → **400 genérico** (provado injetando snapshot FILE via migrator).
- **Atomicidade sem bypass:** conversão em transação interativa no client raiz com `definirContextoOrg`; RLS/WITH CHECK
  valem dentro dela. Conflito reconhece **P2002 e P2028** → idempotente/409, **nunca 500** (regressão de concorrência:
  2 aprovações e 2 DIRECT simultâneos → só 201/409, 1 Card, 1 submissão).
- **Anti-mass-assignment:** `validarSubmissao` com allowlist por `Field.id` do snapshot; chave desconhecida → 400.
  Resposta pública é só `{ ok: true }` — sem id/cardId/orgId (provado por asserção de corpo exato).

## observability-check
- `SubmissaoPublica`/`PublicFormRoute` em `MODELOS_AUDITADOS`. O INSERT da submissão passa pelo **PinoLogger real**
  (achado de revisão: o logger no-op foi removido) → auditoria + sinal `rls.denied` preservados no endpoint público.
  A conversão (tx raiz) emite **auditoria manual** de `Card`/`CardHistory`/`SubmissaoPublica` após o commit. Logs
  sanitizados; **os `valores` do titular NUNCA são logados** (só metadados).

## lgpd-check
- Os `valores` da submissão pública são PII de titular externo: ficam em JSONB org-scoped sob RLS, **nunca em log/erro/
  resposta** (a resposta pública é opaca; a triagem os expõe só ao revisor com capacidade). `SubmissaoPublica` **sem
  GRANT de DELETE** — o dado é preservado (rejeitar é `state=REJECTED`, não apaga). `PublicFormRoute` não guarda PII.
  IP na chave de rate limit é herdado do padrão nativo (registrado como nota LGPD, não introduzido pela 2.8).

## performance-check
- Submissão pública: 1 `findUnique` por `publicId` (índice único, pré-contexto) + releitura do Form
  (`@@index([orgId, pipeId])`) + FormVersion (`@@unique`) + rate limit atômico (1 statement) + 1 INSERT; DIRECT soma a
  1ª Fase ativa (`@@index`) + conversão (2 INSERT + 1 UPDATE curtos). Triagem: `@@index([orgId, formId, state])` para a
  fila. Sem N+1, sem varredura.

## Veredito
Todos os gates aplicáveis **verdes**; sem regressão. Revisão adversarial de 4 lentes concluída (1 HIGH + MEDIUMs
corrigidos; ver `review.md`). Pronto para commit e PR.
