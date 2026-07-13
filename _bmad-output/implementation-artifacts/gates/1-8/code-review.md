# code-review — Story 1.8 (estados honestos e acessibilidade transversal)

## Escopo revisado
Diff da branch `story/1-8-...` sobre `main` (baseline `4d862bf`): `lib/contraste.ts` (razão WCAG pura),
`components/ui/estado.tsx` (`Estado` + `EstadoVazio`/`EstadoErro`/`SemPermissao`/`Carregando`), consumo
no `app/painel/page.tsx`, e testes (`contraste`, `estado`, `dashboard`, `acessibilidade`). Revisão focal
adversarial proporcional ao risco **NORMAL** (frontend/UX/a11y; sem backend; sem dependência nova).

## Findings
Nenhum **CRITICAL/HIGH/MEDIUM**. Nenhum finding acionável.

## Pontos verificados (adversarial)
- **Contraste (gate nomeado):** fórmula WCAG conferida (luminância sRGB→linear, expoente 2,4; razão
  `(L1+0.05)/(L2+0.05)`). Valores **provados por execução**: `ring #CC5B00` ≥ 3:1 contra
  branco/accent/muted (1.4.11); `destructive/warning/success/info` ≥ 4,5:1 como texto sobre branco
  (1.4.3). **Fase vermelha** presente (par forçado abaixo do piso reprova) — Constitution.
- **AC1 "nunca só cor":** cada estado combina ícone (`aria-hidden`) + texto + token semântico. A cor
  nunca é o único portador de informação. Provado em `estado.test.tsx`.
- **AC2 zero × falha:** "sem Organização" é `status` (vazio, sem `aria-busy`, sem token destructive);
  "indisponível" é `alert` (token destructive); "carregando" é `status` + `aria-busy`. Os três são
  distinguíveis programática e visualmente. Provado sobre a casca real em `dashboard.test.tsx`.
- **AC3 não-revelador (INV-REPORT-01):** `SemPermissao` é genérico, sem nome de recurso e sem `href`.
- **AC4 a11y:** foco visível (`focus-visible:ring-2`) em Botão e links; nome acessível em ambas as
  orientações da `Navegacao`; sem `tabindex` positivo. Provado em `acessibilidade.test.tsx`.

## Observações (LOW, sem ação)
- **Recuperação do `EstadoErro`** usa `next/link` para `/painel`. Como a rota é `force-dynamic` e
  `obterContexto` usa `cache()` **por request**, uma nova navegação re-executa o RSC e refaz o fetch —
  a recuperação é real. Registro como decisão, não defeito.
- **Margem de contraste do `destructive`** sobre branco ≈ 4,83:1 — acima do piso 4,5, porém apertado. O
  token é congelado no `DESIGN.md`; nenhuma mudança nesta Story. Observação para o UX, não gap.
- **Login com cor crua** (`text-red-700`, escopo 1.5) permanece; a 1.8 deliberadamente **não** replica o
  padrão (estados usam sempre tokens) nem corrige o Login (fora de escopo).

## Veredito
**APROVADO** — todos os ACs provados por teste real; gate de contraste satisfeito com fase vermelha;
sem CRITICAL/HIGH/MEDIUM; sem dependência nova; sem regra de domínio no frontend.
