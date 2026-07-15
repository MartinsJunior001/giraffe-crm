# Specification Quality Checklist: Formulário de Fase e bloqueio de transição (Story 2.15)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-15
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Focado em valor ao usuário e necessidade do processo (garantir qualidade dos dados para avançar)
- [x] Requisitos derivados do epics (§986-997) e rastreáveis (FR-16; D3.3; INV-FORM-01; AD-12/13)
- [x] Todas as seções obrigatórias preenchidas (Objetivo, Escopo, Cenários, Concorrência, Fora de escopo, Invariantes)

## Requirement Completeness

- [x] Decisões D0–D6 **resolvidas no `clarify`** (2026-07-15) — nenhuma pendência de arquitetura/dono
- [x] Requisitos testáveis e não-ambíguos (CA1–CA4 em BDD, com "sem movimentação parcial" e "evento antes/depois")
- [x] Critérios de sucesso verificáveis (bloqueio sem evento; persistência na mesma tx; rollback integral; valores preservados)
- [x] Cenários de aceite definidos (CA1–CA4, do epics §997)
- [x] Casos de borda identificados (falha de persistência → sem movimentação parcial; salvar ≠ mover; correção posterior)
- [x] Escopo claramente delimitado (Fora de escopo explícito)
- [x] Dependências e premissas identificadas (2.5/2.6/2.14; reuso de submission.ts/Form/Field/FormVersion)

## Feature Readiness

- [x] Cada requisito funcional tem critério de aceite claro (CA1–CA4)
- [x] Cenários cobrem os fluxos primários (config; bloqueio; entrada transacional; saída; correção)
- [x] Invariantes preservados declarados (INV-FORM-01; AD-12/13; sem DELETE; C3 congelado)
- [~] Detalhes de implementação mantidos mínimos — a spec cita entidades/serviços do projeto por rastreabilidade (padrão desta base), não como design prematuro

## Notas

- **`clarify` concluído** (2026-07-15): D0 (persistência = `CardPhaseValues`), D1 (modo no Form PHASE), D2 (congela
  `FormVersion`), D3 (obrigatoriedade opt-in do Field gated ao PHASE), D5 (correção append-only + evento) confirmados
  pelo dono; D4 (chave `(cardId,phaseId)`) e D6 (saída valida o persistido) por default aplicado.
- **Pronta para `/speckit-plan`**: nenhum marcador `[NEEDS CLARIFICATION]` remanescente; nenhuma pendência de dono.
