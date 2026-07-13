---
name: giraffe-data-modeling-definition
description: Transforma a Visão do Produto, o MVP, as Regras de Negócio e as Permissões aprovadas do Giraffe CRM em uma modelagem de dados conceitual e lógica, clara, rastreável e não engessada. Use ao definir entidades, responsabilidades, relacionamentos, cardinalidades, ciclos de vida, fontes de verdade e históricos para Organizações, Workspaces, Contatos, Databases, Registros, Pipes, Fases, Tarefas, Responsáveis, Cards, Formulários, Submissões, Destinos de Dados, Arquivos, Conversas, Mensagens, Histórico, Automações, Execuções, Logs, IA, Dashboards e Integrações. Não use para escolher banco de dados, ORM, tabelas físicas, índices, SQL, migrations, endpoints, componentes visuais ou detalhes de infraestrutura.
---

# Skill — Modelagem de Dados do Giraffe CRM

## 1. Objetivo

Transformar os documentos aprovados do Giraffe CRM em uma modelagem de dados conceitual e lógica capaz de sustentar o produto sem engessá-lo.

A Skill deve responder:

**“Quais informações existem no Giraffe CRM, quem é responsável por cada uma, como se relacionam, qual é sua fonte de verdade e o que acontece com elas ao longo do tempo?”**

A modelagem deve permitir que as próximas etapas decidam arquitetura e implementação sem reinterpretar o domínio.

Esta Skill deve proteger especialmente:

- Form Builder configurável por serviço;
- conexão Formulário → Database → Pipe;
- criação de Cards e Registros relacionados;
- Fases com tarefas próprias;
- Fases com responsáveis próprios;
- execução real das tarefas no Card;
- Histórico visível das atividades anteriores do Card;
- automações no modelo Quando → Condições → Então;
- execuções, resultados e Logs de automação;
- IA como ação possível dentro de automações;
- contatos;
- clientes e informações persistentes;
- histórico de conversas;
- arquivos e documentos;
- IA assistida;
- Dashboard operacional;
- integrações externas.

---

## 2. Entradas obrigatórias

Antes de criar ou alterar a modelagem, consulte:

- Visão do Produto aprovada;
- MVP aprovado;
- Regras de Negócio aprovadas;
- Permissões aprovadas;
- decisões explícitas já registradas;
- referências visuais aprovadas, apenas para compreender quais comportamentos e contextos o modelo precisa sustentar;
- modelagem anterior, quando houver.

Para o Giraffe CRM, considere obrigatoriamente:

- público inicial: agências de marketing;
- o produto é multi-organização;
- Formulário captura a entrada;
- Database guarda informações persistentes;
- Pipe organiza processos;
- Fase orienta a execução atual;
- Card representa o trabalho real em andamento;
- Pipe e Database possuem ciclos de vida separados;
- Pipe e Database devem se relacionar;
- o Form Builder deve ser configurável por serviço;
- um Formulário pode criar ou atualizar Registro;
- um Formulário pode criar Card quando configurado;
- Cards e Registros podem ser relacionados;
- diferentes Fases podem possuir tarefas diferentes;
- diferentes Fases podem possuir responsáveis diferentes;
- tarefa configurada na Fase não é a mesma coisa que tarefa executada no Card;
- o Histórico do Card deve sobreviver às mudanças de Fase;
- automações seguem Quando → Condições → Então;
- automações precisam de execução rastreável;
- Log de automação e Histórico operacional possuem finalidades diferentes;
- IA pode ser uma ação dentro de uma automação;
- arquivos importantes não podem existir apenas em Cards temporários;
- contatos precisam sustentar comunicação em múltiplos canais;
- histórico de conversas deve sobreviver ao fim de um processo;
- IA assistida para follow-up faz parte do MVP;
- painel operacional faz parte do MVP;
- pelo menos uma integração externa concreta faz parte do MVP;
- permissões devem restringir acesso sem alterar a responsabilidade de cada entidade;
- o núcleo não deve codificar estruturas específicas de uma única agência.

---

## 3. Fonte de verdade e conflitos documentais

Não resolva silenciosamente conflitos entre documentos.

Ao encontrar contradição entre Visão, MVP, Regras de Negócio, Permissões e modelagem existente:

1. identifique os documentos envolvidos;
2. descreva exatamente o conflito;
3. não consolide a parte conflitante do modelo;
4. registre a questão em **Conflitos e decisões pendentes**;
5. aguarde decisão explícita;
6. depois da decisão, reconcilie os documentos afetados.

Uma decisão mais recente só substitui outra quando a mudança for:

- explícita;
- aprovada;
- registrada;
- reconciliada com os documentos afetados.

A modelagem não pode inventar uma regra de produto para resolver uma dúvida técnica.

---

## 4. O que esta Skill deve definir

Esta Skill deve definir:

- entidades do domínio;
- responsabilidade de cada entidade;
- fonte de verdade;
- relacionamentos;
- cardinalidades;
- dependências de ciclo de vida;
- estados de negócio necessários;
- eventos históricos necessários;
- fronteiras entre domínios;
- dados derivados;
- dados persistentes;
- dados temporários;
- referências externas;
- resultados de execução;
- riscos de duplicação;
- riscos de perda de histórico.

---

## 5. O que esta Skill não deve definir

Não use esta Skill para escolher:

- PostgreSQL;
- MySQL;
- MongoDB;
- ORM;
- nomes de tabelas físicas;
- colunas físicas;
- tipos SQL;
- índices;
- partições;
- cache;
- filas;
- buckets;
- providers;
- endpoints;
- schemas de API;
- migrations;
- código.

Também não deve decidir:

- layout;
- componentes de interface;
- posição de painéis;
- largura de colunas;
- cores;
- roadmap;
- cronograma;
- tarefas de implementação.

### Exemplo correto

**“Uma Execução de Automação pertence a uma Automação e deve preservar gatilho, contexto, ação e resultado.”**

### Exemplo incorreto

**“Criar tabela automation_runs com JSONB e índice GIN.”**

---

## 6. Fronteira com referências visuais

As referências aprovadas para:

- Form Builder;
- Visualização do Card;
- Automações;

podem revelar necessidades do domínio.

Exemplos:

- Form Builder com biblioteca, construção e configuração → exige diferenciar Formulário, Seção, Campo e Configuração;
- Card mostrando atividades anteriores → exige Histórico operacional consultável;
- Automação Quando → Condições → Então → exige separar definição da automação e execução real.

