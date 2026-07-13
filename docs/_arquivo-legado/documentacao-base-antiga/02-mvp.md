---
name: giraffe-mvp-definition
description: Transforma a Visão do Produto aprovada do Giraffe CRM em um MVP pequeno, validável e implementável. Use sempre que for definir escopo de MVP, recortar a primeira versão, priorizar funcionalidades, decidir o que fica de fora ou responder "qual é a menor versão que entrega valor" — mesmo que o usuário não diga "MVP" explicitamente. Também use ao enxugar um escopo inchado de volta ao núcleo do produto ou ao avaliar se uma funcionalidade proposta pertence à primeira versão. O MVP do Giraffe CRM deve preservar obrigatoriamente: Formulário → Database → Pipe, relacionamento entre Cards e Registros, Fases operacionais com tarefas e responsáveis, histórico visível do Card, automações mínimas com logs, IA assistida, painel operacional, uma API externa concreta e uso responsivo em celular.
---

# Skill — Definição de MVP do Giraffe CRM

## 1. Objetivo

Transformar a Visão do Produto aprovada em um MVP pequeno, validável e implementável.

O MVP deve provar a proposta central do Giraffe CRM sem tentar construir toda a visão futura do produto.

A Skill deve responder:

**"Qual é a menor versão do Giraffe CRM que entrega valor real para uma agência de marketing e valida os princípios centrais do produto?"**

O MVP deve ser pequeno, mas não pode remover capacidades necessárias para provar o valor central do produto.

Os pilares obrigatórios do MVP são:

- Form Builder configurável por serviço;
- conexão Formulário → Database → Pipe;
- núcleo Pipe + Database + relacionamentos;
- criação de Cards e Registros relacionados;
- Fases com tarefas próprias;
- Fases com responsáveis próprios;
- histórico visível das atividades anteriores do Card;
- automações mínimas no modelo Quando → Condições → Então;
- logs e resultados das automações;
- IA assistida para follow-up;
- IA como ação possível dentro da automação;
- painel operacional;
- uma integração externa concreta via API;
- uso responsivo em celular.

---

## 2. Entrada obrigatória

Antes de definir o MVP, consulte:

- Visão do Produto aprovada;
- problema principal;
- público inicial;
- proposta de valor;
- princípios centrais do produto;
- decisões aprovadas mais recentes.

Para o Giraffe CRM, considere obrigatoriamente:

- público inicial: agências de marketing;
- Formulário captura a entrada;
- Database guarda informações persistentes, independentes do ciclo de vida de um processo;
- Pipe organiza processos;
- Fase orienta a execução atual;
- Card representa o trabalho real em andamento;
- Pipe e Database devem se relacionar sem se fundir;
- tarefas configuradas na Fase não são a mesma coisa que tarefas executadas no Card;
- responsáveis podem mudar conforme a Fase;
- histórico do Card deve preservar o que já aconteceu;
- automações reagem a eventos e executam ações adicionais;
- automações não substituem capacidades nativas da Fase;
- IA assistida ajuda a evitar clientes, leads ou demandas esquecidas;
- painel operacional mostra o que precisa de atenção;
- conexão com API externa prova que o produto participa do ecossistema real da agência;
- a aplicação web deve funcionar adequadamente em celular;
- o produto não deve depender de regras fixas de uma única agência.

Considere opcionalmente, quando disponíveis:

- tamanho da equipe;
- prazo;
- orçamento;
- limitações técnicas existentes;
- sistema externo prioritário para integração;
- canal utilizado no follow-up;
- serviço inicial usado para validar o Form Builder;
- Pipe real escolhido para validar as Fases operacionais.

### Regra de entrada ausente

Primeiro procure a Visão do Produto aprovada na documentação oficial do projeto.

Se houver versões diferentes, use a versão explicitamente marcada como atual ou aprovada.

Somente se a documentação obrigatória realmente não existir, pare e informe exatamente o que está faltando.

Não reconstrua uma Visão do Produto ausente nem assuma valores plausíveis.

Um MVP definido sobre uma visão inventada valida a coisa errada.

---

## 3. Hipótese central do MVP

O MVP deve validar se uma agência consegue:

