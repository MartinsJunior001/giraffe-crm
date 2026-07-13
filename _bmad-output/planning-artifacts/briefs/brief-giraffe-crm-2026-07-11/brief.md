---
title: "Product Brief: Giraffe CRM — Fase 1"
status: approved
created: 2026-07-11
updated: 2026-07-11
---

# Product Brief: Giraffe CRM — Fase 1

## Resumo Executivo

O Giraffe CRM é uma plataforma de CRM operacional **low-code/no-code**: em vez de forçar a organização a adaptar seus processos ao rígido molde de um CRM tradicional, ela permite configurar Pipes (processos em Kanban), Databases (bases de registros), Formulários, automações básicas e apoio de IA de acordo com o jeito de trabalhar de cada organização.

A **Fase 1** entrega o núcleo operacional interno: Login, Dashboard, Pipes/Kanban, Cards, Formulários, Database, Automações básicas, E-mails, IA básica, Tarefas e Solicitações, Notificações, Relatórios, Perfil e Painel Administrativo da Organização — com o Super Admin da Plataforma documentado como referência separada, ainda não integrada ao fluxo operacional. Integrações externas (API, Webhooks, MCP, GraphQL pública) ficam deliberadamente fora da Fase 1 e são fronteira explícita da Fase 2.

O foco inicial de mercado é **agências de marketing** — o próprio protótipo e a documentação usam *Giraffe Marketing* como organização de referência. Este brief é a base oficial para dar sequência a PRD, UX e Arquitetura dentro do processo BMAD, **sem ampliar** o escopo já fechado em `docs/01-documentacao-base/`.

## O Problema

Equipes operacionais perdem contexto quando processos, dados, tarefas, e-mails, histórico e decisões ficam espalhados em ferramentas diferentes. CRMs tradicionais agravam esse problema: eles impõem um modelo fixo de pipeline e de dados, obrigando a organização a torcer seu processo real para caber no sistema — em vez do sistema se adaptar ao processo.

Esse atrito é especialmente sensível para agências de marketing (segmento inicial do Giraffe CRM), cujos processos operacionais variam bastante entre si e raramente se encaixam no molde fixo de um CRM de vendas genérico.

## A Solução

O Giraffe CRM reúne, em uma única experiência configurável:

- **Pipes/Kanban** — processos de trabalho com Fases e Cards;
- **Database** — bases de registros persistentes, conceitualmente separadas de Pipe;
- **Formulários** configuráveis em três contextos independentes (inicial do Pipe, de Fase, de Database);
- **Automações básicas** no modelo Evento → Condição → Ação, com ações internas (sem requisição HTTP externa);
- **E-mails e templates** como apoio operacional;
- **IA básica assistiva** — apoio revisável pelo usuário, sem autonomia avançada; os casos de uso concretos e seus limites serão definidos nas etapas apropriadas do BMAD;
- **Tarefas, Solicitações, Notificações e Relatórios** para acompanhamento operacional;
- **Painel Administrativo da Organização**, com o **Super Admin** mantido como camada separada da Plataforma.

O produto é deliberadamente **simples na superfície e configurável por baixo**: a flexibilidade do modelo low-code/no-code é a capacidade central, não um recurso adicional.

## Diferencial

A proposta central é **flexibilidade sem abrir mão de conceitos claros**: Pipe ≠ Database, Card ≠ Registro, Super Admin ≠ Administrador da Organização são distinções estruturais que o produto preserva mesmo sendo configurável — a organização molda seus processos dentro desses limites, não o contrário.

Diferente de CRMs prontos, cada organização define seus próprios Pipes, campos de Formulário e automações. O produto não compete inicialmente em amplitude de integrações (isso é Fase 2/futuro), e sim em adequação ao processo real da organização, começando por agências de marketing.

## A Quem Serve

- **Administrador da Organização** — configura e acompanha a operação da própria organização (não administra a Plataforma).
- **Membro** — opera Pipes, Cards, Databases, E-mails, Tarefas e Solicitações no dia a dia.
- **Convidado** — acesso limitado, conforme decisões de permissão ainda a fechar.
- **Super Admin** — administra a Plataforma Giraffe, escopo separado da Organização.

