# Visão Geral do Produto — Giraffe CRM

**Status:** Revisado para consolidação  
**Fase:** 1. Preparar documentação base  
**Documento:** Fonte oficial da visão do produto

---

## 1. Visão resumida

O Giraffe CRM é uma plataforma SaaS flexível para criar, organizar, executar e automatizar processos de trabalho.

Seu público inicial são agências de marketing que precisam organizar:

- entrada e onboarding de clientes;
- demandas do dia a dia;
- informações e documentos;
- arquivos enviados pelo cliente;
- arquivos produzidos pela agência;
- tarefas e responsáveis;
- conversas e follow-ups;
- automações e integrações.

Em vez de obrigar a empresa a trabalhar de uma forma pré-definida, o Giraffe CRM fornece blocos configuráveis como:

- Formulários;
- Databases;
- Registros;
- Pipes;
- Fases;
- Cards;
- tarefas;
- responsáveis;
- relacionamentos;
- automações;
- integrações;
- dashboards;
- inteligência artificial.

O objetivo é permitir que cada empresa adapte o sistema à sua operação sem depender de programação para mudanças rotineiras.

---

## 2. Problema principal

Agências de marketing frequentemente operam utilizando uma combinação desorganizada de:

- planilhas;
- WhatsApp;
- e-mails;
- formulários;
- gerenciadores de tarefas;
- serviços de armazenamento;
- documentos espalhados;
- informações mantidas apenas na memória da equipe.

Isso provoca:

- perda de informações;
- dificuldade para localizar arquivos;
- falta de padronização na entrada de clientes;
- demandas esquecidas;
- clientes sem acompanhamento;
- pouca visibilidade sobre o andamento do trabalho;
- dependência de processos manuais;
- retrabalho entre equipes.

Além disso, muitas ferramentas misturam:

**o processo que está acontecendo**

com:

**a informação que precisa continuar existindo.**

O Giraffe CRM busca resolver esse problema separando corretamente entrada, informação, processo, comunicação, histórico e automação.

---

## 3. Princípio central do produto

O Giraffe CRM não deve determinar como uma empresa trabalha.

Ele deve fornecer os blocos necessários para que cada empresa construa sua própria forma de trabalhar.

O núcleo do produto deve ser estável.

Sobre esse núcleo, devem ser configuráveis:

- formulários;
- Databases;
- campos;
- Pipes;
- fases;
- tarefas;
- responsáveis;
- relacionamentos;
- automações;
- visualizações;
- integrações.

O sistema fornece as capacidades.

A empresa decide como combiná-las.

---

## 4. Público inicial

O público inicial do Giraffe CRM são agências de marketing e empresas que prestam serviços recorrentes para clientes.

O produto deve inicialmente resolver problemas como:

- entrada de novos clientes;
- onboarding;
- coleta de briefings;
- recebimento de documentos;
- organização de materiais;
- acompanhamento de demandas;
- distribuição de trabalho;
- aprovação de entregas;
- acompanhamento de follow-ups;
- armazenamento do histórico do cliente;
- organização dos arquivos criados pela agência.

A plataforma deve ser construída sobre uma base flexível que permita expansão futura para outros segmentos e departamentos.

O foco inicial de mercado não deve limitar a capacidade futura do produto.

---

## 5. Proposta de valor

Permitir que agências centralizem:

- clientes;
- contatos;
- informações;
- documentos;
- arquivos;
- processos;
- tarefas;
- conversas;
- follow-ups;
- automações.

O Giraffe CRM deve permitir que a agência transforme sua operação real em um sistema organizado sem desenvolver software do zero.

O usuário poderá:

- estruturar processos;
- criar bases de dados;
- montar formulários;
- receber informações;
- distribuir responsabilidades;
- acompanhar demandas;
- automatizar ações;
- conectar sistemas externos;
- usar inteligência artificial como apoio operacional.

---

# 6. Princípios estruturais do produto

## 6.1 Pipe organiza processos

O Pipe representa algo que possui:

- início;
- progresso;
- etapas;
- responsáveis;
- execução;
- conclusão.

Ele responde:

**“Em que etapa isso está e o que precisa acontecer agora?”**

Exemplos:

