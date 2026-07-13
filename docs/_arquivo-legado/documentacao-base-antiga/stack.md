# Stack Escolhida — Giraffe CRM

**Status:** Proposta consolidada para aprovação  
**Fase do projeto:** 1. Preparar documentação base  
**Etapa:** 08. Stack escolhida  
**Arquivo oficial:** `docs/01-documentacao-base/09-stack-escolhida/stack.md`  
**Versão:** 1.0  
**Data de consolidação:** 2026-07-05

---

## 1. Objetivo

Este documento define a Stack técnica-alvo do Giraffe CRM.

Ele transforma as decisões aprovadas de:

- Visão do Produto;
- MVP;
- Regras de Negócio;
- Permissões;
- Modelagem de Dados;
- Integrações Externas;
- Referências Visuais;

em escolhas técnicas de alto nível.

A Stack deve sustentar:

- SaaS multi-organização;
- Form Builder configurável por serviço;
- conexão Formulário → Database → Pipe;
- Cards e Registros relacionados;
- Fases com tarefas próprias;
- Fases com responsáveis próprios;
- Histórico visível do Card;
- Automação no modelo Quando → Condições → Então;
- Execuções, Logs e resultados de Automação;
- IA como ação possível em Automação;
- Conversas relacionadas a Contatos, Registros e Cards;
- integrações externas;
- aplicação web responsiva;
- observabilidade;
- segurança;
- LGPD;
- backup;
- migrações seguras;
- evolução gradual do legado atual.

Este documento não define:

- arquitetura detalhada de módulos;
- schema físico final;
- tabelas finais;
- endpoints finais;
- tasks de implementação;
- Sprint Planning;
- código.

Esses itens pertencem às fases seguintes.

---

# 2. Resumo executivo da Stack

```text
LINGUAGEM PRINCIPAL
TypeScript
        ↓
MONOREPO
pnpm Workspaces + Turborepo
        ↓
FRONTEND
Next.js + React
        ↓
UI
Tailwind CSS + shadcn/ui
        ↓
BACKEND
NestJS — monólito modular
        ↓
API
REST + OpenAPI
        ↓
BANCO PRINCIPAL
PostgreSQL
        ↓
ACESSO A DADOS
Prisma ORM + Prisma Migrate
        ↓
AUTENTICAÇÃO
Better Auth
        ↓
AUTORIZAÇÃO
Motor próprio do domínio Giraffe
        ↓
FILA / JOBS
Redis + BullMQ
        ↓
WORKER
Processo dedicado em NestJS
        ↓
TEMPO REAL
WebSocket / Socket.IO
        ↓
ARQUIVOS
Object Storage compatível com S3
        ↓
IA
Camada própria de providers
+ primeiro adapter OpenAI
        ↓
OBSERVABILIDADE
Pino + OpenTelemetry + Sentry
        ↓
TESTES
Vitest + Playwright
        ↓
CONTAINERS
Docker
        ↓
DEPLOY
Coolify
        ↓
REPOSITÓRIO / CI
GitHub + GitHub Actions
```

---

# 3. Princípios técnicos obrigatórios

## 3.1 Monólito modular primeiro

O Giraffe CRM não começará como conjunto de microserviços.

```text
MONÓLITO MODULAR
        ↓
módulos com fronteiras claras
        ↓
API separada do frontend
        ↓
Worker separado quando necessário
        ↓
extração futura somente por necessidade real
```

Não criar microserviço apenas porque existe um domínio diferente.

Uma área só deve ser extraída quando houver necessidade comprovada de:

- escala independente;
- isolamento operacional;
- segurança específica;
- ciclo de deploy diferente;
- equipe independente;
- carga incompatível com o núcleo.

---

## 3.2 TypeScript ponta a ponta

A linguagem principal será:

```text
TypeScript
```

Aplicada a:

- frontend;
- backend;
- worker;
- scripts;
- integrações;
- validações;
- testes.

---

## 3.3 PostgreSQL como fonte de verdade

O estado de negócio persistente deve ter como fonte principal:

