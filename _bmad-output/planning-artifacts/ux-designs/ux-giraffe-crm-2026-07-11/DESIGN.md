---
title: "DESIGN — Giraffe CRM · Fase 1"
status: final
created: 2026-07-11
updated: 2026-07-11
ui_system: "shadcn/ui + Radix + Tailwind (conforme stack do PRD)"
sources:
  - "docs/01-documentacao-base/08-referencias-visuais/visual-direction.md"
experience_ref: "./EXPERIENCE.md"
colors:
  background: "#FFFFFF"          # Canvas
  surface-soft: "#FAFAFA"
  muted: "#F5F5F5"               # Soft Cloud
  muted-foreground: "#707072"    # Mute
  foreground: "#111111"          # Ink (texto principal + texto sobre laranja)
  foreground-soft: "#39393B"     # Charcoal
  disabled: "#9E9EA0"            # Stone
  border: "#E5E5E5"              # Hairline
  input: "#E5E5E5"
  card: "#FFFFFF"
  card-foreground: "#111111"
  popover: "#FFFFFF"
  popover-foreground: "#111111"
  secondary: "#F5F5F5"
  secondary-foreground: "#111111"
  primary: "#FF7200"             # Primary Orange
  primary-foreground: "#111111"
  primary-hover: "#F26A00"
  primary-pressed: "#CC5B00"
  accent: "#FFF3E8"              # Orange Soft
  accent-foreground: "#111111"
  accent-border: "#FFD0A8"       # Orange Border
  ring: "#CC5B00"                # foco — contraste mais forte
  ring-soft: "#FFB066"           # efeito de foco secundário
  destructive: "#D92D20"         # Erro
  destructive-foreground: "#FFFFFF"
  success: "#157A52"
  info: "#2563EB"
  warning: "#A15C00"             # Atenção (atraso/risco)
typography:
  font-family: "Inter"
rounded:
  button: "8px"
  input: "8px"
  card: "12px"
  modal: "16px"
spacing:
  base: "8px"                    # escala 4 / 8 / 12 / 16 / 24 / 32 / 48
components:
  button-primary: { bg: "#FF7200", fg: "#111111", radius: "8px", weight: 600 }
  button-secondary: { bg: "#F5F5F5", fg: "#111111", border: "#E5E5E5", radius: "8px" }
  button-tertiary: { bg: "transparent", fg: "#39393B" }
  button-destructive: { bg: "#D92D20", fg: "#FFFFFF", radius: "8px" }
  sidebar-item-active: { bg: "#FFF3E8", fg: "#111111", icon: "#FF7200", weight: 600, aria: "aria-current" }
---

# Brand & Style

**Norte:** *"Muito poder por baixo, pouca distração por cima."* (`visual-direction.md` §2)

A interface sustenta processos complexos sem parecer complicada: **clean, profissional, moderna, direta, organizada, confiável, produtiva**. Proporção-guia: **85–90% neutros + 10–15% identidade e estados**. O laranja **orienta, não domina** — se muitos elementos laranja competem, nenhum parece prioritário.

# Colors

### Neutros
| Token | Hex | Uso |
|---|---|---|
| `background` (Canvas) | `#FFFFFF` | fundo e superfícies principais |
| `surface-soft` | `#FAFAFA` | áreas secundárias, alternância leve |
| `muted` (Soft Cloud) | `#F5F5F5` | fundos de controles, containers leves, estados neutros |
| `border` (Hairline) | `#E5E5E5` | bordas, divisores, separação estrutural |
| `foreground` (Ink) | `#111111` | texto principal, ícones fortes, **texto sobre laranja** |
| `foreground-soft` (Charcoal) | `#39393B` | texto de apoio, ícones secundários |
| `muted-foreground` (Mute) | `#707072` | metadados, texto secundário |
| `disabled` (Stone) | `#9E9EA0` | baixa prioridade, estados inativos |

### Laranja Giraffe
| Token | Hex | Uso |
|---|---|---|
| `primary` | `#FF7200` | botão primário, seleção, foco, identidade, conexão de fluxo |
| `primary-hover` | `#F26A00` | hover |
| `primary-pressed` | `#CC5B00` | pressed |
| `accent` (Orange Soft) | `#FFF3E8` | fundo de item ativo, realce suave |
| `accent-border` (Orange Border) | `#FFD0A8` | borda de realce |
| `ring` | `#CC5B00` | anel de foco (contraste forte) |
| `ring-soft` | `#FFB066` | efeito de foco secundário |