- onboarding;
- criação de campanha;
- solicitação de arte;
- criação de site;
- aprovação de conteúdo;
- suporte.

---

## 6.2 Database preserva informações

O Database representa informações que precisam existir independentemente de um processo.

Ele responde:

**“O que precisamos saber, guardar e consultar?”**

Exemplos:

- clientes;
- contatos;
- empresas;
- campanhas;
- sites;
- contratos;
- materiais;
- documentos;
- ativos digitais.

Um processo pode terminar.

A informação pode continuar existindo.

---

## 6.3 Formulário captura a entrada

O Formulário representa uma porta de entrada configurável para informações.

Ele responde:

**“O que precisamos coletar para iniciar ou alimentar este trabalho?”**

O formulário não deve existir apenas para guardar respostas isoladas.

Ele deve poder alimentar a estrutura real do produto.

---

## 6.4 Formulário → Database → Pipe

O Giraffe CRM deve permitir o fluxo:

```text
Formulário
    ↓
captura informações e arquivos
    ↓
Database
preserva informações persistentes
    ↓
Pipe
organiza o processo
```

Uma submissão poderá, conforme configuração:

- identificar ou criar um Contato;
- criar ou atualizar um Registro;
- associar arquivos;
- criar um Card;
- relacionar Card e Registro.

### Regra central

**O Formulário captura.**

**O Database preserva.**

**O Pipe executa.**

---

## 6.5 Relacionamentos conectam os contextos

Um Card pode se relacionar a:

- um cliente;
- vários contatos;
- documentos;
- arquivos;
- campanhas;
- projetos;
- outros Registros.

Um Registro pode se relacionar a:

- vários Cards;
- outros Registros;
- Contatos;
- arquivos;
- conversas.

Relacionar não significa fundir.

Cada elemento deve manter sua própria responsabilidade e ciclo de vida.

---

# 7. Form Builder configurável por serviço

O Giraffe CRM deve permitir que cada organização monte formulários conforme as necessidades de seus serviços.

Exemplos:

```text
Formulário de Tráfego Pago
├── dados da empresa
├── contato responsável
├── objetivo das campanhas
├── público-alvo
├── investimento
├── materiais
└── arquivos
```

```text
Formulário de Criação de Site
├── dados da empresa
├── domínio
├── hospedagem
├── páginas necessárias
├── referências
├── textos
├── imagens
└── arquivos
```

O Form Builder deve permitir configurar, progressivamente:

- campos;
- seções;
- textos de orientação;
- obrigatoriedade;
- arquivos;
- ordem;
- destino das informações.

### Princípio

O formulário deve ser adaptável ao serviço.

O serviço não deve obrigar o núcleo do produto a possuir campos fixos.

---

# 8. Pipes, Fases, tarefas e responsáveis

Cada Pipe pode possuir Fases configuráveis.

Cada Fase pode representar um contexto operacional diferente.

Uma Fase pode possuir:

- tarefas próprias;
- responsáveis próprios;
- equipe responsável;
- instruções;
- campos necessários para a etapa;
- ações disponíveis.

Exemplo:

```text
Pipe: Criação de Artes

Fase: Solicitação
├── validar briefing
├── conferir arquivos
└── responsável: Atendimento

Fase: Produção
├── criar arte
├── revisar conteúdo
└── responsável: Designer

Fase: Análise
├── revisar qualidade
├── aprovar ou solicitar ajuste
└── responsável: Gestor Líder
```

### Princípio

**A Fase define o contexto atual de execução.**

Quando o Card muda de Fase:

- o estado atual muda;
- as tarefas aplicáveis podem mudar;
- os responsáveis aplicáveis podem mudar;
- o histórico anterior deve permanecer.

### Regra

A configuração da Fase não é a mesma coisa que a execução real do Card.

O sistema deve diferenciar:

```text
Tarefa configurada na Fase
        ≠
Tarefa executada no Card
```

---

# 9. Card como unidade de execução

O Card representa uma instância real de um processo em andamento.

Ele deve permitir compreender:

- qual processo está acontecendo;
- qual é a Fase atual;
- o que precisa ser feito agora;
- quais tarefas estão pendentes;
- quem é responsável;
- quais informações estão relacionadas;
- quais atividades já aconteceram.

