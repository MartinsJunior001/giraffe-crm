# Analyze — Story 2.8

## Cobertura dos critérios
- **SC-281** (público opt-in, só inicial/publicado; revogar/despublicar bloqueia) — `*-http`: habilitar devolve
  `publicId`; revogado → 404; CHECK `Form_public_only_initial` no banco; releitura exige `PIPE_INITIAL`+`publicEnabled`
  +versão publicada. Rotação: antigo → 404, novo → 201. ✅
- **SC-282** (submissão não concede acesso; resposta só confirmação; sem dado interno) — `*-http`: corpo `==={ok:true}`,
  sem `pipeId`/`campo.id`; rota sem `@Requer`, `@SemContextoOrganizacional`. ✅
- **SC-283** (TRIAGE não cria Card; DIRECT cria 1, origem PUBLIC) — `*-http` (TRIAGE 0 cards/1 pendente; DIRECT 1 card
  `origin=PUBLIC`/1 convertida). ✅
- **SC-284** (triagem é ciclo da Submissão, não estado do Card) — enum `SubmissaoPublicaState` (entidade distinta);
  `APPROVED` colapsado em `CONVERTED` por design (aprovação = conversão atômica, AD-11). ✅
- **SC-285** (aprovar cria 1 Card + evento + origem; rejeitar preserva) — `*-http` (aprovar 1 Card; rejeitar REJECTED,
  0 Card adicional); `converter` grava `CardHistory CREATED` na mesma tx. ✅
- **SC-286** (idempotência de conversão; convertida não reaprova; nunca 2 Cards) — `*-http`: reaprovar sequencial → 409;
  **concorrência** `Promise.all` (aprovar×aprovar; DIRECT×DIRECT) → só 201/409, **1 Card**, 1 submissão. ✅
- **SC-287** (capacidade "Revisar submissões públicas" deny-by-default) — `triage-authz` (Admin da Org 200; Membro com
  capacidade 200+approve; Membro sem capacidade 403; sem concessão 404); **fase vermelha** provada. ✅
- **SC-288** (guardrails: limites, Arquivo seguro, mensagens sem dados internos) — `*-http`: Arquivo→400; rate limit
  429; respostas genéricas. Guardrails de apresentação (privacidade/consentimento/ID da Org) reconhecidos como
  Produto/UI (sem superfície de API nesta Story). ✅ (parcial por design)
- **SC-289** (RLS org-scoped; sem bypass; contexto ausente falha fechado; Org resolvida pelo recurso) —
  `public-submissions-rls`: isolamento cross-tenant, WITH CHECK (createMany), sem DELETE; `PublicFormRoute` global
  resolve pré-contexto e independe da Org ativa; `publicId` resolve o tenant (nunca o cliente). ✅

## Achados da revisão corrigidos
- **D-R1 — conversão concorrente → 500 (HIGH, Edge, classe Edge-H1 da 2.7):** `converterSubmissaoEmCard` rodava a tx
  raiz sem try/catch; o `Card.create` (chave `public:<submissaoId>`) colide no `@@unique` antes da guarda de estado →
  P2002/P2028 não capturado → 500. **Corrigido:** `isConflitoDeConversao` (P2002‖P2028) → relê o Card e devolve
  idempotente, ou 409; regressão `Promise.all` prova só 201/409 e 1 Card.
- **D-R2 — dedup público só P2002 (MEDIUM, Edge):** `criarSubmissao` não cobria P2028 → 500 sob contenção.
  **Corrigido:** P2002‖P2028 → existente ou 409.
- **D-R3 — converter sem auditoria (MEDIUM, Architecture):** a tx raiz não passa pela extensão; Cards de DIRECT/aprovação
  ficavam sem trilha. **Corrigido:** auditoria manual (`create Card`/`CardHistory`, `update SubmissaoPublica`) após o
  commit, só metadados (padrão da 2.7).
- **D-R4 — logger no-op no serviço público (MEDIUM, Security/Architecture):** `semLog` silenciava auditoria + `rls.denied`
  no endpoint mais atacado. **Corrigido:** `PinoLogger` real (a camada nunca loga `valores`).

## Ressalvas aceitas (não bloqueiam)
- **D-A1 — AC8 guardrails de apresentação sem superfície de API:** são de Produto/UI; não há endpoint público de
  leitura do Formulário nesta Story. Reconhecido no encerramento.
- **D-A2 — estado `APPROVED` colapsado em `CONVERTED`:** aprovação e conversão são atômicas (AD-11); sem janela
  intermediária. Documentado no schema.
- **D-A3 — DIRECT sem `idempotencyKey` não deduplica:** decisão de produto (formulário público raramente controla a
  chave), mitigada pelo rate limit. Diverge da 2.7 interna (chave obrigatória).
- **D-A4 — duplicação de `formInicial`** (Triage/PublicConfig) e IP em claro na chave de rate limit (herdado): dívida
  baixa / nota LGPD, registradas; não bloqueiam.
- **D-A5 — comentário legado "2.9/2.11" no schema de `Card`** (carryover da 2.7): a 2.8 **não** o reintroduz nem
  antecipa GRANT; o consumidor real de UPDATE de Card é posterior (2.14). Correção de redação separada.
