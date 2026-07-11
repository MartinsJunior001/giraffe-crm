# Stack Escolhida - Giraffe CRM - Fase 1

> Documento oficial da stack escolhida para orientar BMAD, PRD, Arquitetura e
> Spec Kit.
> Este documento nao implementa nada e nao altera o prototipo HTML.

---

## 1. Decisao de stack

A stack base escolhida para a implementacao futura do Giraffe CRM Fase 1 e:

- TypeScript;
- Next.js;
- React;
- Tailwind CSS;
- shadcn/ui;
- Radix UI;
- NestJS;
- PostgreSQL;
- Prisma;
- Redis;
- BullMQ;
- Socket.IO;
- Better Auth;
- CASL;
- MinIO;
- Sentry;
- Pino;
- OpenAI Agents SDK TS;
- Coolify;
- Docker Compose;
- GitHub Actions futuramente;
- Qdrant/Meilisearch futuramente.

Esta decisao define direcao tecnica. Versoes, estrutura de repositorio, contratos
de API, schema fisico, modulos e politicas de deploy serao detalhados em BMAD,
Arquitetura e Spec Kit.

---

## 2. Frontend

Stack oficial:

- **TypeScript** como linguagem base;
- **Next.js** como framework web;
- **React** como biblioteca de UI;
- **Tailwind CSS** como base de estilo utilitario;
- **shadcn/ui** como referencia de componentes;
- **Radix UI** como base acessivel para primitivas de UI.

Diretriz:

- a implementacao final nao deve ser derivada diretamente do HTML do prototipo;
- o prototipo serve para direcao visual e fluxo;
- componentes devem respeitar `08-referencias-visuais/visual-direction.md`;
- app mobile nativo fica fora da Fase 1; a experiencia deve ser web responsiva.

---

## 3. Backend

Stack oficial:

- **TypeScript**;
- **NestJS**.

Diretriz:

- backend modular por dominios do produto;
- separacao clara entre Organizacao, Plataforma, Pipe, Database, Card e Registro;
- API interna da aplicacao pode existir, mas API publica para clientes e Fase 2;
- Webhooks externos, MCP e GraphQL publica nao fazem parte da Fase 1.

---

## 4. Banco de dados

Stack oficial:

- **PostgreSQL** como banco principal;
- **Prisma** como ORM/modelagem de acesso a dados.

Diretriz:

- modelar Organizacao como limite operacional;
- manter Pipe separado de Database;
- manter Card separado de Registro;
- materializar relacionamentos que hoje estao pendentes no prototipo, como
  `orgId`, `phaseId`, registros de Database, historico e logs, quando a
  arquitetura fechar o desenho.

---

## 5. Autenticacao

Stack oficial:

- **Better Auth**.

Diretriz:

- definir autenticacao real depois do BMAD/Arquitetura;
- login visual do prototipo nao e implementacao final;
- recuperacao de senha real e sessao real devem ser especificadas antes da
  implementacao.

Fora da Fase 1:

- SAML/SSO avancado;
- impersonation/acesso de suporte.

---

## 6. Autorizacao e permissoes

Stack oficial:

- **CASL** para autorizacao/permissoes.

Diretriz:

- respeitar escopos Plataforma, Organizacao, Pipe e Card;
- Super Admin pertence a Plataforma;
- Administrador da Organizacao administra apenas a propria Organizacao;
- permissoes extremamente granulares ficam fora da Fase 1.

---

## 7. Filas e jobs

Stack oficial:

- **Redis**;
- **BullMQ**.

Uso previsto:

- tarefas assíncronas internas;
- automacoes basicas;
- envio/processamento de e-mails, se definido pela arquitetura;
- rotinas operacionais controladas.

Fora da Fase 1:

- execucao de requisicao HTTP externa em automacoes;
- orquestracao avancada de automacoes externas.

---

## 8. Cache e tempo real

Stack oficial:

- **Redis** para cache e suporte operacional;
- **Socket.IO** para comunicacao em tempo real quando necessario.

Uso previsto:

- atualizacao de notificacoes;
- eventos internos de interface;
- possivel sincronizacao operacional de telas.

Decisoes detalhadas de canais, eventos e invalidação ficam para Arquitetura.

---

## 9. Storage

Stack oficial:

- **MinIO**.

Uso previsto:

- arquivos ligados a Registros, Cards, Formularios ou contextos operacionais;
- upload/download como capacidade contextual.

Fora da Fase 1:

- file manager independente;
- biblioteca global de arquivos;
- integracao generica com drives externos.

---

## 10. Observabilidade

Stack oficial:

- **Sentry** para erros e rastreamento de problemas;
- **Pino** para logs estruturados.

Diretriz:

- diferenciar historico do Card, log operacional e auditoria administrativa;
- nao misturar log tecnico com historico visivel do usuario;
- definir eventos auditaveis na arquitetura.

---

## 11. IA

Stack oficial:

- **OpenAI Agents SDK TS**.

Escopo na Fase 1:

- IA basica assistiva;
- sugestoes;
- resumos;
- apoio em e-mails, cards e automacoes basicas;
- revisao humana antes de acoes sensiveis.

Fora da Fase 1:

- multiplos agentes autonomos avancados;
- IA executando integracoes externas livremente;
- automacoes de IA sem controle humano quando isso extrapolar o MVP.

---

## 12. Deploy

Stack oficial:

- **Docker Compose**;
- **Coolify**.

Diretriz:

- ambiente conteinerizado;
- deploy inicial simples e reproduzivel;
- variaveis e segredos fora do repositorio;
- maturidade de CI/CD sera definida depois.

---

## 13. CI/CD e busca futura

Decisoes futuras:

- **GitHub Actions** futuramente para CI/CD;
- **Qdrant** futuramente se houver necessidade de vetores/memoria semantica;
- **Meilisearch** futuramente se houver necessidade de busca textual dedicada.

Esses itens nao devem ser tratados como requisitos obrigatorios da Fase 1.

---

## 14. Decisoes que ficam para depois

Ficam para BMAD, Arquitetura e Spec Kit:

- versoes exatas de cada tecnologia;
- estrutura de monorepo ou repositorios;
- contratos de API interna;
- schema fisico do banco;
- estrategia de multi-tenant e isolamento por Organizacao;
- politicas de permissao efetiva;
- estrategia de testes;
- observabilidade detalhada;
- politica de fila/retry;
- provedor real de e-mail;
- limites de IA basica;
- estrategia de deploy por ambiente;
- CI/CD final.

---

## 15. Decisao oficial

A stack acima e a base oficial da Fase 1 para documentacao e planejamento. Ela
nao altera o prototipo e nao inicia implementacao. A implementacao final sera
posterior, depois de BMAD e Spec Kit.