1. criar um formulário configurável para um serviço real;
2. receber dados e arquivos por esse formulário;
3. criar ou atualizar um Registro persistente no Database;
4. criar um Card no Pipe quando o fluxo estiver configurado para isso;
5. relacionar Card e Registro sem duplicar todo o contexto;
6. acompanhar o Card por Fases configuráveis;
7. apresentar tarefas próprias da Fase atual;
8. apresentar responsáveis próprios da Fase atual;
9. concluir tarefas sem perder o vínculo com a Fase e o Card;
10. visualizar no Card o histórico das atividades anteriores;
11. criar pelo menos uma automação real usando Quando → Condições → Então;
12. consultar o log e o resultado dessa automação;
13. usar IA como apoio de follow-up e, quando aplicável, como ação de uma automação;
14. visualizar o que está parado, atrasado ou precisa de atenção;
15. conectar o fluxo a pelo menos uma API externa concreta;
16. concluir o processo sem perder as informações persistentes do cliente;
17. executar as principais ações também em tela de celular.

Se o MVP não provar esse conjunto, ele não está validando a proposta mínima atual do Giraffe CRM.

---

## 4. Fluxo principal do MVP

Defina um único fluxo principal antes de adicionar qualquer funcionalidade.

Para o Giraffe CRM:

**Agência configura um formulário para um serviço real → cliente ou equipe envia informações e arquivos → o envio cria ou atualiza um Registro no Database → quando configurado, o sistema cria um Card relacionado no Pipe → o Card entra na primeira Fase → a Fase apresenta suas tarefas e responsáveis → a equipe executa o trabalho e conclui tarefas → o Card avança entre Fases sem perder o histórico → o painel mostra atrasos, inatividade ou follow-ups pendentes → uma automação pode reagir a um evento e executar uma ação adicional → a IA pode sugerir uma próxima ação ou mensagem, inclusive como ação de automação → o usuário revisa quando necessário → uma API externa concreta envia ou recebe informação → logs e históricos preservam o que aconteceu → o processo é concluído → dados, arquivos, relações e histórico permanecem disponíveis no contexto correto.**

### Regra de fluxo único

Form Builder, Fases operacionais, Histórico, Automações, IA, Dashboard e API externa devem fortalecer esse mesmo fluxo principal.

Não crie processos independentes apenas para justificar capacidades obrigatórias.

### Regra de conexão central

O MVP deve provar explicitamente:

```text
Formulário
    ↓
Database / Registro
    ↓
Pipe / Card
    ↓
Fases / Tarefas / Responsáveis
    ↓
Histórico
    ↓
Automação / IA / Integração
```

---

## 5. Estrutura obrigatória do MVP

Avalie o menor conjunto necessário dentro de cada bloco.

Inclua somente o mínimo capaz de fazer o fluxo principal funcionar de ponta a ponta.

---

### 5.1 Base da plataforma

O MVP deve incluir:

- autenticação;
- Organização ou Workspace;
- usuários;
- permissões básicas;
- separação entre organizações.

Não incluir administração enterprise avançada.

---

### 5.2 Database

O MVP deve permitir:

- criar Database;
- criar Registros;
- configurar campos;
- editar Registros;
- armazenar informações persistentes;
- enviar e guardar arquivos e documentos;
- localizar dados após a conclusão do processo.

### Regra

O Database não pode depender da existência de um Card ativo.

---

### 5.3 Form Builder configurável por serviço

O MVP deve permitir que uma agência crie formulários diferentes conforme o serviço prestado.

Exemplos:

- onboarding geral;
- tráfego pago;
- criação de site;
- criação de artes.

A versão mínima deve permitir:

- criar formulário;
- renomear formulário;
- adicionar campos;
- editar campos;
- reordenar campos;
- criar seções;
- adicionar texto de orientação;
- marcar campo como obrigatório;
- receber arquivos;
- pré-visualizar;
- publicar;
- disponibilizar modo público;
- definir destino mínimo dos dados.

### Tipos mínimos de campo

Considere, no mínimo:

- texto curto;
- texto longo;
- e-mail;
- telefone;
- número;
- data;
- seleção única;
- seleção múltipla;
- checkbox;
- arquivo.

Não inclua dezenas de tipos de campo apenas por completude.

### Fora da versão mínima

- lógica condicional avançada;
- cálculos complexos;
- pagamentos;
- assinatura digital;
- scripts personalizados;
- CSS personalizado;
- componentes arbitrários programáveis.

---

