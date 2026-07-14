---
story_key: 2-7-submissao-interna-do-formulario-inicial-e-criacao-do-card
epic: 2
status: done
release: CORE (bloco 2.7; Sprint S6 do roadmap)
risco: ALTO
baseline_commit: empilha sobre a 2.6 (ciclo de publicação; `FormVersion`, snapshot imutável, tx interativa com contexto)
gate_arquitetura: |
  Modelo de dados decorrente dos artefatos (PRD D3.3 "submeter o Formulário inicial cria um Card"; AD-11 identidade
  estável / sem normalização especulativa; AD-12 definição congelada e opção por id; AD-13 evento na mesma
  transação): novas tabelas `Card` e `CardHistory` org-scoped. `valores` em JSONB chaveado por `Field.id`
  (coerente com o snapshot JSON da 2.6; sem tabela de valores por Campo). Card nasce na 1ª Fase ativa e referencia
  a `FormVersion` publicada no ato (`formVersionId`, imutável). Idempotência ESTRUTURAL por
  `@@unique([orgId, formId, idempotencyKey])` (retry → Card existente via P2002), não trava aplicacional.
  Atomicidade Card + CardHistory pela transação interativa com contexto no client RAIZ (mesmo primitivo da 2.6).
  Isolamento por RLS ENABLE+FORCE; `Card` sem GRANT DELETE; `CardHistory` só SELECT+INSERT (append-only imutável).
  Autorização "operar o Pipe" (`exigirOperarPipe`) ativa o poder do Membro do Pipe (antes dormente —
  DBT-2.2-ROLE-DORMENTE). Escopo congelado: submissão interna do inicial → cria Card + evento CREATED. Formulário
  de Fase, submissão pública/triagem (2.8), movimentação entre Fases (2.10), ciclo de vida do Card (2.11) = fora.
---

# Story 2.7 — Submissão interna do Formulário inicial e criação do Card

**Como** operador de um Pipe (Admin da Org, Admin do Pipe ou Membro), **quero** submeter o Formulário inicial
publicado **para que** um Card nasça na 1ª Fase ativa, com a definição usada congelada e o histórico iniciado.

## Critérios de aceite (SC-27x)
- **SC-271** — Submeter o Formulário inicial PUBLICADO cria um Card na 1ª Fase ativa, referenciando a
  `FormVersion` publicada corrente (definição congelada — AD-12), com os `valores` validados; um evento
  `CardHistory` `CREATED` é escrito na MESMA transação (AD-13).
- **SC-272** — Idempotência: retry com a mesma `idempotencyKey` devolve o MESMO Card (nunca duplica); chave nova
  cria outro. Backstop estrutural pelo `@@unique([orgId, formId, idempotencyKey])`.
- **SC-273** — Submeter exige OPERAR o Pipe: Admin da Org e Membro submetem; Viewer só lê (403); sem acesso → 404
  não-enumerante. Ativa o poder do Membro do Pipe.
- **SC-274** — Gate de publicação (não publicado → 409; form inexistente → 404) e validação determinística dos
  `valores` (Campo desconhecido/tipo errado/Seleção por rótulo → 400; chave ausente → 400).
- **SC-277/278** — Imutabilidade pelo GRANT: `Card` sem DELETE; `CardHistory` append-only (sem UPDATE/DELETE).
  Cross-tenant negado pelo banco; contexto ausente falha fechado.

## Não-objetivos (registrados)
Formulário de Fase e submissão pública/triagem (2.8); preenchimento de Card existente; movimentação entre Fases
(2.10); ciclo de vida/estado do Card (2.11); taxonomia de `CardHistory` além de `CREATED`; obrigatoriedade de
Campo (inexistente em `Field`); upload real de Arquivo (gated — AD-28).
