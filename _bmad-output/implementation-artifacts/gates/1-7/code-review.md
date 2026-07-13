# code-review — Story 1.7 (casca navegável e design system)

## Escopo revisado
Diff da branch `story/1-7-casca-navegavel-e-design-system` sobre `main` (549f187):
casca do segmento `/painel` (layout, Navegação, Topbar, Dashboard), design system base
(`Botao`/cva, tokens Tailwind 4, `cn`), navegação filtrada por papel e campo aditivo
`papel` em `GET /organizations/current`. Revisão adversarial cobrindo critérios de aceite,
acessibilidade, aderência arquitetural (AD-2, INV-REPORT-01) e regressão de contrato.

## Findings

### CR-1 (MEDIUM) — AC4: navegação sumia no mobile sem alternativa — CORRIGIDO
- **Origem:** AC4 / EXPERIENCE.md ("navegação adaptada (menu/topbar)" em telas estreitas).
- **Defeito:** a `Sidebar` usava `max-md:hidden`, mas **não havia navegação alternativa no
  mobile**. Abaixo do breakpoint `md`, o usuário ficava sem nenhum acesso à navegação
  primária — esconder a nav sem substituto viola AC4 (a casca precisa permanecer utilizável
  em qualquer largura).
- **Cenário de falha:** viewport < 768px → nenhum `nav` visível → Dashboard inacessível a
  partir de outra rota; a casca deixa de ser navegável.
- **Correção:** `Sidebar.tsx` foi substituído por `Navegacao.tsx`, um Client Component
  stateless com prop `orientacao`:
  - `vertical` = sidebar de desktop (`max-md:hidden`);
  - `horizontal` = barra rolável (`md:hidden`) renderizada na casca logo abaixo da Topbar.
  O `layout.tsx` renderiza as duas orientações; só uma aparece por vez (media query CSS,
  sem JS de estado, sem duplicar fonte de verdade — os `itens` já vêm filtrados do servidor).
  O item ativo continua marcado por `aria-current="page"` + fundo `accent` + peso + ícone
  `primary` (nunca só por cor), em ambas as orientações.
- **Prova:** `casca.test.tsx` (aria-current, item filtrado ausente, nome acessível da nav),
  typecheck Web limpo, 46 testes Web verdes, `build` Web OK.

## Verificações sem finding
- **AD-2 (sem regra de domínio no frontend):** `itensVisiveis` é filtragem de apresentação;
  a nav reflete o `papel` do servidor, não decide autorização. Confirmado.
- **INV-REPORT-01 (não revelar recurso):** item sem acesso fica fora do DOM, não escondido
  por CSS. Confirmado em teste.
- **Regressão de contrato:** o campo aditivo `papel` em `/organizations/current` foi
  propagado ao teste de integração real (`tenant-context-http.test.ts` inclui
  `papel: 'ADMIN'` para Ana@OrgA). Sem quebra de contrato existente.
- **Sem controle falso:** Busca/Notificações/Perfil são `div` não-interativas.

## Veredito
**APROVADO** — CR-1 (MEDIUM) corrigido e provado; nenhum CRITICAL/HIGH; nenhum finding
aberto. Demais dimensões sem regressão.
