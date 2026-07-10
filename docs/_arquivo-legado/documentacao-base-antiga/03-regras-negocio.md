---
name: giraffe-business-rules-definition
description: Transforma a Visão do Produto e o MVP aprovados do Giraffe CRM em regras de negócio claras, numeradas, verificáveis e independentes de tecnologia. Use ao definir comportamentos obrigatórios, condições, limites, exceções e ciclos de vida relacionados a Form Builder, Formulário → Database → Pipe, Pipes, Fases, tarefas, responsáveis, Cards, Registros, relacionamentos, histórico, automações no modelo Quando → Condições → Então, logs e resultados, IA assistida, painel operacional, integrações externas e uso responsivo. Não use para decidir arquitetura, banco de dados, stack, endpoints, layout, componentes visuais, roadmap, permissões detalhadas ou tarefas de implementação.
---

# Skill — Definição de Regras de Negócio do Giraffe CRM

## 1. Objetivo

Transformar a Visão do Produto e o MVP aprovados em regras de negócio explícitas, verificáveis e estáveis.

Uma regra de negócio define:

**o que o produto deve permitir, impedir, preservar ou exigir, independentemente da tecnologia usada para implementá-lo.**

A Skill deve responder:

**“Quais comportamentos e limites o Giraffe CRM deve sempre respeitar para cumprir sua Visão e seu MVP?”**

As regras devem reduzir ambiguidades antes das etapas de:

- Permissões;
- Modelagem de Dados;
- Integrações;
- Referências Visuais;
- BMAD;
- Spec Kit;
- Arquitetura;
- Implementação.

---

## 2. Entradas obrigatórias

Antes de gerar ou alterar regras de negócio, consulte:

- Visão do Produto aprovada;
- MVP aprovado;
- princípios centrais do produto;
- decisões explicitamente aprovadas;
- regras de negócio já existentes;
- referências visuais aprovadas, quando ajudarem a compreender um comportamento.

Para o Giraffe CRM, considere obrigatoriamente:

- público inicial: agências de marketing;
- Formulário captura a entrada;
- Database guarda informações persistentes;
- Pipe organiza processos;
- Fase orienta a execução atual;
- Card representa o trabalho real em andamento;
- Pipe e Database devem se relacionar sem se transformar na mesma entidade;
- o Form Builder deve ser configurável conforme o serviço;
- um Formulário pode alimentar Database e Pipe;
- Cards e Registros podem ser criados e relacionados;
- cada Fase pode possuir tarefas próprias;
- cada Fase pode possuir responsáveis próprios;
- tarefas configuradas na Fase não são a mesma coisa que tarefas executadas no Card;
- o histórico do Card deve preservar atividades anteriores;
- automações seguem o modelo Quando → Condições → Então;
- automações precisam de logs e resultados visíveis;
- automações não substituem capacidades nativas da Fase;
- IA pode ser uma ação dentro de automações;
- IA assistida para follow-up faz parte do MVP;
- painel operacional mínimo faz parte do MVP;
- pelo menos uma integração externa concreta via API faz parte do MVP;
- aplicação web responsiva para celular faz parte do MVP;
- o núcleo não deve codificar regras específicas de uma única agência.

---

## 3. Fonte de verdade e conflitos documentais

Não use precedência silenciosa entre documentos.

A Skill nunca deve decidir sozinha que Visão, MVP, Regra de Negócio ou outra fonte “vence” um conflito.

Ao encontrar contradição:

1. identifique os documentos envolvidos;
2. descreva exatamente a contradição;
3. não consolide a regra conflitante;
4. registre o conflito em **Conflitos e decisões pendentes**;
5. aguarde uma decisão explícita;
6. após a decisão, atualize ou marque como superado o documento afetado.

### Regra de reconciliação

Uma decisão mais recente só substitui uma anterior quando a mudança for:

- explícita;
- aprovada;
- registrada;
- reconciliada com os documentos afetados.

O MVP pode reduzir escopo.

O MVP não pode quebrar silenciosamente um princípio aprovado da Visão do Produto.

As Regras de Negócio não podem inventar comportamentos que não sejam sustentados pela Visão, pelo MVP ou por uma decisão aprovada.

---

## 4. O que é uma regra de negócio

Uma boa regra de negócio deve ser:

- clara;
- objetiva;
- verificável;
- independente de tecnologia;
- ligada a uma fonte aprovada;
- específica ao domínio do produto;
- livre de detalhes de implementação.

### Exemplo correto

**“Concluir um Card não pode apagar o Registro relacionado no Database.”**

### Exemplo incorreto

**“Ao concluir o Card, execute um UPDATE no PostgreSQL.”**

O primeiro define comportamento do produto.

O segundo define implementação técnica.

---

## 5. O que esta Skill não deve definir

Não use esta Skill para decidir:

- stack;
- arquitetura;
- tabelas;
- colunas;
- endpoints;
- filas;
- cache;
- bibliotecas;
- provedores;
- infraestrutura;
- layout visual;
- número de colunas da interface;
- posição de painéis;
- componentes de interface;
- cores;
- ícones;
- roadmap;
- cronograma;
- tarefas de desenvolvimento;
- testes técnicos;
- permissões detalhadas por papel.

Quando uma decisão depender desses temas:

1. registre apenas a necessidade de negócio;
2. não escolha a solução técnica ou visual;
3. encaminhe a decisão para a etapa correta.

### Exemplo

**Regra de negócio:** o histórico do Card deve permanecer consultável.

**Não decidir aqui:** se o histórico aparece na coluna esquerda, em aba, timeline ou painel lateral.

---

## 6. Fronteira com referências visuais

As referências aprovadas para:

