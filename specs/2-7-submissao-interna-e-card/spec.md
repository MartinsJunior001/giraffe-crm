# Spec — Story 2.7 (submissão interna do Formulário inicial e criação do Card)

> Rastreabilidade: FR-15/FR-214; PRD D3.3 (submissão do Formulário inicial cria Card); AD-11/AD-12 (identidade
> estável, definição congelada); AD-13 (evento na mesma transação). epics.md Story 2.7. Depende da 2.3 (Fase),
> 2.6 (publicação/`FormVersion`).

## Objetivo
Submeter o **Formulário inicial publicado** de um Pipe (API interna) e, com isso, **criar um Card** na 1ª Fase
ativa, referenciando a `FormVersion` publicada no ato e guardando os `valores` validados. Um evento `CREATED` é
escrito no `CardHistory` na MESMA transação.

## Escopo
- Rota interna de submissão do Formulário inicial → cria Card (nunca preenche existente — D3.3).
- Validação dos `valores` contra o snapshot da versão publicada (allowlist, tipo, Seleção por `id`).
- Card nasce na 1ª Fase ativa; referencia `formVersionId`; `valores` em JSONB por `Field.id`.
- Idempotência por `idempotencyKey` (`@@unique([orgId, formId, idempotencyKey])`).
- Atomicidade Card + evento `CardHistory`; isolamento por RLS; imutabilidade/append-only pelo GRANT.
- Autorização "operar o Pipe" (ativa o poder do Membro do Pipe).

## Fora de escopo
Formulário de Fase e submissão pública/triagem (2.8), preenchimento de Card existente, movimentação entre Fases
(2.10), ciclo de vida/estado do Card (2.11), taxonomia completa de `CardHistory` (2.10+), obrigatoriedade de
Campo (inexistente em `Field`), upload de Arquivo (gated — AD-28).

## Decisão de modelo
`Card` + `CardHistory` org-scoped; `valores` em **JSONB chaveado por `Field.id`** (coerente com o snapshot JSON
da 2.6; sem tabela de valores por Campo — normalização especulativa vedada por AD-11). Idempotência estrutural
(UNIQUE), não trava aplicacional. Atomicidade pela transação interativa com contexto no client raiz (mesmo
primitivo da publicação 2.6).