O Card não deve ser transformado em repositório principal de todas as informações persistentes.

Dados permanentes devem continuar relacionados aos seus contextos apropriados, especialmente Databases, Registros, Arquivos e Conversas.

---

# 10. Histórico visível das atividades do Card

O Card deve preservar um histórico operacional visível.

O usuário deve conseguir compreender:

- o que aconteceu;
- quem realizou;
- quando aconteceu;
- em qual etapa aconteceu.

O histórico pode incluir:

- criação do Card;
- entrada em uma Fase;
- saída de uma Fase;
- tarefa concluída;
- alteração de responsável;
- comentário;
- arquivo anexado;
- automação executada;
- sugestão de IA aprovada;
- ação externa realizada;
- resultado relevante.

### Princípio

O usuário deve conseguir entender o estado atual sem perder o contexto do caminho percorrido.

O histórico anterior não deve desaparecer quando o Card avança.

---

# 11. Automações

O Giraffe CRM deve permitir que processos reajam a eventos.

O modelo conceitual de automação deve ser simples:

```text
QUANDO
acontece um evento
        ↓
SE
condições opcionais forem atendidas
        ↓
ENTÃO
execute uma ação
```

Exemplos:

```text
QUANDO
Card entrar na Fase “Produção”

ENTÃO
atribuir equipe de Design
```

```text
QUANDO
Card ficar sem atividade

SE
processo ainda estiver ativo

ENTÃO
pedir à IA uma sugestão de follow-up
```

```text
QUANDO
Formulário for enviado

ENTÃO
criar Registro e Card relacionados
```

### Princípio

A automação conecta eventos a ações adicionais.

Ela não deve ser usada para substituir capacidades nativas que pertencem à própria Fase.

Exemplo:

- tarefas padrão da Fase → capacidade nativa;
- responsável padrão da Fase → capacidade nativa;
- criar outro Card em outro Pipe → automação;
- solicitar ação da IA → automação.

---

# 12. Logs e resultados das automações

Toda automação deve possuir resultado rastreável.

O usuário precisa conseguir saber:

- qual automação executou;
- qual evento a iniciou;
- quais condições foram avaliadas;
- qual ação foi solicitada;
- quando executou;
- qual foi o resultado.

Os resultados devem permitir distinguir:

- concluído;
- não concluído;
- aguardando resultado;
- precisa de atenção.

### Princípio

**Automação não pode falhar silenciosamente.**

A lista de automações deve permitir visualizar:

- nome;
- gatilho;
- ação;
- estado;
- última execução;
- resultado recente;
- responsável pela última alteração.

---

# 13. Criação de Cards e Registros relacionados

O Giraffe CRM deve permitir criar elementos relacionados sem duplicar o contexto.

Exemplos:

```text
Formulário de Onboarding
        ↓
cria ou atualiza
Registro no Database “Clientes”
        ↓
cria
Card no Pipe “Onboarding”
        ↓
relaciona
Card ↔ Cliente
```

Outro exemplo:

```text
Card no Pipe “Implantação”
        ↓
automação
        ↓
cria Card no Pipe “Criação de Artes”
        ↓
mantém relacionamento entre os dois contextos
```

### Princípio

Criação relacionada deve preservar contexto e rastreabilidade.

Um Card conectado não deve exigir duplicação manual de todas as informações do elemento de origem.

---

# 14. Inteligência Artificial como camada transversal

A inteligência artificial deve funcionar como uma camada transversal do produto.

Ela poderá:

- sugerir próxima ação;
- gerar sugestão de follow-up;
- resumir contexto;
- analisar informações;
- identificar falta de acompanhamento;
- apoiar automações;
- ajudar usuários a localizar informações;
- futuramente criar estruturas a partir de linguagem natural.

A IA também pode ser uma ação disponível dentro de uma automação.

Exemplo:

```text
QUANDO
cliente ficar sem atividade

SE
processo estiver ativo

ENTÃO
pedir à IA uma sugestão de follow-up
```

### Regra do MVP

A IA pode sugerir.

A ação externa continua sujeita a:

- permissões;
- revisão humana;
- aprovação quando exigida.

### Princípio

A IA deve utilizar a mesma estrutura flexível do produto.

