# Documentação Base — Giraffe CRM · Fase 1

> Documento oficial de referência da **Fase 1** do Giraffe CRM.
> Fonte da verdade desta documentação: `docs/01-documentacao-base/`.
> O **protótipo unificado** em `08-referencias-visuais/prototypes/` é referência
> visual e de fluxo, não implementação final.
>
> Regra editorial: não misturar documentação oficial com legado. O que não pôde
> ser confirmado está marcado como
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
| 1 | Login | `login.html` | ✅ |
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
| 15 | Super Admin | `08-referencias-visuais/prototypes/super-admin-giraffe-crm.html` | referência separada |

> **Nota sobre Super Admin:** existe uma referência visual separada para o
> **Platform Super Admin** em
> `08-referencias-visuais/prototypes/super-admin-giraffe-crm.html`. Ela não faz
> parte do fluxo operacional principal da Organização e sua integração futura
> ao produto principal ainda será definida.
>
> **Nota sobre links do protótipo:** `forgot-password.html` e
> `meu-trabalho.html` existem no pacote principal atual em
> `08-referencias-visuais/prototypes/giraffe-crm-prototipo-html/`.

---

## Estrutura da documentação

```
docs/01-documentacao-base/
├── 00-indice-fase-1.md ............................. [CRIADO]
├── 01-visao-do-produto/
│   ├── visao-produto-fase-1.md ..................... [CRIADO]
│   └── glossario-e-modelo-conceitual/
│       ├── glossario-fase-1.md ..................... [CRIADO]
│       └── modelo-conceitual-fase-1.md ............. [CRIADO]
├── 02-mvp/
│   └── mvp-fase-1.md ............................... [CRIADO]
├── 03-regras-de-negocio/
│   └── regras-negocio-fase-1.md .................... [CRIADO]
├── 04-permissoes/
│   └── permissoes-fase-1.md ........................ [CRIADO]
├── 05-modelagem-de-dados/
│   ├── entidades-fase-1.md ......................... [CRIADO]
│   └── relacionamentos-fase-1.md ................... [CRIADO]
├── 06-integracoes-externas/
│   └── fase-1-vs-fase-2.md ......................... [CRIADO]
├── 07-fluxos-principais/
│   ├── fluxo-login-dashboard.md .................... [CRIADO]
│   ├── fluxo-pipe-card-fase.md ..................... [CRIADO]
│   ├── fluxo-database.md ........................... [PENDENTE]
│   ├── fluxo-automacoes.md ......................... [PENDENTE]
│   ├── fluxo-emails.md ............................. [PENDENTE]
│   └── fluxo-ia-basica.md .......................... [PENDENTE]
├── 08-referencias-visuais/
│   └── prototipo-unificado-fase-1.md ............... [CRIADO]
└── 09-stack-escolhida/
    └── stack-fase-1.md ............................. [CRIADO]
```

> A pasta de protótipos vive em `08-referencias-visuais/prototypes/`. A seção
> de documentação de referências visuais é a `08-referencias-visuais/` (texto),
> conforme a estrutura oficial acima.

---

## O que cada arquivo cobre

- **00-indice-fase-1.md** — este índice: escopo da Fase 1, mapa dos módulos e das telas, estrutura e status da documentação.
- **01-visao-do-produto** — problema, usuários-alvo, proposta de valor e objetivos da Fase 1.
- **01-visao-do-produto/glossario-e-modelo-conceitual** — vocabulário oficial e entidades conceituais.
- **02-mvp** — recorte mínimo entregável, o que entra e o que fica de fora.
- **03-regras-de-negocio** — regras confirmadas no protótipo (status de card, leitura de notificações, etc.).
- **04-permissoes** — papéis de plataforma × papéis de organização e o que cada um pode.
- **05-modelagem-de-dados** — entidades e relacionamentos em nível técnico, derivados de `giraffe-state.js`.
- **06-integracoes-externas** — fronteira Fase 1 × Fase 2 e itens "Em breve".
- **07-fluxos-principais** — passo a passo dos fluxos navegáveis.
- **08-referencias-visuais** — inventário das telas do protótipo unificado.
- **09-stack-escolhida** — stack oficial escolhida para a Fase 1.

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