```text
PostgreSQL
```

Exemplos:

- Organizações;
- Contatos;
- Databases;
- Registros;
- Pipes;
- Fases;
- Cards;
- Tarefas;
- Atribuições;
- Histórico;
- Formulários;
- Submissões;
- Automações;
- Execuções;
- Logs de negócio;
- Sugestões de IA;
- Referências Externas.

Redis, cache, fila, WebSocket e ferramentas externas não substituem a fonte de verdade do negócio.

---

## 3.4 Provider externo nunca entra diretamente no domínio

```text
DOMÍNIO
Enviar mensagem
        ↓
ADAPTER
        ↓
Meta Cloud API
ou
360dialog
ou
outro provider
```

Não:

```text
regra de negócio
        ↓
payload específico do provider
```

---

## 3.5 Nenhuma versão deve ser escolhida por memória

Antes de iniciar implementação ou upgrade:

1. executar `context7-check`;
2. consultar documentação oficial atual;
3. verificar compatibilidade;
4. registrar a versão exata;
5. atualizar lockfile;
6. executar testes.

Este documento escolhe tecnologias.

As versões exatas serão fixadas no início da implementação de cada área.

---

# 4. Arquitetura técnica-alvo

```text
                    ┌───────────────────┐
                    │      Browser      │
                    └─────────┬─────────┘
                              ↓
                    ┌───────────────────┐
                    │     apps/web      │
                    │      Next.js      │
                    └─────────┬─────────┘
                              ↓
                    ┌───────────────────┐
                    │     apps/api      │
                    │      NestJS       │
                    └──────┬─────┬──────┘
                           │     │
                 ┌─────────┘     └─────────┐
                 ↓                         ↓
       ┌─────────────────┐       ┌─────────────────┐
       │   PostgreSQL    │       │      Redis      │
       │ fonte de verdade│       │ filas / cache   │
       └─────────────────┘       └────────┬────────┘
                                         ↓
                                ┌─────────────────┐
                                │   apps/worker   │
                                │ NestJS + BullMQ │
                                └───────┬─────────┘
                                        ↓
                   ┌────────────────────┼────────────────────┐
                   ↓                    ↓                    ↓
              Integrações             IA              Object Storage
```

---

# 5. Estrutura-alvo do monorepo

```text
PROJETO-GIRAFFE-CRM/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── ui/
│   ├── config/
│   ├── validation/
│   ├── auth/
│   ├── observability/
│   └── integrations/
│
├── docs/
├── skills/
├── tooling/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── pnpm-lock.yaml
```

Não criar packages vazios apenas para parecer organizado.

Cada package precisa possuir responsabilidade real.

---

# 6. Gerenciamento do monorepo

## Escolha

```text
pnpm Workspaces
+
Turborepo
```

### pnpm

- gerenciamento de dependências;
- workspaces;
- lockfile único;
- scripts;
- dependências internas.

### Turborepo

- orquestração de tarefas;
- builds;
- testes;
- lint;
- typecheck;
- cache de tarefas.

Turborepo não define arquitetura do domínio.

---

# 7. Frontend

## Escolha

```text
Next.js
+
React
+
TypeScript
```

## Direção

Usar:

```text
App Router
```

para o frontend novo.

## Responsabilidades

- experiência do usuário;
- navegação;
- renderização;
- acessibilidade;
- responsividade;
- interação;
- estado visual;
- consumo da API;
- atualização em tempo real.

O frontend não deve ser fonte de verdade para:

- Permissões;
- automações;
- idempotência;
- regras críticas;
- estados externos;
- autorização;
- isolamento multi-organização.

---

# 8. UI e Design System

## Escolha

```text
Tailwind CSS
+
shadcn/ui
+
componentes próprios
```

O `shadcn/ui` será usado como:

- base de primitives;
- ponto de partida;
- código controlado pelo projeto.

Não como:

- identidade visual pronta;
- Design System final;
- motivo para copiar componentes sem adaptação.

### Fonte de verdade visual

```text
visual-direction.md
        ↓
Design System
        ↓
componentes
```

