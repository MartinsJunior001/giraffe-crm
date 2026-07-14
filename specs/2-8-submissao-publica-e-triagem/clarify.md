# Clarify — Story 2.8

Dúvidas resolvidas pela hierarquia de artefatos (PRD D3.3, Épico 2, AD-6/10/11/28) e pela **decisão escalada** do
dono do produto para o baseline antiabuso (não inventado).

1. **Como um formulário fica público?** Opt-in explícito, **só o Formulário inicial** (`PIPE_INITIAL`) e **só
   publicado** — CHECK `Form_public_only_initial` no banco impede habilitar público em Fase/Database. Despublicar ou
   revogar bloqueia a submissão (→ 404).
2. **Como o tenant é resolvido sem autenticação?** Por um registro **global** `PublicFormRoute` (sem RLS — AD-10),
   que mapeia um `publicId` **opaco e aleatório** → `(orgId, formId)`, sem PII. O fluxo entra em
   `withTenantContext(orgId)` e **relê o Form sob RLS** — nunca confia em `orgId`/`formId`/`pipeId`/`formVersionId` do
   cliente. Link inválido/revogado/cross-tenant → **404 uniforme** (não enumera).
3. **Revogação e rotação?** Revogar = `Form.publicEnabled=false` + `PublicFormRoute.active=false`. Rotacionar =
   revogar a atual + criar um `publicId` novo. Sem DELETE (a rota é preservada; revogar é `active=false`).
4. **TRIAGE vs DIRECT?** `TRIAGE` (padrão): a submissão fica **pendente**, sem criar Card, até a triagem. `DIRECT`:
   converte na hora em 1 Card na 1ª Fase ativa. O modo é do Formulário (`Form.publicMode`).
5. **A triagem é estado do Card?** Não. `SubmissaoPublica` tem **ciclo próprio** (`PENDING`/`CONVERTED`/`REJECTED`) —
   `Fase ≠ Status do Card` preservado. **Aprovar = converter** é atômico (não há estado "aprovada mas não
   convertida"): aprovação e criação do Card acontecem na mesma transação (AD-11).
6. **Aprovar/rejeitar?** Aprovar cria **1 Card** (`origin=PUBLIC`) na 1ª Fase ativa + evento `CREATED`, marcando a
   submissão `CONVERTED` na mesma transação (idempotente: convertida não reconverte → 409, nunca 2 Cards). Rejeitar
   marca `REJECTED` sem criar Card e **preserva** a submissão (sem DELETE — LGPD).
7. **Quem revisa?** Capacidade EXPLÍCITA `reviewPublicSubmissions` na `PipeGrant` existente, **deny-by-default**:
   Admin da Org implícito; demais só por concessão ACTIVE com a capacidade (e `Membership` ACTIVE). Sem a capacidade →
   403; sem acesso → 404. Reusa CASL/`@Requer`/guard (C3 congelado) + guarda fina no serviço (DBT-AUTHZ-01).
8. **Baseline antiabuso (decisão escalada)?** Rate limit **atômico** por IP confiável + `publicId` (fail-closed);
   **Arquivo bloqueado** no canal público (AD-28); idempotência; sem CAPTCHA no MVP; **nenhuma PII em log**. Guardrails
   de apresentação (aviso de privacidade/consentimento/ID da Org) são de Produto/UI, sem superfície de API nesta Story.
9. **Idempotência da submissão pública?** `idempotencyKey` do cliente (opcional) + `@@unique([orgId, formId,
   idempotencyKey])`. Sem chave, não deduplica (cada submissão é distinta) — decisão de produto para formulário
   público, mitigada pelo rate limit.
