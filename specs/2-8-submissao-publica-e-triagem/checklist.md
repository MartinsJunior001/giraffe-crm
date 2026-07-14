# Checklist — Story 2.8

- [x] Público **opt-in**, só Formulário inicial (`PIPE_INITIAL`) e só publicado — CHECK `Form_public_only_initial`.
- [x] Resolução de tenant por `PublicFormRoute` **global** (sem RLS — AD-10), `publicId` opaco, sem PII; releitura do
      Form **sob RLS**; cliente nunca fornece `orgId`/`formId`/`formVersionId`.
- [x] Link inválido/revogado/não publicado/cross-tenant → **404 uniforme** (não-enumeração) — provado em `*-http`.
- [x] Revogação e **rotação** do `publicId` (antigo deixa de resolver → 404; novo resolve) — provado.
- [x] TRIAGE não cria Card (submissão PENDING); DIRECT cria **1 Card** `origin=PUBLIC` na 1ª Fase ativa — provado.
- [x] Triagem é ciclo da `SubmissaoPublica` (`PENDING`/`CONVERTED`/`REJECTED`), não estado do Card (`Fase ≠ Status`).
- [x] Aprovar cria 1 Card + evento `CREATED` e marca `CONVERTED` na MESMA transação (atômico); rejeitar preserva.
- [x] Idempotência da conversão: convertida não reconverte → 409; **nunca 2 Cards** (`@@unique` do Card backstop).
- [x] Concorrência: P2002 **e** P2028 → idempotente/409, **nunca 500** — regressão `Promise.all` (aprovar×aprovar e
      DIRECT×DIRECT) → só 201/409, 1 Card, 1 submissão.
- [x] Capacidade `reviewPublicSubmissions` na `PipeGrant`, **deny-by-default**; Admin da Org implícito; sem capacidade
      403; sem acesso 404 — provado em `triage-authz`; **fase vermelha** do portão provada.
- [x] `SubmissaoPublica` org-scoped: RLS ENABLE+FORCE, WITH CHECK, **sem GRANT DELETE** (LGPD) — provado em `*-rls`.
- [x] `PublicFormRoute` global resolve pré-contexto e independe da Org ativa; **sem GRANT DELETE** — provado.
- [x] Rate limit **atômico** por IP confiável + `publicId`, fail-closed → **429** acima do teto — provado por HTTP.
- [x] IP de fonte confiável (`client-ip.ts`), nunca X-Forwarded-For cru; **Arquivo bloqueado** no público (AD-28) → 400.
- [x] Resposta pública é só `{ ok: true }` — sem id/cardId/orgId (asserção de corpo exato); erros 400/404 genéricos.
- [x] Auditoria (FR-214): `SubmissaoPublica`/`PublicFormRoute` em `MODELOS_AUDITADOS`; logger **real** no serviço
      público; auditoria manual do converter após a tx raiz; **`valores` nunca em log**.
- [x] Sem antecipar: sem CAPTCHA, sem movimentação/estado de Card, sem Database (E3), sem upload real de Arquivo.
- [x] C3/`ability.ts`/guard **intocados** (`git diff` vazio em `kernel/authz/`); `Card` segue SELECT/INSERT.
- [x] Gates verdes (typecheck/format/lint/build/testes — 449); revisão adversarial de 4 lentes; 1 HIGH + 3 MEDIUM
      corrigidos com regressão.