- Form Builder;
- Visualização do Card;
- Automações;

podem ajudar a esclarecer comportamentos esperados.

Entretanto:

- a referência visual não cria uma regra de negócio sozinha;
- a Skill deve extrair apenas o comportamento aprovado;
- composição, cores e layout pertencem ao documento de Referências Visuais;
- protótipos HTML demonstram, mas não substituem regras aprovadas.

### Exemplo

Referência visual mostra histórico no lado esquerdo do Card.

A regra de negócio correta é:

**“O histórico anterior do Card deve permanecer visível ou facilmente consultável.”**

A regra de negócio incorreta é:

**“O histórico deve obrigatoriamente ocupar 420px na coluna esquerda.”**

---

## 7. Formato obrigatório de cada regra

Toda regra deve usar exatamente este formato:

```text
### RN-[DOMÍNIO]-[NÚMERO] — [Título curto]

**Fonte:** [Visão do Produto, MVP, decisão aprovada ou regra-base]

**Regra:** [comportamento obrigatório]

**Gatilho ou condição:** [quando a regra se aplica]

**Resultado obrigatório:** [o que deve acontecer ou ser impedido]

**Exceções:** [se existirem; caso contrário, “Nenhuma no escopo atual”]

**Escopo:** [MVP ou Produto]
```

Use uma regra por comportamento.

Não misture várias decisões diferentes na mesma regra.

Não crie regra sem indicar sua fonte.

---

## 8. Domínios de regras

Avalie somente os domínios necessários ao escopo atual.

### Geral

Princípios centrais do produto.

Prefixo: `RN-GER`

### Organização e Workspace

Separação lógica entre organizações e contexto de uso.

Prefixo: `RN-ORG`

Não detalhar papéis e permissões nesta etapa.

### Pipe e Fases

Processos, Fases, Cards, movimentação, conclusão e ciclo de vida.

Prefixo: `RN-PIPE`

### Tarefas

Definição de tarefas na Fase e execução real no Card.

Prefixo: `RN-TAR`

### Database

Informações persistentes, Registros, campos configuráveis e ciclo de vida.

Prefixo: `RN-DB`

### Relacionamentos

Conexões entre Cards, Registros e outros contextos.

Prefixo: `RN-REL`

### Formulários

Form Builder, publicação, submissão, destino e atualização de informações.

Prefixo: `RN-FORM`

### Automações

Gatilhos, condições, ações, execução, estado, logs e resultados.

Prefixo: `RN-AUT`

### Arquivos

Vínculo, preservação, localização e tratamento de arquivos e documentos.

Prefixo: `RN-ARQ`

### IA

Detecção de necessidade de acompanhamento, sugestão, revisão humana, uso em automações e limites de autonomia.

Prefixo: `RN-IA`

### Painel operacional

Informações que exigem atenção e consistência dos indicadores.

Prefixo: `RN-DASH`

### API e integrações externas

Envio, recebimento, resultado, falha, contexto e rastreabilidade.

Prefixo: `RN-API`

### Histórico

Eventos relevantes que precisam permanecer consultáveis.

Prefixo: `RN-HIST`

### Uso em celular

Ações essenciais que devem ser executáveis pela aplicação web responsiva.

Prefixo: `RN-MOB`

---

## 9. Regras obrigatórias de anti-engessamento

Ao gerar qualquer regra, preserve estes princípios:

1. O núcleo define capacidades universais, não o processo específico de uma agência.
2. Fases de onboarding não podem virar Fases obrigatórias para todos.
3. Campos de uma agência não podem virar campos fixos do núcleo.
4. Tarefas de um serviço não podem virar tarefas universais do produto.
5. Cargos de uma agência não podem virar responsáveis fixos do núcleo.
6. Formulários de serviços devem ser configuráveis.
7. Templates aceleram a configuração, mas não criam regras universais.
8. Automações específicas de uma agência não podem virar comportamento obrigatório para todas.
9. Necessidades específicas devem preferencialmente ser resolvidas por:
   - configuração;
   - template;
   - automação;
   - módulo;
   - integração.
10. Antes de transformar uma necessidade em regra universal, pergunte:

**“Isso precisa ser verdade para todo Giraffe CRM ou apenas para um processo, serviço, segmento ou cliente?”**

Se for específico, não transforme em regra universal do núcleo.

---

# 10. Regras-base atuais do produto

As regras abaixo representam a interpretação atual dos documentos aprovados do Giraffe CRM.

Elas não substituem a Visão ou o MVP.

Se um documento aprovado entrar em conflito com qualquer regra-base:

1. não aplique precedência silenciosa;
2. registre o conflito;
3. identifique as fontes envolvidas;
4. não consolide a regra conflitante;
5. reconcilie os documentos após decisão explícita.

Uma regra-base só deixa de valer quando a decisão que a originou for explicitamente revisada e aprovada.

---

## 10.1 Regras gerais

### RN-GER-001 — Pipe e Database possuem responsabilidades diferentes

**Fonte:** Visão do Produto

**Regra:** Pipe organiza trabalho em movimento; Database preserva informações independentes do ciclo de vida de um processo.

**Gatilho ou condição:** sempre que uma funcionalidade tratar processo, informação ou ambos.

**Resultado obrigatório:** a separação entre processo e informação persistente deve ser preservada.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-GER-002 — Necessidades específicas não viram núcleo automaticamente

**Fonte:** Visão do Produto

**Regra:** uma necessidade específica de uma agência, cliente, serviço ou processo não pode se tornar comportamento obrigatório de todo o produto sem decisão explícita de valor universal.

**Gatilho ou condição:** proposta de campo, Fase, tarefa, responsável, fluxo, formulário ou automação fixa.

