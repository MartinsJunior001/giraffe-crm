# Visao do Produto - Giraffe CRM - Fase 1

> Documento oficial da visao de produto da Fase 1.
> Fonte oficial: `docs/01-documentacao-base/`.
> O prototipo HTML em `08-referencias-visuais/prototypes/` e usado apenas como
> referencia visual. A implementacao final sera definida depois, em BMAD e Spec Kit.

---

## 1. Visao do produto

O Giraffe CRM e um CRM operacional para organizar o trabalho diario de uma
organizacao em processos, cards, bases de dados, comunicacao, automacoes basicas
e acompanhamento operacional.

A Fase 1 deve entregar uma base clara para o produto: o usuario entra no sistema,
entende o que precisa de atencao, navega por pipes, opera cards, consulta
databases, acompanha tarefas, recebe notificacoes, usa recursos basicos de IA e
administra a propria organizacao.

O produto deve ser simples na superficie e consistente por baixo. A Fase 1 nao
deve tentar resolver todo o universo de integracoes, marketplace, analytics
avancado ou permissoes extremamente granulares.

---

## 2. Problema que resolve

Equipes operacionais costumam perder contexto quando processos, dados, tarefas,
e-mails, historico e decisoes ficam espalhados em ferramentas diferentes.

O Giraffe CRM resolve esse problema ao reunir, em uma unica experiencia:

- processos em formato de Pipe/Kanban;
- cards com fase atual, status, historico e acoes;
- databases para informacao persistente;
- formularios configuraveis para captura e estrutura dos dados;
- automacoes basicas para reduzir tarefas repetitivas;
- e-mails e templates como apoio operacional;
- IA basica para sugestao, resumo e apoio humano;
- tarefas, solicitacoes, notificacoes e relatorios;
- administracao da propria organizacao.

---

## 3. Publico-alvo inicial

O publico-alvo inicial da Fase 1 e composto por organizacoes que precisam
controlar processos internos e relacionamento operacional com clientes, leads,
parceiros ou contratos.

Perfis principais:

- **Administrador da Organizacao:** configura e acompanha a operacao da propria
  organizacao.
- **Membro:** opera pipes, cards, databases, e-mails, tarefas e solicitacoes.
- **Convidado:** possui acesso limitado, conforme decisoes de permissao.
- **Super Admin:** administra a Plataforma Giraffe, separado da Organizacao.

O Administrador da Organizacao nao e Super Admin. O Super Admin pertence ao
escopo da Plataforma.

---

## 4. Proposta de valor

A proposta de valor da Fase 1 e:

> Dar a uma organizacao uma base operacional clara para acompanhar processos,
> dados, comunicacao e tarefas em um CRM unico, sem misturar Pipe com Database,
> Card com Registro ou Administracao da Organizacao com Super Admin.

Beneficios esperados:

- mais clareza sobre o que esta em andamento;
- menos dispersao entre processos e bases de dados;
- melhor rastreabilidade de cards, tarefas e notificacoes;
- automacoes basicas sem abrir integracoes externas prematuramente;
- IA assistiva controlada, sem prometer autonomia avancada;
- base documental pronta para Product Brief, PRD, Arquitetura, BMAD e Spec Kit.

---

## 5. Principios do produto

1. **Operacao antes de complexidade.** A Fase 1 prioriza os fluxos centrais de
   trabalho, nao recursos avancados.
2. **Conceitos separados.** Pipe nao e Database; Card nao e Registro; Super Admin
   nao e Administrador da Organizacao.
3. **Visual demonstra, Markdown decide.** O HTML mostra direcao visual, mas nao
   define arquitetura, banco, API ou implementacao final.
4. **IA assistiva.** IA ajuda o usuario, mas nao age como conjunto de agentes
   autonomos avancados na Fase 1.
5. **Integracoes sob controle.** API publica, Webhooks, MCP, GraphQL publica e
   requisicao HTTP em automacoes ficam fora da Fase 1.
6. **Permissoes simples o bastante para o MVP.** A Fase 1 nao inclui permissoes
   extremamente granulares por campo, acao ou regra customizada complexa.