Ela não deve criar uma segunda arquitetura paralela.

---

# 15. Painel operacional

O painel operacional deve responder rapidamente:

**“O que precisa da minha atenção agora?”**

Ele deve priorizar:

- processos atrasados;
- follow-ups pendentes;
- Cards sem atividade;
- automações com problema;
- integrações que precisam de atenção;
- trabalho em andamento.

O Dashboard deve ser derivado da operação real.

Ele não deve se transformar em uma segunda fonte de verdade.

---

# 16. Arquivos e documentos

Arquivos e documentos não devem existir apenas como anexos perdidos dentro de Cards.

O sistema deve permitir que arquivos relevantes façam parte da informação persistente da empresa.

Exemplos:

- logotipos;
- identidade visual;
- contratos;
- briefings;
- documentos;
- vídeos;
- imagens;
- relatórios;
- materiais enviados pelo cliente;
- materiais produzidos pela agência.

Esses arquivos podem se relacionar a:

- clientes;
- Contatos;
- Registros;
- Cards;
- projetos;
- campanhas;
- mensagens.

O objetivo é permitir localizar informações e arquivos mesmo depois que um processo tenha sido concluído.

---

# 17. Núcleo essencial do produto

O Giraffe CRM deve possuir um conjunto de capacidades universais.

## Organização

- Organizações;
- Workspaces quando necessários;
- Usuários;
- Equipes;
- Permissões.

## Informação

- Databases;
- Registros;
- campos configuráveis;
- Contatos;
- arquivos;
- relacionamentos.

## Entrada

- Formulários;
- seções;
- campos;
- submissões;
- destino de dados.

## Processo

- Pipes;
- Fases;
- Cards;
- tarefas;
- responsáveis;
- histórico.

## Automação

- gatilhos;
- condições;
- ações;
- estado;
- logs;
- resultados.

## Comunicação

- Conversas;
- Mensagens;
- histórico.

## Inteligência

- IA assistida;
- follow-up;
- sugestões;
- revisão humana.

## Operação

- Dashboard;
- relatórios essenciais;
- integrações;
- API.

Esses elementos formam a base do produto.

---

# 18. O que deve ser configurável

O usuário autorizado deve poder configurar, progressivamente:

- nomes de Pipes;
- Fases;
- tarefas por Fase;
- responsáveis por Fase;
- instruções;
- nomes de Databases;
- campos;
- relacionamentos;
- formulários;
- seções;
- destino dos dados;
- automações;
- notificações;
- visualizações;
- relatórios;
- integrações.

O sistema fornece os blocos.

A empresa decide como combiná-los.

---

# 19. Templates e módulos

Templates devem acelerar a criação.

Eles não devem limitar o usuário.

Exemplos iniciais para agências:

- CRM comercial;
- entrada de clientes;
- onboarding;
- criação de artes;
- criação de sites;
- gestão de tráfego pago;
- social media;
- solicitações de clientes;
- aprovação de conteúdo.

Um template pode configurar:

- Formulários;
- Databases;
- Pipes;
- Fases;
- tarefas;
- responsáveis;
- automações.

Cada template deve ser apenas um ponto de partida editável.

---

# 20. Direção de experiência visual

O Giraffe CRM deve ter uma interface:

- predominantemente neutra;
- clara;
- produtiva;
- consistente;
- com uso moderado do laranja `#FF7200`.

As referências visuais servem para aprender:

- composição;
- hierarquia;
- densidade;
- comportamento;
- organização.

Elas não devem ser copiadas literalmente.

---

## 20.1 Referência visual — Form Builder

O Form Builder deve priorizar:

- biblioteca de campos;
- formulário em construção;
- configuração contextual;
- pré-visualização;
- publicação.

Direção preferencial:

```text
Esquerda
→ biblioteca de campos

Centro
→ formulário em construção

Direita
→ configuração do elemento selecionado
```

O construtor deve preferencialmente funcionar como uma área completa de trabalho, e não depender de um modal apertado.

---

## 20.2 Referência visual — Visualização do Card

A visualização do Card deve permitir compreender o processo atual e o histórico.

Direção preferencial:

