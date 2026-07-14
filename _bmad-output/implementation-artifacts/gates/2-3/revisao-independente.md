# Revisão independente — Story 2.3 (Gerenciamento de Fases, PR #22)

> Três revisores **read-only** de contexto fresco (não implementaram a Story) revisaram o diff
> `main...story/2-3-gerenciamento-de-fases` sobre código/migration/testes, ignorando o veredito do
> implementador. Story **CRÍTICA** (nova tabela org-scoped + RLS + migration + ativação do poder
> diferencial por papel de Pipe) → bateria completa.

## Vereditos

| Revisor | Veredito |
|---|---|
| Blind Security | **SECURITY APPROVED** |
| Edge Case Hunter | **APPROVED WITH LOW FINDINGS** |
| Acceptance Auditor | **ACCEPTANCE CHANGES REQUIRED** → item corrigido abaixo |

Convergência: isolamento pelo banco (RLS ENABLE+FORCE, 4 policies, WITH CHECK no INSERT e UPDATE, GRANT sem
DELETE) simétrico a Pipe/PipeGrant, provado em fase vermelha; autorização diferencial correta e sem vazamento
cross-tenant; C3/guard/`ability.ts` **não tocados** (confirmado por `git diff`); não-enumeração 404 uniforme;
idempotência sem falso `denied`; nenhum teste tautológico; nenhuma antecipação de escopo (sem tabela/relação
de Card; trava "Fase com Cards ativos" deferida como contrato futuro, AD-11).

## Findings e tratamento

### MEDIUM (Acceptance F1) — CORRIGIDO
- **Faltava o teste em fase vermelha "Membership SUSPENDED + concessão ADMIN → negado"** que o gate
  DBT-2.2-ROLE-DORMENTE exigiu (parte de SC-236). O comportamento já existia e é imposto em **duas camadas**
  (o `org-context.resolver` só resolve contexto com `Membership.state = ACTIVE`; o `PhasesService.resolverPoder`
  reconfere) — risco de regressão baixo, mas o gate pedia a evidência.
  **Correção:** adicionado o caso em `phases-authz.test.ts` (conta/Membership descartável **Diana**, ACTIVE →
  gerencia; suspensa → negada), auto-contido e **sem tocar o fixture compartilhado Bruno** (nenhuma suíte conta
  o total de Memberships da Org A — verificado). Prova a fase vermelha (suspensa não cria Fase). Suíte **294/294**.

### LOW (Edge Case) — CORRIGIDO
- **Docstring de `listar` vs. ordenação:** o texto prometia "arquivadas no fim", mas a ordenação só por
  `[position, id]` intercalaria uma arquivada de `position` baixa. **Correção:** ordenar por
  `[state, position, id]` (o enum declara `ACTIVE` antes de `ARCHIVED` → ativas primeiro, arquivadas depois);
  docstring alinhada. Cosmético (a `position` não sai no payload); sem impacto de dado.

### LOW (Blind Security, Edge Case) — rastreado (sem ação nova)
- **Exaustão de precisão do `pontoMedio`** (`div(2)`/`(a+b)/2` repetido; empate de `position`): já é
  **DBT-2.3-POSITION-RENORM** (`gates/2-3/gates-finais.md`). O desempate determinístico por `id`
  (`orderBy [state, position, id]`) mantém a ordem estável — sem corrupção nem risco de isolamento.
- **TOCTOU de "≥1 Fase ativa"**: já é **DBT-2.3-ULTIMA-FASE-TOCTOU** (recuperável por `restaurar`).

### INFO / não-bloqueante
- `renomear`/`mover`/`arquivar` de Fase inexistente geram `rls.filtered → denied` na trilha quando
  `count:0` — trade-off já documentado da 2.1 (falso positivo aceito). Consistente.
- `renomear` também renomeia Fase ARCHIVED — comportamento consistente, sob RLS + escopo do Pipe; sem
  implicação de segurança.
- **`epics.md` desatualizado** (F2 do Acceptance): Story 2.3 lista "Dep.: 2.1" (deveria incluir 2.2) e mantém
  a cláusula de Card como AC. Correção do artefato é pelo **workflow BMAD**, fora do diff de implementação —
  registrado para o PM/`correct-course`, não bloqueia o merge (o código deferiu a cláusula corretamente).

## Estado dos gates após as correções
`context7` · `format:check` · `lint` (escopado; ruído de `.claude/worktrees/` é efêmero e fora do commit) ·
`typecheck` · `test` **294/294** (PostgreSQL real) · `migration-check` (deploy/rollback/reaplicação com
evidência real) — todos verdes. Sem CRITICAL/HIGH.

## Conclusão
Aprovado com findings tratados: o MEDIUM do Acceptance (teste mandatório do gate) foi **corrigido na origem
com teste**; o LOW acionável do Edge Case (ordenação/docstring) idem; os demais LOW são débitos rastreados.
C3 intacto, isolamento e autorização provados, sem antecipação de escopo. **SC-231..239 com evidência
completa.** Apto ao merge sob a permissão de merge vigente (CI verde + sem CRITICAL/HIGH).
