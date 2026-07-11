# MVP - Giraffe CRM - Fase 1

> Documento oficial do recorte de MVP da Fase 1.
> Fonte oficial: `docs/01-documentacao-base/`.
> Este documento define escopo de produto, nao implementacao tecnica.

---

## 1. Objetivo do MVP

O objetivo do MVP da Fase 1 e entregar a menor versao coerente do Giraffe CRM
capaz de sustentar uma operacao interna completa de CRM:

- entrar no sistema;
- visualizar prioridades operacionais;
- operar processos em Pipes/Kanban;
- criar, visualizar e mover Cards;
- configurar Formularios basicos;
- consultar Databases e Registros;
- usar automacoes internas simples;
- apoiar comunicacao por e-mail;
- usar IA basica como assistente;
- acompanhar tarefas, solicitacoes, notificacoes e relatorios;
- administrar a propria Organizacao;
- manter Super Admin como referencia separada da Plataforma.

O MVP deve preparar Product Brief, PRD, Arquitetura, BMAD e Spec Kit sem misturar
Fase 1 com Fase 2.

---

## 2. Modulos incluidos

| Modulo | Status no MVP | Observacao |
|---|---|---|
| Login | Incluido | Fluxo de entrada e recuperacao visual de senha. |
| Dashboard operacional | Incluido | Visao de atencao, pipes, databases e indicadores. |
| Pipes / Kanban | Incluido | Processo operacional com fases e cards. |
| Cards | Incluido | Item de trabalho do Pipe. |
| Formularios | Incluido | Contextos inicial, fase e database. |
| Database | Incluido | Bases persistentes de registros. |
| Automacoes basicas | Incluido | Acoes internas, sem HTTP externo. |
| E-mails | Incluido | Composer, historico visual e templates. |
| IA basica | Incluido | Apoio assistivo, nao autonomia avancada. |
| Tarefas e Solicitacoes | Incluido | Acompanhamento operacional. |
| Notificacoes | Incluido | Popover, pagina e status de leitura. |
| Relatorios | Incluido | Indicadores operacionais basicos. |
| Perfil | Incluido | Dados do usuario e contexto. |
| Painel Administrativo da Organizacao | Incluido | Configura a propria Organizacao. |
| Super Admin | Referencia separada | Plataforma, fora da administracao comum da Organizacao. |

---

## 3. Funcionalidades por modulo

### Login

- entrada visual no sistema;
- acesso ao dashboard operacional;
- recuperacao de senha como fluxo visual;
- logout retornando ao login.

Limite: autenticacao real, sessao real e recuperacao real de senha serao
definidas na implementacao.

### Dashboard operacional

- visao inicial da operacao;
- listagem de Pipes;
- listagem de Databases;
- indicadores e prioridades;
- acesso a notificacoes e busca global.

### Pipes / Kanban

- catalogo de Pipes;
- abertura de Pipe navegavel;
- fases em formato Kanban;
- cards organizados por fase;
- movimentacao visual de cards.

Limite: regras formais de transicao de fase e maquina de estados do Card ainda
dependem de decisao.

### Cards

- titulo, criador, fase atual, status e data;
- modal ou visualizacao detalhada;
- comentarios, tarefas, e-mails e historico como referencia visual;
- status confirmados: `ok`, `atrasado`, `expirado`, `vencido`, `finalizado`,
  `arquivado`;
- possivel relacao com Registro.

Limite: Card nao e Registro, e a conexao Card <-> Registro ainda precisa de
decisao de cardinalidade.

### Formularios

- formulario inicial do Pipe;
- formulario da Fase;
- formulario do Database;
- catalogo visual comum de tipos de campo;
- regra de independencia entre os tres contextos.

Limite: lista oficial final de tipos de campo e isolamento tecnico de estado
serao definidos na implementacao.

### Database

- catalogo de Databases;
- visualizacao de registros;
- campos configuraveis por formulario de Database;
- Database como base persistente distinta de Pipe.

Limite: schema fisico e persistencia real serao definidos depois.

### Automacoes basicas

- modelo Evento -> Condicao -> Acao;
- automacoes ligadas ao contexto operacional;
- acoes internas, como notificar responsavel ou usar template de e-mail;
- logs/resultados em nivel operacional basico, quando aplicavel.

Limite: requisicao HTTP externa, Webhooks, API externa e MCP ficam fora da Fase 1.

### E-mails

