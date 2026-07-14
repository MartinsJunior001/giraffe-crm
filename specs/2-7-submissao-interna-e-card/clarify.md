# Clarify — Story 2.7

Dúvidas resolvidas pela hierarquia de artefatos (PRD D3.3, AD-11/12/13), sem inventar comportamento de Produto.

1. **Submeter cria ou preenche?** CRIA um Card novo (D3.3). Não há rota que preencha um Card existente pelo
   Formulário inicial.
2. **Onde o Card nasce?** Na 1ª Fase ativa do Pipe (ordem `position, id`). O Pipe garante ≥1 Fase ativa (2.3); se
   não houver, 409 (estado inconsistente, não submissão inválida).
3. **Qual definição vale?** A `FormVersion` **publicada** no ato (`formVersionId`), congelada (AD-12) — editar o
   rascunho depois não muda o Card. Só Formulário publicado recebe submissão; não publicado → 409.
4. **Onde ficam os valores?** JSONB chaveado por `Field.id` (opção de Seleção por `id`, nunca rótulo). Coerente
   com o snapshot da 2.6; sem tabela de valores por Campo (AD-11).
5. **Validação dos valores?** Contra o snapshot: allowlist (chave = `id` de Campo do snapshot; desconhecida
   recusa — anti-mass-assignment), tipo por Campo, Seleção por `id` existente, limites defensivos. Valor ausente
   é permitido (não há obrigatoriedade em `Field`).
6. **Idempotência?** `idempotencyKey` do cliente + `@@unique([orgId, formId, idempotencyKey])`. Retry da mesma
   chave devolve o Card existente (nunca duplica). É estrutural (banco), não trava aplicacional.
7. **Evento de histórico?** `CardHistory` `CREATED`, escrito na MESMA transação do Card (AD-13): não há Card sem
   evento nem evento sem Card. `CardHistory` é append-only e imutável (GRANT só SELECT+INSERT).
8. **Autorização?** OPERAR o Pipe: Admin da Org / Admin do Pipe / Membro submetem; Viewer só lê → 403; sem acesso
   → 404 não-enumerante. Ativa o poder "Membro opera Cards" (antes dormente — DBT-2.2-ROLE-DORMENTE).
9. **Upload de Arquivo?** Gated (AD-28) — a validação de Campo FILE trata o valor como string (referência); a
   capacidade real de arquivo é do E3. Sem materializar.
