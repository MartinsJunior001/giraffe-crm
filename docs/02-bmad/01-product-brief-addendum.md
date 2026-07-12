---
title: "Addendum — Product Brief: Giraffe CRM · Fase 1"
created: 2026-07-11
updated: 2026-07-11
---

# Addendum — Product Brief: Giraffe CRM

> **Aviso:** este addendum **não amplia, não altera e não substitui** o escopo oficial da Fase 1 definido em `docs/01-documentacao-base/`. Ele é contexto complementar ao `01-product-brief.md` — aprofundamento que pertence a etapas futuras (PRD, Arquitetura) ou que não coube no corpo enxuto do brief. Em qualquer divergência, a documentação oficial da Fase 1 prevalece sobre este documento.

---

## 1. Estratégia comercial e visão de plataforma (contexto de roadmap, não decisão)

Fornecido pelo stakeholder nesta conversa, fora dos documentos-fonte:

- Visão de médio prazo: evoluir de produto operacional interno (Fase 1) para **plataforma SaaS multiempresa (multi-tenant)**, após a Fase 2 abrir API externa, Webhooks, MCP e integrações.
- Segmento inicial: **agências de marketing** (organização de referência: *Giraffe Marketing*).
- `PENDENTE DE DECISÃO`: estratégia comercial, modelo de cobrança/monetização, e expansão para outros segmentos além de agências de marketing.

Este conteúdo é direcional — não deve ser lido como roadmap comprometido nem usado para justificar funcionalidades na Fase 1.

---

## 2. Inventário consolidado de pendências da documentação-fonte

Consolidado a partir de `docs/01-documentacao-base/` para referência rápida do PRD/Arquitetura. Em caso de divergência, os documentos originais são a fonte de verdade — este inventário é um índice, não uma reafirmação de decisão.

### Modelo de dados e relacionamentos (`05-modelagem-de-dados/`)
- Cardinalidade e semântica da conexão Card ↔ Registro (1—N ou N—N).
- `phaseId` no Card (hoje `phase` é nome-texto, não referência forte).
- `orgId` ausente em Pipe, Database, Usuário, Notificação, Tarefa, Solicitação — isolamento multi-organização hoje é implícito, não materializado.
- `cardId` em E-mail e possivelmente em Tarefa (hoje ligada por `pipeId`).
- `templateId` na Ação de automação (hoje é texto, não referência).
- Coleção de Registros no state (`state.records` vazio) com `databaseId`.
- Estrutura final de Histórico do Card e de Log/Auditoria administrativa (distintos entre si).

### Cards e Pipes (`03-regras-de-negocio/`, `07-fluxos-principais/`)
- Máquina de estados do Card: transições válidas entre `ok`, `atrasado`, `expirado`, `vencido`, `finalizado`, `arquivado`.
- Regras oficiais de movimentação entre Fases (quem pode, quando, com que efeito).
- Catálogo oficial de eventos, condições e ações internas de automação.
- Isolamento efetivo de estado entre os três Formulários (inicial do Pipe, de Fase, de Database) — regra declarada, comportamento não validado.

### Permissões (`04-permissoes/`)
- Papéis de Pipe (Admin do Pipe, Membro do Pipe, Somente leitura, Visão restrita, Apenas formulário inicial) — não existem no seed, são proposta de produto.
- Papéis de Card (Responsável, Observador, Comentador, Restrito ao próprio) — idem.
- Conjunto exato de permissões (o que "Editar" e "Administrar" incluem por módulo).
- Mapeamento de `Visualizador` (legado) para Convidado vs. Somente leitura quando o contexto não permitir decidir com segurança.
- Área de Super Admin integrada e suas permissões concretas — hoje `NÃO INTEGRADO AO PROTÓTIPO UNIFICADO`.
- Regra de suporte/auditoria para Super Admin acessar dados de organização (`FORA DA FASE 1`).

### Autenticação, sessão e infraestrutura (`09-stack-escolhida/`, fluxos)
- Modelo de autenticação real e sessão real (Better Auth definido como stack, comportamento não especificado).
- Recuperação de senha real.
- Limites exatos da IA básica (o que ela pode sugerir/resumir, em quais contextos).

### Riscos adicionais levantados pelo stakeholder (cobertos por skills do projeto, sem consolidação na Arquitetura do BMAD)
- Segurança geral da aplicação (skill `security-check` já existente no projeto).
- Conformidade com LGPD (skill `lgpd-check` já existente; dados pessoais de usuários, clientes e leads dentro dos Databases/Registros).
- Observabilidade (skill `observability-check` já existente; a stack já define Sentry + Pino, mas eventos auditáveis não estão definidos).
- Estratégia de backup e migrations (skills `backup-check` e `migration-check` já existentes; banco PostgreSQL/Prisma escolhido, política ainda não definida).

Nenhum destes itens deve ser tratado como requisito fechado; todos permanecem como decisão a ser tomada nas etapas de PRD e Arquitetura, com a documentação de `docs/01-documentacao-base/` como fonte de verdade preferencial sobre este addendum.
