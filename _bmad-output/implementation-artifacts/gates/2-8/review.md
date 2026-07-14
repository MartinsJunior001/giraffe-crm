# Revisão independente — Story 2.8 (submissão pública controlada e triagem)

> Revisão adversarial de **risco ALTO** (endpoint público NÃO autenticado num sistema multi-tenant): quatro
> revisores read-only em paralelo. HIGH corrigido com regressão de concorrência; MEDIUM que afete
> isolamento/observabilidade/aceite corrigido. Evidência real; PostgreSQL real.

## Revisores e veredito
- **Blind Security** — APROVA COM RESSALVAS, sem CRITICAL/HIGH. Isolamento multi-tenant sólido e defense-in-depth:
  mesmo uma `PublicFormRoute` **envenenada** (orgId/formId incoerentes) é inerte, porque a releitura do Form sob
  `withTenantContext(orgId)` filtra por RLS um `formId` alheio → null → 404. Cliente nunca fornece
  `orgId`/`formId`/`formVersionId`. **1 MEDIUM** (logger no-op silencia a trilha de auditoria no endpoint mais
  atacado); **1 MEDIUM-LOW** (conversão concorrente → 500); LOWs (IP em claro na chave de rate limit — herdado;
  DIRECT sem chave duplica — por decisão; enumeração antes do rate limit — desprezível).
- **Architecture Reviewer** — APROVA COM RESSALVAS. Fronteira do kernel (AD-4/5) preservada; DBT-AUTHZ-01 respeitado
  (C3/`ability.ts`/guard **intocados** — `git diff` vazio em `kernel/authz/`); tabela global `PublicFormRoute`
  análoga a `Account` (AD-10), GRANT mínimo sem DELETE; transação de conversão no client raiz com `definirContextoOrg`
  (fonte única); sem antecipar 2.9+/E3 (AD-11); `Card` segue SELECT/INSERT (a coluna `origin` não exigiu UPDATE).
  **R1 MEDIUM** (converter não emite auditoria — contraste com a 2.7); **R2 MEDIUM** (logger no-op); **R3 MEDIUM**
  (P2002/P2028 não traduzido → 500); R4-R6 BAIXA/INFO (DIRECT sem chave; rate limit só protege links válidos;
  comentário legado "2.9/2.11" de `Card` — carryover da 2.7, **não** reintroduzido pela 2.8).
- **Edge Case Hunter** — APROVA COM RESSALVAS. **1 HIGH CONFIRMADO** (regressão da classe Edge-H1 da 2.7 reaparece
  no `converter-submissao.ts`); **1 MEDIUM** (`criarSubmissao` só reconhece P2002, não P2028). Verificou OK:
  idempotência com chave null (NULLs não colidem no PG), gate de Arquivo efetivo (bloqueia antes de `validarSubmissao`
  tratar FILE como texto), borda do rate limit conservadora, validação sem inventar obrigatoriedade. Apontou a
  **lacuna de teste de concorrência real** (só havia retries sequenciais).
- **Acceptance Auditor** — APROVA COM RESSALVAS. Os nove AC (SC-281…289) cobertos por código real + teste de
  integração. Sem escopo antecipado proibido (CAPTCHA deferido; sem movimentação/estado de Card; sem E3/Database;
  Arquivo só como contrato consumido). Ressalvas: AC8 estruturalmente PARCIAL no backend (guardrails de apresentação —
  aviso de privacidade/consentimento/ID da Org — são de Produto/UI, sem superfície de API); estado `APPROVED`
  colapsado em `CONVERTED` (design AD-11, aprovação = conversão atômica). Lacunas: 429 e rotação sem teste dedicado.

## Achados e disposição