### 5.4 Conexão Formulário → Database → Pipe

O formulário não deve ser apenas um coletor de respostas isoladas.

O MVP deve permitir configurar, no mínimo:

- criar ou atualizar um Registro no Database;
- associar os arquivos recebidos ao contexto correto;
- criar um Card no Pipe quando o fluxo exigir;
- relacionar o Card ao Registro criado ou atualizado.

### Regra

A criação de Card deve ser configurável.

Nem todo formulário precisa criar um Card.

### Regra

Quando o mesmo envio criar ou atualizar um Registro e criar um Card, o relacionamento entre eles deve ser preservado.

---

### 5.5 Pipe

O MVP deve permitir:

- criar Pipe;
- criar Fases;
- reordenar Fases;
- criar Cards;
- mover Cards entre Fases;
- acompanhar o estado atual;
- concluir ou arquivar o processo.

### Regra

As Fases devem ser configuráveis.

Não criar Fases obrigatórias e imutáveis para todas as organizações.

---

### 5.6 Fases operacionais

Cada Fase deve poder possuir configuração própria de execução.

A versão mínima deve permitir:

- tarefas próprias da Fase;
- responsáveis próprios da Fase;
- equipe responsável quando aplicável;
- instruções operacionais da Fase.

Quando um Card entrar em uma Fase, o sistema deve:

- apresentar as tarefas aplicáveis;
- apresentar os responsáveis aplicáveis;
- permitir concluir tarefas;
- preservar o histórico anterior.

### Regra

Fase define o contexto atual da execução.

Automação não deve ser obrigatória para aplicar tarefas e responsáveis nativos da Fase.

---

### 5.7 Tarefas da Fase e execução no Card

O MVP deve diferenciar:

```text
Tarefa configurada na Fase
        ≠
Tarefa executada no Card
```

A versão mínima deve permitir identificar, na execução real:

- Card;
- Fase;
- tarefa;
- estado da tarefa;
- responsável quando aplicável;
- quem concluiu;
- quando concluiu.

### Fora da versão mínima

- subtarefas complexas;
- dependências entre tarefas;
- Gantt;
- SLA avançado por tarefa;
- fórmulas de produtividade;
- templates muito sofisticados de checklist.

---

### 5.8 Responsáveis por Fase

Cada Fase deve poder definir responsáveis ou equipes padrão.

O MVP deve permitir:

- definir responsável padrão;
- definir equipe padrão quando aplicável;
- visualizar o responsável atual do Card;
- atualizar responsabilidade quando permitido.

### Regra

Mudança de Fase pode alterar o contexto de responsabilidade.

### Regra

A regra exata de substituição, acumulação ou manutenção de responsáveis deve ser definida posteriormente nas Regras de Negócio.

A Skill de MVP não deve inventar essa política.

---

### 5.9 Relacionamentos

O MVP deve permitir:

- relacionar Card a Registro;
- acessar as informações do Registro a partir do processo;
- preservar a relação após conclusão do Card;
- criar Cards relacionados quando o fluxo exigir;
- criar Registros relacionados quando o fluxo exigir.

### Regra

Criar um elemento relacionado não deve exigir copiar manualmente todo o contexto da origem.

---

### 5.10 Visualização do Card

A visualização do Card deve permitir compreender:

- contexto geral;
- Fase atual;
- tarefas atuais;
- responsáveis atuais;
- informações relacionadas;
- arquivos relevantes;
- atividades anteriores;
- ações disponíveis.

### Direção de referência visual

Usar como referência de experiência:

```text
Esquerda
→ informações gerais
→ arquivos relevantes
→ histórico anterior

Centro
→ Fase atual
→ tarefas atuais
→ campos e dados da etapa

Direita
→ ações rápidas
→ mudança de Fase
→ ações complementares
```

### Regra

Essa composição é uma referência visual e funcional.

Não é obrigação de copiar literalmente outro produto.

---

### 5.11 Histórico visível do Card

O MVP deve possuir histórico operacional visível.

O histórico deve permitir visualizar, no mínimo:

- criação do Card;
- mudanças de Fase;
- tarefas concluídas;
- alterações relevantes de responsáveis;
- comentários;
- anexos adicionados;
- automações executadas;
- ações relevantes de IA;
- ações externas relevantes.

### Regra

O histórico anterior não deve desaparecer quando o Card avançar.