### Regra

A referência visual ajuda a identificar conceitos.

Ela não define:

- entidade por posição na tela;
- entidade por coluna visual;
- campo de banco por componente de interface.

### Exemplo

A interface mostra Histórico do lado esquerdo.

A modelagem correta é:

**Card possui contexto atual e se relaciona a eventos históricos.**

A modelagem incorreta é:

**criar entidade LeftSidebarHistory.**

---

## 7. Princípios centrais da modelagem

### 7.1 Uma entidade deve ter uma responsabilidade principal

Não use uma entidade para representar simultaneamente:

- pessoa;
- cliente;
- processo;
- formulário;
- tarefa;
- automação;
- conversa;
- arquivo;
- evento.

Se dois conceitos possuem ciclos de vida diferentes, devem ser modelados separadamente.

---

### 7.2 Fonte de verdade deve ser explícita

Para cada informação importante, responda:

**“Qual entidade é a fonte oficial desta informação?”**

Exemplos:

- fase atual do processo → Card;
- configuração da Fase → Fase + definições relacionadas;
- tarefa esperada na Fase → Definição de Tarefa da Fase;
- tarefa realmente executada → Execução de Tarefa do Card;
- dados persistentes do cliente → Registro do Database;
- identidade de uma pessoa → Contato;
- estrutura de coleta → Formulário;
- envio realizado → Submissão;
- lógica de automação → Automação;
- resultado de uma execução → Execução de Automação;
- detalhe de diagnóstico operacional da automação → Log/Evento de Execução;
- histórico de comunicação → Conversa + Mensagens;
- histórico de mudança de Fase → Evento de Transição;
- arquivo persistente → Arquivo/Ativo;
- indicador operacional → dado derivado das entidades de origem.

Não duplique informação sem justificar qual cópia é derivada.

---

### 7.3 Configuração e execução não são a mesma coisa

O modelo deve distinguir:

```text
configuração
        ≠
execução real
```

Exemplos:

```text
Tarefa configurada na Fase
        ≠
Tarefa executada no Card
```

```text
Automação configurada
        ≠
Execução da Automação
```

```text
Formulário publicado
        ≠
Submissão recebida
```

---

### 7.4 Estado atual e histórico não são a mesma coisa

O modelo deve distinguir:

- estado atual;
- eventos que levaram ao estado atual.

Exemplos:

- Card possui uma Fase atual;
- Histórico de Fases registra transições anteriores;
- Tarefa possui estado atual;
- eventos relevantes preservam execução e conclusão;
- Automação possui estado atual;
- Execuções preservam o que aconteceu antes.

---

### 7.5 Relação não significa fusão

Relacionar entidades não deve destruir suas responsabilidades.

Exemplos:

- Card relacionado a Cliente não transforma Cliente em Card;
- Card relacionado a outro Card não cria um único processo;
- Conversa relacionada a Card não passa a existir apenas dentro do Card;
- Arquivo relacionado a Mensagem pode também se relacionar ao Registro do cliente;
- Submissão que cria Card e Registro não transforma os três no mesmo conceito.

---

### 7.6 O núcleo deve ser universal

Não fixe no núcleo campos como:

- verba de Meta Ads;
- quantidade de artes;
- URL do site;
- nicho do cliente;
- gestor de tráfego;
- data de postagem.

Esses dados pertencem a:

- Databases configuráveis;
- Campos configuráveis;
- Formulários configuráveis;
- Templates;
- módulos futuros.

O núcleo deve modelar capacidades universais.

---

## 8. Mapa de domínios obrigatório

A Skill deve avaliar estes domínios:

1. Organização e contexto;
2. Identidade e participação;
3. Contatos;
4. Databases e Registros;
5. Pipe, Fases, Tarefas e Responsáveis;
6. Relacionamentos;
7. Form Builder, Formulários e Submissões;
8. Arquivos e documentos;
9. Conversas e Mensagens;
10. Histórico e Auditoria;
11. Automações, Execuções e Logs;
12. IA assistida;
13. Dashboard operacional;
14. Integrações externas.

Não crie entidades sem necessidade real.

---

# 9. Domínio — Organização e contexto

## 9.1 Organização

Representa a empresa cliente do Giraffe CRM.

### Responsabilidade

Ser o limite principal de:

- propriedade dos dados;
- isolamento;
- usuários;
- recursos;
- permissões;
- integrações.

### Regras

- dados de Organizações diferentes não podem se misturar;
- toda entidade de negócio deve possuir contexto organizacional identificável;
- relação entre entidades de Organizações diferentes deve ser proibida, exceto quando existir decisão explícita de compartilhamento futuro.

---

## 9.2 Workspace

Representa um espaço organizacional dentro da empresa, quando necessário.

### Responsabilidade

Agrupar recursos e operação dentro da Organização.

### Regra

A Skill deve verificar se o MVP precisa realmente distinguir:

- Organização;
- Workspace.

Se os dois conceitos tiverem a mesma responsabilidade no escopo atual, registre a decisão pendente em vez de criar duplicação conceitual.

---

# 10. Domínio — Identidade e participação

## 10.1 Usuário

Representa uma identidade autenticada que utiliza o sistema.

### Responsabilidade

Identificar quem executa ações internas.

### Não representa

- Contato externo;
- Cliente;
- participante de Formulário público.

---

## 10.2 Participação na Organização

Representa a relação entre Usuário e Organização.

### Responsabilidade

Registrar que um Usuário participa de uma Organização em determinado contexto de acesso.

### Regra

O perfil de acesso não deve ser tratado como atributo permanente da pessoa.

O mesmo Usuário pode possuir participações diferentes em contextos diferentes.

---

## 10.3 Equipe

Representa um agrupamento interno de participantes.

### Responsabilidade

Apoiar:

- atribuição;
- visibilidade;
- responsabilidade;
- escopo de permissões.

### Regra

Equipe não deve substituir Usuário nem Organização.

---

# 11. Domínio — Contatos

## 11.1 Contato

Representa uma pessoa com quem a Organização se relaciona.

### Responsabilidade

Ser a identidade humana persistente usada para:

- comunicação;
- relacionamentos;
- follow-up;
- histórico de Conversas;
- associação a Clientes e Registros.

