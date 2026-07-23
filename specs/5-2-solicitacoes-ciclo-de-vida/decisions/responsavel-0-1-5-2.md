# Decisão — Responsável da Solicitação é 0..1 (opcional)

**Story 5.2. Status: decidido (clarify). Reversível: MÉDIO.**

## Contexto / ambiguidade

O `epics.md` diverge internamente sobre a cardinalidade do Responsável da Solicitação:

- **§1544 (Escopo — Pertencimento/Responsável):** "referencia **zero ou uma** Membership ativa da mesma
  Organização".
- **§1546 (Escopo — Responsável):** idem, "**zero ou uma** Membership ativa".
- **§1551 (AC1):** "…associa-se a 0..1 Card do mesmo Pipe/Org **e tem Responsável (Membership ativa)**."

Lido literalmente, o AC1 sugeriria Responsável **obrigatório** na criação, o que o Escopo nega duas vezes.

## Decisão

**Responsável é 0..1 (opcional).** Criar Solicitação sem Responsável é válido; quando atribuído (na criação
ou depois), deve ser uma Membership `state=ACTIVE` da mesma Org. A cláusula "tem Responsável (Membership
ativa)" do AC1 lê-se como a **restrição de validade** ("quando há Responsável, é Membership ativa"), não como
obrigatoriedade de preenchimento.

## Fundamentos

1. **Fonte mais específica prevalece.** O Escopo (§1544/§1546) descreve a cardinalidade duas vezes e de forma
   inequívoca ("zero ou uma"); o AC1 é uma frase-resumo. Em divergência, a regra específica e repetida vence
   a genérica.
2. **Consistência com a 5.1 (twin imediato).** A Tarefa (`epics.md` §1525, código `Task`) tem Responsável
   0..1 opcional. A 5.2 é o twin declarado; divergir criaria assimetria sem justificativa de produto.
3. **Não inventar obrigatoriedade (Constitution).** Tornar o Responsável obrigatório na criação seria inventar
   um requisito que o Escopo nega — e mudaria o contrato de dados sem decisão de produto registrada.
4. **Reatribuição/esvaziamento (§1546) pressupõe ausência legítima.** O contrato E8 pode **esvaziar** o
   Responsável ("reatribuído **ou** explicitamente esvaziado"). Um estado "sem Responsável" é, portanto,
   previsto pelo próprio Escopo — incompatível com obrigatoriedade rígida.

## Consequências

- `POST /pipes/:pipeId/solicitacoes` aceita corpo sem `responsavelMembershipId` (default `null`).
- `PUT /solicitacoes/:id/responsavel` com `null` remove o Responsável (idempotente).
- A leitura expõe `responsavelValido` (recomputado); referência inválida nunca é confiada em silêncio.

## Escalonamento

Se Produto decidir, no futuro, que Solicitação **exige** Responsável, é mudança de contrato de dados
(coluna NOT NULL + regra de criação) e reabre esta decisão — não é assumida agora.
