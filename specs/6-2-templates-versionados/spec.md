# Spec — Story 6.2: Administração e versionamento de Templates de E-mail

> Base: `origin/main = 1c7d51b` · Épico 6 · Risco **ALTO** (migration + imutabilidade + catálogo tipado)
> Fontes: epics.md §6.2 · PRD FR-25 (RN-111, D6.5) · Spine AD-25/AD-11 · padrão `FormVersion` (2.6)

## Objetivo

Templates de e-mail da Organização com **versionamento imutável** (twin de `FormVersion`) e **catálogo
canônico tipado de variáveis** — a DEFINIÇÃO e a validação nascem aqui; a **resolução/aplicação** é a 6.3
e a Ação de Automação é a 6.6. Sem envio real (6.4, AD-28 intacto).

## Requisitos

- **RF-1 (propriedade/ciclo):** **Admin da Org** cria/edita/arquiva/restaura; ADMIN/MEMBER **consultam**
  (GUEST → 403; Admin do Pipe NÃO administra); **sem exclusão definitiva** (GRANT sem DELETE; arquivar =
  `state`, idempotente, caminho no-op sem `updateMany`). Arquivado é **somente-leitura** (nova versão →
  409; fluxo restaurar → editar → arquivar).
- **RF-2 (versionamento):** `EmailTemplate` (identidade estável: `templateId`, nome, estado, ponteiro
  `activeVersion`) + `EmailTemplateVersion` (**imutável**: assunto, corpo, definição de variáveis, autor,
  data — GRANT só `SELECT/INSERT`, numerada por `@@unique([orgId, templateId, version])`). **Editar =
  publicar nova versão** numa tx interativa (INSERT versão + UPDATE ponteiro — padrão da publicação 2.6);
  concorrência de número resolve por UNIQUE → P2002/P2028 → 409, nunca 500. E-mails enviados e Execuções
  iniciadas nunca mudam (imutabilidade pelo banco).
- **RF-3 (variáveis):** catálogo **canônico de plataforma** (não user-defined) com nome/tipo/origem
  tenant-safe; a definição do Template declara `{ nome, obrigatoria }` por variável usada; sintaxe no
  conteúdo: `{{nome}}`. Validação fail-closed no servidor: referência não declarada, declaração fora do
  catálogo, duplicata ou sintaxe malformada → 400. **Nada é executado/resolvido na 6.2** (sem
  script/expressão/consulta — resolver é 6.3; o contrato "obrigatória ausente bloqueia" nasce na
  definição e é consumido pela 6.3).
- **RF-4 (autorização):** guard grosso `@Requer('ler','Organizacao')` (C3 congelado); fina no serviço:
  administrar = `papel === 'ADMIN'` (403 senão); consultar = ADMIN/MEMBER (GUEST 403); 404 não-enumerante
  para id invisível.

## Decisões (clarify consolidado)

- **D-62.1 — Catálogo inicial de variáveis** (AUTONOMOUS_DECISION, aditivo/reversível): `org.name`,
  `card.title`, `user.name` (tipo TEXT, origens já canônicas e tenant-safe). Ampliar é acrescentar
  constante — a 6.3 resolve só as do catálogo.
- **D-62.2 — Toda edição publica** (sem rascunho de Template): o epics não pede draft de Template; a
  menor mudança correta é editar ⇒ nova versão imediata com ponteiro atualizado (como o Form Builder
  faria com publish). `activeVersion` sempre aponta a última.
- **D-62.3 — Tetos:** nome ≤ 120; assunto ≤ 200; corpo ≤ 20_000 (mesmos do e-mail 6.1); ≤ 20 variáveis
  declaradas. Conteúdo texto plano com placeholders (mesma validação de controle da 6.1).
- **D-62.4 — OQ-26 rastreado, não decidido aqui:** a versão imutável endereçável (`templateVersionId`) É
  o que a semântica Ação↔Template exige; a ratificação formal (`DEB-4-9-TEMPLATE-VERSION-RATIFY`)
  permanece da 6.6 — nenhuma decisão de produto inventada.
- **D-62.5 — FKs compostas tenant-safe** (lição 4.1): `(orgId, templateId) → EmailTemplate(orgId, id)`;
  `@@unique([orgId, id])` no pai.

## Invariantes que não podem regredir

RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE) nas duas tabelas; `withTenantContext` em toda query;
`orgId` fora da fronteira; `EmailTemplateVersion` sem UPDATE/DELETE de runtime (imutável pelo banco);
`EmailTemplate` sem DELETE, UPDATE column-scoped (`name`/`state`/`activeVersion`/`updatedAt` — autoria e
`orgId` imutáveis); MODELOS_AUDITADOS +2; C3 congelado; AD-28 intacto (nada de envio/Resend).

## Critérios de aceite

1. Admin cria (201: template + v1), edita (201: v2 com `templateId` estável), arquiva/restaura (200
   idempotentes); MEMBER consulta (200) e não administra (403); GUEST 403; sem rota de DELETE.
2. Nova versão nunca altera versão anterior (UPDATE/DELETE em `EmailTemplateVersion` → permission
   denied, provado); ponteiro avança; concorrência de edição → um vence, outro 409.
3. Definição de variáveis validada fail-closed: `{{desconhecida}}` no corpo → 400; declaração fora do
   catálogo → 400; duplicata → 400; definição válida persiste tipada na versão.
4. Arquivado: nova versão → 409; consultar segue 200; restaurar devolve a edição.
5. Isolamento: cross-tenant invisível; WITH CHECK no INSERT (createMany); FK composta rejeita
   `templateId` alheio na versão.

## Fora do escopo

Aplicação/resolução/preview real (6.3); Ação de Automação e ratificação OQ-26 (6.6); envio (6.4);
variáveis definidas pelo usuário; rich text; permissão canônica futura de Admin de Pipe.