**Resultado obrigatório:** a necessidade deve ser tratada preferencialmente por configuração, template, automação, módulo ou integração.

**Exceções:** decisão explicitamente aprovada como capacidade universal.

**Escopo:** Produto

---

### RN-GER-003 — Capacidades nativas e automações possuem responsabilidades diferentes

**Fonte:** Visão do Produto + MVP

**Regra:** uma capacidade que pertence naturalmente à configuração de uma entidade não deve depender obrigatoriamente de automação para funcionar.

**Gatilho ou condição:** quando uma necessidade puder ser atendida pela configuração nativa de Fase, Formulário, Database ou outro recurso.

**Resultado obrigatório:** automações devem ser usadas para reagir a eventos e executar ações adicionais, não para substituir capacidades essenciais do próprio recurso.

**Exceções:** automação pode complementar o comportamento nativo quando explicitamente configurada.

**Escopo:** Produto

---

## 10.2 Regras de Pipe e Fases

### RN-PIPE-001 — Todo Card ativo possui um estado atual

**Fonte:** MVP

**Regra:** todo Card ativo deve estar associado a um Pipe e possuir uma Fase atual.

**Gatilho ou condição:** criação ou movimentação de Card.

**Resultado obrigatório:** o estado atual do Card deve ser identificável.

**Exceções:** estados especiais de arquivamento ou exclusão podem ser definidos posteriormente.

**Escopo:** MVP

---

### RN-PIPE-002 — Concluir um processo não elimina a informação relacionada

**Fonte:** Visão do Produto + MVP

**Regra:** concluir ou arquivar um Card não pode apagar Registros persistentes relacionados no Database.

**Gatilho ou condição:** conclusão ou arquivamento do processo.

**Resultado obrigatório:** os Registros relacionados continuam disponíveis conforme seu próprio ciclo de vida.

**Exceções:** exclusão explícita do Registro segundo regras próprias de retenção, exclusão e LGPD.

**Escopo:** Produto

---

### RN-PIPE-003 — Cada Fase pode possuir configuração própria de execução

**Fonte:** Visão do Produto + MVP

**Regra:** uma Fase pode definir tarefas, responsáveis e instruções aplicáveis ao seu contexto de execução.

**Gatilho ou condição:** configuração de uma Fase.

**Resultado obrigatório:** diferentes Fases do mesmo Pipe podem representar diferentes necessidades de trabalho.

**Exceções:** uma Fase pode não possuir tarefas, responsáveis ou instruções quando o processo não exigir.

**Escopo:** MVP

---

### RN-PIPE-004 — A entrada em uma Fase altera o contexto atual de execução

**Fonte:** Visão do Produto + MVP

**Regra:** quando um Card entra em uma Fase, o sistema deve aplicar ou apresentar o contexto configurado para aquela Fase.

**Gatilho ou condição:** entrada do Card em uma nova Fase.

**Resultado obrigatório:** tarefas, responsáveis e instruções aplicáveis à Fase atual devem ficar disponíveis conforme a configuração.

**Exceções:** elementos não configurados para a Fase não são obrigatórios.

**Escopo:** MVP

---

### RN-PIPE-005 — Mudança de Fase não apaga o contexto anterior

**Fonte:** Visão do Produto + MVP

**Regra:** avançar ou retornar um Card entre Fases não pode apagar o histórico das Fases anteriores.

**Gatilho ou condição:** mudança de Fase.

**Resultado obrigatório:** atividades já realizadas permanecem consultáveis.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-PIPE-006 — Responsáveis podem variar por Fase

**Fonte:** Visão do Produto + MVP

**Regra:** diferentes Fases podem definir responsáveis ou equipes padrão diferentes.

**Gatilho ou condição:** configuração da Fase ou entrada do Card na Fase.

**Resultado obrigatório:** o contexto de responsabilidade pode mudar conforme a etapa do processo.

**Exceções:** a política de substituir, acumular ou manter responsáveis anteriores deve ser definida explicitamente em regra própria quando aprovada.

**Escopo:** MVP

---

### RN-PIPE-007 — A regra de mudança de responsáveis não pode ser presumida

**Fonte:** MVP + decisão pendente identificada

**Regra:** o sistema não deve presumir silenciosamente se o responsável anterior será substituído, mantido ou acumulado quando o Card mudar de Fase.

**Gatilho ou condição:** Fase com responsável ou equipe padrão diferente da Fase anterior.

**Resultado obrigatório:** a política deve ser explicitamente configurada ou definida por regra aprovada.

**Exceções:** nenhuma até a política ser aprovada.

**Escopo:** MVP

---

## 10.3 Regras de tarefas

### RN-TAR-001 — Tarefa configurada e tarefa executada são conceitos diferentes

**Fonte:** Visão do Produto + MVP

**Regra:** a tarefa definida na configuração de uma Fase não é a mesma coisa que a execução dessa tarefa em um Card específico.

**Gatilho ou condição:** Card entra em uma Fase que possui tarefas configuradas.

**Resultado obrigatório:** o sistema deve distinguir o modelo esperado de trabalho da execução real.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-TAR-002 — A execução da tarefa deve manter contexto

**Fonte:** MVP

**Regra:** uma tarefa executada deve permanecer relacionada ao Card e à Fase em que foi realizada.

**Gatilho ou condição:** início, atualização ou conclusão da tarefa.

**Resultado obrigatório:** deve ser possível identificar o que foi feito, em qual Card e em qual etapa.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-TAR-003 — Concluir uma tarefa não apaga seu histórico

**Fonte:** MVP

**Regra:** concluir uma tarefa não pode remover sua existência do histórico do Card.