---

# 9. Ícones

## Escolha recomendada

```text
Lucide
```

Manter consistência e evitar misturar várias bibliotecas sem necessidade.

---

# 10. Estado de servidor

## Escolha

```text
TanStack Query
```

Usar para:

- carregamento de dados remotos;
- cache de servidor;
- invalidação;
- mutations;
- estados de loading;
- estados de erro.

TanStack Query não substitui o banco de dados nem as regras do backend.

---

# 11. Estado local de interface

Direção inicial:

```text
React state
+
URL
+
estado de formulário
```

Adicionar store global somente quando houver necessidade real.

Não adicionar Zustand, Redux ou outra store por padrão.

---

# 12. Formulários

## Escolha

```text
React Hook Form
+
Zod
```

### React Hook Form

- interação;
- estados do formulário;
- erros;
- submissão.

### Zod

- validação;
- schemas;
- tipos;
- validação de dados não confiáveis.

O Form Builder do Giraffe CRM será dinâmico:

```text
DEFINIÇÃO DO FORMULÁRIO
        ↓
renderização dinâmica
        ↓
SUBMISSÃO
        ↓
processamento
```

---

# 13. Drag-and-drop

## Escolha

```text
dnd-kit
```

Usar inicialmente para:

- reordenar campos do Form Builder;
- mover elementos configuráveis;
- movimentações visuais de Kanban quando adequado.

A movimentação visual não confirma sozinha a mudança de negócio.

```text
drag do Card
        ↓
backend valida
        ↓
regra de negócio aceita
        ↓
estado é persistido
        ↓
interface confirma
```

---

# 14. Tabelas e Databases

## Escolha

```text
TanStack Table
```

Usar como base lógica para:

- tabelas;
- colunas;
- ordenação;
- seleção;
- filtros;
- paginação;
- visualizações densas.

O visual continua controlado pelo Design System do Giraffe CRM.

---

# 15. Backend

## Escolha principal proposta

```text
NestJS
+
TypeScript
```

## Direção

```text
Monólito modular
```

Módulos conceituais podem incluir futuramente:

- Organization;
- Identity;
- Contacts;
- Database;
- Pipe;
- Forms;
- Tasks;
- History;
- Automations;
- Conversations;
- AI;
- Integrations.

Esses módulos conceituais não autorizam criar microserviços.

---

# 16. API

## Escolha

```text
REST
+
OpenAPI
```

GraphQL não entra no núcleo do MVP.

Pode ser reavaliado apenas se existir necessidade real.

---

# 17. Validação no backend

## Escolha

```text
Zod como padrão de schema compartilhável
```

A integração exata entre:

- Zod;
- NestJS;
- OpenAPI;

deverá ser validada no BMAD Arquitetura e no `context7-check`.

---

# 18. Banco de dados

## Escolha

```text
PostgreSQL
```

## Estratégia

```text
NÚCLEO RELACIONAL
+
JSONB somente quando justificar flexibilidade
```

Não transformar todo o CRM em um grande JSON.

Não transformar todo campo configurável em coluna fixa do núcleo.

---

# 19. ORM e acesso a dados

## Escolha

```text
Prisma ORM
```

## Migrações

```text
Prisma Migrate
```

### Uso permitido

- acesso tipado;
- transações;
- migrations;
- queries comuns.

SQL nativo continua permitido quando necessário para:

- performance;
- recursos específicos do PostgreSQL;
- migrações complexas;
- consultas que o ORM não represente adequadamente.

---

# 20. Busca inicial

## Escolha

```text
Busca nativa do PostgreSQL
```

Não entram no MVP sem necessidade comprovada:

```text
Elasticsearch
OpenSearch
```

---

# 21. Multi-organização

Estratégia base:

```text
Banco compartilhado
+
isolamento lógico por Organization
```

Toda entidade de negócio deve possuir contexto organizacional identificável.

A autorização deve ser aplicada no backend.

Não confiar apenas em:

- filtros do frontend;
- parâmetros enviados pelo usuário;
- rotas ocultas.