- composer e historico visual;
- templates de e-mail;
- uso de template por automacao basica;
- e-mail como apoio ao trabalho em Cards.

Limite: envio real, caixa real e sincronizacao com provedores dependem da
arquitetura futura.

### IA basica

- sugestao, resumo e apoio ao usuario;
- apoio em e-mail, card ou automacao basica;
- experiencia assistiva e revisavel.

Limite: IA autonoma avancada e multiplos agentes autonomos ficam fora da Fase 1.

### Tarefas e Solicitacoes

- tarefas com status operacional;
- solicitacoes com acompanhamento;
- ligacao inicial ao Pipe;
- visao de pendencias sem estados vazios falsos.

Limite: vinculo direto Tarefa/Card e Solicitacao/Card ainda e decisao pendente.

### Notificacoes

- popover;
- pagina de notificacoes;
- badge de nao lidas;
- acao de marcar todas como lidas;
- referencia a Card.

Limite: outros alvos de notificacao, como tarefa, usuario ou sistema, ainda nao
estao confirmados no modelo atual.

### Relatorios

- indicadores basicos;
- contagem coerente com pipes/cards reais;
- filtros operacionais.

Limite: analytics avancado fica fora da Fase 1.

### Perfil

- dados do usuario;
- contexto de organizacao;
- pipes relacionados e preferencias basicas, conforme produto.

### Painel Administrativo da Organizacao

- membros;
- informacoes administrativas da propria Organizacao;
- estatisticas, auditoria e financeiro como referencia/escopo controlado;
- itens de API/Token/Webhooks marcados como Fase 2 quando aparecerem.

Limite: nao administra a Plataforma.

### Super Admin

- referencia separada da Plataforma;
- nao e papel comum da Organizacao;
- nao substitui o Painel Administrativo da Organizacao.

---

## 4. Limites do MVP

O MVP nao deve tentar resolver:

- integracoes externas genericas;
- API publica;
- Webhooks externos;
- MCP;
- GraphQL publica;
- requisicao HTTP em automacoes;
- billing complexo;
- marketplace;
- SAML/SSO avancado;
- impersonation;
- app mobile nativo;
- automacoes avancadas;
- IA autonoma avancada;
- analytics avancado;
- permissoes extremamente granulares.

---

## 5. Criterios de sucesso

O MVP da Fase 1 sera considerado bem definido quando:

- todos os modulos da Fase 1 tiverem escopo documentado;
- Pipe, Database, Card e Registro estiverem conceitualmente separados;
- Super Admin estiver separado da Administracao da Organizacao;
- Fase 2 estiver explicitamente bloqueada no escopo atual;
- o prototipo estiver tratado como referencia visual, nao como implementacao;
- a stack oficial estiver documentada;
- as pendencias restantes estiverem marcadas como decisao, e nao como requisito
  funcional ja fechado;
- BMAD puder iniciar sem precisar consultar `docs/_arquivo-legado/` como fonte
  principal.

---

## 6. Fora do MVP

Ficam fora do MVP da Fase 1:

- API externa para clientes;
- Webhooks externos;
- MCP;
- GraphQL publica;
- editor avancado de automacoes;
- marketplace de integracoes;
- billing complexo;
- SAML/SSO avancado;
- acesso de suporte com impersonation;
- app mobile nativo;
- motor avancado de agentes autonomos;
- analytics avancado;
- controle de permissao extremamente granular.

---

## 7. Riscos e pendencias

Riscos de produto:

- confundir Pipe com Database durante a implementacao;
- tratar Card como Registro ou Registro como Card;
- misturar Administrador da Organizacao com Super Admin;
- transformar recursos demonstrativos do prototipo em requisitos fechados sem
  validacao;
- abrir Fase 2 antes de estabilizar o nucleo operacional.

Pendencias conhecidas:

- definir cardinalidade Card <-> Registro;
- definir maquina de estados do Card;
- fechar catalogo de tipos de campo;
- fechar catalogo de eventos, condicoes e acoes internas de automacao;
- definir limites exatos da IA basica;
- definir permissoes efetivas por modulo;
- definir modelo de autenticacao e sessao;
- definir modelo fisico de logs, auditoria, historico e notificacoes.

---

## 8. Decisao final do MVP

A Fase 1 esta pronta para seguir para BMAD como um MVP operacional de CRM, desde
que as pendencias acima sejam tratadas como decisoes de produto/arquitetura e
nao como funcionalidades ja implementadas.