### Regra central

**Contato não é sinônimo de Cliente.**

Um Cliente pode ser:

- empresa;
- marca;
- Organização;
- conta;
- projeto.

Esses conceitos podem existir como Registros em Databases configuráveis.

O Contato representa a pessoa.

---

## 11.2 Identidade de Contato

Representa uma forma pela qual um Contato pode ser identificado ou alcançado.

Exemplos:

- e-mail;
- telefone;
- WhatsApp;
- identificador de canal externo.

### Responsabilidade

Permitir que um mesmo Contato possua múltiplas identidades de comunicação.

### Regras

- um Contato pode possuir várias identidades;
- uma identidade externa deve manter o contexto do canal ou integração de origem;
- identificadores externos não são identidade global universal;
- o mesmo valor vindo de integrações diferentes não deve ser automaticamente considerado a mesma identidade sem regra explícita.

---

## 11.3 Relação Contato ↔ Registro

Representa o vínculo entre uma pessoa e uma informação persistente do negócio.

Exemplos:

- Contato ↔ Cliente;
- Contato ↔ Empresa;
- Contato ↔ Projeto.

### Regras

- um Contato pode se relacionar a vários Registros;
- um Registro pode se relacionar a vários Contatos;
- o tipo da relação deve poder ser identificado quando necessário.

Não transforme exemplos de tipo em valores fixos universais sem necessidade.

---

## 11.4 Regras de deduplicação

Não mescle Contatos automaticamente apenas porque possuem:

- mesmo nome;
- mesmo telefone;
- mesmo e-mail.

A modelagem deve permitir:

- identificar possível duplicidade;
- revisar;
- decidir;
- preservar histórico.

### Regra de fusão futura

Quando houver fusão de Contatos:

- relacionamentos não podem ser perdidos;
- Conversas não podem ser perdidas;
- Arquivos não podem ser perdidos;
- Referências Externas não podem ser perdidas;
- deve existir rastreabilidade da fusão.

---

# 12. Domínio — Databases e Registros

## 12.1 Database

Representa uma coleção configurável de informações persistentes.

Exemplos:

- Clientes;
- Empresas;
- Campanhas;
- Sites;
- Contratos;
- Ativos Digitais.

### Responsabilidade

Definir a estrutura de um conjunto de Registros.

### Regra

Database não representa fluxo ou Fase.

---

## 12.2 Definição de Campo

Representa um campo configurável de um Database.

### Responsabilidade

Definir:

- nome;
- finalidade;
- tipo lógico;
- obrigatoriedade de negócio quando aplicável.

### Regra

Campos específicos de uma agência não viram atributos fixos do núcleo.

---

## 12.3 Registro

Representa uma informação persistente dentro de um Database.

### Exemplos

- Cliente;
- Empresa;
- Campanha;
- Site.

### Responsabilidade

Ser a instância persistente da estrutura definida pelo Database.

### Regra

O Registro continua existindo independentemente de Cards ativos.

---

## 12.4 Valor de Campo

Representa o valor atribuído a um Campo em um Registro.

### Regra

A Skill deve modelar conceitualmente a separação entre:

- definição da estrutura;
- valor do Registro.

Não decidir nesta etapa como isso será armazenado fisicamente.

---

# 13. Domínio — Pipe, Fases, Tarefas e Responsáveis

## 13.1 Pipe

Representa um processo configurável.

Exemplos:

- Onboarding;
- Criação de Site;
- Solicitação de Arte;
- Implantação de Tráfego Pago.

### Responsabilidade

Definir o fluxo de trabalho.

### Regra

Pipe não é repositório principal de informações persistentes do Cliente.

---

## 13.2 Fase

Representa uma etapa configurável do Pipe.

### Responsabilidade

Indicar um estado possível do processo e servir como contexto atual de execução.

### Regras

- uma Fase pertence a um Pipe;
- a ordem das Fases deve ser identificável;
- Fases específicas de uma agência não devem ser fixas no núcleo.

---

## 13.3 Instrução da Fase

Representa orientação operacional associada à Fase.

### Responsabilidade

Explicar o que deve ser considerado durante aquela etapa.

### Regra

A Instrução da Fase é configuração.

Ela não representa atividade executada.

---

## 13.4 Definição de Tarefa da Fase

Representa uma tarefa esperada quando um Card está em determinada Fase.

### Responsabilidade

Definir o modelo de trabalho da etapa.

### Pode permitir identificar

- Fase;
- título;
- orientação;
- ordem;
- obrigatoriedade quando aplicável;
- responsável padrão quando aprovado.

### Regra central

**Definição de Tarefa da Fase não é Execução de Tarefa do Card.**

---

## 13.5 Execução de Tarefa do Card

Representa a ocorrência real de uma tarefa no contexto de um Card.

### Responsabilidade

Preservar o trabalho efetivamente realizado.

### Deve permitir identificar

- Card;
- Fase de contexto;
- Definição de Tarefa de origem quando houver;
- estado atual;
- responsável quando aplicável;
- quem executou;
- momento de conclusão;
- resultado relevante.

### Regra

A execução deve continuar rastreável mesmo depois que o Card sair da Fase.

---

## 13.6 Responsabilidade Padrão da Fase

Representa a definição de quem deve assumir ou participar do trabalho naquela Fase.

Pode apontar para:

- Usuário;
- Equipe;
- outro sujeito aprovado futuramente.

### Responsabilidade

Definir o padrão de responsabilidade da etapa.

### Regra

A política de substituir, acumular ou preservar responsáveis anteriores não deve ser presumida.

Se ainda não estiver aprovada, registre como decisão pendente.

---

## 13.7 Atribuição do Card

Representa a responsabilidade real atual no Card.

### Responsabilidade

Identificar quem está responsável pelo trabalho real.

### Regra

Atribuição do Card e Responsabilidade Padrão da Fase possuem ciclos de vida diferentes.

### Regra

A modelagem deve permitir, quando necessário:

- Usuário responsável;
- Equipe responsável;
- múltiplos participantes.

Não presumir cardinalidade única sem decisão aprovada.

---

## 13.8 Card

Representa uma instância em andamento dentro de um Pipe.

### Responsabilidade

Guardar o estado atual do processo.

### Deve permitir identificar