PostgreSQL Row Level Security poderá ser avaliado como defesa adicional.

---

# 22. Autenticação

## Escolha principal proposta

```text
Better Auth
```

## Responsabilidade

- identidade;
- login;
- sessão;
- recuperação;
- autenticação.

Possibilidades futuras:

- OAuth;
- 2FA;
- passkeys;
- SSO.

Somente quando aprovadas.

---

# 23. Autorização

## Escolha

```text
Motor próprio do domínio Giraffe
```

Baseado na fórmula:

```text
Subject
+
Action
+
Resource
+
Scope
+
Condition
```

Better Auth não será a fonte de verdade das permissões de negócio.

```text
Better Auth
→ quem é a pessoa?

Giraffe Authorization
→ o que ela pode fazer aqui?
```

---

# 24. Organizações e membros

A entidade oficial:

```text
Organization
```

e as regras de:

- Membership;
- Equipes;
- perfis;
- Permissões;

continuam pertencendo ao domínio Giraffe CRM.

Não delegar silenciosamente o modelo completo de Organizações e Permissões ao provider de autenticação.

---

# 25. Arquivos

## Escolha

```text
Object Storage compatível com S3
```

## PostgreSQL guarda

- identidade do Arquivo;
- nome;
- tipo;
- tamanho;
- origem;
- relacionamento;
- metadados;
- referência segura de localização.

## Object Storage guarda

```text
conteúdo binário
```

Não salvar binários grandes diretamente no PostgreSQL como padrão.

Arquivos não serão módulo visual independente no MVP.

Eles aparecem contextualmente em:

- Database / Registro;
- Card;
- Formulário / Submissão;
- Conversa / Mensagem.

---

# 26. Provider físico de arquivos

## Decisão nesta fase

```text
Interface S3-compatible
```

## Pendente para Arquitetura

Escolher provider físico de produção considerando:

- custo;
- backup;
- região;
- LGPD;
- compatibilidade S3;
- operação.

---

# 27. Redis

## Escolha

```text
Redis
```

## Responsabilidades permitidas

- filas;
- jobs;
- delays;
- locks operacionais quando justificados;
- cache;
- rate limiting quando adequado;
- suporte a tempo real quando necessário.

Redis não é fonte de verdade de negócio.

---

# 28. Automação e jobs

## Escolha

```text
BullMQ
+
Redis
```

Usar para:

- jobs assíncronos;
- ações de integração;
- retries;
- delays;
- follow-ups;
- processamento em background;
- ações de IA;
- jobs agendados.

---

# 29. Worker

## Escolha

```text
apps/worker
```

```text
API
→ recebe e valida

PostgreSQL
→ persiste intenção / estado

Redis + BullMQ
→ agenda trabalho

Worker
→ executa

PostgreSQL
→ registra resultado

Histórico / Logs
→ tornam visível
```

---

# 30. Automação do produto

O motor seguirá:

```text
QUANDO
        ↓
CONDIÇÕES
        ↓
ENTÃO
```

## Stack interna

```text
Eventos internos
+
PostgreSQL
+
BullMQ
+
Worker
```

A definição da Automação fica persistida no PostgreSQL.

A Execução da Automação fica persistida no PostgreSQL.

A fila transporta o trabalho.

Ela não substitui o Histórico da Execução.

---

# 31. Tecnologias não escolhidas para Automação no MVP

Não usar como núcleo inicial:

```text
n8n
Temporal
Camunda
motor BPM enterprise
```

Isso protege o MVP contra complexidade prematura.

---

# 32. Tempo real

## Escolha

```text
WebSocket
+
Socket.IO
```

Usar quando existir valor real para:

- Conversas;
- atualizações do Card;
- tarefas;
- notificações;
- estado de execução.

Não transformar toda comunicação da aplicação em WebSocket.

REST continua sendo padrão para operações comuns.

---

# 33. Conversas

A Stack deve sustentar:

```text
Contato
        ↓
Conversa
        ↓
Mensagem
```

com relações opcionais a:

- Registro;
- Card;
- Pipe;
- contexto externo.

## Persistência

```text
PostgreSQL
```

## Atualização em tempo real

```text
Socket.IO
```

## Processamento externo

```text
BullMQ + Worker
```

---

# 34. IA

## Estratégia

```text
Camada própria de provider
```

```text
AI Provider Interface
        ↓
OpenAI Adapter
        ↓
outros adapters futuros
```

## Primeiro provider proposto

```text
OpenAI
```

O domínio não deve depender diretamente de:

- nome de modelo;
- payload específico;
- SDK específico.

---

# 35. Validação de saídas de IA

## Escolha

```text
Zod
```

Usar para validar:

- objetos estruturados;
- decisões classificadas;
- sugestões com formato definido.

Texto gerado por IA não é automaticamente uma ação autorizada.

---

# 36. Guardrails de IA

A Stack deve permitir:

- escopo de contexto;
- revisão humana;
- fallback para humano;
- proteção contra prompt leak;
- registro de origem;
- aprovação;
- rastreabilidade;
- controle de custo.

IA não ganha Permissões extras.

---

# 37. Custo de IA

Toda chamada relevante deve poder associar:

- Organização;
- contexto;
- provider;
- modelo;
- tokens ou unidade equivalente;
- custo estimado;
- resultado;
- duração.

Isso sustenta:

```text
cost-monitoring-check
```

---

# 38. Integrações externas

## Estratégia

```text
Adapters por capacidade / provider
```

Exemplo:

```text
packages/integrations/
├── whatsapp/
├── meta/
├── email/
└── telephony/
```

A estrutura final será detalhada em Arquitetura.

Não colocar lógica específica de provider diretamente em:

- Card;
- Contact;
- Automation;
- Conversation.

---

# 39. Primeira integração concreta do MVP

A direção atual mantém:

```text
WhatsApp
```

como forte candidata.

O provider inicial ainda precisa de comparação final.

Não escolher silenciosamente entre:

- Meta Cloud API;
- 360dialog;
- Evolution API;
- outro provider.

---

# 40. Webhooks

## Direção

Recebimento por:

```text
NestJS API
```

Processamento robusto por:

```text
persistência
+
idempotência
+
fila
+
worker
```

Webhook não deve executar todo trabalho pesado durante a requisição.

---

# 41. Cliente HTTP

## Direção inicial

Preferir:

```text
fetch nativo do runtime
```

Usar SDK oficial de provider quando houver vantagem real.

Não adicionar Axios por padrão apenas por hábito.

---

# 42. Logs estruturados

## Escolha

```text
Pino
```

Campos mínimos quando aplicáveis:

- timestamp;
- level;
- service;
- environment;
- requestId;
- organizationId;
- userId;
- automationRunId;
- integration;
- errorCode.

Não colocar:

- senha;
- token;
- segredo;
- conteúdo sensível desnecessário.

---

# 43. Observabilidade

## Escolha

```text
OpenTelemetry
```

Usar progressivamente para:

- traces;
- métricas;
- correlação entre serviços/processos.

Objetivo:

```text
o que aconteceu?
onde falhou?
qual Organização foi afetada?
qual execução originou o problema?
```

---

# 44. Error tracking

## Escolha proposta

```text
Sentry
```

Usar para:

- erros não tratados;
- regressões;
- stack traces;
- contexto técnico;
- alertas.

Sentry não substitui:

- Logs de Automação;
- Histórico do Card;
- auditoria;
- logs estruturados.

---

# 45. Histórico, Auditoria e Logs técnicos

Manter separados:

```text
HISTÓRICO DE NEGÓCIO
→ o que aconteceu com o usuário/processo

AUDITORIA
→ ações sensíveis e administrativas

LOG TÉCNICO
→ diagnóstico do sistema

LOG DE AUTOMAÇÃO
→ execução operacional da Automação
```

---

# 46. Testes

## Escolhas

```text
Vitest
+
Playwright
```

## Vitest

- unidades;
- regras de domínio;
- serviços;
- packages compartilhados;
- integração técnica quando adequado.

