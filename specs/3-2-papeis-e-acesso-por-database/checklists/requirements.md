# Specification Quality Checklist: Papéis e acesso por Database (Story 3.2)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *nota: por convenção do repo, esta spec é técnica e cita padrões internos (RLS, GRANT, CASL, helpers) deliberadamente, como as specs 2.2/3.1; o público são stakeholders técnicos*
- [x] Focused on user value and business needs (cada pessoa acessa apenas as bases autorizadas, com o poder correto)
- [x] Written for stakeholders (técnicos, padrão do repo)
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (Q1–Q5 resolvidas por fonte autoritativa — PRD D3.4/epics/AD-9; Q2 código HTTP por default coerente com 2.2)
- [x] Requirements are testable and unambiguous (FR-3.2-1..8 com códigos HTTP, papéis e estados definidos)
- [x] Success criteria are measurable (CA1-CA6 verificáveis; autoridade/teto/unicidade/isolamento com resultados definidos)
- [x] Acceptance scenarios are defined (CA1-CA6, mapeados a AC1-AC6 da story md e a epics §1088-1092)
- [x] Edge cases are identified (Admin do DB→ADMIN 403; GUEST→não-VIEWER 400; 2ª concessão ativa 409; revogar corta acesso; sem-papel 404 não-enumerante; cross-tenant; contexto ausente; sem DELETE)
- [x] Scope is clearly bounded (Fora de escopo explícito; role dormente do poder diferencial declarado como contrato futuro 3.3/3.4)
- [x] Dependencies and assumptions identified (Rastreabilidade + Decisões de design D1–D8 + Assunções)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (conceder/listar/alterar/revogar; acesso ao catálogo por concessão)
- [x] Feature meets measurable outcomes defined in acceptance scenarios
- [x] No implementation details leak beyond the repo's established convention

## Notes

- **Autoridade hierárquica de concessão (D2/D3)** é a diferença real frente à 2.2 (que era Admin-da-Org-only). A
  fonte é **explícita** (PRD D3.4 §969 + epics §1086): Admin do Database concede só `MEMBER`/`VIEWER`; só Admin da
  Org toca `ADMIN` do Database. Não é ambiguidade — é requisito confirmado.
- **Q2 (código HTTP do teto da Org)** é o único ponto sem valor fixado na fonte; adotou-se **400** (corpo inválido
  para o alvo), coerente com `exigirMembershipAtivaDaOrg` da 2.2. Alternativa (409) registrada e rejeitada.
- **Q5 (reconciliação §297 × §970)** resolvida a favor da decisão **resolvida** D3.4 §970 ("Convidado só recebe
  Somente leitura"); §297 cita matriz `PENDENTE` que não derruba decisão resolvida. Registrada no `analyze.md`.
- **Role dormente (D8)** — o poder diferencial MEMBER vs VIEWER sobre Registros/schema **não** é ambiguidade: é
  aplicação direta de AD-11/Constitution II e do precedente da 2.2 (SC-222=B → ativado em 2.3/2.7). Consumidores
  concretos na 3.2 = acesso ao catálogo + autoridade de concessão.