- Pipe;
- Fase atual;
- responsáveis atuais quando aplicável;
- relações com Registros;
- relações com outros Cards;
- datas relevantes;
- estado de conclusão ou arquivamento.

### Regra

O Card não deve duplicar silenciosamente dados persistentes do Registro relacionado.

---

## 13.9 Histórico de Fases

Representa as mudanças de Fase do Card ao longo do tempo.

### Responsabilidade

Permitir responder:

- de qual Fase saiu;
- para qual Fase foi;
- quando;
- por quem ou por qual origem;
- qual contexto provocou a mudança.

### Regra

Fase atual do Card e Histórico de Fases possuem responsabilidades diferentes.

---

# 14. Domínio — Relacionamentos

## 14.1 Relação Card ↔ Registro

Representa a conexão entre processo e informação persistente.

### Regra central

**O Card organiza o trabalho; o Registro preserva a informação.**

### Cardinalidade

A Skill deve permitir avaliar:

- um Card relacionado a um Registro;
- um Card relacionado a vários Registros;
- um Registro relacionado a vários Cards.

Não fixar 1:1 sem necessidade explícita.

---

## 14.2 Relação Card ↔ Card

Representa a conexão entre processos distintos.

Exemplos:

- Card de Onboarding ↔ Card de Criação de Site;
- Card de Implantação ↔ Card de Criação de Artes.

### Regra

Cards relacionados continuam com:

- Pipes próprios;
- Fases próprias;
- tarefas próprias;
- responsáveis próprios;
- ciclos de vida próprios.

A relação preserva contexto.

Ela não funde os processos.

---

## 14.3 Relação Registro ↔ Registro

Representa conexões entre informações persistentes.

Exemplos:

- Cliente ↔ Contrato;
- Cliente ↔ Campanha;
- Cliente ↔ Site.

### Regra

Relacionamentos configuráveis não devem ser substituídos por campos duplicados.

---

## 14.4 Origem de Criação Relacionada

Quando um Formulário, Automação ou ação cria mais de um elemento relacionado, o modelo deve permitir preservar a origem comum.

Exemplos:

```text
Submissão
├── criou Registro
└── criou Card relacionado
```

```text
Execução de Automação
├── criou Card A
└── relacionou Card A ao Card B
```

### Regra

Preservar a origem comum não significa transformar os elementos criados em uma única entidade.

---

## 14.5 Relação Conversa ↔ Contexto

Uma Conversa pode se relacionar a:

- Contato;
- Registro;
- Card;
- outros contextos aprovados.

### Regra

A Conversa não depende do Card para existir.

O processo pode terminar e a comunicação continuar.

---

# 15. Domínio — Form Builder, Formulários e Submissões

## 15.1 Formulário

Representa uma estrutura configurável de entrada de informações.

### Responsabilidade

Definir o que pode ser coletado.

### Deve permitir identificar

- Organização proprietária;
- nome;
- finalidade;
- estado de publicação;
- estrutura atual;
- Destinos de Dados configurados.

### Regra

O Formulário é configurável por serviço.

Não deve possuir campos fixos específicos de uma agência no núcleo.

---

## 15.2 Seção do Formulário

Representa um agrupamento estrutural dentro do Formulário.

### Responsabilidade

Organizar campos e orientações.

### Regra

Seção é parte da definição do Formulário.

Ela não representa resposta enviada.

---

## 15.3 Definição de Campo do Formulário

Representa um campo configurado para coleta.

### Responsabilidade

Definir:

- nome;
- tipo lógico;
- orientação;
- obrigatoriedade;
- posição;
- opções quando aplicável.

### Regra

Definição de Campo e Valor Submetido são conceitos diferentes.

---

## 15.4 Publicação do Formulário

Representa a disponibilização do Formulário para uso.

### Responsabilidade

Permitir distinguir:

- Formulário em edição;
- Formulário publicado;
- versões ou estados futuros quando necessários.

### Regra

A Skill deve avaliar se o MVP precisa preservar a configuração exata usada em cada Submissão.

Se sim, a publicação deve fornecer uma referência estável da versão ou estrutura usada.

Não inventar versionamento completo sem necessidade.

---

## 15.5 Submissão

Representa um envio realizado por uma pessoa ou sistema externo.

### Responsabilidade

Preservar o contexto original da entrada.

### Deve permitir identificar

- Formulário de origem;
- publicação ou estrutura de origem quando necessário;
- momento do envio;
- origem conhecida;
- dados recebidos;
- arquivos recebidos;
- estado de processamento;
- resultados produzidos.

### Regra

A Submissão não deve desaparecer depois de gerar seus resultados.

---

## 15.6 Valor Submetido

Representa o valor recebido para uma Definição de Campo.

### Regra

A modelagem deve distinguir:

- o Campo que definiu a pergunta;
- o valor realmente enviado.

Não decidir armazenamento físico nesta etapa.

---

## 15.7 Destino de Dados do Formulário

Representa a configuração do que deve acontecer com a Submissão.

Pode definir, conforme escopo aprovado:

- criar Registro;
- atualizar Registro;
- criar Card;
- relacionar Card e Registro;
- associar Arquivos.

### Responsabilidade

Ligar a entrada ao contexto real do produto.

### Regra central

**Formulário captura. Database preserva. Pipe executa.**

### Regra

Nem todo Formulário precisa criar Card.

Nem toda Submissão cria todos os resultados possíveis.

---

## 15.8 Resultado da Submissão

Representa um efeito produzido pelo processamento da Submissão.

Pode relacionar a Submissão a:

- Contato criado ou identificado;
- Registro criado;
- Registro atualizado;
- Card criado;
- relação criada;
- Arquivo associado;
- falha ou pendência relevante.

### Regra

Resultado da Submissão e Submissão são conceitos diferentes.

---

# 16. Domínio — Arquivos e documentos

## 16.1 Arquivo ou Ativo

Representa um arquivo persistente conhecido pelo sistema.

### Responsabilidade

Preservar identidade e metadados do arquivo.

### Deve permitir identificar

- Organização proprietária;
- origem;
- tipo;
- nome;
- momento de entrada;
- relações de negócio.

### Regra

O Arquivo não deve existir apenas como dado interno de Card ou Mensagem.

---

## 16.2 Relação de Arquivo

Representa o vínculo do Arquivo com contextos como:

- Registro;
- Card;
- Mensagem;
- Submissão;
- Execução de Tarefa quando necessário.