## Playwright

- fluxos críticos E2E;
- autenticação;
- Formulário → Database → Pipe;
- movimentação de Card;
- Automação principal;
- responsividade essencial.

---

# 47. Testes obrigatórios do MVP

No mínimo:

```text
Organização A não acessa Organização B

Formulário cria destino correto

Card relaciona Registro correto

mudança de Fase preserva Histórico

tarefa concluída preserva ator e horário

Automação não duplica efeito

retry não duplica efeito

resultado desconhecido não vira sucesso

IA não executa ação sem autorização necessária

arquivo permanece relacionado ao contexto persistente
```

---

# 48. Qualidade estática

## Escolhas

- TypeScript `strict`;
- ESLint;
- Prettier;
- typecheck em CI.

---

# 49. Git e repositório

## Escolha

```text
Git
+
GitHub
```

Usar para:

- versionamento;
- Pull Requests;
- Issues quando aplicável;
- CI;
- revisão;
- rastreabilidade.

---

# 50. CI

## Escolha

```text
GitHub Actions
```

Pipeline mínimo:

```text
install
        ↓
lint
        ↓
typecheck
        ↓
test
        ↓
build
```

Em alterações de banco:

```text
migration-check
```

Em alterações críticas:

```text
security-check
lgpd-check
observability-check
backup-check
```

---

# 51. Containers

## Escolha

```text
Docker
```

Direção:

```text
web
api
worker
```

como processos independentes.

---

# 52. Deploy

## Escolha

```text
Coolify
```

Responsabilidades:

- deploy;
- variáveis;
- domínios;
- HTTPS;
- containers;
- integração com Git;
- ambientes.

Todo deploy deve passar por:

```text
coolify-deploy-check
```

---

# 53. Estratégia de deploy

```text
GitHub
        ↓
CI valida
        ↓
Coolify deploya
        ↓
health checks
        ↓
validação pós-deploy
```

Não usar deploy manual sem rastreabilidade como fluxo normal.

---

# 54. Ambientes

Manter no mínimo:

```text
local
staging
production
```

Production não deve compartilhar:

- credenciais;
- banco;
- Redis;
- storage;

com desenvolvimento.

---

# 55. Desenvolvimento local

## Direção

```text
pnpm
+
Turborepo
+
Docker Compose para dependências
```

Serviços locais previstos:

- PostgreSQL;
- Redis;
- object storage compatível;
- ferramentas auxiliares aprovadas.

---

# 56. Segredos

Segredos devem ficar em:

- variáveis seguras;
- secret management do ambiente;
- recursos próprios aprovados.

Nunca em:

- Git;
- screenshot;
- README;
- campo comum do Database;
- Log.

---

# 57. Segurança

A Stack deve sustentar:

- autenticação;
- autorização server-side;
- isolamento de Organização;
- rate limiting;
- validação de entrada;
- validação de webhook;
- proteção de segredos;
- logs sem dados sensíveis;
- dependências auditáveis.

Esconder um botão não é segurança.

---

# 58. LGPD

A Stack deve permitir implementar:

- minimização;
- consentimento quando aplicável;
- retenção;
- anonimização;
- exclusão;
- auditoria;
- restrição de acesso;
- proteção de contexto enviado à IA.

Não inventar prazo legal no código.

---

# 59. Backup

Produção deve possuir:

```text
backup do PostgreSQL
+
backup ou proteção do Object Storage
+
teste de restauração
```

Backup sem teste de restore não é suficiente.

Skill obrigatória:

```text
backup-check
```

---

# 60. Migrações

## Escolha

```text
Prisma Migrate
```

Regras:

- migration versionada;
- revisão;
- backup quando necessário;
- estratégia de rollback ou roll-forward;
- teste em staging;
- logs.

Proibido em production como rotina:

```text
db push
```

Skill obrigatória:

```text
migration-check
```

---

# 61. Legacy atual

O projeto possui histórico com:

```text
Frontend legado
→ Next.js

Backend legado
→ Strapi 4
```

O legado é fonte de:

- comportamento;
- dados;
- integrações;
- aprendizado.

Não é automaticamente a Stack-alvo final.

---

# 62. Backend-alvo versus Strapi legado

## Proposta

```text
TARGET
NestJS

LEGACY
Strapi 4
```

## Estratégia

Não realizar big bang.

```text
inventariar
        ↓
mapear dependências
        ↓
especificar módulo
        ↓
migrar
        ↓
validar
        ↓
convergir
```

Skill obrigatória:

```text
migration-check
```

---

# 63. Firebase e Supabase

O legado pode utilizar:

- Firebase;
- Supabase;
- serviços semelhantes.

Eles não serão automaticamente fontes de verdade do novo núcleo.

Qualquer permanência deve possuir caso de uso explícito.

Não manter tecnologia apenas porque já existe no código.

Também não remover sem mapear dependências.

---

# 64. Tecnologias rejeitadas ou adiadas

## Microserviços

```text
ADIADO
```

## MongoDB como banco principal

```text
NÃO ESCOLHIDO
```

## Strapi como backend-alvo do novo núcleo

```text
NÃO RECOMENDADO
```

Permanece como legado até migração segura.

## Firebase como fonte principal do domínio

```text
NÃO ESCOLHIDO
```

## Elasticsearch / OpenSearch no MVP

```text
ADIADO
```

## Temporal no MVP

```text
ADIADO
```

## n8n como motor central do produto

```text
NÃO ESCOLHIDO
```

Pode existir como integração auxiliar futura.

## Binários no PostgreSQL como padrão

```text
NÃO ESCOLHIDO
```

## Aplicativo nativo no MVP

```text
ADIADO
```

A escolha é web responsiva.

---

# 65. Matriz final de decisões

| Área | Escolha |
|---|---|
| Linguagem | TypeScript |
| Runtime | Node.js Active LTS validado na implementação |
| Monorepo | pnpm Workspaces + Turborepo |
| Frontend | Next.js + React |
| Router | App Router |
| Estilo | Tailwind CSS |
| Base de componentes | shadcn/ui |
| Ícones | Lucide |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Validação | Zod |
| Drag-and-drop | dnd-kit |
| Tabelas | TanStack Table |
| Backend | NestJS |
| Arquitetura | Monólito modular |
| API | REST + OpenAPI |
| Banco | PostgreSQL |
| ORM | Prisma ORM |
| Migrações | Prisma Migrate |
| Auth | Better Auth |
| Autorização | Motor próprio Giraffe |
| Filas | BullMQ |
| Broker de fila/cache | Redis |
| Worker | NestJS dedicado |
| Tempo real | Socket.IO |
| Arquivos | Object Storage S3-compatible |
| IA | Camada própria de providers |
| Primeiro provider de IA | OpenAI — proposta |
| Logs | Pino |
| Telemetria | OpenTelemetry |
| Error tracking | Sentry — proposta |
| Testes | Vitest + Playwright |
| Containers | Docker |
| Deploy | Coolify |
| Repositório | GitHub |
| CI | GitHub Actions |

---

# 66. Decisões que exigem aprovação explícita

Antes de mudar o status para **Aprovado**, confirmar:

## 66.1 Backend-alvo

```text
NestJS substitui gradualmente Strapi como backend-alvo?
```

Recomendação:

```text
SIM
```

## 66.2 Autenticação

```text
Better Auth será o mecanismo de autenticação?
```

Com a regra:

```text
Permissões do negócio continuam no Giraffe CRM.
```

Recomendação:

```text
SIM
```

## 66.3 ORM

```text
Prisma será o ORM e sistema de migrations?
```

Recomendação:

```text
SIM
```

## 66.4 Primeira IA

```text
OpenAI será o primeiro adapter de IA?
```

Recomendação:

```text
SIM
```

## 66.5 Error tracking

```text
Sentry será usado no MVP?
```

Recomendação:

```text
SIM
```

desde que custo e política de dados sejam aprovados.

## 66.6 Provider físico de Object Storage

Ainda não escolher nesta Fase 1.