| # | Sev. | Achado | Disposição |
|---|------|--------|------------|
| Edge-H1 / Sec-ML / Arch-R3 | HIGH | `converterSubmissaoEmCard` roda a tx raiz **sem try/catch**; o `Card.create` (chave `public:<submissaoId>`) colide no `@@unique` **antes** da guarda de estado. Sob `approve`×`approve` ou DIRECT-convert concorrente da mesma submissão, a 2ª transação estoura **P2002/P2028 não capturado → 500** (a guarda `count=0→409` é inalcançável nesse interleaving). | **CORRIGIDO.** Predicado `isConflitoDeConversao` (P2002 ‖ P2028), simétrico à 2.6/2.7. No conflito, relê o Card da submissão (`public:<submissaoId>`) e o devolve **idempotente**; sem Card visível ainda (P2028 em voo) → **409**, nunca 500. Integridade já garantida pelo `@@unique` + rollback (nunca 2 Cards); o defeito era de contrato de erro/observabilidade. |
| Edge-M2 | MED | `criarSubmissao` (serviço público) só reconhecia **P2002**; sob contenção de lock o batch-transaction do `withTenantContext` pode emitir **P2028** → erro cru → **500** no dedup público. | **CORRIGIDO.** `isConflitoDeSubmissao` agora cobre P2002 ‖ P2028; no conflito relê por `(formId, idempotencyKey)` e devolve a existente, ou **409** se ainda em voo — nunca 500. |
| Sec-M1 / Arch-R1 | MED | O `converter` (tx raiz, fora da extensão) **não emitia auditoria** (FR-214): Cards de submissão DIRECT e de aprovação de triagem ficavam sem trilha, embora `Card`/`CardHistory`/`SubmissaoPublica` estejam em `MODELOS_AUDITADOS`. Inconsistência: `rejeitar` (via extensão) era auditado, `aprovar` não. | **CORRIGIDO.** Auditoria manual após o commit da tx (padrão da 2.7): `create Card`, `create CardHistory`, `update SubmissaoPublica` — só metadados (ator/Org/ação/recurso/resultado), **nunca os valores**. |
| Sec-M2 / Arch-R2 | MED | `PublicSubmissionService` injetava um **logger no-op** (`semLog`) em `withTenantContext`, silenciando a auditoria do INSERT de `SubmissaoPublica` e o sinal `rls.denied` no endpoint mais atacado. A justificativa de PII era falsa: a camada só loga metadados, nunca `args`/`valores`. | **CORRIGIDO.** Injeta o `PinoLogger` real (como `TriageService`/`PublicConfigService`). A proteção de PII dos `valores` já é da camada, não do silenciamento. |
| Edge-gap / Acc | MED | A corrida de conversão/idempotência **não era testada** (só retries sequenciais, que passam pelo pré-check e encobrem o H1). | **CORRIGIDO.** Dois testes `Promise.all`: (a) duas aprovações simultâneas → só 201/409 (**nunca 500**), exatamente **1 Card**; (b) duas submissões DIRECT simultâneas com a mesma `idempotencyKey` → só 201/409, **1 submissão, 1 Card**. |
| Acc-AC3 | MED | Rotação do `publicId` tinha código mas **sem teste dedicado**. | **CORRIGIDO.** Teste: habilitar → rotacionar → o `publicId` antigo deixa de resolver (**404**), o novo resolve (**201**); identificador realmente trocado. |
| Acc-AC8 | MED | 429 do rate limit sem teste HTTP dedicado. | **CORRIGIDO.** Teste: 20 submissões (IP+publicId) passam (201), a **21ª → 429** (baseline antiabuso, fail-closed). |
| Sec-L / Arch-R4 / Edge-info | LOW | DIRECT **sem** `idempotencyKey` do cliente não deduplica retries → double-submit acidental cria Cards distintos (mitigado pelo rate limit). Diverge da 2.7 interna (chave obrigatória). | **ACEITO (decisão de produto).** Formulário público raramente controla a chave; o baseline antiabuso limita o volume. Registrado; reconhecido no encerramento. |
| Acc-AC4 | LOW | Estado `APPROVED` (listado no `plan.md`) omitido; aprovação colapsa direto em `CONVERTED`. | **ACEITO (design AD-11).** Aprovação e conversão são atômicas — não há janela "aprovada mas não convertida". Documentado no schema. Reconhecido no encerramento. |
| Acc-AC8-b | LOW | Guardrails de apresentação (aviso de privacidade/consentimento/identificação da Org) sem superfície de API. | **ACEITO (Produto/UI).** São guardrails de apresentação, não de backend; não há endpoint público de leitura do Formulário nesta Story. Reconhecido no encerramento. |
| Arch-dup | LOW | `formInicial` duplicado literalmente em `TriageService` e `PublicConfigService`. | **ACEITO (dívida baixa).** Candidato a extração para `forms/form-locate.ts`; não bloqueia. Registrado. |
| Sec-L / Edge-borda | LOW | IP em claro na chave de rate limit (herdado do padrão nativo); enumeração de `publicId` inválido não consome cota (resolver barato, IDs opacos ≥16 chars); "penalty box" após exceder. | **ACEITOS**, registrados. Consistentes com o baseline antiabuso escolhido; não bloqueiam. |

## Veredito
Um HIGH (Edge-H1) corrigido com regressão de concorrência determinística; todos os MEDIUM de
isolamento/observabilidade (auditoria do converter, logger real, P2002/P2028→409) corrigidos. Nenhum CRITICAL.
Suíte 2.8: **21 testes** (http 11, authz 4, rls 6); suíte cheia **449 testes, verde**. Fase vermelha do portão de
capacidade provada (desligado → authz vermelho → restaurado). Pronto para commit e PR.