**Gatilho ou condição:** conclusão da tarefa.

**Resultado obrigatório:** a atividade permanece consultável com seu resultado relevante.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-TAR-004 — Tarefas de um serviço não viram tarefas universais

**Fonte:** Visão do Produto

**Regra:** tarefas específicas de um processo ou serviço devem permanecer configuráveis.

**Gatilho ou condição:** criação de tarefa padrão para uma Fase.

**Resultado obrigatório:** o núcleo não deve exigir as mesmas tarefas em todos os Pipes.

**Exceções:** tarefas universais somente quando explicitamente aprovadas como capacidade geral.

**Escopo:** Produto

---

## 10.4 Regras de Database

### RN-DB-001 — O Database existe independentemente do Pipe

**Fonte:** Visão do Produto

**Regra:** um Registro do Database pode continuar existindo mesmo quando não houver Card ativo relacionado.

**Gatilho ou condição:** conclusão, arquivamento ou inexistência de processo ativo.

**Resultado obrigatório:** a informação permanece consultável conforme seu próprio ciclo de vida.

**Exceções:** exclusão explícita segundo regras aplicáveis.

**Escopo:** Produto

---

### RN-DB-002 — A estrutura do Database deve ser configurável

**Fonte:** Visão do Produto + MVP

**Regra:** os campos usados para descrever Registros não devem ser fixos para uma única agência.

**Gatilho ou condição:** criação ou configuração de Database.

**Resultado obrigatório:** a estrutura mínima necessária ao contexto deve poder ser configurada.

**Exceções:** campos internos universais necessários ao funcionamento do produto.

**Escopo:** MVP

---

## 10.5 Regras de relacionamentos

### RN-REL-001 — Pipe e Database se relacionam sem se fundir

**Fonte:** Visão do Produto

**Regra:** um Card pode se relacionar a Registros do Database sem transformar o Registro em Card ou o Card em Registro persistente.

**Gatilho ou condição:** associação entre processo e informação.

**Resultado obrigatório:** processo e informação continuam com ciclos de vida independentes.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-REL-002 — O contexto relacionado deve estar disponível no processo

**Fonte:** MVP

**Regra:** ao trabalhar em um Card relacionado a um Registro, o contexto necessário desse Registro deve estar acessível ao usuário autorizado.

**Gatilho ou condição:** abertura ou execução de um Card relacionado.

**Resultado obrigatório:** a equipe não precisa duplicar manualmente a mesma informação para acompanhar o processo.

**Exceções:** informações não autorizadas ao usuário.

**Escopo:** MVP

---

### RN-REL-003 — Criação relacionada deve preservar o vínculo

**Fonte:** Visão do Produto + MVP

**Regra:** quando um fluxo cria um Card e um Registro relacionados, o vínculo entre eles deve ser preservado.

**Gatilho ou condição:** criação dos dois elementos pelo mesmo Formulário, Automação ou ação configurada.

**Resultado obrigatório:** deve ser possível navegar do processo para a informação persistente e vice-versa conforme as permissões.

**Exceções:** quando o fluxo explicitamente não exigir relacionamento.

**Escopo:** MVP

---

### RN-REL-004 — Criar elemento relacionado não exige duplicar todo o contexto

**Fonte:** Visão do Produto + MVP

**Regra:** criar um Card ou Registro relacionado não deve exigir copiar manualmente todas as informações do elemento de origem.

**Gatilho ou condição:** criação de elemento conectado.

**Resultado obrigatório:** o relacionamento preserva o contexto compartilhado sem transformar uma entidade na outra.

**Exceções:** valores específicos podem ser copiados quando houver regra explícita de negócio.

**Escopo:** Produto

---

### RN-REL-005 — Cards relacionados podem existir em Pipes diferentes

**Fonte:** Visão do Produto + MVP

**Regra:** um fluxo pode criar ou relacionar Cards em Pipes diferentes quando isso representar processos distintos.

**Gatilho ou condição:** necessidade de iniciar um segundo processo relacionado.

**Resultado obrigatório:** os Cards mantêm seus próprios ciclos de vida e o relacionamento entre eles permanece identificável.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

## 10.6 Regras de Form Builder e Formulários

### RN-FORM-001 — A entrada deve chegar ao contexto correto

**Fonte:** MVP

**Regra:** informações e arquivos recebidos por Formulário devem ser associados ao Registro ou processo correto.

**Gatilho ou condição:** envio válido de Formulário.

**Resultado obrigatório:** os dados recebidos permanecem localizáveis dentro do contexto correto.

**Exceções:** submissões incompletas ou não identificadas devem seguir regra própria quando esse caso for definido.

**Escopo:** MVP

---

### RN-FORM-002 — O Form Builder deve ser configurável por serviço

**Fonte:** Visão do Produto + MVP

**Regra:** diferentes serviços podem possuir Formulários com estruturas diferentes.

**Gatilho ou condição:** criação ou edição de Formulário.

**Resultado obrigatório:** campos, seções, orientações, obrigatoriedade e arquivos podem ser configurados conforme a necessidade do serviço.

**Exceções:** limites do MVP podem restringir os tipos de campo disponíveis.

**Escopo:** MVP

---

### RN-FORM-003 — Campos específicos do serviço não pertencem ao núcleo

**Fonte:** Visão do Produto

**Regra:** campos próprios de tráfego pago, criação de site, criação de artes ou outro serviço não devem se tornar atributos fixos universais do produto.

**Gatilho ou condição:** criação de campo específico de um serviço.

**Resultado obrigatório:** o campo permanece configurável dentro do Formulário ou Database apropriado.

**Exceções:** campos internos universais aprovados.

**Escopo:** Produto

---