7. **Organizacao como limite operacional.** A Organizacao define o contexto dos
   dados operacionais.

---

## 6. Conceitos centrais

| Conceito | Definicao oficial da Fase 1 |
|---|---|
| Plataforma | O produto Giraffe acima das organizacoes; escopo do Super Admin. |
| Organizacao | Empresa/cliente que usa o CRM; limite da operacao. |
| Pipe | Processo de trabalho em formato Kanban. |
| Fase | Etapa de um Pipe. |
| Card | Item de trabalho que pertence a um Pipe e esta em uma Fase. |
| Database | Base de informacao persistente, separada de Pipe. |
| Registro | Entrada de um Database. |
| Formulario | Configuracao de campos para Pipe, Fase ou Database. |
| Automacao basica | Regra interna no modelo Evento -> Condicao -> Acao. |
| IA basica | Apoio assistivo, revisavel e controlado pelo usuario. |
| Administrador da Organizacao | Administra somente a propria organizacao. |
| Super Admin | Administra a Plataforma, como referencia separada. |

---

## 7. Diferenca entre Pipe, Database, Card e Registro

### Pipe

Pipe organiza processo. Ele representa o fluxo operacional, normalmente em
formato Kanban, com fases e cards.

### Database

Database guarda informacao persistente. Ele representa uma base estruturada de
registros, como empresas, parceiros, contratos, acessos ou outros dados de
referencia.

### Card

Card pertence a um Pipe. Ele representa um trabalho em andamento, possui fase,
status e pode se relacionar com outras entidades.

### Registro

Registro pertence a um Database. Ele representa uma linha ou entrada persistente
de uma base de dados.

### Regras obrigatorias

- Pipe nao e Database.
- Card nao e Registro.
- Card pode se relacionar com Registro, mas a relacao nao funde os conceitos.
- Pipe organiza execucao; Database guarda informacao.
- Card vive no processo; Registro vive na base de dados.

---

## 8. Foco da Fase 1

A Fase 1 contem:

- Login;
- Dashboard operacional;
- Pipes / Kanban;
- Cards;
- Formularios;
- Database;
- Automacoes basicas;
- E-mails;
- IA basica;
- Tarefas e Solicitacoes;
- Notificacoes;
- Relatorios;
- Perfil;
- Painel Administrativo da Organizacao;
- Super Admin apenas como referencia separada da Plataforma.

O foco e produzir uma base funcional e conceitual consistente para iniciar BMAD
sem confundir escopo atual com escopo futuro.

---

## 9. O que nao entra na Fase 1

Devem ser tratados como Fase 2 ou futuro:

- API externa;
- Webhooks externos;
- MCP;
- GraphQL publica;
- requisicao HTTP em automacoes;
- integracoes externas genericas;
- Marketplace;
- billing complexo;
- SAML/SSO avancado;
- impersonation ou acesso de suporte;
- app mobile nativo;
- automacoes avancadas;
- IA autonoma avancada com multiplos agentes;
- analytics avancado;
- permissoes extremamente granulares.

---

## 10. Decisoes documentadas

- A fonte oficial da documentacao e `docs/01-documentacao-base/`.
- O prototipo HTML e referencia visual, nao implementacao final.
- Implementacao final sera posterior, apos BMAD e Spec Kit.
- Super Admin pertence a Plataforma e deve permanecer separado da Organizacao.
- Administrador da Organizacao administra apenas a propria organizacao.
- API externa, Webhooks, MCP, GraphQL publica e requisicao HTTP em automacoes
  pertencem a Fase 2.

---

## 11. Pendencias que seguem abertas

Estas pendencias nao bloqueiam a preparacao do BMAD, mas devem ser resolvidas na
etapa de produto/arquitetura:

- cardinalidade final da conexao Card <-> Registro;
- maquina de estados e gatilhos dos status do Card;
- catalogo oficial completo de tipos de campo;
- limites exatos da IA basica;
- regras efetivas de permissoes por modulo;
- isolamento multi-organizacao materializado em dados;
- estrutura final de historico, logs e auditoria.