### Regra

Estado atual e histórico possuem responsabilidades diferentes.

---

### 5.12 Automações mínimas

O MVP deve possuir um mecanismo mínimo de automação baseado em:

```text
QUANDO
evento ocorre
        ↓
SE
condições opcionais forem atendidas
        ↓
ENTÃO
ação é executada
```

A versão mínima deve permitir:

- criar automação;
- nomear automação;
- escolher um gatilho;
- configurar condições simples opcionais;
- escolher uma ação;
- ativar;
- pausar;
- editar;
- consultar resultado.

### Limite recomendado do MVP

Preferir:

- 1 gatilho;
- 0 ou mais condições simples;
- 1 ação principal.

Não construir um orquestrador complexo de workflows na primeira versão.

---

### 5.13 Gatilhos mínimos de automação

A Skill deve priorizar somente gatilhos necessários ao fluxo real.

Candidatos fortes para o MVP:

- formulário enviado;
- Card criado;
- Card entra em uma Fase;
- campo atualizado;
- Card fica sem atividade.

Não é obrigatório implementar todos.

O MVP deve provar automação com pelo menos um gatilho real.

---

### 5.14 Ações mínimas de automação

Candidatas fortes para o MVP:

- criar Card relacionado;
- criar ou atualizar Registro;
- mover Card;
- atualizar campo;
- atribuir responsável ou equipe;
- pedir sugestão à IA;
- executar uma ação externa aprovada.

Não é obrigatório implementar todas.

### Regra

Tarefas e responsáveis nativos da Fase não devem depender obrigatoriamente de automação.

---

### 5.15 IA como ação de automação

O MVP deve permitir, em pelo menos um caso real, usar IA como ação de uma automação.

Exemplo:

```text
QUANDO
Card ficar sem atividade

SE
processo ainda estiver ativo

ENTÃO
pedir à IA uma sugestão de follow-up
```

A versão mínima deve:

- gerar sugestão;
- preservar contexto;
- permitir revisão humana;
- impedir envio externo autônomo quando a revisão for exigida.

### Regra

A IA como ação de automação não recebe permissões adicionais.

---

### 5.16 Logs e resultados das automações

Toda automação do MVP deve possuir resultado rastreável.

O usuário deve conseguir identificar:

- automação executada;
- evento que iniciou;
- contexto;
- ação solicitada;
- momento;
- resultado.

O MVP deve distinguir, no mínimo:

- concluído;
- não concluído;
- aguardando resultado;
- precisa de atenção.

### Regra

Automação não pode falhar silenciosamente.

### Lista de automações

A lista deve permitir visualizar, no mínimo:

- nome;
- gatilho;
- ação;
- estado ativo ou pausado;
- última execução;
- resultado recente.

---

### 5.17 Interface visual de referência — Form Builder

A referência do MVP deve orientar uma experiência com:

```text
Esquerda
→ biblioteca de campos

Centro
→ formulário em construção

Direita
→ configuração do elemento selecionado
```

Também deve prever:

- pré-visualizar;
- publicar;
- modo público.

### Regra

Preferir área completa de trabalho em vez de depender de modal apertado.

### Regra

A identidade visual deve seguir o Giraffe CRM:

- neutros predominantes;
- `#FF7200` moderado;
- componentes próprios;
- sem copiar identidade de referência externa.

---

### 5.18 Interface visual de referência — Automações

A referência do MVP deve possuir:

#### Tela de lista

- Automações;
- Logs;
- pesquisa;
- filtros;
- nome;
- gatilho;
- ação;
- estado;
- última execução;
- resultado recente;
- botão de nova automação.

#### Editor

Estrutura visual baseada em:

```text
QUANDO
        →
CONDIÇÕES
        →
ENTÃO
```

### Regra

A estrutura da experiência pode ser muito semelhante às referências aprovadas.

A identidade visual deve ser do Giraffe CRM.

---

### 5.19 IA assistida para follow-up

A IA deve, no mínimo:

- identificar Cards ou Registros sem atividade;
- detectar follow-ups pendentes;
- sugerir próxima ação;
- gerar sugestão de mensagem quando aplicável;
- exigir revisão humana antes de qualquer envio externo quando essa revisão for prevista.

A IA deve atuar sobre o próprio fluxo principal do MVP.

---

### 5.20 Painel operacional