### RN-FORM-004 — Um Formulário pode criar ou atualizar um Registro

**Fonte:** Visão do Produto + MVP

**Regra:** a submissão de um Formulário pode criar ou atualizar um Registro conforme destino configurado.

**Gatilho ou condição:** envio válido de Formulário com destino definido.

**Resultado obrigatório:** os dados persistentes são associados ao Database correto.

**Exceções:** Formulários sem destino de Database podem existir quando explicitamente aprovados.

**Escopo:** MVP

---

### RN-FORM-005 — Criar Card a partir do Formulário é configurável

**Fonte:** Visão do Produto + MVP

**Regra:** um Formulário pode criar um Card quando esse comportamento estiver configurado.

**Gatilho ou condição:** envio válido de Formulário com destino de Pipe definido.

**Resultado obrigatório:** o Card é criado no contexto configurado.

**Exceções:** nem todo Formulário precisa criar Card.

**Escopo:** MVP

---

### RN-FORM-006 — Formulário, Database e Pipe possuem responsabilidades diferentes

**Fonte:** Visão do Produto

**Regra:** o Formulário captura a entrada, o Database preserva a informação e o Pipe organiza a execução.

**Gatilho ou condição:** sempre que um fluxo usar os três recursos.

**Resultado obrigatório:** nenhum deles deve assumir silenciosamente a responsabilidade dos demais.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-FORM-007 — A submissão deve preservar sua origem

**Fonte:** MVP

**Regra:** uma submissão deve permanecer relacionada ao Formulário que a originou.

**Gatilho ou condição:** envio válido.

**Resultado obrigatório:** deve ser possível identificar a origem da entrada.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-FORM-008 — Publicar Formulário não publica o processo interno

**Fonte:** Regras de Negócio + Permissões aprovadas

**Regra:** disponibilizar um Formulário não concede acesso ao Pipe, Database ou informações internas relacionadas.

**Gatilho ou condição:** publicação ou uso público do Formulário.

**Resultado obrigatório:** somente os campos e ações explicitamente expostos ficam disponíveis.

**Exceções:** acesso posterior depende de regra própria.

**Escopo:** Produto

---

### RN-FORM-009 — Arquivos recebidos devem possuir destino identificável

**Fonte:** Visão do Produto + MVP

**Regra:** arquivos enviados por Formulário não podem permanecer sem contexto de negócio identificável.

**Gatilho ou condição:** submissão com arquivo.

**Resultado obrigatório:** o arquivo fica associado ao Registro, Card, submissão ou outro contexto aprovado.

**Exceções:** arquivos rejeitados ou inválidos seguem regra própria.

**Escopo:** MVP

---

## 10.7 Regras de automações

### RN-AUT-001 — Toda automação possui um gatilho

**Fonte:** Visão do Produto + MVP

**Regra:** uma automação deve possuir um evento identificável que inicie sua avaliação.

**Gatilho ou condição:** criação ou execução de automação.

**Resultado obrigatório:** deve ser possível saber o que iniciou a automação.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-AUT-002 — Condições são opcionais e precedem a ação

**Fonte:** Visão do Produto + MVP

**Regra:** uma automação pode possuir condições adicionais que devem ser avaliadas antes da ação.

**Gatilho ou condição:** automação configurada com condições.

**Resultado obrigatório:** a ação somente é executada quando as condições configuradas forem satisfeitas.

**Exceções:** automação sem condições adicionais executa conforme o gatilho aprovado.

**Escopo:** MVP

---

### RN-AUT-003 — Toda automação possui ação identificável

**Fonte:** Visão do Produto + MVP

**Regra:** uma automação deve definir qual ação pretende executar após o gatilho e as condições aplicáveis.

**Gatilho ou condição:** criação ou execução de automação.

**Resultado obrigatório:** a ação pretendida deve ser identificável.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-AUT-004 — O modelo de automação deve preservar Quando → Condições → Então

**Fonte:** Visão do Produto + MVP

**Regra:** a automação deve ser compreensível como evento, condições opcionais e ação.

**Gatilho ou condição:** criação, leitura ou edição de automação.

**Resultado obrigatório:** o usuário consegue entender o comportamento da automação sem depender de detalhes técnicos.

**Exceções:** futuras evoluções podem incluir múltiplas ações ou ramificações, desde que preservem clareza.

**Escopo:** Produto

---

### RN-AUT-005 — Automações não substituem tarefas e responsáveis nativos da Fase

**Fonte:** Visão do Produto + MVP

**Regra:** tarefas e responsáveis configurados diretamente na Fase devem funcionar sem exigir uma automação auxiliar.

**Gatilho ou condição:** Card entra em Fase com configuração nativa.

**Resultado obrigatório:** o contexto da Fase fica disponível independentemente da existência de automação.

**Exceções:** automações podem complementar o comportamento.

**Escopo:** MVP

---

### RN-AUT-006 — Toda execução de automação deve possuir resultado rastreável

**Fonte:** Visão do Produto + MVP

**Regra:** cada execução relevante de automação deve produzir um resultado consultável.

**Gatilho ou condição:** automação é iniciada.

**Resultado obrigatório:** deve ser possível identificar automação, contexto, momento, ação e resultado.

**Exceções:** eventos puramente técnicos pertencem à observabilidade, sem substituir o resultado de negócio.

**Escopo:** MVP

---

### RN-AUT-007 — Automação não pode falhar silenciosamente

**Fonte:** Visão do Produto + MVP

**Regra:** quando uma automação não produzir o resultado esperado, essa situação deve permanecer identificável.

**Gatilho ou condição:** execução não concluída, resultado desconhecido ou necessidade de atenção.

