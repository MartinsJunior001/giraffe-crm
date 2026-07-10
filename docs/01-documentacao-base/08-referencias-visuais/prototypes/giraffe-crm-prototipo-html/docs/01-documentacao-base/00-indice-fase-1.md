# Documentação Base — Giraffe CRM · Fase 1

> Documento oficial de referência da **Fase 1** do Giraffe CRM.
> Fonte da verdade desta documentação: o **protótipo unificado** em
> `08-referencias-visuais/prototypes/` (em especial `giraffe-state.js`) e a
> **auditoria pós-unificação** (`AUDITORIA-POS-UNIFICACAO.html`).
>
> Regra editorial: **nada aqui foi inventado.** Toda afirmação vem do protótipo
> ou da auditoria. O que não pôde ser confirmado está marcado como
> `NÃO CONFIRMADO` ou `PENDENTE DE DECISÃO`.

---

## O que é a Fase 1

A Fase 1 é o CRM operacional interno de uma organização (ex.: *Giraffe Marketing*):
autenticação, um painel operacional, processos em formato Kanban (Pipes), cards,
formulários configuráveis, bases de dados (Databases), automações internas,
e-mails, IA básica, tarefas/solicitações, notificações, relatórios, perfil,
painel administrativo da organização e a camada de Super Admin da plataforma.

**A Fase 1 não inclui integrações externas.** API externa, Webhooks, MCP,
GraphQL pública e requisição HTTP em automações são **Fase 2** e aparecem no
protótipo apenas como **"Em breve"** (ver `06-integracoes-externas/`).

---

## Módulos da Fase 1

| # | Módulo | Tela(s) no protótipo | Navegável no protótipo |
|---|--------|----------------------|------------------------|
| 1 | Login | `login.html`, `forgot-password.html` | ✅ |
| 2 | Dashboard operacional | `dashboard-home.html` | ✅ |
| 3 | Pipes / Kanban | `pipe-kanban.html` | ✅ (1 pipe navegável) |
| 4 | Cards | modal em `pipe-kanban.html` | ✅ |
| 5 | Formulários | inicial, de fase, de database | ✅ |
| 6 | Database | `database-empresas-parceiras.html` | ✅ (1 database navegável) |
| 7 | Automações básicas | `automacoes-pipe.html` | ✅ |
| 8 | E-mails | composer / templates | ✅ (visual) |
| 9 | IA básica | `agentes-ia.html`, AI Builder no dashboard | ✅ (visual) |
| 10 | Tarefas e Solicitações | `tarefas-solicitacoes.html` | ✅ |
| 11 | Notificações | `minhas-notificacoes.html` + popover | ✅ |
| 12 | Relatórios | `relatorios-empresa.html` | ✅ |
| 13 | Perfil | `meu-perfil.html` | ✅ |
| 14 | Painel Administrativo da Organização | `painel-administrativo.html` | ✅ |
| 15 | Super Admin | `NÃO CONFIRMADO` como tela dedicada | ver nota abaixo |

> **Nota sobre Super Admin:** no protótipo, "Super Admin" existe hoje como
> **papel** do usuário (`currentUser.role = "Super Admin"`), não como uma área
> de plataforma separada e navegável. Se a Fase 1 exige uma área de Super Admin
> distinta do Painel Administrativo da Organização, isso é `PENDENTE DE DECISÃO`.

---

## Estrutura da documentação

```
docs/01-documentacao-base/
├── 00-indice-fase-1.md ............................. [CRIADO]
├── 01-visao-do-produto/
│   └── visao-produto-fase-1.md ..................... [PENDENTE]
├── 02-mvp/
│   └── mvp-fase-1.md ............................... [PENDENTE]
├── 03-glossario-e-modelo-conceitual/
│   ├── glossario-fase-1.md ......................... [CRIADO]
│   └── modelo-conceitual-fase-1.md ................. [CRIADO]
├── 03-regras-de-negocio/
│   └── regras-negocio-fase-1.md .................... [PENDENTE]
├── 04-permissoes/
│   └── permissoes-fase-1.md ........................ [PENDENTE]
├── 05-modelagem-de-dados/
│   ├── entidades-fase-1.md ......................... [PENDENTE]
│   └── relacionamentos-fase-1.md ................... [PENDENTE]
├── 07-fluxos-principais/
│   ├── fluxo-login-dashboard.md .................... [PENDENTE]
│   ├── fluxo-pipe-card-fase.md ..................... [PENDENTE]
│   ├── fluxo-database.md ........................... [PENDENTE]
│   ├── fluxo-automacoes.md ......................... [PENDENTE]
│   ├── fluxo-emails.md ............................. [PENDENTE]
│   └── fluxo-ia-basica.md .......................... [PENDENTE]
├── 06-integracoes-externas/
│   └── fase-1-vs-fase-2.md ......................... [PENDENTE]
├── 08-referencias-visuais/
│   └── prototipo-unificado-fase-1.md ............... [PENDENTE]
└── 09-stack-escolhida/
    └── stack-fase-1.md ............................. [PENDENTE]
```

> A pasta de protótipos vive em `08-referencias-visuais/prototypes/`. A seção
> de documentação de referências visuais é a `08-referencias-visuais/` (texto),
> conforme a estrutura oficial acima.

---

## O que cada arquivo cobre

- **00-indice-fase-1.md** — este índice: escopo da Fase 1, mapa dos módulos e das telas, estrutura e status da documentação.
- **01-visao-do-produto** — problema, usuários-alvo, proposta de valor e objetivos da Fase 1.
- **02-mvp** — recorte mínimo entregável, o que entra e o que fica de fora.
- **03-glossario** — vocabulário oficial (Organização, Pipe, Fase, Card, Database, etc.).
- **03-modelo-conceitual** — entidades conceituais e como se relacionam (visão de negócio, não de banco).
- **03-regras-de-negocio** — regras confirmadas no protótipo (status de card, leitura de notificações, etc.).
- **04-permissoes** — papéis de plataforma × papéis de organização e o que cada um pode.
- **05-modelagem-de-dados** — entidades e relacionamentos em nível técnico, derivados de `giraffe-state.js`.
- **07-fluxos-principais** — passo a passo dos fluxos navegáveis.
- **06-integracoes-externas** — fronteira Fase 1 × Fase 2 e itens "Em breve".
- **08-referencias-visuais** — inventário das telas do protótipo unificado.
- **09-stack-escolhida** — stack de implementação (a definir). `PENDENTE DE DECISÃO`.

---

## Estado da unificação (resumo da auditoria)

- **Fonte única real e consumida pelas telas:** identidade do usuário/organização,
  notificações (popover + página + badge), grade do dashboard, relatórios,
  tarefas/solicitações, lista de pipes do perfil e busca global.
- **Ainda não consumido do state central (dados espelhados na própria tela):**
  Kanban/Cards/Fases, registros do Database, templates de e-mail e lista de
  automações. Estão *visualmente coerentes* porque o seed foi derivado dessas
  telas, mas são cópias — a documentação técnica trata `giraffe-state.js` como
  a fonte canônica. Ver auditoria, seção "Fontes de verdade".
- **Fase 2 bloqueada:** Token/GraphQL, requisição HTTP, painel de API aparecem
  como "Em breve".

---

## Convenções desta documentação

- `NÃO CONFIRMADO` — não há evidência suficiente no protótipo/auditoria.
- `PENDENTE DE DECISÃO` — decisão de produto ainda não tomada.
- "Em breve" / Fase 2 — fora do escopo funcional atual.
- Toda entidade citada usa os nomes e ids de `giraffe-state.js`.
