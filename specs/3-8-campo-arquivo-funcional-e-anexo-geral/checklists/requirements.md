# Specification Quality Checklist: Story 3.8 — Campo Arquivo funcional e anexo geral

**Purpose**: Validar completude e qualidade da spec antes do planejamento
**Created**: 2026-07-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (linguagens/frameworks) além do necessário para ancorar em invariantes já
      autoritativos (ADR/CLAUDE.md) — decisões de HOW ficam no `plan.md`
- [x] Focada em valor ao usuário e à segurança (arquivos seguros com controle de acesso do recurso)
- [x] Legível por stakeholders (seções de Resumo/Fora de escopo/RF em linguagem de produto)
- [x] Todas as seções obrigatórias preenchidas

## Requirement Completeness

- [x] Sem marcadores [NEEDS CLARIFICATION] no corpo — as incertezas viram Q1–Q8 (seção 6), resolvidas no clarify
- [x] Requisitos testáveis e inequívocos (RF-1..RF-9 mapeados a AC1–AC10 do story file)
- [x] Success criteria mensuráveis (409 específico, 404 não-enumerante, limites numéricos, mutação obrigatória)
- [x] Success criteria tecnologia-agnósticos onde aplicável (o acoplamento a nomes de guarda é herança de
      invariante autoritativo, não escolha nova)
- [x] Cenários de aceite definidos (AC1–AC10)
- [x] Edge cases identificados (QUARANTINED referenciado; fileId cross-recurso; pai arquivado; download público)
- [x] Escopo claramente delimitado (seção 2 — Fora de escopo)
- [x] Dependências e premissas identificadas (BLOQUEIO DURO 3.7; deps 3.3/3.4/2.x; ADR-001)

## Feature Readiness

- [x] Todo requisito funcional tem critério de aceite claro (RF↔AC)
- [x] Cenários de usuário cobrem os fluxos primários (Campo Arquivo interno, anexo geral, canal público)
- [x] A feature atende aos resultados mensuráveis definidos
- [~] Sem vazamento de implementação — parcialmente: a spec cita nomes de guardas/arquivos existentes porque são
      **contratos autoritativos** (INV-FILE-03, AD-5, submission.ts); o HOW detalhado vai para `plan.md`

## Notes

- **Bloqueio de dependência (3.7 não mergeada) é registrado como risco R6 e no cabeçalho** — é premissa, não
  ambiguidade de requisito. Não impede a validação da spec.
- Q1–Q8 são decisões de produto/modelagem para o `speckit-clarify`; as inclinações conservadoras já estão anotadas.
- A citação de nomes técnicos (guardas, `submission.ts`, `FileAuthzContract`) é deliberada: a Story é um **consumo
  de contrato existente**, então ancorar nos contratos é o que torna os requisitos testáveis, não vazamento de HOW.