```text
Esquerda
→ informações gerais
→ arquivos relevantes
→ histórico das atividades anteriores

Centro
→ Fase atual
→ tarefas atuais
→ campos e dados da etapa

Direita
→ ações rápidas
→ mudança de Fase
→ ações complementares
```

O histórico deve permanecer visível ou facilmente acessível.

---

## 20.3 Referência visual — Automações

O módulo de Automações deve utilizar uma estrutura simples.

```text
QUANDO
        →
CONDIÇÕES
        →
ENTÃO
```

A experiência deve incluir:

- lista de automações;
- estado ativo ou pausado;
- gatilho;
- ação;
- última execução;
- resultado;
- acesso aos logs.

A interface pode usar blocos conectados para representar o fluxo.

---

# 21. O que o produto não deve ser

O Giraffe CRM não deve:

- impor um único modelo de operação;
- transformar toda informação em Card;
- transformar todo processo em Database;
- armazenar informações importantes apenas em Cards temporários;
- obrigar todos os clientes a utilizar os mesmos campos;
- obrigar todos os Pipes a utilizar as mesmas Fases;
- transformar tarefas de uma agência em regras universais;
- transformar cada necessidade de cliente em código personalizado;
- depender de um único provedor externo;
- esconder falhas de automações ou integrações;
- permitir que IA execute ações críticas sem os controles aprovados;
- tentar substituir todos os sistemas empresariais.

---

# 22. Critérios principais de sucesso

O primeiro critério é:

**“Uma empresa consegue transformar seu processo real em um fluxo funcional dentro do Giraffe CRM sem alterar o código do sistema?”**

O segundo é:

**“A empresa consegue localizar suas informações, arquivos e conversas mesmo depois que um processo foi concluído?”**

O terceiro é:

**“Cada serviço pode possuir seu próprio formulário, processo, tarefas e responsáveis sem criar uma nova versão do sistema?”**

O quarto é:

**“O usuário consegue entender o que precisa fazer agora e também o que já aconteceu antes?”**

O quinto é:

**“Automações e IA ajudam a operação sem esconder resultados, falhas ou decisões?”**

Se as respostas forem sim, o produto está preservando flexibilidade e valor operacional.

---

# 23. Não confundir foco de mercado com rigidez do produto

O Giraffe CRM começa atendendo agências de marketing porque esse é o mercado inicial conhecido profundamente pelo produto.

Entretanto, sua arquitetura conceitual não deve codificar permanentemente as regras de uma agência no núcleo.

Necessidades específicas devem ser implementadas por meio de:

- configurações;
- templates;
- módulos;
- automações;
- extensões;
- integrações.

Antes de adicionar uma capacidade ao núcleo, perguntar:

**“Isso é universal para a plataforma ou específico de um processo, segmento ou cliente?”**

Uma necessidade específica não deve automaticamente se tornar regra obrigatória de todo o sistema.

---

# 24. Regra fundamental do produto

O Giraffe CRM deve ser construído sobre estas ideias:

**O Formulário captura a entrada.**

**O Database preserva a informação.**

**O Pipe organiza o processo.**

**A Fase orienta a execução atual.**

**O Card representa o trabalho real em andamento.**

**As tarefas mostram o que precisa ser feito.**

**Os responsáveis mostram quem deve agir.**

**Os relacionamentos conectam contextos sem fundi-los.**

**O Histórico mostra o que já aconteceu.**

**As Automações reagem a eventos.**

**Os Logs mostram o resultado das automações.**

**A IA ajuda a analisar, sugerir e acompanhar.**

**As Integrações conectam o Giraffe CRM ao ecossistema externo.**

**O Dashboard mostra o que precisa de atenção.**

---

# 25. Pergunta final da Visão

Antes de aprovar uma nova capacidade, perguntar:

**“Ela ajuda o usuário a capturar informação, preservar contexto, executar um processo, acompanhar o histórico, automatizar trabalho ou agir melhor?”**

Se a resposta for não, a capacidade precisa de justificativa antes de entrar no produto.

A visão do Giraffe CRM pode ser resumida assim:

> **Um sistema flexível em que a empresa configura como a informação entra, onde ela é preservada, como o trabalho avança, quem é responsável, o que já aconteceu e quais ações podem ser automatizadas ou assistidas por IA.**