O MVP deve possuir uma visão mínima que responda:

**"O que precisa da minha atenção agora?"**

O painel deve apresentar, no mínimo:

- Cards sem atividade;
- processos atrasados;
- follow-ups pendentes;
- itens por Fase ou status;
- automações que precisam de atenção quando aplicável.

Não transforme esse requisito em uma plataforma de BI.

---

### 5.21 Conexão com API externa

O MVP deve possuir pelo menos uma integração externa real e concreta ligada ao fluxo principal.

A integração deve provar que o Giraffe CRM consegue enviar ou receber dados de outro sistema.

Exemplos possíveis:

- WhatsApp;
- e-mail;
- formulário ou site externo;
- Meta;
- Google;
- armazenamento externo.

A escolha deve seguir o caso real do MVP.

Não crie uma plataforma genérica de integrações apenas para cumprir esse requisito.

---

### 5.22 Uso em celular

A aplicação web deve ser responsiva desde o MVP.

Em tela de celular, o usuário deve conseguir, no mínimo:

- consultar informações;
- abrir Cards e Registros;
- visualizar arquivos;
- comentar ou atualizar uma demanda;
- movimentar um Card;
- verificar tarefas e pendências;
- verificar follow-ups;
- revisar sugestão de IA;
- acompanhar histórico essencial.

O preenchimento de formulários públicos também deve funcionar adequadamente no celular.

Aplicativo nativo não é necessário no MVP.

Configurações complexas de Form Builder e Automação podem permanecer prioritariamente em desktop.

---

## 6. Formato de saída

SEMPRE gere a saída usando exatamente este template, com estes nove títulos, nesta ordem:

```text
# MVP — [nome do produto/módulo]

## 1. Objetivo do MVP
[O que exatamente esta primeira versão deve provar.]

## 2. Usuário principal
[Quem utilizará o MVP primeiro.]

## 3. Problema validado
[Qual problema específico o MVP resolve.]

## 4. Fluxo principal
[A jornada completa que precisa funcionar do início ao fim.]

## 5. Funcionalidades obrigatórias
[Somente as capacidades mínimas necessárias para validar o MVP.]

## 6. Fora do MVP
[Tudo que ficará explicitamente para versões futuras.]

## 7. Critérios de aceite
[Como saber se cada parte do MVP está funcionando.]

## 8. Critérios de sucesso
[Como saber se o MVP entregou valor real.]

## 9. Riscos e dúvidas críticas
[Somente questões que possam impedir o MVP de funcionar ou ser validado.]
```

Em **5. Funcionalidades obrigatórias**, sempre inclua:

- Form Builder configurável por serviço;
- Formulário → Database → Pipe;
- núcleo Pipe + Database + relacionamento;
- criação de Cards e Registros relacionados;
- Fases operacionais com tarefas;
- Fases operacionais com responsáveis;
- histórico visível do Card;
- automação mínima Quando → Condições → Então;
- logs e resultados das automações;
- IA assistida para follow-up;
- IA como ação possível de automação;
- painel operacional mínimo;
- uma integração externa concreta via API;
- responsividade para celular como requisito não-funcional.

Não adicione seções fora deste template.

Não gere código, cronograma ou arquitetura.

A saída desta Skill é definição de escopo.

---

## 7. Regras de priorização

Antes de incluir qualquer funcionalidade adicional, pergunte, nesta ordem:

1. **O fluxo principal deixa de funcionar sem isso?**
2. **Isso é necessário para provar a proposta de valor?**
3. **Isso resolve um problema atual do público inicial?**
4. **Estamos adicionando porque é necessário ou porque seria interessante ter?**

Funcionalidades apenas interessantes não entram no MVP.

### Exceção obrigatória

Não use essas perguntas para remover os pilares mínimos já aprovados:

- Form Builder;
- Formulário → Database → Pipe;
- Fases com tarefas;
- Fases com responsáveis;
- histórico visível;
- automações mínimas;
- logs;
- IA assistida;
- painel operacional;
- API externa concreta;
- responsividade.

Nesses casos, pergunte:

**"Qual é a menor versão desta capacidade capaz de validar seu valor?"**

A Skill pode reduzir o escopo.

Não pode remover o pilar.

---

## 8. Regras contra engessamento

O MVP pode ser pequeno, mas não deve quebrar os princípios centrais do produto.