**Resultado obrigatório:** o usuário consegue distinguir execução bem-sucedida de execução problemática.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-AUT-008 — Resultado desconhecido não é sucesso

**Fonte:** MVP

**Regra:** ausência de evidência suficiente de conclusão não pode ser apresentada como sucesso.

**Gatilho ou condição:** resultado da automação ainda não confirmado.

**Resultado obrigatório:** a execução permanece em estado identificável de espera, incerteza ou atenção.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-AUT-009 — Automação pode criar Card ou Registro relacionado

**Fonte:** Visão do Produto + MVP

**Regra:** uma automação pode criar Card, Registro ou ambos quando essa ação estiver configurada.

**Gatilho ou condição:** ação de automação aprovada.

**Resultado obrigatório:** os elementos criados mantêm o contexto e os relacionamentos necessários.

**Exceções:** quando a ação configurada não exigir relacionamento.

**Escopo:** MVP

---

### RN-AUT-010 — Alterar automação não apaga o resultado de execuções anteriores

**Fonte:** Visão do Produto + MVP

**Regra:** editar, pausar ou desativar uma automação não deve apagar silenciosamente os resultados históricos das execuções já realizadas.

**Gatilho ou condição:** alteração do estado ou configuração da automação.

**Resultado obrigatório:** o histórico anterior permanece consultável conforme as regras de retenção.

**Exceções:** exclusão ou anonimização explicitamente aprovada.

**Escopo:** Produto

---

### RN-AUT-011 — O estado da automação deve ser identificável

**Fonte:** MVP

**Regra:** deve ser possível distinguir se uma automação está apta ou não a reagir a novos eventos.

**Gatilho ou condição:** consulta à automação.

**Resultado obrigatório:** o usuário consegue identificar, no mínimo, se a automação está ativa ou pausada.

**Exceções:** estados adicionais podem ser aprovados posteriormente.

**Escopo:** MVP

---

## 10.8 Regras de arquivos

### RN-ARQ-001 — Arquivos importantes não podem existir apenas em Cards temporários

**Fonte:** Visão do Produto + MVP

**Regra:** arquivos que fazem parte do histórico ou dos ativos do cliente devem poder ser associados a Registros persistentes.

**Gatilho ou condição:** envio ou produção de arquivo relevante.

**Resultado obrigatório:** o arquivo continua localizável após a conclusão do processo relacionado.

**Exceções:** arquivos temporários sem valor persistente.

**Escopo:** MVP

---

### RN-ARQ-002 — Segredos não são campos comuns do Database

**Fonte:** Decisão aprovada de segurança do produto

**Regra:** senhas, tokens, chaves e outros segredos não devem ser tratados como campos comuns de informação.

**Gatilho ou condição:** cadastro de acessos ou integrações.

**Resultado obrigatório:** o sistema deve usar apenas metadados, status ou referências seguras até existir mecanismo específico para segredos.

**Exceções:** mecanismo de credenciais aprovado em etapa própria.

**Escopo:** Produto

---

## 10.9 Regras de IA

### RN-IA-001 — A IA identifica necessidade de acompanhamento

**Fonte:** MVP

**Regra:** a IA do MVP deve identificar itens que atendam aos critérios definidos de inatividade ou follow-up pendente.

**Gatilho ou condição:** condição de acompanhamento satisfeita.

**Resultado obrigatório:** o item é sinalizado para atenção.

**Exceções:** itens concluídos, ignorados ou fora dos critérios aplicáveis.

**Escopo:** MVP

---

### RN-IA-002 — A IA sugere, mas não envia sozinha no MVP

**Fonte:** MVP

**Regra:** a IA pode sugerir próxima ação ou mensagem, mas não pode executar envio externo sem revisão humana quando essa revisão for exigida.

**Gatilho ou condição:** geração de sugestão de follow-up.

**Resultado obrigatório:** o usuário revisa e aprova antes do envio quando aplicável.

**Exceções:** nenhuma no MVP para ações externas sujeitas a revisão humana.

**Escopo:** MVP

---

### RN-IA-003 — A IA respeita o contexto permitido

**Fonte:** Visão do Produto + decisão aprovada de segurança

**Regra:** a IA deve considerar apenas informações pertencentes ao contexto permitido do usuário e do processo.

**Gatilho ou condição:** uso de dados para gerar análise, sugestão ou ação.

**Resultado obrigatório:** dados de organizações, clientes ou contextos não relacionados não podem ser misturados.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-IA-004 — IA pode ser ação de automação

**Fonte:** Visão do Produto + MVP

**Regra:** uma automação pode solicitar uma análise ou sugestão de IA quando essa ação estiver configurada.

**Gatilho ou condição:** automação atinge a ação de IA.

**Resultado obrigatório:** a saída da IA permanece relacionada ao contexto que originou a automação.

**Exceções:** nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-IA-005 — Automação não amplia o acesso da IA

**Fonte:** Visão do Produto + Permissões aprovadas

**Regra:** usar IA dentro de uma automação não concede acesso adicional a dados.

**Gatilho ou condição:** automação solicita ação de IA.

**Resultado obrigatório:** a IA usa somente o contexto autorizado.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-IA-006 — Sugestão de IA e ação executada são diferentes

**Fonte:** Visão do Produto + MVP

**Regra:** gerar uma sugestão de IA não significa que a ação sugerida foi executada.

**Gatilho ou condição:** geração de sugestão.

**Resultado obrigatório:** o estado da sugestão e o estado da ação permanecem distinguíveis.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

## 10.10 Regras de painel operacional

### RN-DASH-001 — O painel mostra o que exige atenção

**Fonte:** MVP

**Regra:** o painel operacional deve destacar itens sem atividade, atrasados ou com follow-up pendente.