**Segmento inicial de mercado:** agências de marketing (organização de referência na documentação: *Giraffe Marketing*). Expansão para outros segmentos é `PENDENTE DE DECISÃO`.

## Critérios de Sucesso

- **Qualitativo** (já sustentado pela documentação-fonte): mais clareza sobre o que está em andamento; menos dispersão entre processos e bases de dados; melhor rastreabilidade de cards, tarefas e notificações; automações internas sem abrir integrações externas prematuramente; IA assistiva controlada, sem prometer autonomia avançada.
- **Prontidão documental para o BMAD**: escopo macro da Fase 1 documentado; distinções conceituais centrais preservadas (ver Diferencial); Fase 2 explicitamente bloqueada no escopo atual; stack oficial documentada; pendências registradas como decisão, não como requisito fechado.
- **Métricas de negócio/uso mensuráveis** (adoção, retenção, substituição de ferramenta atual, redução de tempo operacional): `PENDENTE DE DECISÃO` — não existem na documentação-fonte nem foram definidas nesta conversa; serão definidas nas etapas apropriadas do BMAD, começando pelo PRD.

## Escopo

**Dentro da Fase 1** — os módulos de Login, Dashboard operacional, Pipes/Kanban, Cards, Formulários, Database, Automações básicas, E-mails, IA básica, Tarefas e Solicitações, Notificações, Relatórios, Perfil, Painel Administrativo da Organização, e Super Admin como referência separada da Plataforma (ver `docs/01-documentacao-base/02-mvp/mvp-fase-1.md`).

**Fora do MVP/Fase 1** (Fase 2 ou futuro): API externa, Webhooks, MCP, GraphQL pública, requisição HTTP em automações, marketplace, billing complexo, SAML/SSO avançado, impersonation, app mobile nativo, automações avançadas, IA autônoma avançada com múltiplos agentes, analytics avançado, permissões extremamente granulares.

O protótipo HTML unificado é referência visual e de fluxo — **não** é implementação final, arquitetura, schema de banco ou contrato de API. A modelagem de dados em `05-modelagem-de-dados/` é **puramente conceitual**, sem schema físico.

## Riscos e Pendências

**Riscos identificados:**
- Crescimento indevido de escopo (Fase 2 sendo tratada como parte da Fase 1).
- Uso acidental de `docs/_arquivo-legado/` como fonte oficial em vez de `docs/01-documentacao-base/`.
- Complexidade inerente ao modelo low-code/no-code (configurabilidade tem custo de implementação e de UX).
- Isolamento multiempresa (multi-tenant), segurança, LGPD, observabilidade, backup e migrations já possuem skills de verificação definidas no projeto (`security-check`, `lgpd-check`, `observability-check`, `backup-check`, `migration-check`), mas ainda faltam consolidação e decisões formais na Arquitetura do BMAD.
- Dependência futura de integrações externas (Fase 2) para o produto atingir sua visão de plataforma SaaS.

**Categorias de pendência já registradas na documentação-fonte** (detalhamento completo no addendum e nos próprios documentos): cardinalidade Card ↔ Registro; máquina de estados do Card; catálogo de tipos de campo; limites exatos da IA básica; permissões efetivas por módulo, Pipe e Card; isolamento multi-organização materializado em dados; modelo de autenticação e sessão; estrutura final de histórico, logs e auditoria.

Nenhuma dessas pendências é resolvida por este brief — permanecem como decisão de produto/arquitetura para as etapas seguintes (PRD, UX, Arquitetura), conforme instrução explícita do stakeholder.

## Visão

Depois de estabilizado o núcleo operacional da Fase 1, o Giraffe CRM pretende evoluir para uma **plataforma SaaS multiempresa (multi-tenant)**, utilizável por várias organizações além da agência de marketing inicial. A Fase 2 (API externa, Webhooks, MCP, integrações) faz parte dessa direção, mas abrir essas integrações não é, por si só, garantia de que o produto se torne uma plataforma SaaS — essa evolução depende de decisões de produto, arquitetura e negócio ainda não tomadas.

Estratégia comercial, modelo de cobrança e expansão para outros segmentos além de agências de marketing permanecem `PENDENTE DE DECISÃO` (contexto adicional no addendum).