É obrigatório:

- manter Pipe e Database como conceitos separados;
- permitir relacionamento entre processo e informação;
- evitar campos fixos específicos de uma agência no núcleo;
- evitar Fases obrigatórias e imutáveis;
- permitir configuração mínima de campos;
- permitir configuração mínima de Fases;
- permitir tarefas e responsáveis por Fase sem fixar cargos de agência no núcleo;
- não transformar documentos persistentes em anexos perdidos em Cards;
- não transformar Formulários em respostas isoladas sem destino;
- não transformar Automação em substituta de capacidades nativas da Fase;
- manter IA, painel, automação e integração conectados ao fluxo principal;
- evitar regras específicas de um único cliente no núcleo.

### Distinção que importa

Seja específico ao domínio do produto:

- Formulário;
- Database;
- Pipe;
- Fase;
- Card;
- Tarefa;
- Responsável;
- Histórico;
- Automação;
- IA;
- Painel;
- Integração.

Não seja específico às regras de uma agência particular.

### Regra de segurança para acessos

Informações de acesso podem incluir:

- plataforma relacionada;
- conta relacionada;
- responsável;
- status do acesso;
- instruções;
- referência segura para credencial.

Senhas, tokens, chaves e outros segredos não devem ser tratados como campos comuns do Database.

---

## 9. Capacidades obrigatórias além do núcleo

As capacidades abaixo fazem parte do MVP e não são opcionais.

A função desta seção é limitar cada capacidade à menor versão necessária.

---

### 9.1 Form Builder configurável

**Valor que deve validar:** permitir que uma agência adapte a entrada de informações conforme o serviço.

Versão mínima:

- criar formulário;
- organizar campos;
- criar seções;
- publicar;
- receber dados e arquivos;
- definir destino mínimo.

Não entra:

- lógica condicional avançada;
- cálculos complexos;
- scripts;
- CSS personalizado;
- pagamentos.

---

### 9.2 Fases operacionais

**Valor que deve validar:** permitir que cada etapa tenha contexto real de execução.

Versão mínima:

- tarefas por Fase;
- responsáveis por Fase;
- instruções;
- execução no Card;
- histórico preservado.

Não entra:

- dependências avançadas;
- subtarefas complexas;
- SLA avançado por tarefa.

---

### 9.3 Automações

**Valor que deve validar:** reduzir trabalho manual e conectar eventos a ações.

Versão mínima:

- gatilho;
- condições simples opcionais;
- ação;
- ativar/pausar;
- logs;
- resultado.

Não entra:

- fluxos com muitas ramificações;
- loops;
- editor visual complexo;
- dezenas de gatilhos e ações;
- orquestração enterprise.

---

### 9.4 IA assistida para follow-up

**Valor que deve validar:** reduzir clientes, leads ou demandas esquecidas.

Versão mínima:

- identificar inatividade;
- detectar follow-up pendente;
- sugerir próxima ação;
- gerar sugestão de mensagem;
- permitir uso como ação de automação;
- exigir revisão humana quando aplicável.

Não entra:

- múltiplos agentes;
- autonomia total;
- execução irrestrita;
- decisões críticas sem confirmação;
- criação completa do sistema por prompt.

---

### 9.5 Painel operacional

**Valor que deve validar:** dar visibilidade rápida sobre o que exige atenção.

Versão mínima:

- itens sem atividade;
- processos atrasados;
- follow-ups pendentes;
- quantidade por Fase ou status;
- automações que precisam de atenção quando aplicável.

Não entra:

- BI completo;
- construtor livre de dashboards;
- dezenas de gráficos;
- análises preditivas;
- relatórios financeiros complexos.

---

### 9.6 Conexão com API externa

**Valor que deve validar:** provar que o Giraffe CRM participa do ecossistema real da agência.

Versão mínima:

- escolher uma integração externa concreta;
- enviar ou receber dados do fluxo principal;
- validar um caso real.

Não entra:

- dezenas de integrações;
- marketplace;
- construtor genérico;
- infraestrutura abstrata sem caso real;
- múltiplos provedores para o mesmo problema.

---

## 10. O que não entra automaticamente no MVP

Não inclua sem justificativa direta:

- IA totalmente autônoma;
- múltiplos agentes de IA;
- criação completa de processos por prompt;
- lógica condicional avançada de formulários;
- cálculos complexos em formulários;
- assinatura digital;
- pagamentos;
- subtarefas complexas;
- dependências avançadas entre tarefas;
- SLA avançado por tarefa;
- automações com ramificações complexas;
- loops de automação;
- editor completo de workflow visual;
- dashboards avançados;
- BI completo;
- relatórios complexos;
- marketplace;
- dezenas de integrações específicas;
- dezenas de templates;
- aplicativo mobile nativo;
- módulos de RH;
- módulos financeiros;
- Service Desk;
- personalização visual avançada;
- permissões extremamente granulares;
- billing complexo;
- recursos enterprise.

Não exclua a categoria inteira quando sua versão mínima é obrigatória.

Exemplos:

- Form Builder avançado fica fora, mas Form Builder mínimo entra;
- automação avançada fica fora, mas Quando → Condições → Então entra;
- IA avançada fica fora, mas follow-up assistido e ação de IA entram;
- dashboards avançados ficam fora, mas painel operacional mínimo entra;
- dezenas de integrações ficam fora, mas uma integração concreta entra;
- app nativo fica fora, mas aplicação web responsiva entra.

---

## 11. Princípio de decisão

Sempre prefira:

**um fluxo completo funcionando com os pilares essenciais**

em vez de:

**muitas funcionalidades incompletas.**

O MVP deve permitir executar um processo real do início ao fim usando:

- Formulário;
- Database;
- Registro;
- Pipe;
- Card;
- relacionamento;
- Fases;
- tarefas;
- responsáveis;
- histórico;
- automação;
- logs;
- IA;
- painel;
- API externa;
- uso responsivo em celular.

---

## 12. Validação final obrigatória

Antes de aprovar o MVP, responda:

1. **Uma agência consegue criar um formulário para um serviço real?**
2. **O formulário consegue criar ou atualizar um Registro persistente?**
3. **O fluxo pode criar um Card relacionado quando configurado?**
4. **Card e Registro permanecem relacionados sem duplicar todo o contexto?**
5. **Cada Fase pode possuir tarefas próprias?**
6. **Cada Fase pode possuir responsáveis próprios?**
7. **O Card mostra as tarefas da Fase atual?**
8. **O Card preserva histórico visível das atividades anteriores?**
9. **É possível criar uma automação real usando Quando → Condições → Então?**
10. **A automação possui log e resultado visíveis?**
11. **A IA pode ser usada como ação de automação em um caso real?**
12. **A IA continua sujeita à revisão humana quando necessária?**
13. **O painel mostra o que exige atenção?**
14. **Existe pelo menos uma API externa concreta funcionando?**
15. **As principais ações funcionam no celular?**
16. **Ao concluir o processo, informações e arquivos continuam no contexto correto?**

Se qualquer resposta for **não**, o MVP está incompleto.

Depois pergunte:

**"Existe alguma funcionalidade no escopo que não é necessária para executar esse fluxo nem para validar um dos pilares obrigatórios?"**

Se existir, remova-a ou justifique explicitamente.

---

## 13. Exemplo trabalhado

Use este exemplo como calibração do nível de detalhe esperado.

**Contexto de entrada:** agência "Studio Verde", 6 pessoas, atende pequenos e-commerces. Ao fechar um cliente, dados, arquivos e status de acessos se perdem em conversas e drives; o onboarding não tem etapas claras; cada serviço exige informações diferentes; responsáveis mudam por etapa; clientes ficam sem follow-up; automações não são rastreáveis.

