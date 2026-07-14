# Clarify — Story 2.6

Dúvidas resolvidas pela hierarquia de artefatos (Architecture Agent read-only), sem inventar comportamento de
Produto.

1. **Modelo de versionamento?** SNAPSHOT JSON IMUTÁVEL VERSIONADO. Semântica em AD-12 + PRD D3.2; forma física
   deferida (Spine) → baseline. Nenhum gatilho relacional (edição parcial de versão é vedada pelo PRD).
2. **Imutabilidade?** Do banco: runtime só SELECT+INSERT em `FormVersion`; sem UPDATE/DELETE.
3. **Atomicidade?** Transação interativa com contexto no client raiz (consumidor concreto previsto pela nota 1.3).
   `UNIQUE(orgId, formId, version)` → 409 em concorrência de número.
4. **Rascunho vs. publicado?** Rascunho = `Form`+`Field` editável; publicar congela num snapshot; editar depois
   não toca versões (PRD D3.2 "novas edições vão para novo rascunho").
5. **Validações de publicabilidade?** Sem Campo ativo; Seleção sem opção ativa; gate de Arquivo (AD-28);
   `typeConfig` malformado → 400 determinístico. Só Campos ativos entram no snapshot.
6. **Formulário vazio?** A Story não expressa regra; adotamos "sem Campo ativo não publica" como validação
   conservadora e determinística (não é comportamento de Produto novo — é recusa de rascunho inválido).
7. **Obrigatoriedade no snapshot?** `Field` não tem o atributo na 2.4/2.5 — o snapshot NÃO o inventa.
8. **Despublicar apaga versões?** Não. Zera o ponteiro; versões e dados preservados (PRD D3.2).
