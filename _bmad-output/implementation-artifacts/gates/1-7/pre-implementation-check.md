# Pre-Implementation Check Report

## Identificacao da tarefa
Story 1.7 — Casca navegável e design system. Branch `story/1-7-casca-navegavel-e-design-system`.

## Fase e etapa atual
Fase 1, Épico 1, Lote 1. Sequência L1: 1.6 (done) → **1.7** → 1.8 → tech-2. Documentação Base ✅ →
BMAD ✅ → Spec Kit ✅ → **Implementação (aqui)**. Dependências 1.4/1.6 `done` no `main`. Não antecipa Fase 2.

## Objetivo
Casca navegável (Sidebar + Topbar + rota do Dashboard) e design system (tokens shadcn/ui + Tailwind 4,
Button, componentes fundamentais), com navegação adaptada às permissões e responsividade.

## Escopo incluido / Fora do escopo
Ver Story. Incluído: tokens, Button, casca, nav adaptada, `aria-current`, responsividade, base de a11y.
Fora: Busca/Notificações funcionais (espaços reservados), indicadores do Dashboard (FR-4), estados/a11y
transversais completos (1.8), Radix (sem consumidor). **Sem migration.**

## Story e criterios de aceite
AC1 casca+nav adaptada; AC2 item ativo `aria-current` (não só cor); AC3 sem controle falso/dado
fictício, Dashboard sem indicadores; AC4 responsivo. Traduzidos em SC-701..708.

## Regras de negocio afetadas
Nenhuma no frontend (CLAUDE.md: nenhuma regra de domínio no frontend). A nav reflete permissões do
servidor; não as decide.

## Permissoes afetadas
Autorização é do servidor (1.6/1.3). **Esconder item de nav é UX, não fronteira de segurança** — mesmo
que um item vazasse, o backend nega a ação. "Sem revelar recurso" (INV-REPORT-01) honrado **não
renderizando** o item oculto.

## Dados e entidades afetados
Nenhuma entidade nova, sem migration. Único toque de dados: `GET /organizations/current` passa a incluir
`papel` (já resolvido no `RequestContext` desde a 1.6) — leitura, sem query nova. `papel` não é PII.

## Arquitetura e modulos afetados
`apps/web`: `globals.css` (tokens), `lib/utils.ts` (`cn`), `components/ui/button.tsx`,
`app/painel/layout.tsx` + `_componentes/` (Sidebar/Topbar), `app/painel/page.tsx` (conteúdo do
Dashboard), `lib/navegacao.ts` (config declarativa + filtro por papel), `lib/auth.ts` (fetch com
`papel`). `apps/api`: `organizations.controller.ts` (+`papel` no retorno). **Gate de Arquitetura: N/A**
(sem decisão nova; a stack de UI já é decisão do SPINE).

## Dependencias tecnicas
Novas deps (base shadcn/ui): `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
**Radix não** (Constitution II). Tailwind 4 verificado no `context7-check`.

## Skills obrigatorias para esta tarefa
`context7-check` ✅ (Tailwind 4). `security-check` leve (nenhuma regra de domínio no frontend; nav é UX;
estado de erro não vaza internals). `observability-check` limitado (estado sanitizado, sem URL/stack).
`migration-check`/`lgpd-check`/`backup-check` **não se aplicam**. `performance-check` não bloqueia.
Acessibilidade completa é da **1.8** (aqui só a base: `aria-current`, foco, teclado do shell).

## Riscos identificados
1. Frontend inferir regra de domínio → mitigação: nav filtra por `papel` do servidor; autorização real
   é do backend; item oculto não renderizado.
2. Controle falso / dado fictício (Busca/Notificações/Dashboard) → mitigação: espaços **reservados** sem
   handler; Dashboard sem indicadores.
3. Contraste do `ring #CC5B00` → a verificação completa é da 1.8; aqui só aplicar o token.
4. Over-install de UI (Radix sem consumidor) → mitigação: adiar Radix (Constitution II).

## Plano minimo de implementacao
Ordem: (1) deps; (2) tokens `globals.css` + `cn`; (3) Button (cva) + testes; (4) API `papel` + teste;
(5) `lib/navegacao` (config + filtro) + testes; (6) casca `layout` + Sidebar/Topbar; (7) Dashboard shell;
(8) responsividade; (9) gates. **Não alterar:** proxy/rota de sessão (1.5), autorização (1.6/1.3),
nada de backend além do campo `papel`.

## Estrategia de testes
Vitest (web, jsdom): unidade do filtro de navegação (papel → itens; oculto não aparece); render da casca
(Sidebar/Topbar; `aria-current`; Dashboard sem indicadores); Button (variantes/foco/aria). API (real):
contrato de `/organizations/current` com `papel`.

## Estrategia de rollback
Sem migration → rollback é reverter o código. Aditivo: o campo `papel` no endpoint não quebra
consumidores existentes; a casca substitui a página mínima da 1.5 preservando o comportamento honesto.

## Decisoes pendentes
Nenhuma que gere retrabalho estrutural. Verificação de contraste do `ring` fica para a 1.8 (registrado).

## Status final
**APROVADO** — casca/UX; sem migration; sem nova fronteira de segurança; dependências mínimas e
verificáveis; rollback trivial. Prosseguir para implementação com `security-check`/`observability-check`
leves antes de concluir.
