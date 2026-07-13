# Pre-Implementation Check Report

## Identificacao da tarefa
Story 1.8 — Estados honestos e acessibilidade transversal.
Branch `story/1-8-estados-honestos-e-acessibilidade-transversal`. Baseline `4d862bf`.

## Fase e etapa atual
Fase 1, Épico 1, Lote 1. Sequência L1: 1.7 (done) → **1.8** → tech-2. Documentação Base ✅ → BMAD ✅ →
Spec Kit ✅ → **Implementação (aqui)**. Dependência **1.7** `done` no `main`. Não antecipa Fase 2.

## Objetivo
Camada transversal de estados de sistema (carregando/vazio/erro/sem permissão) e piso de acessibilidade
WCAG 2.2 AA, testáveis sobre os componentes e a casca do Épico 1.

## Escopo incluido / Fora do escopo
Incluído: utilitário de contraste WCAG, componentes `Estado*`, consumo no Dashboard, gate de a11y
transversal (foco/nomes/ordem). Fora: estados de domínio (Épicos 2+); `Pendente`/`Aguardando` sem
consumidor; `jest-axe`/axe-core; contraste renderizado e tab nativo (verificação manual/e2e); correção
do Login (1.5). **Sem migration, sem backend.**

## Story e criterios de aceite
AC1 nunca só cor; AC2 zero legítimo ≠ falha/carregando; AC3 "sem permissão" não revela recurso; AC4
a11y transversal WCAG 2.2 AA (foco/ordem/nomes/contraste). Traduzidos em SC-801..806.

## Regras de negocio afetadas
Nenhuma no frontend (CLAUDE.md). Os componentes **renderizam** o modelo de estado honesto já existente
(`EstadoOrg`), não o redefinem.

## Permissoes afetadas
Nenhuma nova. O estado "sem permissão" é **genérico e não-revelador** (INV-REPORT-01) — não enumera
recursos e não depende da matriz de permissões (OQ-1..4, `PENDENTE`). Autorização real é do servidor
(1.6/1.3).

## Dados e entidades afetados
Nenhum. Sem entidade, sem migration, sem query, sem PII. Só apresentação.

## Arquitetura e modulos afetados
Somente `apps/web`: novos `lib/contraste.ts`, `components/ui/estado.tsx`; modificado
`app/painel/page.tsx` (consumo). Testes novos em `test/`. **Gate de Arquitetura: N/A** (sem decisão
nova; padrão shadcn/ui + Tailwind 4 já é do SPINE/1.7).

## Dependencias tecnicas
**Nenhuma dependência nova.** Reutiliza `cn`, `Botao`, `lucide-react`, tokens do `globals.css` e o
modelo `EstadoOrg`. `jest-axe`/axe-core **não** são adicionados (evita gate de dependência; contraste
provado por cálculo puro).

## Skills obrigatorias para esta tarefa
`context7-check` (Tailwind 4 tokens — já coberto na 1.7; WCAG 2.2 como baseline documental).
`security-check` leve (estado não-revelador; sem regra de domínio no frontend). `observability-check`
**N/A** (sem backend, sem log novo). `migration-check`/`lgpd-check`/`backup-check`/`performance-check`
**não se aplicam**.

## Riscos identificados
1. **Abstração especulativa** (componentes de estado sem consumidor) → mitigação R1: só variantes com
   consumidor concreto (`EstadoVazio/EstadoErro/SemPermissao/Carregando`); sem `Pendente`/`Aguardando`
   isolados (Constitution II).
2. **Gate de contraste** (jsdom não pinta; axe não mede sem layout) → mitigação R2: cálculo puro de
   razão WCAG; `ring` vs `accent` ≈ 3,8:1 (passa 3:1 não-textual, mas `ring` **nunca** como texto).
3. **Cor crua** replicada do Login → mitigação R5: sempre tokens; não tocar/replicar o Login.
4. **`aria-live` prematuro** → mitigação R3: `role` estático (`status`/`alert`); sem troca client-side
   na 1.8.

## Plano minimo de implementacao
Ordem: (1) `contraste.ts` + teste (fase vermelha); (2) `estado.tsx` + teste; (3) consumo no Dashboard +
teste; (4) a11y transversal; (5) gates. **Não alterar:** backend, autorização (1.6/1.3), casca da 1.7
além do consumo dos estados no Dashboard, Login (1.5).

## Estrategia de testes
Vitest: `contraste.test.ts` (`node`, razão WCAG + fase vermelha); `estado.test.tsx` (`jsdom`, roles/
nomes/token/não-revelador); teste do Dashboard (zero×falha); `acessibilidade.test.tsx` (foco/nomes/
ordem na casca). Sem dependência nova.

## Estrategia de rollback
Sem migration → rollback é reverter o código. Componentes novos são aditivos; o consumo no Dashboard
preserva o comportamento honesto herdado da 1.5/1.7.

## Decisoes pendentes
Nenhuma que gere retrabalho estrutural. Matriz de permissões (OQ-1..4) não bloqueia (estado
não-revelador). `jest-axe` fica como opção futura sob gate, se um requisito exigir.

## Status final
**APROVADO** — frontend/UX/a11y; sem migration; sem backend; sem dependência nova; sem nova fronteira
de segurança; rollback trivial. Prosseguir para implementação com `security-check` leve antes de
concluir.