### Regra

Um mesmo Arquivo pode possuir mais de uma relação quando isso representar o negócio real.

---

## 16.3 Segredos

Senhas, tokens, chaves e segredos não devem ser modelados como Arquivos ou valores comuns do Database.

A modelagem deve registrar apenas:

- referência segura;
- metadados;
- status;
- contexto autorizado;

até existir mecanismo próprio aprovado.

---

# 17. Domínio — Conversas e Mensagens

## 17.1 Conversa

Representa um contexto contínuo de comunicação.

### Responsabilidade

Agrupar comunicação relacionada ao longo do tempo.

### Deve permitir identificar

- Organização;
- canal;
- participantes;
- estado atual quando aplicável;
- relações com Contatos;
- relações opcionais com Registros e Cards.

### Regra central

**Conversa não pertence obrigatoriamente a um Card.**

O Card pode ser concluído e a Conversa continuar existindo.

---

## 17.2 Participante da Conversa

Representa quem participa da comunicação.

Pode referenciar:

- Contato;
- Usuário;
- participante externo identificado pelo canal.

### Regra

O participante mantém seu papel no contexto da Conversa sem duplicar a entidade original.

---

## 17.3 Mensagem

Representa uma unidade de comunicação dentro de uma Conversa.

### Deve permitir identificar

- Conversa;
- direção;
- remetente;
- momento;
- canal;
- estado de entrega quando aplicável;
- referência externa quando existir;
- Arquivos relacionados.

### Regra

Uma Mensagem recebida de sistema externo deve preservar referência externa estável dentro do contexto da integração.

---

## 17.4 Nota Interna

Representa uma anotação da equipe que não deve ser enviada ao Contato.

### Regra

Nota Interna e Mensagem Externa não devem ser o mesmo conceito.

---

## 17.5 Histórico de entrega da Mensagem

Representa mudanças relevantes no resultado de uma Mensagem externa.

Exemplos:

- pendente;
- enviada;
- entregue;
- não concluída.

### Regra

Estado atual e eventos relevantes de entrega devem poder ser distinguidos quando o canal fornecer essa informação.

---

## 17.6 Múltiplos canais

A modelagem deve suportar mais de um canal ao longo da evolução do produto.

Exemplos futuros:

- WhatsApp;
- e-mail;
- telefonia;
- outros canais.

### Regra

Não modele Conversa de forma exclusiva para um único provedor.

---

# 18. Domínio — Histórico e Auditoria

## 18.1 Histórico de Atividade do Card

Representa eventos de negócio visíveis no contexto operacional do Card.

Exemplos:

- criação do Card;
- mudança de Fase;
- tarefa concluída;
- responsável alterado;
- comentário;
- Arquivo anexado;
- Automação executada;
- sugestão de IA aprovada;
- ação externa relevante.

### Responsabilidade

Permitir reconstruir o que aconteceu no fluxo de negócio.

### Regra

O Histórico do Card deve permanecer consultável depois que o Card avançar para novas Fases.

---

## 18.2 Evento de Atividade

Representa uma ocorrência relevante no Histórico operacional.

### Deve permitir identificar

- Card ou contexto;
- tipo de evento;
- momento;
- ator ou origem;
- referência ao recurso relacionado;
- resumo operacional necessário.

### Regra

O evento não deve copiar indiscriminadamente todo o conteúdo do recurso relacionado.

---

## 18.3 Histórico de Fases

Continua sendo especializado em transições de Fase.

### Regra

A Skill deve decidir se:

- Histórico de Fases será uma visão especializada do Histórico de Atividade;
- ou um conceito separado relacionado aos mesmos eventos.

Não escolher solução física nesta etapa.

O importante é preservar a semântica da transição.

---

## 18.4 Histórico de Tarefas

A execução de Tarefa deve preservar mudanças relevantes do seu ciclo de vida.

Exemplos:

- criada para o Card;
- iniciada;
- concluída;
- reaberta.

### Regra

Não é obrigatório criar uma entidade universal de evento para toda mudança.

Modele apenas o necessário para responder ao comportamento aprovado.

---

## 18.5 Auditoria

Representa eventos relevantes para controle e segurança.

Exemplos:

- alteração de permissão;
- mudança administrativa crítica;
- ação sensível quando aplicável.

### Regra

Histórico operacional e Auditoria possuem finalidades diferentes.

---

## 18.6 Histórico de Conversa

O histórico de Conversa é composto por:

- Conversa;
- Participantes;
- Mensagens;
- Notas Internas;
- Eventos relevantes de entrega.

### Regra

Não copie todo o Histórico de Conversa para o Card.

---

# 19. Domínio — Automações, Execuções e Logs

## 19.1 Automação

Representa uma regra configurável que reage a eventos.

### Responsabilidade

Definir o comportamento esperado:

```text
QUANDO
evento ocorre
        ↓
SE
condições forem satisfeitas
        ↓
ENTÃO
ação é solicitada
```

### Deve permitir identificar

- Organização;
- nome;
- estado atual;
- gatilho;
- condições opcionais;
- ação;
- recursos de contexto;
- quem criou ou alterou quando necessário.

### Regra

Automação configurada não é a mesma coisa que Execução de Automação.

---

## 19.2 Estado da Automação

Representa se a Automação pode reagir a novos eventos.

No MVP, deve permitir distinguir pelo menos:

- ativa;
- pausada.

### Regra

Estado atual não substitui histórico de execuções.

---

## 19.3 Definição de Gatilho

Representa o evento que inicia a avaliação da Automação.

Exemplos do MVP podem incluir:

- Formulário enviado;
- Card criado;
- Card entra em Fase;
- Campo atualizado;
- Card fica sem atividade.

### Regra

O modelo conceitual não deve ficar preso a uma lista fixa eterna de gatilhos.

---

## 19.4 Definição de Condição

Representa um critério adicional avaliado antes da ação.

### Regra

A Automação pode não possuir Condições.

### Regra

Condição configurada não é resultado de avaliação.

---

## 19.5 Definição de Ação

Representa o que a Automação pretende fazer.

Exemplos:

- criar Card relacionado;
- criar ou atualizar Registro;
- mover Card;
- atualizar campo;
- atribuir responsável;
- solicitar sugestão à IA;
- executar ação externa.

### Regra

A definição da ação não comprova que a ação foi concluída.