**Gatilho ou condição:** acesso ao painel.

**Resultado obrigatório:** o usuário consegue identificar rapidamente onde precisa agir.

**Exceções:** Nenhuma no MVP.

**Escopo:** MVP

---

### RN-DASH-002 — Indicadores devem refletir o estado real da operação

**Fonte:** MVP

**Regra:** um indicador do painel deve representar o estado real dos itens que o originam.

**Gatilho ou condição:** apresentação de indicador operacional.

**Resultado obrigatório:** o indicador não pode contradizer silenciosamente a informação de origem.

**Exceções:** quando houver divergência temporária conhecida, essa condição deve ser identificável.

**Escopo:** Produto

---

### RN-DASH-003 — Automação com problema pode exigir atenção operacional

**Fonte:** MVP

**Regra:** quando uma automação relevante precisar de intervenção, o produto deve permitir que essa necessidade seja identificável no contexto operacional apropriado.

**Gatilho ou condição:** automação em estado que exige atenção.

**Resultado obrigatório:** o problema não permanece oculto do usuário responsável.

**Exceções:** a forma visual de apresentação pertence à Referência Visual e UX.

**Escopo:** MVP

---

## 10.11 Regras de API e integrações externas

### RN-API-001 — O MVP deve possuir uma integração externa real

**Fonte:** MVP

**Regra:** pelo menos uma integração externa concreta deve participar do fluxo real do MVP.

**Gatilho ou condição:** validação do MVP.

**Resultado obrigatório:** o sistema envia ou recebe dados de outro serviço em um caso de uso real.

**Exceções:** Nenhuma para aprovação do MVP.

**Escopo:** MVP

---

### RN-API-002 — Resultado externo não concluído não pode ser apresentado como sucesso

**Fonte:** MVP

**Regra:** uma ação externa que não produzir o resultado esperado não pode ser apresentada como concluída com sucesso.

**Gatilho ou condição:** ausência do resultado esperado da ação externa.

**Resultado obrigatório:** a situação permanece identificável para acompanhamento e tratamento.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** MVP

---

### RN-API-003 — Toda ação externa deve manter contexto

**Fonte:** MVP

**Regra:** uma ação de envio ou recebimento externo deve permanecer relacionada ao cliente, Registro, Card ou processo correspondente.

**Gatilho ou condição:** comunicação com sistema externo.

**Resultado obrigatório:** deve ser possível entender a origem, o destino e o contexto de negócio da ação.

**Exceções:** eventos sem contexto de negócio pertencem à observabilidade técnica.

**Escopo:** MVP

---

## 10.12 Regras de histórico

### RN-HIST-001 — Ações relevantes devem permanecer rastreáveis

**Fonte:** MVP

**Regra:** mudanças relevantes no processo e ações externas devem gerar histórico consultável.

**Gatilho ou condição:** mudança de Fase, mudança relevante, sugestão aprovada, ação externa ou resultado não concluído.

**Resultado obrigatório:** deve ser possível reconstruir o que aconteceu no fluxo de negócio.

**Exceções:** eventos puramente técnicos pertencem à observabilidade.

**Escopo:** MVP

---

### RN-HIST-002 — O histórico do Card deve permanecer visível ou facilmente consultável

**Fonte:** Visão do Produto + MVP + referência visual aprovada

**Regra:** o usuário deve conseguir consultar as atividades anteriores relevantes do Card durante sua execução.

**Gatilho ou condição:** abertura ou acompanhamento do Card.

**Resultado obrigatório:** o contexto anterior permanece acessível sem depender da memória da equipe.

**Exceções:** a forma exata de apresentação pertence à Referência Visual e UX.

**Escopo:** MVP

---

### RN-HIST-003 — Estado atual e histórico possuem responsabilidades diferentes

**Fonte:** Visão do Produto + MVP

**Regra:** o estado atual do Card não substitui o registro dos eventos anteriores.

**Gatilho ou condição:** mudança de Fase, tarefa, responsável ou outro evento relevante.

**Resultado obrigatório:** o produto permite saber onde o Card está agora e o que aconteceu antes.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

### RN-HIST-004 — Histórico anterior não é apagado por mudança de Fase

**Fonte:** MVP

**Regra:** entrar em uma nova Fase não pode remover as atividades relevantes das Fases anteriores.

**Gatilho ou condição:** mudança de Fase.

**Resultado obrigatório:** o histórico acumulado permanece consultável.

**Exceções:** regras de retenção ou anonimização explicitamente aprovadas.

**Escopo:** MVP

---

### RN-HIST-005 — Logs de automação e histórico operacional não são a mesma coisa

**Fonte:** Visão do Produto + MVP

**Regra:** o resultado técnico-operacional de uma automação e o histórico do processo podem se relacionar, mas possuem finalidades diferentes.

**Gatilho ou condição:** automação executa ação relevante sobre um Card, Registro ou processo.

**Resultado obrigatório:** o produto pode mostrar no histórico que uma automação agiu e, separadamente, manter o detalhe do resultado da execução.

**Exceções:** Nenhuma no escopo atual.

**Escopo:** Produto

---

## 10.13 Regras de uso em celular

### RN-MOB-001 — As principais ações devem funcionar em tela de celular

**Fonte:** MVP

**Regra:** o usuário deve conseguir acompanhar e agir sobre o fluxo principal usando a aplicação web em tela de celular.

**Gatilho ou condição:** acesso em tela de celular.

**Resultado obrigatório:** deve ser possível consultar Registros, abrir Cards, visualizar arquivos, atualizar demandas, movimentar Cards, verificar tarefas, pendências, histórico essencial e revisar sugestões de IA.

