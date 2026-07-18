# Specification Analysis Report — Story 3.8 (Campo Arquivo funcional e anexo geral)

Análise cross-artefato (read-only) de: story file (`3-8-...md`), `spec.md`, `plan.md`, `data-model.md`,
`research.md`, `contracts/files.http.md`, `quickstart.md`, `tasks.md`, `checklists/{requirements,security}.md`.
Data: 2026-07-18 (planejamento antecipado, Planner n+1). **Premissa registrada:** a dependência da 3.7 não
mergeada é bloqueio de sequenciamento conhecido (NEEDS-3.7), não defeito de consistência.

## Findings

| ID | Categoria | Severidade | Local | Resumo | Recomendação |
|----|-----------|-----------|-------|--------|--------------|
| C1 | Coverage | — | — | **Nenhum achado CRITICAL.** Sem violação de constituição; todo RF tem ≥1 task; nenhuma task órfã. | Prosseguir (após 3.7) |
| H1 | Underspecification | HIGH→aceito | spec §3 RF-6 / plan F7 / tasks T013 | Valores numéricos dos limites do canal público (Q4) ainda não definidos | Fixar no plan da abertura; já registrado como decisão pendente + variável fail-closed (ausente→nega) |
| H2 | Inconsistency | HIGH→aceito | plan §NEEDS-3.7 / data-model | Assinatura do `FileAuthzContract` e forma final de `FileObject` dependem da 3.7 | Congelar em T001; explicitamente marcado NEEDS-3.7 (premissa, não defeito) |
| M1 | Underspecification | MEDIUM | data-model §Finalidade | Modelagem do anexo geral em aberto (Opção A JSONB vs. B coluna `purpose`) | Decidir no plan (T012); default conservador = A (AD-11) já anotado |
| M2 | Ambiguity | MEDIUM | spec §Clarifications | 8 decisões são defaults do planner "a validar", não decisões do dono | Revalidar na abertura com o dono; risco de retrabalho baixo (defaults fail-closed) |
| L1 | Consistency | LOW | story file INV-3.8-01..09 vs spec §4 | A spec lista um subconjunto dos invariantes do story file | Aceitável — a spec referencia o story file; sem contradição |
| L2 | Terminology | LOW | spec usa AC1–AC10 (não SC-###) | O repo não adota o esquema SC-### do template speckit | Consistente com o padrão do repo (3-5 idem) — sem ação |
| L3 | Coverage | LOW | tasks T011 (leitura 3.5) | AC "opcional" (Q5) exibir coluna FILE — pode não ser MVP | Mantido fora do MVP (US4); explícito no tasks |

## Coverage Summary (Requisito → Task)

| Requisito | Tem task? | Task IDs | Notas |
|-----------|-----------|----------|-------|
| RF-1 (Campo Arquivo funcional) | Sim | T005, T006, T015, T017 | remove indisponibilidade de 2.4 |
| RF-2 (valor `FILE` referencial) | Sim | T005, T016, T017 | substitui tratamento textual (R1) |
| RF-3 (gate de consumo 409) | Sim | T006, T018 | AC-2 da ADR, com mutação |
| RF-4 (anexo geral) | Sim | T010, T011, T012, T017 | herança de permissão |
| RF-5 (substituição sem perda silenciosa) | Sim | T007, T017 | evento na mesma tx |
| RF-6 (canal público) | Sim | T013, T014, T019 | limites + rate limit + magic-bytes |
| RF-7 (read-only sob arquivamento) | Sim | T009, T017 | inclui pai (Q7) |
| RF-8 (download sob sessão) | Sim | T010, T011, T017 | Opção A |
| RF-9 (eventos de Histórico) | Sim | T008, T016/T017 | append-only, sem PII |
| AC1–AC10 (story file) | Sim | mapeados nas tasks por (AC: …) | 100% |

## Cobertura reversa (Task → Requisito)

Nenhuma task órfã. T001 (gate) e T020–T024 (regressão/CLAUDE.md/gates/revisão/commit) são cross-cutting
(sem RF único) — esperado. Todas as tasks de US1–US4 mapeiam a ≥1 RF/AC.

## Constitution Alignment

- **Constitution II (sem antecipar escopo):** OK — exclusões declaradas (spec §2); E5/E6/avatar/cota fora.
- **Constitution XI (artefatos autoritativos / sprint-status):** OK — `sprint-status.yaml` **não** movido; pendência
  registrada no story file. Docs-only, worktree isolado.
- **Isolamento-mãe (AD-6) / GRANT como fronteira:** preservado — RLS herdada; meta de nenhum GRANT novo; fase
  vermelha exigida se houver coluna.
- **AD-28 fail-closed / AD-5 (sem regra no kernel, binding no consumidor):** refletido em F1/F3 e nos invariantes.
- **context7-check obrigatório:** agendado em T001 (na abertura, versões pós-3.7).

Nenhuma violação.

## Métricas

- Requisitos funcionais (RF): 9 · Critérios de aceite (AC): 10 · Invariantes (INV-3.8): 9
- Tasks: 24 · Cobertura de requisitos (≥1 task): **100%**
- Achados: CRITICAL 0 · HIGH 2 (ambos aceitos/registrados como NEEDS-3.7) · MEDIUM 2 · LOW 3
- Ambiguidades: 1 (M2 — defaults a validar) · Duplicações: 0

## Veredito

**APROVADO para seguir como planejamento antecipado. Nenhum achado CRITICAL.** Os dois HIGH (H1/H2) e o M1 são
**pontos que só fecham com a 3.7 mergeada** — registrados explicitamente (NEEDS-3.7), não deficiências de redação.
Os artefatos são internamente consistentes e a cobertura requisito↔task é total.

## Next Actions

- **Antes de implementar:** rodar **T001** (confirmar 3.7 mergeada; fixar baseline, assinatura do
  `FileAuthzContract`, forma de `FileObject`, constante do gate; `context7-check`) e **revalidar Q1–Q8 com o dono**.
- **Mover `sprint-status.yaml`** (`backlog → ready-for-dev`) de forma autoritativa via workflow BMAD **no ramo real**
  quando a Story abrir — não neste worktree isolado.
- Sem CRITICAL: não há bloqueio de consistência; o bloqueio é de **dependência** (3.7).

---

## Re-análise do DELTA — 2026-07-18 (3.7 MERGEADA e done, PR #103/#105)

A 3.7 fechou. Reavaliação **apenas dos pontos que a mudança de estado toca** (não se refazem artefatos corretos).
Fonte da verdade da reconciliação: **`reconciliation-3-7.md`**.

| ID | Antes | Agora |
|----|-------|-------|
| **H2** (assinatura `FileAuthzContract` + forma de `FileObject`) | HIGH→aceito (NEEDS-3.7) | **RESOLVIDO.** Assinatura congelada (`podeLer`/`podeEditar(resourceType,resourceId)` + token Symbol + `FilesModule` deny-all default), forma de `FileObject` e estados (`DISPONIVEL`/`QUARENTENA`/…) fixados em `reconciliation-3-7.md`. |
| **M1** (modelagem anexo geral A vs B) | MEDIUM | **RESOLVIDO para Opção A.** `FileObject.resourceType` é **texto** genérico → allowlist no consumidor (`CARD`/`RECORD`), anexo geral = linha não referenciada em `valores`. **Sem migration, sem GRANT novo** (AD-11). Coluna `purpose` só se a Opção A falhar na prática — improvável. |
| **R6** (dependência 3.7) | risco | **RESOLVIDO** (mergeada). |
| **H1** (valores dos limites do canal público — Q4) | HIGH→aceito | **ABERTO, não-bloqueante.** Fixar na implementação como envs novos (Zod, faixa, fail-closed) com defaults conservadores ≤ limites da 3.7; T013. |
| **Q1/Q4/Q5/Q6/Q7/Q8** | defaults do planner | Seguem como defaults conservadores fail-closed; validáveis com o dono, sem retrabalho estrutural. |

**NOVO pré-requisito rastreado (não-defeito):** **DEB-3.7-SMOKE-STORAGE** — a 3.8, como 1º consumidor, deve
reintroduzir o provisionamento MinIO/ClamAV no CI + um smoke real do caminho SigV4/`node:net` da 3.7 (T001b/T017).
Não é inconsistência dos artefatos; é a quitação de um débito herdado, exigida antes de as ACs de storage real valerem.

**Veredito do delta: APROVADO. 0 CRITICAL, 0 HIGH remanescente bloqueante** (H2/M1/R6 resolvidos; H1 é decisão de
valor de config, endereçada na T013 com fail-closed). Cobertura requisito↔task segue 100% (T001b acrescentada não
cria RF órfão — é pré-requisito de infraestrutura). Apto ao `context7-check` + `pre-implementation-check` e implementação.