---

## 19.6 Execução de Automação

Representa uma ocorrência real de uma Automação.

### Responsabilidade

Preservar:

- Automação de origem;
- momento de início;
- contexto que disparou;
- avaliação das condições;
- ação solicitada;
- estado atual;
- resultado final ou atual.

### Regra central

**Automação configurada ≠ Execução real.**

---

## 19.7 Resultado da Execução

Representa o resultado de negócio da Execução de Automação.

No MVP, deve permitir distinguir pelo menos:

- concluído;
- não concluído;
- aguardando resultado;
- precisa de atenção.

### Regra

Resultado desconhecido não pode ser representado como sucesso.

---

## 19.8 Evento ou Log de Execução

Representa acontecimentos relevantes durante uma Execução de Automação.

### Exemplos

- gatilho recebido;
- condição avaliada;
- ação solicitada;
- ação aceita;
- ação concluída;
- falha;
- espera por resultado;
- necessidade de atenção.

### Responsabilidade

Apoiar rastreabilidade operacional e diagnóstico.

### Regra

Log de Automação não é o mesmo que Histórico do Card.

### Regra

Um evento relevante pode aparecer resumido no Histórico do Card e detalhado no Log da Execução.

---

## 19.9 Recursos afetados pela Execução

Uma Execução pode se relacionar a:

- Card de origem;
- Registro de origem;
- Formulário/Submissão de origem;
- Card criado;
- Registro criado ou atualizado;
- Relação criada;
- Sugestão de IA criada;
- Ação Externa iniciada.

### Regra

A Execução deve preservar contexto suficiente para explicar o que fez.

---

## 19.10 Automação e criação relacionada

Quando uma Automação criar Card ou Registro:

- o elemento criado mantém seu próprio ciclo de vida;
- a Execução mantém referência ao resultado;
- relacionamentos criados permanecem explícitos.

### Regra

A Automação não se torna proprietária permanente do recurso criado.

---

## 19.11 Ciclo de vida da Automação

A Skill deve avaliar:

- criação;
- edição;
- ativação;
- pausa;
- arquivamento ou exclusão quando aplicável;
- efeito sobre execuções anteriores.

### Regra

Alterar ou pausar uma Automação não apaga execuções históricas.

### Decisão a avaliar

A Skill deve identificar se o MVP precisa:

- preservar a configuração exata usada por cada Execução;
- ou apenas referência suficiente para reconstrução operacional.

Não inventar versionamento completo sem necessidade.

---

# 20. Domínio — IA assistida

## 20.1 Sugestão de IA

Representa uma recomendação gerada para apoiar o usuário.

### Exemplos

- próxima ação;
- follow-up;
- sugestão de mensagem;
- resumo de contexto.

### Deve permitir identificar

- contexto analisado;
- momento da geração;
- tipo de sugestão;
- conteúdo sugerido;
- estado da sugestão;
- revisão humana;
- resultado quando aprovado;
- origem da solicitação.

### Regra

A Sugestão não é a mesma coisa que a ação executada.

---

## 20.2 Origem da Solicitação de IA

A Sugestão pode ser solicitada por:

- usuário;
- Automação;
- outro contexto futuro aprovado.

### Regra

Quando a IA for acionada por Automação, a Sugestão deve permanecer relacionada à Execução de Automação que a originou.

---

## 20.3 Revisão Humana

Representa a decisão sobre uma Sugestão de IA.

Exemplos:

- aprovada;
- ajustada;
- descartada.

### Regra

No MVP, ação externa sugerida pela IA exige revisão humana antes da execução quando essa revisão for prevista.

---

## 20.4 Contexto da IA

A modelagem deve permitir identificar quais entidades forneceram contexto relevante para a Sugestão.

### Regra

A IA não pode depender de contexto implícito impossível de auditar.

### Regra

Não armazenar conteúdo sensível desnecessário apenas para auditoria.

---

## 20.5 Sugestão de IA e ação externa

Quando uma Sugestão aprovada resultar em ação externa:

- a Sugestão permanece;
- a Revisão Humana permanece;
- a Ação Externa possui seu próprio resultado;
- o vínculo entre elas deve ser rastreável.

---

# 21. Domínio — Dashboard operacional

## 21.1 Indicadores são derivados

O Dashboard deve utilizar dados derivados das fontes de verdade.

Exemplos:

- Card sem atividade;
- processo atrasado;
- follow-up pendente;
- quantidade por Fase;
- Automação que precisa de atenção.

### Regra

O Dashboard não deve se tornar segunda fonte de verdade.

---

## 21.2 Item de Atenção

Quando necessário, a modelagem pode representar um item operacional que exige ação.

### Deve permitir identificar

- origem;
- motivo;
- estado;
- responsável;
- momento de detecção.

### Regra

Não crie entidade própria se o estado puder ser derivado de forma confiável e não houver ciclo de vida próprio.

---

# 22. Domínio — Integrações externas

## 22.1 Conexão de Integração

Representa a existência de uma integração configurada.

### Responsabilidade

Identificar:

- Organização;
- sistema externo;
- finalidade;
- estado de negócio da conexão.

### Regra

Segredos da integração não pertencem ao modelo comum de dados do produto.

---

## 22.2 Referência Externa

Representa a identidade de uma entidade em um sistema externo.

Pode se relacionar a:

- Contato;
- Conversa;
- Mensagem;
- Registro;
- Arquivo;
- Ação Externa;
- outros contextos aprovados.

### Regra

A Referência Externa deve ser interpretada dentro do contexto da integração de origem.

---

## 22.3 Ação Externa

Representa uma tentativa de enviar ou receber algo em um caso de negócio relevante.

### Deve permitir identificar

- contexto;
- origem;
- destino;
- ação pretendida;
- resultado atual.

### Regra

Uma Ação Externa que não produziu o resultado esperado não pode ser representada como sucesso concluído.

---

## 22.4 Relação Automação ↔ Ação Externa

Uma Execução de Automação pode iniciar uma Ação Externa.

### Regra

Execução de Automação e Ação Externa possuem resultados próprios.

### Exemplo

```text
Execução de Automação
→ solicitou envio

Ação Externa
→ aguardando confirmação
```

A Automação não deve ser marcada como sucesso final quando o resultado externo ainda é desconhecido, se o sucesso depender dessa confirmação.

---