```text
# MVP — Onboarding operacional de cliente (Giraffe CRM)

## 1. Objetivo do MVP
Provar que uma agência consegue criar um formulário adequado ao serviço,
receber dados e arquivos, preservar essas informações em um Database,
criar um Card relacionado, executar um onboarding por Fases com tarefas e
responsáveis próprios, acompanhar o histórico, usar uma automação rastreável,
receber apoio de IA para follow-up e utilizar uma integração externa real.

## 2. Usuário principal
Gestor de contas ou operação da agência responsável pela entrada e
coordenação do cliente.

## 3. Problema validado
Informações chegam por canais dispersos, formulários não se adaptam aos
serviços, processos não têm execução clara por etapa, responsabilidades se
perdem, não existe histórico operacional confiável e clientes ficam sem
acompanhamento.

## 4. Fluxo principal
Gestor cria ou publica um formulário do serviço → cliente envia dados e
arquivos → o sistema cria ou atualiza o Registro no Database "Clientes" →
quando configurado, cria um Card no Pipe "Onboarding" → relaciona Card ↔
Cliente → Card entra na Fase atual e apresenta tarefas e responsáveis →
equipe conclui tarefas → Card avança preservando o histórico → painel sinaliza
atraso ou inatividade → automação reage ao evento e pede sugestão de IA →
gestor revisa → follow-up aprovado é enviado por API externa → log registra o
resultado → onboarding é concluído → dados, arquivos, relações e histórico
continuam disponíveis.

## 5. Funcionalidades obrigatórias
- Autenticação e Organização/Workspace
- Database "Clientes" com campos configuráveis e arquivos persistentes
- Form Builder configurável por serviço
- Seções, campos, obrigatoriedade, preview, publicação e modo público
- Formulário criando ou atualizando Registro
- Criação opcional de Card a partir do Formulário
- Relacionamento Card ↔ Registro
- Pipe "Onboarding" com Fases configuráveis
- Tarefas próprias por Fase
- Responsáveis próprios por Fase
- Execução de tarefas no Card
- Histórico visível de mudanças de Fase, tarefas, responsáveis e ações
- Automação mínima: Quando → Condições opcionais → Então
- Ativar e pausar automação
- Logs e resultados das automações
- IA assistida para follow-up
- IA como ação de automação em pelo menos um caso real
- Painel operacional mínimo
- Uma integração externa concreta via API
- Aplicação web responsiva para ações principais

## 6. Fora do MVP
Lógica condicional avançada de formulário, cálculos complexos, assinatura
digital, pagamentos, subtarefas complexas, dependências avançadas, SLA
avançado por tarefa, automações com ramificações e loops, editor completo de
workflow, IA autônoma, múltiplos agentes, BI completo, marketplace, dezenas
de integrações, app nativo, billing e permissões enterprise.

## 7. Critérios de aceite
- É possível criar um formulário específico para um serviço.
- O formulário recebe dados e arquivos.
- O envio cria ou atualiza um Registro persistente.
- O envio pode criar um Card quando configurado.
- Card e Registro ficam relacionados.
- Cada Fase pode possuir tarefas próprias.
- Cada Fase pode possuir responsáveis próprios.
- O Card mostra tarefas e responsáveis da Fase atual.
- Concluir tarefa preserva quem fez e quando.
- Mudar de Fase preserva o histórico anterior.
- O histórico mostra eventos relevantes do Card.
- É possível criar e ativar uma automação com gatilho, condição e ação.
- O log mostra a execução e o resultado da automação.
- A automação pode pedir uma sugestão à IA.
- A IA não envia uma ação externa sem a revisão exigida.
- O painel sinaliza itens sem atividade, atrasados e follow-ups pendentes.
- Uma API externa concreta envia ou recebe dados do fluxo real.
- As ações principais funcionam em tela de celular.

## 8. Critérios de sucesso
- A agência executa pelo menos 1 onboarding real do início ao fim.
- O formulário do serviço substitui a coleta manual dispersa.
- O cliente e seus arquivos continuam localizáveis após a conclusão.
- A equipe entende o que deve fazer em cada Fase.
- O histórico permite reconstruir o que aconteceu sem depender da memória.
- Pelo menos 1 automação é usada em um fluxo real e possui resultado visível.
- A IA ajuda a retomar pelo menos 1 item parado.
- A integração externa é usada em pelo menos 1 caso real.
- O usuário consegue acompanhar e agir também pelo celular.

## 9. Riscos e dúvidas críticas
- Quais tipos de campo são realmente indispensáveis no Form Builder inicial?
- O destino dos dados está claro para o usuário?
- A criação de Card a partir do formulário deve ser configuração padrão ou opcional?
- Como responsáveis de uma Fase substituem, acumulam ou preservam responsáveis anteriores?
- Qual é o menor conjunto de eventos necessário no histórico?
- Quais gatilhos e ações de automação validam melhor o primeiro fluxo?
- Como evitar automações duplicadas ou conflitantes no MVP?
- Qual critério de inatividade deve acionar a IA sem gerar excesso de alertas?
- Qual API externa concreta valida melhor o fluxo inicial?
- O layout de Card continua compreensível em telas menores?
```
