# Sprint Change Proposal — 2026-07-17

**Workflow:** `bmad-correct-course` · **Autor:** Dev (agente) navegando mudança · **Autorização do dono:** explícita
(mensagem 2026-07-17, decisões DIV-1/DIV-2 e Q1/Q2/Q3). **Idioma:** pt-BR (casa os artefatos alvo).

## Seção 1 — Sumário do problema

A OQ-47 (capacidade de arquivos) foi decidida pelo dono, que escolheu a **Opção A: upload e download passam pela API,
sem URL pré-assinada entregue ao cliente** (entrega autenticada por proxy sob a sessão do usuário). A materialização
dessa decisão é a **ADR-001** (`docs/03-arquitetura/adr-001-capacidade-de-arquivos.md`).

Duas revisões independentes read-only apontaram que a Opção A **contradiz a letra** de dois artefatos autoritativos —
não por erro de projeto, mas porque os artefatos foram escritos quando a URL assinada ainda era a hipótese de trabalho:

- **DIV-1 — AD-27 (Architecture Spine), Rule:** contém *"acesso por URL temporária e curta"*.
- **DIV-2 — epics.md, Story 3.7, AC#2:** contém *"ocorre por URL temporária, de curta duração, vinculada ao usuário,
  ao recurso e à finalidade"*.

A ADR-001 registrou ambas como **divergências abertas** (§0/DIV-1/DIV-2) e a 3.7 foi mantida **fora de `ready-for-dev`**
até que os artefatos autoritativos sejam emendados pelos seus workflows oficiais — o que este documento faz.

## Seção 2 — Análise de impacto

- **Epic Impact:** apenas Épico 3, Story 3.7 (capacidade de arquivos). A Story 3.8 (consumidores) herda por referência.
- **Story Impact:** 3.7 AC#2 (redação do mecanismo de download). Nenhuma outra Story muda.
- **Artifact Conflicts:** `ARCHITECTURE-SPINE.md` (AD-27 Rule) e `epics.md` (3.7 AC#2). PRD e UX **não** especificam o
  mecanismo de entrega de arquivo, logo **não** são impactados (verificado).
- **Technical Impact:** nenhum código existe ainda (3.7 no backlog). A emenda apenas alinha a letra dos artefatos à
  decisão do dono já tomada; não amplia escopo.

## Seção 3 — Abordagem recomendada

**Direct Adjustment** (ajuste direto, mínimo e rastreável). **Não** é rollback nem replanejamento: a decisão de Produto
já existe; corrige-se a redação de dois artefatos para refleti-la, **preservando o texto original** por marcação de
emenda (não exclusão), com ponteiro para esta proposta e para a ADR-001.

**Por que a Opção A não regride a intenção do AC#2.** A cláusula "vinculada ao usuário, ao recurso e à finalidade" é
**melhor** cumprida pela entrega sob sessão do que por uma URL pré-assinada, que é *bearer* — vincula-se à chave e ao
relógio, nunca ao usuário. "Não há link público permanente" e "a chave nunca é autorização" seguem verdadeiros. O que
muda é só o **mecanismo** ("URL temporária e curta" → "proxy/stream sob sessão").

## Seção 4 — Propostas de mudança detalhadas

### Mudança 1 — AD-27 (ARCHITECTURE-SPINE.md), Rule

**OLD:** `… buckets privados; acesso por URL temporária e curta; validar tamanho/tipo/conteúdo …`

**NEW:** `… buckets privados; acesso por entrega autenticada sob a sessão do usuário (proxy/stream pela API)
[emenda 2026-07-17 — OQ-47/Opção A do dono; a redação original "acesso por URL temporária e curta" foi substituída,
ver ADR-001 e este Sprint Change Proposal]; validar tamanho/tipo/conteúdo …`

**Rationale:** alinhar o AD-27 à Opção A; preservar o texto original por marcação de emenda; `updated`/`status` do
frontmatter **inalterados** (convenção do projeto: emenda rastreada inline + memlog, não por bump de data).

### Mudança 2 — epics.md, Story 3.7, AC#2

**OLD:** `Then ocorre por URL temporária, de curta duração, vinculada ao usuário, ao recurso e à finalidade; a chave
interna do objeto nunca é usada como autorização; não há link público permanente.`

**NEW:** `Then ocorre por entrega autenticada sob a sessão do usuário (stream pela API), vinculada ao usuário, ao
recurso e à finalidade; a chave interna do objeto nunca é usada como autorização; não há link público permanente.
(Emenda 2026-07-17 — OQ-47/Opção A do dono, ADR-001: a redação anterior exigia "URL temporária, de curta duração"; a
entrega por proxy sob sessão a substitui e vincula ao usuário, o que uma URL bearer não faz. Ver Sprint Change
Proposal 2026-07-17.)`

**Rationale:** idem; preserva o restante do AC intacto.

## Seção 5 — Handoff de implementação

**Escopo: Minor.** Ajuste de redação em dois artefatos, sem replanejamento. Handoff:

1. Aplicadas as Mudanças 1 e 2 (este documento é a evidência).
2. **ADR-001 → v5:** elimina §0/DIV-1/DIV-2 (resolvidas) e atualiza as citações literais para o texto emendado;
   aplica Q1 (10/recurso, contagem), Q2 (rate limit na 3.7 + extração como tech story pré-requisito) e Q3
   (`.txt/.csv/.json` fora da allowlist, gate de magic bytes intacto).
3. Após a v5 revisada e mergeada: `security-check` e liberação da **3.7** para `ready-for-dev` pelo BMAD.

**Critério de sucesso:** nenhuma divergência aberta entre ADR-001, AD-27 e epics 3.7; a 3.7 implementável sem
contradizer artefato autoritativo.