**Exceções:** configurações complexas de Form Builder, Automação e administração podem permanecer prioritariamente em desktop no MVP.

**Escopo:** MVP

---

### RN-MOB-002 — Formulários públicos devem ser preenchíveis no celular

**Fonte:** MVP

**Regra:** um participante deve conseguir preencher e enviar o Formulário público usando tela de celular.

**Gatilho ou condição:** acesso ao Formulário público por dispositivo móvel.

**Resultado obrigatório:** os campos essenciais, arquivos e envio permanecem utilizáveis.

**Exceções:** recursos avançados não incluídos no MVP.

**Escopo:** MVP

---

## 11. Regras de qualidade

Antes de aprovar qualquer regra, verifique:

1. descreve comportamento de negócio e não implementação?
2. pode ser testada ou verificada?
3. possui um único propósito?
4. indica uma fonte aprovada?
5. está ligada à Visão, ao MVP ou a uma decisão explícita?
6. evita palavras vagas sem definição?
7. explica quando se aplica?
8. explica o resultado obrigatório?
9. explicita exceções quando existirem?
10. evita engessar o produto com uma regra específica de uma única agência?
11. evita invadir permissões, modelagem, arquitetura ou implementação?
12. evita transformar referência visual em regra de layout?
13. diferencia configuração da Fase de execução do Card?
14. diferencia tarefa configurada de tarefa executada?
15. diferencia capacidade nativa de automação?
16. diferencia resultado de automação de histórico operacional?
17. continuaria verdadeira se tecnologia, interface ou arquitetura mudassem amanhã?

Se qualquer resposta for “não”, revise a regra.

---

## 12. Formato obrigatório de saída

SEMPRE gere a saída com estes títulos, nesta ordem:

```text
# Regras de Negócio — [produto ou módulo]

## 1. Escopo
[O que estas regras cobrem.]

## 2. Fontes consultadas
[Documentos aprovados e decisões usadas.]

## 3. Princípios protegidos
[Princípios que não podem ser quebrados.]

## 4. Glossário mínimo
[Somente termos necessários para interpretar as regras.]

## 5. Regras globais
[Regras universais do produto.]

## 6. Regras por domínio
[Regras numeradas usando o formato obrigatório.]

## 7. Conflitos e decisões pendentes
[Somente conflitos reais entre documentos ou decisões ainda não resolvidas.]

## 8. Fora deste documento
[Temas deliberadamente deixados para Permissões, Modelagem, Integrações, Referências Visuais, Arquitetura ou etapas posteriores.]
```

Não gere código.

Não escolha tecnologia.

Não modele tabelas.

Não defina endpoints.

Não defina layout.

Não invente regras futuras.

Não transforme dúvidas de implementação em regras de negócio.

---

## 13. Validação final obrigatória

Antes de considerar as regras aprovadas, responda:

1. Formulário, Database e Pipe continuam com responsabilidades diferentes?
2. O Form Builder pode variar por serviço sem criar campos fixos no núcleo?
3. Um Formulário pode criar ou atualizar Registro quando configurado?
4. Um Formulário pode criar Card quando configurado?
5. Card e Registro relacionados preservam o vínculo?
6. Criar elemento relacionado evita duplicação obrigatória de todo o contexto?
7. Cada Fase pode possuir tarefas próprias?
8. Cada Fase pode possuir responsáveis próprios?
9. Tarefa configurada e tarefa executada permanecem distintas?
10. A política de mudança de responsáveis foi explicitada ou registrada como pendente?
11. O histórico do Card preserva atividades anteriores?
12. Mudar de Fase não apaga o histórico?
13. Automações seguem Quando → Condições → Então?
14. Automação não substitui capacidade nativa da Fase?
15. Toda execução relevante de automação possui resultado rastreável?
16. Automação não falha silenciosamente?
17. Resultado desconhecido não vira sucesso?
18. A IA pode ser ação de automação?
19. A automação não amplia o acesso da IA?
20. Sugestão de IA e ação executada permanecem diferentes?
21. O painel pode revelar automações que precisam de atenção?
22. Uma integração externa real continua obrigatória no MVP?
23. As ações essenciais e o histórico funcionam no celular?
24. Referências visuais foram usadas apenas para esclarecer comportamento?
25. Alguma regra específica de uma agência foi transformada indevidamente em regra universal?
26. Alguma regra invadiu arquitetura, modelagem, permissões, layout ou implementação?
27. Existe conflito documental não resolvido?
28. Cada regra possui fonte explícita?
29. Cada regra continuaria verdadeira se tecnologia, interface ou arquitetura mudassem amanhã?

Se qualquer resposta indicar conflito ou ambiguidade, revise antes de aprovar.

---

## 14. Princípio final

Sempre prefira:

**poucas regras claras, verificáveis, rastreáveis e estáveis**

em vez de:

**uma lista grande de requisitos vagos ou detalhes de implementação.**

A pergunta final é:

**“Se a tecnologia, a interface ou a arquitetura mudassem amanhã, esta regra ainda precisaria continuar verdadeira?”**

Se a resposta for sim, provavelmente é uma regra de negócio.

Se a resposta for não, provavelmente pertence a outra etapa do projeto.

Para as novas capacidades, aplique também estas perguntas:

**“A Fase define o trabalho esperado ou estamos tentando resolver tudo com Automação?”**

**“O Formulário apenas coleta ou sabemos para onde a informação deve ir?”**

**“O histórico mostra o que aconteceu ou apenas o estado atual?”**

**“A Automação executou com sucesso ou apenas não sabemos o resultado?”**

**“A IA sugeriu uma ação ou a ação foi realmente executada?”**