Escolher em BMAD Arquitetura considerando:

- custo;
- backup;
- região;
- LGPD;
- compatibilidade S3;
- operação.

## 66.7 Provider inicial de WhatsApp

Ainda não escolher silenciosamente.

Comparar:

- Meta Cloud API;
- 360dialog;
- Evolution API;
- alternativas aprovadas.

---

# 67. Decisões pendentes para BMAD Arquitetura

O documento de Arquitetura deverá detalhar:

- módulos do NestJS;
- fronteiras do monólito;
- schema multi-tenant;
- estratégia de autorização;
- integração Better Auth ↔ API;
- estrutura dos packages;
- transactional outbox ou alternativa;
- política de eventos;
- estrutura das filas;
- retries;
- idempotência;
- estratégia de WebSocket;
- provider de Object Storage;
- provider de WhatsApp;
- estratégia de backup;
- estratégia de restore;
- ambientes;
- topologia no Coolify;
- observabilidade;
- correlação de logs;
- rate limiting;
- secrets;
- migração do Strapi;
- migração de dados.

---

# 68. Processo obrigatório antes de implementar

```text
Story aprovada
        ↓
Spec Kit
        ↓
context7-check
        ↓
pre-implementation-check
        ↓
safe-implementation
        ↓
testes
        ↓
code-review
        ↓
security-check
        ↓
lgpd-check
        ↓
observability-check
```

Quando aplicável:

```text
backup-check
migration-check
performance-check
ai-guardrails-check
cost-monitoring-check
coolify-deploy-check
commit-check
```

---

# 69. Referências técnicas verificadas para esta consolidação

Foram consultadas documentações oficiais atuais das tecnologias principais, incluindo:

- Next.js — App Router e self-hosting;
- NestJS — WebSockets, queues e OpenAPI;
- PostgreSQL — JSONB e busca textual;
- pnpm — Workspaces;
- Turborepo — estrutura de monorepo;
- Prisma — PostgreSQL e Prisma Migrate;
- Better Auth — PostgreSQL, Prisma e autenticação;
- Redis — cache e job queues;
- BullMQ — workers, retries e produção;
- shadcn/ui;
- TanStack Query;
- TanStack Table;
- dnd-kit;
- React Hook Form;
- Zod;
- OpenTelemetry;
- Pino;
- Sentry;
- Coolify.

Consultar novamente no início da implementação.

Documentação técnica muda.

---

# 70. Critérios de aceite

O documento está pronto para aprovação quando:

1. a Stack sustenta o MVP aprovado;
2. Formulário, Database e Pipe continuam separados;
3. o backend possui fronteira própria;
4. PostgreSQL é fonte de verdade;
5. Redis não é fonte de verdade;
6. arquivos possuem storage próprio e metadados persistentes;
7. Automação possui fila, Worker, Execução e Log;
8. IA não está acoplada a um único provider no domínio;
9. autenticação e autorização estão separadas;
10. Organization continua domínio do Giraffe CRM;
11. multi-organização é protegida no backend;
12. Histórico de negócio e Log técnico estão separados;
13. observabilidade está prevista desde o início;
14. backup e restore são obrigatórios;
15. migration-check é obrigatório;
16. deploy é reproduzível;
17. o legado possui estratégia gradual;
18. microserviços não foram introduzidos sem necessidade;
19. versões exatas dependem de `context7-check`;
20. decisões críticas foram aprovadas explicitamente.

---

# 71. Princípio final

A Stack do Giraffe CRM deve ser:

> **simples o suficiente para uma equipe pequena construir e operar, mas estruturada o suficiente para não quebrar quando o produto crescer.**

A decisão central é:

```text
TypeScript
+
Monorepo
+
Next.js
+
NestJS
+
PostgreSQL
+
Redis/BullMQ
+
Object Storage
+
Adapters
+
Observabilidade
```

Com esta regra permanente:

> **Não adicionar tecnologia porque ela é moderna. Adicionar somente quando ela resolver um problema real do produto com custo de complexidade aceitável.**