### Semânticas
| Token | Hex | Uso |
|---|---|---|
| `destructive` | `#D92D20` | erro, falha, ação destrutiva |
| `success` | `#157A52` | concluído, confirmado |
| `info` | `#2563EB` | informação |
| `warning` | `#A15C00` | atraso, risco, atenção operacional |

**Regras de cor (duras):**
- `#FF7200` **nunca** representa erro, sucesso, falha, indisponibilidade, alerta ou problema — para isso, sempre semânticas.
- **Texto sobre `#FF7200` é `#111111`**, nunca branco.
- **Não usar `#FF7200` como texto comum sobre fundo branco** — reservá-lo para **fundos, ícones, bordas e indicadores**.

# Typography

**Fonte:** Inter (alta legibilidade, boa densidade em tabelas e telas pequenas).

| Nível | Tamanho | Peso |
|---|---|---|
| Título de página | 24–28px | 600–700 |
| Título de seção | 18–20px | 600 |
| Título de Card | 14–16px | 500–600 |
| Texto principal | 14px | 400 |
| Texto de interface | 13–14px | 400–500 |
| Metadado | 12–13px | 400–500 |
| Números operacionais | 24–32px | 600–700 |

Hierarquia por peso/tamanho controlado — **não** por títulos gigantes. Produtividade antes do efeito editorial.

# Layout & Spacing

Ritmo-base **8px**: `4` microajuste · `8` relação direta · `12` componente compacto · `16` componente padrão · `24` bloco · `32` seção interna · `48` grande separação. Espaço cria organização — não é espaço vazio "premium".

# Elevation & Depth

Interface predominantemente **plana**.
- **Nível 0** — sem sombra (Cards, tabelas, seções).
- **Nível 1** — borda 1px (separação, seleção, container).
- **Nível 2** — sombra muito leve (dropdown, popover, modal, elemento flutuante).

# Shapes

- Botões / inputs: radius **8px**.
- Cards: radius **12px**.
- Modais / painéis: radius **16px**.
- Avatares: circulares.
- **Pills** só para chips, filtros, tags e status — não como padrão de todo botão.

# Components

### Botões
| Variante | Visual | Uso |
|---|---|---|
| **Primário** | bg `#FF7200`, texto `#111111`, radius 8px, peso 600 | criar, salvar, enviar, aprovar, publicar, ativar. Preferir **um** CTA primário por região. |
| **Secundário** | bg branco ou `#F5F5F5`, texto `#111111`, borda `#E5E5E5` | editar, cancelar, filtrar, apoio |
| **Terciário** | sem fundo, texto `#39393B` | ver detalhes, abrir, menor prioridade |
| **Destrutivo** | vermelho semântico `#D92D20`, texto `#FFFFFF` | excluir — **nunca laranja** |

### Sidebar — item ativo (Opção A)
- Fundo `#FFF3E8`, texto `#111111`, **ícone `#FF7200`**, peso 600.
- Estado programático **`aria-current`**.
- **Não depender só da cor** para indicar seleção (combinar com peso, ícone e `aria-current`).
- **Nunca** sidebar inteira laranja.

### Navegação
- **Sidebar:** base branca / cinza muito claro.
- **Topbar:** branca, borda inferior leve; CTA laranja só quando necessário.

# Do's and Don'ts

**Do** — muito branco/neutro; laranja só onde há prioridade; texto quase preto; bordas leves; pouca sombra; densidade produtiva; Inter; ritmo 8px; diferenciar Formulário de Database, Pipe de Database, configuração da Fase de execução do Card, responsável padrão de responsável atual; manter Histórico acessível; diferenciar estados de IA.

**Don't** — não pintar a sidebar inteira de laranja; não usar todos os botões em laranja; não usar branco como texto sobre `#FF7200`; **não usar `#FF7200` como texto comum sobre branco**; não usar laranja para erro/sucesso; não usar gradiente decorativo; não usar sombra pesada; não usar pills em tudo; não usar radius exagerado; não transformar Dashboard em coleção de Cards coloridos; não transformar Database em outro Kanban.

<!-- Próxima rodada: A3 (estados, primitivas de interação, piso de acessibilidade) no EXPERIENCE.md. -->