# 23. Fontes de verdade obrigatórias

A Skill deve declarar, no mínimo:

| Informação | Fonte de verdade |
|---|---|
| Estrutura do Formulário | Formulário + Seções + Definições de Campo |
| Dados enviados | Submissão + Valores Submetidos |
| Destino configurado | Destino de Dados do Formulário |
| Resultado da entrada | Resultado da Submissão |
| Dados persistentes | Registro do Database |
| Fase atual | Card |
| Tarefas esperadas | Definições de Tarefa da Fase |
| Tarefas executadas | Execuções de Tarefa do Card |
| Responsabilidade padrão | Responsabilidade Padrão da Fase |
| Responsabilidade real atual | Atribuição do Card |
| Histórico do processo | Histórico de Atividade + eventos especializados |
| Lógica da Automação | Automação |
| Resultado da Automação | Execução de Automação |
| Detalhe da execução | Eventos/Logs de Execução |
| Sugestão de IA | Sugestão de IA |
| Decisão humana | Revisão Humana |
| Resultado externo | Ação Externa |
| Indicadores | Dados derivados das fontes operacionais |

Não transforme esta tabela em decisão de armazenamento físico.

---

# 24. Cardinalidades que a Skill deve avaliar

A Skill deve declarar explicitamente as cardinalidades relevantes.

No mínimo, avalie:

- Organização ↔ Usuário;
- Organização ↔ Workspace;
- Organização ↔ recursos;
- Contato ↔ Identidades de Contato;
- Contato ↔ Registros;
- Database ↔ Registros;
- Database ↔ Definições de Campo;
- Pipe ↔ Fases;
- Pipe ↔ Cards;
- Fase ↔ Definições de Tarefa;
- Fase ↔ Responsabilidades Padrão;
- Card ↔ Execuções de Tarefa;
- Card ↔ Atribuições;
- Card ↔ Histórico de Fases;
- Card ↔ Eventos de Atividade;
- Card ↔ Registros;
- Card ↔ Cards relacionados;
- Formulário ↔ Seções;
- Formulário ↔ Definições de Campo;
- Formulário ↔ Destinos de Dados;
- Formulário ↔ Submissões;
- Submissão ↔ Valores Submetidos;
- Submissão ↔ Arquivos;
- Submissão ↔ Resultados;
- Automação ↔ Gatilho;
- Automação ↔ Condições;
- Automação ↔ Ação;
- Automação ↔ Execuções;
- Execução de Automação ↔ Eventos/Logs;
- Execução de Automação ↔ Recursos afetados;
- Execução de Automação ↔ Sugestão de IA;
- Execução de Automação ↔ Ação Externa;
- Registro ↔ Arquivos;
- Conversa ↔ Participantes;
- Conversa ↔ Mensagens;
- Conversa ↔ Contatos;
- Conversa ↔ Registros;
- Conversa ↔ Cards;
- Mensagem ↔ Arquivos;
- Sugestão de IA ↔ Contextos;
- Sugestão de IA ↔ Revisão Humana;
- Integração ↔ Referências Externas.

Não escolha cardinalidade por conveniência técnica.

Escolha com base no comportamento real do produto.

---

# 25. Regras de ciclo de vida

Para cada entidade principal, a Skill deve responder:

1. como nasce?
2. quem ou o que pode criá-la?
3. qual é seu estado ativo?
4. pode ser concluída?
5. pode ser arquivada?
6. pode ser excluída?
7. o que acontece com seus relacionamentos?
8. o histórico permanece?
9. existe retenção ou anonimização futura?
10. o que não pode ser perdido?

Avalie obrigatoriamente:

- Contato;
- Registro;
- Formulário;
- Publicação do Formulário;
- Submissão;
- Card;
- Execução de Tarefa;
- Atribuição;
- Arquivo;
- Conversa;
- Mensagem;
- Automação;
- Execução de Automação;
- Log/Evento de Execução;
- Sugestão de IA;
- Revisão Humana;
- Ação Externa.

---

# 26. Decisões de ciclo de vida que devem ser avaliadas

## 26.1 Mudança de configuração da Fase

Perguntar:

- novas tarefas afetam apenas Cards futuros?
- Cards já na Fase recebem mudanças?
- tarefas já concluídas permanecem intactas?

Não inventar resposta sem decisão aprovada.

---

## 26.2 Mudança de responsável padrão

Perguntar:

- substitui responsável atual?
- afeta apenas próximos Cards?
- acumula com atribuições existentes?

Registrar como decisão pendente quando não estiver aprovado.

---

## 26.3 Edição de Formulário publicado

Perguntar:

- Submissões futuras usam nova estrutura?
- Submissões anteriores continuam interpretáveis?
- o MVP precisa de versão explícita da publicação?

Não criar versionamento complexo automaticamente.

---

## 26.4 Edição de Automação ativa

Perguntar:

- execuções futuras usam nova configuração?
- execuções em andamento continuam com configuração original?
- o resultado histórico continua interpretável?

Não apagar histórico.

---

# 27. Regras de exclusão, retenção e LGPD

A Skill não deve inventar prazos legais.

Deve identificar quais decisões precisam existir.

Avalie:

- exclusão de Contato;
- anonimização;
- exclusão de Registro;
- retenção de Submissões;
- retenção de Valores Submetidos;
- retenção de Arquivos;
- retenção de Conversas;
- retenção de Mensagens;
- retenção de Histórico do Card;
- retenção de Execuções de Automação;
- retenção de Logs;
- retenção de Sugestões de IA;
- retenção de contexto enviado à IA.

### Regra

Excluir uma entidade não deve apagar silenciosamente dados que precisam permanecer por obrigação de negócio ou auditoria.

### Regra

Reter dados não é sinônimo de guardar para sempre.

Quando as políticas ainda não existirem, registre como decisão pendente.

---

# 28. Regras de qualidade da modelagem

Antes de aprovar a modelagem, verifique:

1. cada entidade possui responsabilidade clara?
2. a fonte de verdade de cada informação importante está definida?
3. configuração e execução estão separadas?
4. estado atual e histórico estão separados quando necessário?
5. Formulário, Database e Pipe continuam com responsabilidades diferentes?
6. Form Builder pode variar por serviço sem campos fixos no núcleo?
7. Submissão e resultado da Submissão estão separados?
8. Card e Registro possuem ciclos de vida independentes?
9. criação relacionada preserva origem e vínculo?
10. Card relacionado a Card não funde processos?
11. Fase e Card continuam separados?
12. tarefa configurada e tarefa executada estão separadas?
13. responsabilidade padrão da Fase e atribuição real do Card estão separadas?
14. mudança de Fase preserva Histórico?
15. Histórico do Card não depende da Fase atual?
16. Automação e Execução de Automação estão separadas?
17. condição configurada e avaliação da condição estão separadas?
18. ação configurada e resultado executado estão separados?
19. resultado desconhecido não vira sucesso?
20. Log de Automação e Histórico operacional possuem finalidades diferentes?
21. IA acionada por Automação preserva origem?
22. Sugestão de IA e ação executada estão separadas?
23. Dashboard permanece derivado das fontes de verdade?
24. Contato e Cliente não foram tratados como sinônimos?
25. Conversa não foi presa ao ciclo de vida do Card?
26. Mensagem Externa e Nota Interna estão separadas?
27. Arquivos importantes sobrevivem ao fim do processo?
28. relacionamentos não duplicam dados sem necessidade?
29. identificadores externos estão contextualizados pela Integração?
30. o modelo suporta mais de um canal?
31. nenhuma entidade foi criada apenas por causa da posição visual na interface?
32. não foram escolhidos banco, ORM, tabelas físicas ou detalhes técnicos?
33. conflitos documentais foram registrados?
34. decisões de retenção e LGPD não foram inventadas?

Se qualquer resposta for “não”, revise.

---

# 29. Formato obrigatório de saída

SEMPRE gere a saída com estes títulos, nesta ordem:

```text
# Modelagem de Dados — [produto ou módulo]

## 1. Escopo
[O que a modelagem cobre.]

## 2. Fontes consultadas
[Visão, MVP, Regras de Negócio, Permissões e decisões.]

## 3. Princípios protegidos
[Princípios que não podem ser quebrados.]

## 4. Glossário
[Termos essenciais.]

## 5. Mapa de domínios
[Domínios e suas responsabilidades.]

## 6. Entidades
[Cada entidade com responsabilidade e fonte de verdade.]

## 7. Relacionamentos e cardinalidades
[Como as entidades se conectam.]

## 8. Ciclos de vida
[Criação, estado, conclusão, arquivamento, exclusão.]

## 9. Histórico e rastreabilidade
[Quais eventos precisam permanecer consultáveis.]

## 10. Dados derivados
[Dashboard, indicadores e projeções.]

## 11. Integrações e referências externas
[Identidades e ações externas.]

## 12. Privacidade, retenção e LGPD
[Decisões necessárias sem inventar políticas.]

## 13. Conflitos e decisões pendentes
[Somente conflitos e ambiguidades reais.]

## 14. Fora deste documento
[Banco, ORM, tabelas físicas, índices, API, arquitetura, layout e implementação.]
```

Não gere:

- SQL;
- migrations;
- schemas físicos;
- código;
- endpoints;
- arquitetura;
- componentes visuais.

---

# 30. Validação final obrigatória

Antes de considerar a modelagem aprovada, responda:

1. Organização é o limite de propriedade dos dados?
2. Workspace possui responsabilidade diferente ou duplica Organização?
3. Contato representa pessoa e não Cliente?
4. Cliente pode existir como Registro persistente e configurável?
5. um Contato pode possuir múltiplas identidades de canal?
6. Formulário representa definição e Submissão representa envio real?
7. Formulário pode variar por serviço?
8. Destino de Dados está separado da Submissão?
9. Resultado da Submissão preserva o que foi criado ou atualizado?
10. Formulário → Database → Pipe preserva responsabilidades diferentes?
11. Pipe representa processo?
12. Database representa informação persistente?
13. Card e Registro possuem ciclos de vida independentes?
14. criação de Card e Registro relacionados preserva vínculo?
15. Cards relacionados em Pipes diferentes continuam independentes?
16. cada Fase pode possuir Definições de Tarefa próprias?
17. cada Fase pode possuir Responsabilidade Padrão própria?
18. Definição de Tarefa está separada da Execução de Tarefa?
19. Responsabilidade Padrão está separada da Atribuição real?
20. mudanças de Fase possuem histórico próprio?
21. Histórico do Card preserva atividades anteriores?
22. estado atual do Card não substitui Histórico?
23. Automação está separada de Execução de Automação?
24. Gatilho, Condições e Ação estão conceitualmente distintos?
25. Resultado da Execução está separado do Log?
26. Log de Automação está separado do Histórico operacional?
27. resultado desconhecido permanece identificável?
28. Automação pode criar recursos relacionados sem se tornar proprietária deles?
29. IA como ação de Automação preserva a Execução de origem?
30. Sugestão de IA está separada da ação executada?
31. Conversa continua existindo sem depender de Card ativo?
32. Mensagens permanecem ligadas à Conversa?
33. Nota Interna está separada de Mensagem Externa?
34. Arquivos importantes não ficam presos a Cards ou Mensagens?
35. Histórico de Conversa não é copiado integralmente para o Card?
36. Dashboard deriva das fontes de verdade?
37. Referências Externas estão contextualizadas pela Integração?
38. a modelagem suporta mais de um canal futuro?
39. exclusão, retenção e LGPD possuem decisões pendentes explícitas?
40. nenhuma decisão visual ou técnica invadiu a modelagem conceitual?

Se qualquer resposta indicar conflito, ambiguidade ou acoplamento indevido, revise antes de aprovar.

---

# 31. Princípio final

Sempre prefira:

**entidades com responsabilidades claras + configuração separada da execução + relacionamentos explícitos + históricos separados**

em vez de:

**um grande objeto que tenta guardar tudo.**

As perguntas finais são:

**“Se um processo terminar amanhã, ainda conseguimos encontrar o Cliente, seus Contatos, Arquivos e Conversas sem depender daquele Card?”**

**“Se uma Fase mudar amanhã, conseguimos distinguir o modelo da Fase do trabalho que já foi executado?”**

**“Se uma Automação for editada amanhã, ainda conseguimos entender o que aconteceu nas execuções anteriores?”**

**“Se um Formulário mudar amanhã, ainda conseguimos interpretar o que foi enviado antes?”**

Se as respostas forem sim, a modelagem está preservando a visão central do Giraffe CRM.
