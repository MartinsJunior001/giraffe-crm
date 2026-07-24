# Spec — Story 6.1: Modelo canônico de e-mail e Composer

> Base: `origin/main = ca31cd5` · Épico 6 (E-mails, Templates e IA assistiva) · Risco **ALTO**
> Fontes: epics.md §Story 6.1 · PRD FR-24 (D6.5/D3.6, RN-110/RN-114) · Spine AD-24/AD-25/AD-28/AD-11 · CLAUDE.md (invariante-mãe)

## Objetivo

Materializar o **modelo canônico de e-mail outbound** da Organização e as operações de **Composer**
(iniciar/editar/descartar/solicitar envio), **sem envio real** (6.4, gated AD-28/OQ-28), sem inbox, sem
Templates (6.2/6.3) e sem anexos (6.5).

## Requisitos

- **RF-1 (modelo canônico):** todo e-mail pertence a **exatamente 1 Organização**, tem **identidade
  estável** (`id`) e é associável a **0..1 Card da MESMA Organização**; vários e-mails podem apontar o
  mesmo Card. A associação **não concede acesso** em nenhum sentido (Card ↛ e-mail, e-mail ↛ Card).
- **RF-2 (Composer):** iniciar composição (rascunho técnico), editar destinatários/assunto/corpo,
  descartar, **solicitar envio** (= congelar: transição terminal local `SUBMITTED`, sem porta de provedor).
  Rascunho: privado aos autorizados, não aparece como enviado, **não emite Evento de domínio**, deixa de
  ser editável ao entrar no fluxo de envio; descartar não afeta enviados. **Sem** caixa de rascunhos.
- **RF-3 (destinatários):** ≥1 destinatário principal válido; normalização (trim + lowercase),
  validação sintática e **deduplicação no servidor**; teto **20 destinatários** (D-61.2); sem CC/BCC
  (sem âncora no PRD/UX); sem disparo em massa.
- **RF-4 (conteúdo):** assunto/corpo **texto plano** sanitizados fail-closed (sem HTML/script/conteúdo
  ativo; sem caracteres de controle além de `\n`/`\t`); tetos: assunto ≤ 200, corpo ≤ 20_000. Conteúdo
  **imutável após SUBMITTED** (409 em qualquer edição).
- **RF-5 (autorização):** capacidades **deny-by-default** revalidadas no servidor (D-61.3):
  - **compor/editar/descartar/submeter** e-mail **associado a Card** → exige **operar o Card**
    (`exigirOperarCard`, 2.10);
  - e-mail **sem Card** → Membership ativa com papel **ADMIN ou MEMBER** da Org (GUEST → 403);
  - **ler o detalhe** → o **autor** (Membership criadora) ou **Admin da Org**; acesso ao Card **não**
    concede leitura do e-mail;
  - sem acesso → **404 não-enumerante**; guard C3 **congelado** (capacidade fina no serviço,
    DBT-AUTHZ-01).

## Decisões (clarify consolidado)

- **D-61.1 — Estados da 6.1:** `DRAFT → SUBMITTED | DISCARDED` (enum `EmailState`). `SUBMITTED` é o
  contrato que a 6.4 consumirá (fila/outbox/estados honestos de entrega são dela). `DISCARDED` preserva a
  linha (sem DELETE — LGPD/GRANT).
- **D-61.2 — Teto de destinatários = 20** (AUTONOMOUS_DECISION): o epics exige o teto definido
  pré-implementação; 20 cobre apoio operacional a um Card e é hostil a campanha. REVERSIBILITY: HIGH
  (constante no núcleo puro).
- **D-61.3 — Mapa de capacidades** (AUTONOMOUS_DECISION): na ausência de papel específico de e-mail no
  PRD, mapear às capacidades canônicas existentes (operar Card / papel de Org / autoria) — menor mudança
  correta, deny-by-default, sem tocar o guard. O refinamento por capacidade própria ("histórico de
  e-mail", FR-24) entra com o histórico real na 6.4.
- **D-61.4 — Corpo texto plano** na 6.1: PRD não exige rich text; formato seguro/rich é extensão futura
  (campo novo, aditivo). Sanitização = validação fail-closed de texto plano + tetos, nunca strip
  silencioso (400 com motivo).
- **D-61.5 — FK composta tenant-safe** `(orgId, cardId) → Card(orgId, id)` (lição 4.1): RLS + FK simples
  aceitariam `cardId` alheio (ação referencial bypassa row security).
- **D-61.6 — Sem Evento de domínio na 6.1:** `EMAIL_SENT` é evento de **envio** (6.4/6.6, slot de
  extensão do 4.9). Compor/descartar/submeter não emitem outbox — evita evento sem fato de envio.

## Invariantes que não podem regredir

RLS **ENABLE+FORCE** com `WITH CHECK` no INSERT e UPDATE; toda query por `withTenantContext`; `orgId`
fora do payload; GRANT **sem DELETE**; entidade nova em `MODELOS_AUDITADOS`; caminho idempotente não
emite `updateMany` (sem falso `denied`); logs sem assunto/corpo/destinatários (PII); C3 congelado;
nenhuma env de provedor (AD-28 intacto — nada de e-mail real).

## Critérios de aceite (espelham o epics)

1. Compor cria e-mail canônico da Org (identidade estável), 0..1 Card da mesma Org; associação não
   concede/revela acesso (404 não-enumerante nos dois sentidos).
2. Destinatários normalizados/validados/deduplicados no servidor; >20 ou 0 principais → 400; nenhum
   endereço aceito só por validação client-side.
3. Assunto/corpo sanitizados fail-closed; após `SUBMITTED`, toda edição → 409 (imutável).
4. Cada capacidade (compor/editar/descartar/submeter/ler) deny-by-default e revalidada no servidor;
   GUEST sem Card → 403; sem acesso → 404.
5. Rascunho não emite Evento, não aparece como enviado; descartar é mudança de estado (linha preservada).

## Fora do escopo

Envio real/fila/provedor/estados de entrega e histórico geral+por Card (6.4); Templates (6.2/6.3);
anexos (6.5); Ação/Evento de Automação de e-mail (6.6, slots 4.9 seguem recusados); IA (6.7+);
recebimento/inbox/sincronização/campanhas (fora da Fase 1); CC/BCC; rich text.
