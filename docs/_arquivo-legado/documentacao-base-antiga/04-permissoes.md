---
name: giraffe-permissions-definition
description: Transforma a Visão do Produto, o MVP e as Regras de Negócio aprovadas do Giraffe CRM em um modelo de permissões claro, verificável, flexível e independente de tecnologia. Use ao definir quem pode visualizar, criar, editar, mover, comentar, concluir, atribuir, relacionar, publicar, aprovar, configurar, ativar, pausar, excluir ou executar ações em Organizações, Workspaces, Pipes, Fases, Tarefas, Cards, Databases, Registros, Formulários, Submissões, Destinos de Dados, Arquivos, Histórico, Automações, Logs, IA, Dashboards e Integrações. Não use para decidir implementação técnica de autenticação ou autorização, banco de dados, RBAC, ABAC, RLS, JWT, OAuth, middleware, endpoints, bibliotecas ou layout visual.
---

# Skill — Definição de Permissões do Giraffe CRM

## 1. Objetivo

Transformar as decisões aprovadas do produto em um modelo claro de acesso e autoridade.

A Skill deve responder:

**“Quem pode fazer o quê, em qual recurso, dentro de qual contexto e sob quais condições?”**

O modelo de permissões deve:

- proteger os dados de cada Organização;
- permitir controle por recurso;
- permitir restrições por contexto;
- evitar acesso indireto indevido;
- proteger Pipe e Database como recursos separados;
- proteger Formulários, Submissões e Destinos de Dados;
- separar configuração de Fase de execução no Card;
- separar configuração de tarefa de conclusão de tarefa;
- controlar criação de Cards e Registros relacionados;
- proteger Histórico;
- separar configuração, ativação e consulta de Automações;
- proteger Logs e resultados de Automações;
- proteger IA, Dashboard e Integrações;
- permitir perfis padrão sem engessar o produto;
- permanecer independente da tecnologia usada na implementação.

---

## 2. Entradas obrigatórias

Antes de criar ou alterar permissões, consulte:

- Visão do Produto aprovada;
- MVP aprovado;
- Regras de Negócio aprovadas;
- decisões aprovadas sobre Organizações, usuários e segurança;
- Modelagem de Dados aprovada, quando existir;
- permissões já existentes;
- referências visuais aprovadas, apenas quando ajudarem a entender quais ações precisam ser acessíveis.

Para o Giraffe CRM, considere obrigatoriamente:

- o produto é multi-organização;
- dados de Organizações diferentes não podem se misturar;
- Formulário captura a entrada;
- Database preserva informação;
- Pipe organiza processo;
- Fase orienta a execução atual;
- Card representa o trabalho real em andamento;
- Pipe e Database possuem responsabilidades e ciclos de vida separados;
- relacionamentos não podem conceder acesso indevido;
- Form Builder configurável por serviço faz parte do MVP;
- Formulário pode criar ou atualizar Registro;
- Formulário pode criar Card quando configurado;
- Cards e Registros podem ser relacionados;
- cada Fase pode possuir tarefas próprias;
- cada Fase pode possuir responsáveis próprios;
- tarefa configurada na Fase não é a mesma coisa que tarefa executada no Card;
- Histórico do Card deve permanecer consultável;
- Automações seguem Quando → Condições → Então;
- Automações possuem Logs e resultados;
- IA pode ser ação de uma Automação;
- arquivos podem exigir proteção adicional;
- IA assistida faz parte do MVP;
- Dashboard operacional faz parte do MVP;
- integração externa via API faz parte do MVP;
- aplicação web responsiva faz parte do MVP;
- o núcleo não deve depender de cargos específicos de agência.

---

## 3. Fonte de verdade e conflitos

Não resolva silenciosamente conflitos entre documentos.

Ao encontrar contradição entre Visão, MVP, Regras de Negócio e Permissões:

1. identifique os documentos envolvidos;
2. descreva exatamente o conflito;
3. não consolide a permissão conflitante;
4. registre a questão em **Conflitos e decisões pendentes**;
5. aguarde decisão explícita;
6. depois da decisão, reconcilie os documentos afetados.

Uma decisão mais recente só substitui outra quando a mudança for:

- explícita;
- aprovada;
- registrada;
- reconciliada com os documentos afetados.

---

## 4. Fórmula obrigatória de uma permissão

Toda permissão deve ser avaliada pela fórmula:

**Sujeito + Ação + Recurso + Escopo + Condição**

### Sujeito

Quem recebe a permissão.

Exemplos:

- usuário;
- equipe;
- perfil;
- convidado externo;
- integração;
- Automação autorizada.

### Ação

O que pode ser feito.

Exemplos:

- visualizar;
- criar;
- editar;
- mover;
- comentar;
- concluir;
- atribuir;
- arquivar;
- excluir;
- publicar;
- aprovar;
- configurar;
- ativar;
- pausar;
- relacionar;
- executar ação externa.

### Recurso

Onde a ação acontece.

Exemplos:

- Organização;
- Workspace;
- Pipe;
- Fase;
- Tarefa;
- Card;
- Database;
- Registro;
- Formulário;
- Submissão;
- Destino de Dados;
- Arquivo;
- Histórico;
- Automação;
- Execução de Automação;
- Log;
- Dashboard;
- Sugestão de IA;
- Integração.

### Escopo

Até onde a permissão vale.

Exemplos:

- Organização;
- recurso específico;
- equipe;
- itens próprios;
- itens atribuídos;
- itens relacionados;
- itens explicitamente compartilhados.

### Condição

Quando a permissão é válida.

Exemplos:

- se o usuário for responsável;
- se fizer parte da equipe;
- se possuir acesso ao recurso de origem;
- se possuir acesso ao recurso de destino;
- se a ação tiver sido aprovada;
- se o item estiver dentro do escopo permitido.

---

## 5. Princípio anti-engessamento

O núcleo não deve depender de cargos fixos como:

- Gestor de Tráfego;
- Designer;
- Social Media;
- Atendimento;
- Diretor de Arte.

Esses nomes pertencem às Organizações usuárias.

O núcleo deve oferecer capacidades universais combináveis.

Exemplos:

- visualizar_pipe;
- configurar_pipe;
- configurar_fase;
- configurar_tarefas_fase;
- configurar_responsaveis_fase;
- criar_card;
- mover_card;
- concluir_tarefa;
- alterar_responsavel_card;
- visualizar_historico_card;
- visualizar_database;
- editar_registro;
- criar_formulario;
- editar_formulario;
- configurar_destino_formulario;
- publicar_formulario;
- visualizar_submissoes;
- criar_automacao;
- editar_automacao;
- ativar_automacao;
- pausar_automacao;
- visualizar_logs_automacao;
- usar_ia;
- aprovar_followup;
- executar_acao_externa;
- configurar_integracao.

Os níveis de permissão definidos nesta Skill são:

**perfis padrão de acesso**

e não:

**regras imutáveis do núcleo.**

Uma Organização pode usar os perfis padrão como ponto de partida e combinar capacidades conforme sua operação.

---

## 6. Hierarquia de permissões

O modelo deve avaliar três níveis.

### Nível 1 — Organização

Define a autoridade máxima do usuário dentro da Organização.

### Nível 2 — Recurso

Define o acesso específico a:

- Pipe;
- Database;
- Formulário;
- Automação;
- Dashboard;
- Integração;
- outros recursos protegidos.

### Nível 3 — Contexto

Define quais itens o usuário pode acessar dentro do recurso.

Exemplos:

- todos os itens;
- itens próprios;
- itens atribuídos;
- itens da equipe;
- itens relacionados;
- itens explicitamente compartilhados.

### Regra de combinação

O acesso efetivo nunca pode ultrapassar o limite permitido pelo nível superior.

Uma permissão em um Pipe não pode conceder autoridade administrativa sobre a Organização.

Um relacionamento não pode conceder acesso a um Database oculto.

Um Formulário público não pode conceder acesso ao Pipe ou Database de destino.

Um Dashboard não pode revelar dados que o usuário não pode consultar na origem.

Uma Automação não pode executar ações além da autoridade explicitamente permitida ao seu contexto.

A IA não pode usar dados fora do contexto autorizado.

Uma Integração não pode executar ações além das capacidades concedidas ao seu contexto.

---

# 7. Nível Organização

Os perfis abaixo são padrões iniciais.

## 7.1 Super Admin

Perfil com autoridade máxima sobre a Organização.

Pode, no mínimo:

- acessar e administrar a Organização;
- gerenciar administradores e membros;
- gerenciar configurações globais;
- gerenciar segurança;
- gerenciar Integrações da Organização;
- acessar recursos da Organização;
- transferir responsabilidades administrativas críticas;
- gerenciar cobrança e assinatura quando esse módulo existir.

### Regra

A Organização não pode ficar sem pelo menos um Super Admin ativo.

---

## 7.2 Admin

Perfil administrativo amplo, abaixo do Super Admin.

Pode, conforme o escopo aprovado:

- gerenciar membros;
- criar e administrar recursos;
- configurar Pipes e Databases;
- administrar Formulários;
- administrar Automações;
- gerenciar Integrações autorizadas;
- visualizar informações administrativas e operacionais.

Não pode, por padrão:

- remover o último Super Admin;
- assumir poderes reservados ao Super Admin;
- executar ações críticas explicitamente restritas.

### Regra

Administração operacional e autoridade máxima da Organização não devem ser tratadas como a mesma coisa.

---

## 7.3 Membro

Usuário padrão da Organização.

Pode:

- acessar recursos aos quais recebeu permissão;
- executar ações permitidas nesses recursos;
- participar de processos;
- trabalhar com Registros, Cards, tarefas e arquivos autorizados.

Não pode, por padrão:

- gerenciar a Organização;
- gerenciar outros usuários;
- alterar permissões globais;
- acessar recursos sem concessão.

### Regra

Ser Membro não concede automaticamente acesso a:

- todos os Pipes;
- todos os Databases;
- todos os Formulários;
- todas as Automações;
- todos os Dashboards;
- todos os Logs;
- todos os Arquivos.

### Criação de recursos

A capacidade de criar:

- Pipes;
- Databases;
- Formulários;
- Automações;
- Dashboards;
- outros recursos;

deve ser concedida explicitamente.

---

## 7.4 Convidado Externo

Usuário com participação limitada e explícita.

Pode:

- acessar apenas recursos compartilhados;
- executar somente ações concedidas;
- visualizar ou colaborar dentro do escopo autorizado.

Não pode, por padrão:

- navegar por toda a Organização;
- descobrir recursos não compartilhados;
- gerenciar a conta;
- criar recursos globais;
- administrar usuários;
- configurar Automações;
- configurar Destinos de Dados.

### Regra

O Convidado Externo é um usuário limitado.

Ele não deve ser confundido com uma pessoa que apenas envia um Formulário público.

---

## 7.5 Participante de Formulário Público

Pessoa externa que envia informações sem se tornar membro da Organização.

Pode:

- abrir Formulário publicado;
- enviar dados permitidos;
- anexar arquivos quando o Formulário permitir.

Não recebe automaticamente:

- conta de usuário;
- acesso ao Workspace;
- acesso ao Pipe;
- acesso ao Card criado;
- acesso ao Database;
- acesso ao Registro criado;
- acesso ao Histórico;
- acesso aos Logs;
- acesso a informações internas.

### Regra

Enviar um Formulário não transforma uma pessoa em usuário da Organização.

---

# 8. Nível Pipe, Fase, Tarefa e Card

Cada Pipe deve possuir controle próprio.

## 8.1 Admin do Pipe

Pode, no mínimo:

- visualizar o Pipe;
- configurar o Pipe;
- criar e reordenar Fases;
- configurar tarefas padrão das Fases;
- configurar responsáveis ou equipes padrão das Fases;
- configurar instruções da Fase;
- gerenciar participantes do Pipe dentro dos limites da Organização;
- criar Cards;
- editar Cards;
- mover Cards;
- concluir ou arquivar Cards;
- visualizar Histórico autorizado do Pipe e dos Cards.

Não recebe automaticamente autoridade sobre:

- Organização;
- Databases não autorizados;
- Formulários não autorizados;
- Automações não autorizadas;
- Integrações globais;
- recursos externos ao Pipe.

---

## 8.2 Membro do Pipe

Pode, conforme o escopo concedido:

- visualizar Cards;
- criar Cards;
- editar Cards;
- mover Cards;
- comentar;
- executar tarefas permitidas;
- concluir tarefas permitidas;
- consultar Histórico autorizado;
- consultar informações operacionais do Pipe.

Não pode, por padrão:

- alterar a estrutura do Pipe;
- criar ou remover Fases;
- configurar tarefas padrão da Fase;
- configurar responsáveis padrão da Fase;
- gerenciar permissões do Pipe;
- alterar configurações administrativas.

---

## 8.3 Leitura e Comentários

Pode:

- visualizar Cards autorizados;
- visualizar informações permitidas;
- visualizar Histórico autorizado;
- adicionar comentários quando essa capacidade estiver habilitada.

Não pode:

- editar conteúdo principal do Card;
- mover Card;
- alterar Fase;
- concluir tarefa;
- alterar responsável;
- configurar Pipe;
- excluir Card.

### Regra

Se nenhuma capacidade de comentário for concedida, o perfil se comporta como leitura pura.

---

## 8.4 Visão Restrita

Pode:

- criar Cards quando permitido;
- visualizar e editar somente itens que atendam às condições definidas.

Condições possíveis:

- Card criado pelo próprio usuário;
- Card atribuído ao usuário;
- Card atribuído à equipe;
- Card explicitamente compartilhado.

### Regra

Visão Restrita deve ser definida por condição clara.

Nunca use “acesso limitado” sem especificar a condição.

---

## 8.5 Apenas Formulário Inicial

Pode:

- acessar o Formulário publicado;
- enviar uma solicitação.

Não recebe automaticamente:

- acesso ao Pipe;
- acesso ao Card criado;
- acesso a outros Cards;
- acesso aos dados internos do processo.

### Regra

Este nível pode ser usado sem transformar o participante em Membro da Organização.

---

## 8.6 Configuração de Fase

A capacidade de configurar Fase deve ser separada da capacidade de operar Cards.

Pode incluir, quando autorizado:

- editar nome da Fase;
- alterar posição;
- configurar tarefas padrão;
- configurar responsáveis padrão;
- configurar equipe padrão;
- configurar instruções.

### Regra

Executar tarefas em um Card não concede permissão para alterar a configuração da Fase.

### Regra

Configurar uma Fase não concede automaticamente acesso irrestrito a todos os Cards que passam por ela.

---

## 8.7 Execução de Tarefas

As capacidades devem poder ser separadas em:

- visualizar tarefa;
- iniciar tarefa;
- editar tarefa em execução;
- concluir tarefa;
- reabrir tarefa;
- visualizar histórico da tarefa.

### Regra

Concluir uma tarefa não concede permissão para alterar o modelo de tarefa configurado na Fase.

### Regra

A capacidade de concluir tarefa pode ser condicionada a:

- responsabilidade individual;
- responsabilidade da equipe;
- acesso ao Card;
- outras condições aprovadas.

---

## 8.8 Responsáveis por Fase e Card

As capacidades devem poder ser separadas em:

- configurar responsável padrão da Fase;
- configurar equipe padrão da Fase;
- atribuir responsável a um Card;
- alterar responsável atual;
- remover responsável;
- visualizar responsáveis.

### Regra

Configurar responsável padrão da Fase e alterar responsável de um Card são autoridades diferentes.

### Regra

A política de substituir, acumular ou preservar responsáveis anteriores deve ser respeitada conforme as Regras de Negócio aprovadas.

---

## 8.9 Regras de segurança para Fase, Tarefa e Card

### PERM-PIPE-001 — Configuração de Fase não implica operação irrestrita

**Regra:** poder configurar uma Fase não concede automaticamente autoridade para executar qualquer ação em todos os Cards.

**Resultado obrigatório:** configuração estrutural e operação do processo podem ser separadas.

---

### PERM-PIPE-002 — Operar Card não implica configurar Fase

**Regra:** criar, editar, mover ou trabalhar em um Card não concede automaticamente permissão para alterar tarefas, responsáveis ou instruções padrão da Fase.

**Resultado obrigatório:** o modelo do processo permanece protegido.

---

### PERM-PIPE-003 — Tarefa executada respeita o acesso ao Card

**Regra:** um usuário não pode executar tarefa de um Card que está fora do seu escopo autorizado.

**Resultado obrigatório:** acesso a tarefas não contorna as regras do Card.

---

### PERM-PIPE-004 — Atribuição não amplia acesso automaticamente

**Regra:** atribuir um responsável a um Card não deve conceder acesso além do necessário e aprovado para executar seu trabalho.

**Resultado obrigatório:** atribuição e escopo de acesso permanecem controlados.

---

# 9. Nível Database

Como Database é um pilar central do Giraffe CRM, deve possuir controle próprio.

## 9.1 Admin do Database

Pode:

- visualizar o Database;
- configurar sua estrutura;
- gerenciar campos;
- criar Registros;
- editar Registros;
- arquivar ou excluir conforme regras aplicáveis;
- gerenciar participantes do Database dentro dos limites da Organização.

---

## 9.2 Editor do Database

Pode:

- visualizar Registros autorizados;
- criar Registros;
- editar Registros permitidos;
- relacionar Registros quando autorizado.

Não pode, por padrão:

- alterar a estrutura do Database;
- gerenciar campos;
- administrar permissões.

---

## 9.3 Leitor do Database

Pode:

- visualizar Registros autorizados.

Não pode:

- criar;
- editar;
- excluir;
- alterar estrutura.

---

## 9.4 Visão Restrita do Database

Pode acessar somente Registros que atendam a condições explícitas.

Exemplos:

- Registros próprios;
- Registros atribuídos;
- Registros relacionados a Cards autorizados;
- Registros da equipe.

### Regra

Acesso a um Card relacionado não concede automaticamente acesso total ao Database.

---

# 10. Nível Form Builder, Formulário e Submissões

Formulários devem possuir controle próprio.

## 10.1 Admin do Formulário

Pode, conforme o escopo aprovado:

- criar Formulário;
- editar estrutura;
- criar seções;
- adicionar e reordenar campos;
- editar propriedades de campos;
- configurar obrigatoriedade;
- configurar recebimento de arquivos;
- configurar Destinos de Dados;
- pré-visualizar;
- publicar;
- despublicar;
- visualizar Submissões autorizadas;
- gerenciar participantes internos do Formulário.

### Regra

Administrar um Formulário não concede automaticamente acesso irrestrito aos Pipes e Databases de toda a Organização.

---

## 10.2 Editor do Formulário

Pode:

- editar estrutura;
- criar seções;
- adicionar e reordenar campos;
- editar textos e propriedades autorizadas;
- pré-visualizar.

Não pode, por padrão:

- publicar;
- despublicar;
- configurar Destinos de Dados;
- visualizar todas as Submissões;
- alterar permissões.

### Regra

Editar o Formulário e publicar o Formulário podem ser capacidades diferentes.

---

## 10.3 Leitor de Submissões

Pode:

- visualizar Submissões autorizadas;
- visualizar arquivos recebidos quando permitido;
- consultar resultados relacionados dentro do seu escopo.

Não pode, por padrão:

- editar estrutura do Formulário;
- publicar;
- configurar Destinos de Dados;
- alterar Pipe ou Database de destino.

---

## 10.4 Participante Público

Pode:

- visualizar campos publicados;
- preencher;
- anexar arquivos autorizados;
- enviar.

Não pode:

- acessar configuração;
- acessar Submissões de terceiros;
- acessar Pipe;
- acessar Card criado;
- acessar Database;
- acessar Registro criado;
- escolher livremente qualquer destino interno.

---

## 10.5 Destinos de Dados

As capacidades devem poder ser separadas em:

- configurar criação de Registro;
- configurar atualização de Registro;
- configurar criação de Card;
- selecionar Database de destino;
- selecionar Pipe de destino;
- configurar relacionamento Card ↔ Registro.

### Regra

Configurar Destino de Dados exige autoridade sobre o Formulário e sobre os recursos de destino necessários.

### Regra

Um Editor de Formulário não recebe automaticamente poder para apontar dados para qualquer Database ou Pipe.

---

## 10.6 Publicação

As capacidades devem poder ser separadas em:

- pré-visualizar;
- publicar;
- despublicar;
- compartilhar link público.

### Regra

Publicar um Formulário não concede ao participante público qualquer autoridade sobre o processo interno.

---

## 10.7 Regras de segurança para Formulários

### PERM-FORM-001 — Publicar Formulário não publica o processo interno

**Regra:** disponibilizar um Formulário externo não concede acesso ao Pipe, Database ou informações internas relacionadas.

**Resultado obrigatório:** somente os campos e ações explicitamente expostos ficam disponíveis.

---

### PERM-FORM-002 — Envio não concede acesso ao item criado

**Regra:** enviar um Formulário não concede automaticamente acesso ao Card ou Registro resultante.

**Resultado obrigatório:** qualquer acesso posterior precisa ser concedido por regra própria.

---

### PERM-FORM-003 — Editar estrutura não implica publicar

**Regra:** a capacidade de editar campos e seções não concede automaticamente a capacidade de publicar ou despublicar.

**Resultado obrigatório:** preparação e disponibilização externa podem ser controladas separadamente.

---

### PERM-FORM-004 — Configurar destino exige acesso aos destinos

**Regra:** um usuário só pode configurar criação ou atualização em recursos de destino aos quais possui autoridade apropriada.

**Resultado obrigatório:** Formulários não funcionam como atalho para gravar em Pipes ou Databases protegidos.

---

### PERM-FORM-005 — Participante público não escolhe autoridade interna

**Regra:** um participante público só pode acionar os destinos previamente configurados por usuário autorizado.

**Resultado obrigatório:** o participante não pode usar o Formulário para escolher livremente recursos internos.

---

### PERM-FORM-006 — Visualizar Submissões é diferente de editar Formulário

**Regra:** acesso às respostas recebidas e autoridade sobre a estrutura do Formulário podem ser concedidos separadamente.

**Resultado obrigatório:** a equipe pode consultar entradas sem alterar o mecanismo de coleta.

---

### PERM-FORM-007 — Arquivos recebidos respeitam o destino autorizado

**Regra:** arquivos recebidos por Formulário só podem ser vinculados aos contextos previamente autorizados.

**Resultado obrigatório:** upload público não concede acesso ou escrita irrestrita em outros recursos.

---

# 11. Criação de Cards e Registros relacionados

As capacidades devem poder ser separadas em:

- criar Card no Pipe de destino;
- criar Registro no Database de destino;
- atualizar Registro;
- relacionar Card e Registro;
- criar Card relacionado a outro Card;
- visualizar o relacionamento;
- remover o relacionamento.

## Regra central

Criar em um recurso e relacionar recursos são autoridades diferentes.

---

### PERM-REL-001 — Criar Card relacionado exige autoridade no destino

**Regra:** um usuário só pode criar Card relacionado em um Pipe onde possua capacidade apropriada.

**Resultado obrigatório:** relacionamento não contorna permissão do Pipe de destino.

---

### PERM-REL-002 — Criar Registro relacionado exige autoridade no Database

**Regra:** um usuário só pode criar Registro relacionado em um Database onde possua capacidade apropriada.

**Resultado obrigatório:** relacionamento não contorna permissão do Database de destino.

---

### PERM-REL-003 — Relacionar não concede acesso automático

**Regra:** criar uma relação entre Card e Registro não concede automaticamente acesso ao recurso relacionado.

**Resultado obrigatório:** cada recurso preserva suas próprias regras de acesso.

---

### PERM-REL-004 — Formulário e Automação usam somente destinos aprovados

**Regra:** criação automática ou configurada de Cards e Registros só pode utilizar destinos previamente autorizados.

**Resultado obrigatório:** Formulários e Automações não ampliam autoridade de usuários ou participantes.

---

### PERM-REL-005 — Navegação respeita o acesso de cada lado

**Regra:** um usuário pode visualizar que existe uma relação sem necessariamente receber acesso ao conteúdo completo do recurso relacionado.

**Resultado obrigatório:** vínculo e conteúdo podem possuir níveis de visibilidade diferentes.

---

# 12. Histórico do Card

O Histórico deve possuir controle de acesso próprio dentro do contexto do Card.

As capacidades podem incluir:

- visualizar Histórico;
- visualizar detalhes de eventos;
- visualizar eventos de Automação;
- visualizar eventos de IA;
- visualizar eventos de ação externa.

## Regra

Acesso ao Card pode permitir visualizar o Histórico operacional básico.

Eventos que revelem dados de recursos protegidos devem continuar respeitando as permissões de origem.

---

### PERM-HIST-001 — Histórico respeita o acesso ao Card

**Regra:** um usuário não pode consultar o Histórico completo de um Card fora do seu escopo autorizado.

**Resultado obrigatório:** Histórico não contorna as regras do Card.

---

### PERM-HIST-002 — Histórico não revela dados ocultos por relacionamento

**Regra:** um evento histórico não pode expor conteúdo de um Registro, Arquivo, Integração ou outro recurso ao qual o usuário não possui acesso.

**Resultado obrigatório:** o evento pode indicar que algo aconteceu sem revelar dados protegidos.

---

### PERM-HIST-003 — Visualizar Histórico não concede editar passado

**Regra:** consultar atividades anteriores não concede autoridade para alterar ou apagar eventos históricos.

**Resultado obrigatório:** leitura e alteração de histórico permanecem separadas.

---

### PERM-HIST-004 — Detalhe de Log e evento operacional podem ter acessos diferentes

**Regra:** um usuário pode visualizar que uma Automação atuou no Card sem necessariamente acessar todo o Log detalhado da execução.

**Resultado obrigatório:** Histórico operacional e Log de Automação podem ter níveis de acesso diferentes.

---

# 13. Nível Automações

Automações devem possuir controle próprio.

## 13.1 Capacidades de Automação

Considere separar:

- criar Automação;
- editar nome;
- configurar gatilho;
- configurar condições;
- configurar ação;
- selecionar recursos de origem;
- selecionar recursos de destino;
- usar IA como ação;
- ativar;
- pausar;
- excluir;
- visualizar estado;
- visualizar execuções;
- visualizar Logs;
- visualizar resultados;
- administrar ações externas.

---

## 13.2 Gestor de Automação

Perfil padrão com autoridade ampla sobre Automações autorizadas.

Pode, conforme escopo:

- criar;
- editar;
- configurar gatilho;
- configurar condições;
- configurar ação;
- ativar;
- pausar;
- visualizar execuções;
- visualizar Logs;
- excluir quando permitido.

Não recebe automaticamente:

- autoridade sobre todos os Pipes;
- autoridade sobre todos os Databases;
- autoridade sobre todas as Integrações;
- autoridade para aprovar ações críticas;
- acesso a segredos.

---

## 13.3 Editor de Automação

Pode:

- editar estrutura autorizada;
- configurar gatilhos e condições permitidos;
- configurar ações dentro dos recursos autorizados;
- testar conceitualmente a configuração quando esse recurso existir.

Não pode, por padrão:

- ativar;
- desativar;
- excluir;
- configurar ações externas sensíveis;
- alterar Integrações.

---

## 13.4 Operador de Automação

Pode, conforme escopo:

- visualizar estado;
- ativar;
- pausar;
- consultar resultado.

Não pode, por padrão:

- alterar lógica;
- trocar destinos;
- adicionar ações;
- acessar detalhes técnicos restritos.

---

## 13.5 Leitor de Logs

Pode:

- visualizar execuções autorizadas;
- consultar resultado;
- consultar contexto permitido.

Não pode:

- alterar Automação;
- ativar;
- pausar;
- reconfigurar ação;
- acessar segredos.

---

## 13.6 Regras de segurança para Automações

### PERM-AUT-001 — Criar Automação não implica ativar

**Regra:** a capacidade de criar ou editar uma Automação não concede automaticamente a capacidade de ativá-la.

**Resultado obrigatório:** preparação e entrada em operação podem ser controladas separadamente.

---

### PERM-AUT-002 — Ativar não implica editar

**Regra:** a capacidade de ativar ou pausar uma Automação não concede automaticamente autoridade para alterar sua lógica.

**Resultado obrigatório:** operação e configuração podem ser separadas.

---

### PERM-AUT-003 — Automação só pode usar recursos autorizados

**Regra:** gatilhos, condições e ações devem operar apenas sobre recursos e escopos previamente autorizados.

**Resultado obrigatório:** Automação não contorna permissões de Pipe, Database, Formulário, IA ou Integração.

---

### PERM-AUT-004 — Ação de destino exige autoridade apropriada

**Regra:** configurar uma ação que cria, atualiza, move, relaciona ou envia algo exige autoridade adequada sobre os recursos envolvidos.

**Resultado obrigatório:** a Automação não amplia a autoridade do configurador.

---

### PERM-AUT-005 — Condições não podem vazar dados protegidos

**Regra:** avaliar uma condição não concede ao usuário acesso visual a dados que ele não poderia consultar diretamente.

**Resultado obrigatório:** uso interno de um dado em condição não transforma esse dado em informação visível.

---

### PERM-AUT-006 — Logs possuem acesso separado

**Regra:** visualizar a existência de uma execução e visualizar o Log detalhado podem exigir capacidades diferentes.

**Resultado obrigatório:** detalhes sensíveis não são expostos apenas porque o usuário viu o resultado operacional.

---

### PERM-AUT-007 — Logs não expõem segredos

**Regra:** acesso a Logs de Automação não concede acesso a senhas, tokens, chaves ou outros segredos.

**Resultado obrigatório:** rastreabilidade não compromete segurança.

---

### PERM-AUT-008 — Resultado operacional e detalhe técnico podem ter acessos diferentes

**Regra:** um usuário pode visualizar se uma Automação foi concluída, não concluída ou precisa de atenção sem necessariamente acessar detalhes técnicos internos.

**Resultado obrigatório:** operação e diagnóstico técnico podem ser separados.

---

### PERM-AUT-009 — Pausar Automação não concede acesso ao histórico inteiro

**Regra:** operar o estado atual de uma Automação não concede automaticamente acesso a todas as execuções históricas.

**Resultado obrigatório:** gestão operacional e consulta histórica podem ser separadas.

---

### PERM-AUT-010 — Automação possui escopo explícito

**Regra:** a autoridade de execução de uma Automação deve ser explicitamente limitada ao contexto aprovado.

**Resultado obrigatório:** a Automação não depende de autoridade irrestrita nem de privilégios implícitos.

---

# 14. IA dentro de Automações

As capacidades devem poder ser separadas em:

- configurar ação de IA;
- permitir uso de determinado contexto;
- visualizar sugestão;
- editar sugestão;
- aprovar sugestão;
- executar ação externa resultante.

---

### PERM-IA-001 — IA herda os limites de contexto

**Regra:** a IA só pode usar informações que o usuário, a Automação e a operação estão autorizados a acessar.

**Resultado obrigatório:** a IA não amplia o alcance dos dados.

---

### PERM-IA-002 — Sugestão não concede autoridade de execução

**Regra:** gerar uma sugestão não concede automaticamente permissão para executar a ação sugerida.

**Resultado obrigatório:** a execução depende da permissão da ação e da revisão humana prevista.

---

### PERM-IA-003 — Aprovação e execução podem ser capacidades diferentes

**Regra:** visualizar, editar, aprovar e executar uma ação externa podem exigir capacidades diferentes.

**Resultado obrigatório:** o produto pode separar análise, aprovação e execução.

---

### PERM-IA-004 — Configurar IA em Automação exige autoridade de IA

**Regra:** configurar IA como ação de uma Automação exige capacidade explícita para usar IA naquele contexto.

**Resultado obrigatório:** qualquer Editor de Automação não recebe automaticamente acesso à IA.

---

### PERM-IA-005 — Automação não amplia o acesso da IA

**Regra:** usar IA dentro de uma Automação não concede acesso adicional a dados.

**Resultado obrigatório:** a IA permanece dentro do contexto autorizado.

---

### PERM-IA-006 — Aprovar sugestão não implica configurar Automação

**Regra:** um usuário pode ser autorizado a revisar ou aprovar uma sugestão sem receber autoridade para editar a Automação que a originou.

**Resultado obrigatório:** operação diária e administração da Automação permanecem separadas.

---

# 15. Recursos protegidos obrigatórios

A Skill deve avaliar permissões, quando aplicável, para:

- Organização;
- usuários e equipes;
- Pipe;
- Fase;
- configuração da Fase;
- Tarefa;
- execução da Tarefa;
- Card;
- Histórico do Card;
- Database;
- Registro;
- relacionamento;
- Formulário;
- estrutura do Formulário;
- Submissão;
- Destino de Dados;
- Arquivo;
- comentário;
- Automação;
- Execução de Automação;
- Log de Automação;
- resultado de Automação;
- Dashboard;
- IA;
- Integração;
- ação externa.

Não crie permissões desnecessárias.

Crie apenas capacidades que representem ações reais do produto.

---

# 16. Ações universais

Considere, quando aplicável:

- visualizar;
- criar;
- editar;
- comentar;
- mover;
- concluir;
- reabrir;
- atribuir;
- remover atribuição;
- arquivar;
- excluir;
- compartilhar;
- relacionar;
- remover relacionamento;
- publicar;
- despublicar;
- aprovar;
- configurar;
- ativar;
- pausar;
- gerenciar participantes;
- executar ação externa;
- visualizar Histórico;
- visualizar Log;
- visualizar resultado.

Não presuma que toda ação se aplica a todo recurso.

---

# 17. Regras globais de segurança

### PERM-GER-001 — Isolamento entre Organizações

**Regra:** um usuário não pode acessar dados de outra Organização sem autorização explícita válida.

**Resultado obrigatório:** os dados de Organizações diferentes permanecem isolados.

---

### PERM-GER-002 — Acesso não é herdado por relacionamento

**Regra:** relacionar dois recursos não pode conceder automaticamente acesso ao recurso que o usuário não poderia consultar diretamente.

**Resultado obrigatório:** relacionamentos preservam as regras de acesso de cada recurso.

---

### PERM-GER-003 — O acesso efetivo não pode exceder o nível superior

**Regra:** uma permissão de recurso ou contexto não pode conceder autoridade acima do limite da Organização.

**Resultado obrigatório:** níveis inferiores restringem ou especializam o acesso, mas não elevam autoridade global.

---

### PERM-GER-004 — Ausência de permissão não significa permissão implícita

**Regra:** uma ação protegida só pode ser executada quando o acesso necessário estiver concedido.

**Resultado obrigatório:** o sistema não presume autorização apenas porque não existe uma negação explícita.

---

### PERM-GER-005 — Mudanças de permissão devem ser rastreáveis

**Regra:** alterações relevantes de acesso devem permanecer consultáveis.

**Resultado obrigatório:** deve ser possível identificar quem alterou uma permissão relevante e qual mudança foi realizada.

---

### PERM-GER-006 — Visibilidade na interface não substitui permissão

**Regra:** esconder, desabilitar ou exibir um botão não define sozinho a autoridade do usuário.

**Resultado obrigatório:** a permissão deve continuar válida independentemente da forma visual usada para apresentar a ação.

---

# 18. Regras de Arquivos

### PERM-ARQ-001 — Arquivo respeita o contexto autorizado

**Regra:** um usuário só pode acessar um Arquivo quando possuir acesso válido ao Arquivo e ao contexto exigido.

**Resultado obrigatório:** Arquivos não ficam disponíveis apenas por conhecimento de nome, link ou relação indireta.

---

### PERM-ARQ-002 — Acesso ao recurso não implica acesso irrestrito a todo Arquivo

**Regra:** Arquivos classificados ou restritos podem exigir autorização adicional.

**Resultado obrigatório:** acessar um Card ou Registro não precisa conceder automaticamente acesso a todo Arquivo relacionado.

---

### PERM-ARQ-003 — Upload público não concede acesso posterior

**Regra:** enviar um Arquivo por Formulário público não concede ao participante acesso posterior ao Arquivo armazenado.

**Resultado obrigatório:** envio e consulta permanecem separados.

---

# 19. Regras de Dashboard

### PERM-DASH-001 — Dashboard respeita os dados de origem

**Regra:** um usuário só pode visualizar indicadores derivados de dados dentro do seu escopo autorizado.

**Resultado obrigatório:** o Dashboard não revela, direta ou indiretamente, informações de recursos ocultos.

---

### PERM-DASH-002 — Agregação não elimina restrições de acesso

**Regra:** transformar dados em contagem, gráfico ou indicador não torna esses dados automaticamente visíveis.

**Resultado obrigatório:** indicadores permanecem sujeitos às regras de acesso da informação de origem.

---

### PERM-DASH-003 — Problemas de Automação respeitam o escopo

**Regra:** um usuário só pode visualizar alertas ou itens de atenção relacionados a Automações dentro do seu escopo autorizado.

**Resultado obrigatório:** Dashboard não revela Automações ou recursos ocultos.

---

# 20. Regras de API e Integrações

### PERM-API-001 — Integração possui autoridade explícita

**Regra:** uma Integração só pode executar ações e acessar recursos expressamente autorizados.

**Resultado obrigatório:** conectar um sistema externo não concede acesso irrestrito à Organização.

---

### PERM-API-002 — Integração não pode elevar a autoridade do usuário

**Regra:** uma ação externa iniciada por usuário não pode ultrapassar a autoridade permitida ao contexto da operação.

**Resultado obrigatório:** a Integração não funciona como atalho para contornar permissões.

---

### PERM-API-003 — Configurar Integração é diferente de usar Integração

**Regra:** administrar credenciais ou configurações pode exigir autoridade diferente de executar uma ação já autorizada.

**Resultado obrigatório:** uso operacional e administração da Integração podem ser separados.

---

### PERM-API-004 — Automação não amplia autoridade da Integração

**Regra:** acionar uma Integração por Automação não concede acesso adicional ao canal, conta ou recurso externo.

**Resultado obrigatório:** a ação permanece limitada ao contexto autorizado.

---

# 21. Fronteira com Referências Visuais

As referências aprovadas para:

- Form Builder;
- Visualização do Card;
- Automações;

ajudam a identificar quais ações precisam ser compreensíveis e acessíveis.

Elas não definem autoridade.

### Regra

A Skill de Permissões pode exigir que ações não autorizadas não sejam apresentadas como disponíveis.

Ela não deve decidir:

- posição do botão;
- número de colunas;
- cor;
- largura de painel;
- componente visual;
- disposição do Histórico.

### Exemplo correto

**“Usuário sem permissão de publicar não pode publicar o Formulário.”**

### Exemplo incorreto

**“O botão Publicar deve ficar no canto superior direito.”**

### Regra

As referências visuais podem mostrar:

- Form Builder em três áreas;
- Histórico do Card à esquerda;
- Automação com blocos Quando → Condições → Então.

Isso não altera as permissões.

---

# 22. Regra sobre cobrança e licença

Não transforme política comercial em permissão.

Exemplos que não pertencem a esta Skill:

- convidado é gratuito;
- membro ocupa licença paga;
- determinado perfil não gera cobrança.

Essas decisões pertencem a:

- modelo comercial;
- billing;
- planos;
- regras de assinatura.

A Skill de Permissões define:

**o que o perfil pode fazer.**

Ela não define:

**quanto custa esse perfil.**

---

# 23. Regras de qualidade

Antes de aprovar qualquer permissão, verifique:

1. está claro quem recebe a permissão?
2. está clara a ação?
3. está claro o recurso?
4. está claro o escopo?
5. a condição está explícita quando necessária?
6. a permissão pode ser testada?
7. evita cargo específico de uma agência?
8. evita conceder acesso indireto?
9. respeita o isolamento entre Organizações?
10. respeita Formulário, Database e Pipe como recursos separados?
11. diferencia editar Formulário de publicar?
12. diferencia editar Formulário de configurar Destino de Dados?
13. diferencia configurar Fase de executar tarefa?
14. diferencia configurar responsável padrão de alterar responsável do Card?
15. diferencia criar Card ou Registro de relacioná-los?
16. Histórico respeita acesso ao Card e aos recursos relacionados?
17. diferencia criar Automação de ativar?
18. diferencia ativar Automação de editar?
19. Logs possuem acesso separado?
20. Automação não contorna permissões?
21. IA não amplia acesso?
22. aprovação de IA e execução podem ser separadas?
23. protege Arquivos?
24. protege Dashboard?
25. protege Integrações?
26. evita misturar permissão com cobrança ou preço?
27. evita transformar referência visual em regra de acesso?
28. evita decidir implementação técnica?

Se qualquer resposta for “não”, revise.

---

# 24. Formato obrigatório de saída

SEMPRE gere a saída com estes títulos, nesta ordem:

```text
# Permissões — [produto ou módulo]

## 1. Escopo
[O que o modelo cobre.]

## 2. Fontes consultadas
[Visão, MVP, Regras de Negócio e decisões usadas.]

## 3. Princípios protegidos
[Princípios de acesso que não podem ser quebrados.]

## 4. Sujeitos
[Quem pode receber permissões.]

## 5. Recursos protegidos
[Onde as permissões se aplicam.]

## 6. Ações
[O que pode ser feito.]

## 7. Níveis de Organização
[Perfis e limites.]

## 8. Níveis por Recurso
[Pipe, Database, Formulário, Automação e outros recursos.]

## 9. Condições de Visibilidade
[Próprio, atribuído, equipe, relacionado ou outras.]

## 10. Matriz de Permissões
[Quem pode fazer o quê em cada recurso.]

## 11. Regras Especiais
[Fases, Tarefas, Histórico, Formulários, Automações, IA, Dashboard, API e Arquivos.]

## 12. Conflitos e Decisões Pendentes
[Somente conflitos reais.]

## 13. Fora deste Documento
[Implementação técnica, billing, layout e temas deliberadamente adiados.]
```

Não gere código.

Não escolha tecnologia.

Não defina:

- RBAC;
- ABAC;
- RLS;
- JWT;
- OAuth;
- middleware;
- tabelas;
- policies;
- endpoints;
- layout.

Essas são decisões de implementação, arquitetura ou UX.

---

# 25. Validação final obrigatória

Antes de considerar o modelo aprovado, responda:

1. dados de Organizações diferentes permanecem isolados?
2. ser Membro não concede acesso automático a todos os recursos?
3. Pipe possui controle próprio?
4. Database possui controle próprio?
5. Formulário possui controle próprio?
6. Automação possui controle próprio?
7. editar Formulário é diferente de publicar?
8. editar Formulário é diferente de configurar Destino de Dados?
9. participante público não acessa Card ou Registro criado?
10. Formulário só aciona destinos previamente autorizados?
11. cada Fase pode ter tarefas e responsáveis sem conceder configuração a quem apenas opera Cards?
12. executar tarefa não permite alterar a configuração da Fase?
13. alterar responsável do Card é diferente de configurar responsável padrão da Fase?
14. criar Card relacionado exige acesso ao Pipe de destino?
15. criar Registro relacionado exige acesso ao Database de destino?
16. relacionamentos não concedem acesso indevido?
17. Histórico respeita o acesso ao Card?
18. Histórico não revela dados ocultos?
19. visualizar Histórico não permite editar o passado?
20. criar Automação é diferente de ativar?
21. ativar Automação é diferente de editar?
22. Automação só usa recursos autorizados?
23. Logs possuem acesso separado?
24. Logs não expõem segredos?
25. resultado operacional pode ser visto sem expor detalhe técnico?
26. IA dentro de Automação não amplia acesso?
27. visualizar, aprovar e executar ação de IA podem ser separados?
28. Dashboard não revela dados ocultos?
29. Integração possui autoridade explícita?
30. Integração e Automação não contornam permissões?
31. existe pelo menos um Super Admin ativo?
32. níveis são perfis padrão e não cargos fixos de agência?
33. política de cobrança ficou fora da definição de permissões?
34. referências visuais não foram transformadas em regras de layout?
35. alguma decisão invadiu implementação técnica?
36. existe conflito documental não resolvido?

Se qualquer resposta indicar falha, conflito ou ambiguidade, revise antes de aprovar.

---

# 26. Princípio final

Sempre prefira:

**capacidades universais + perfis padrão + escopos explícitos + separação entre configurar e executar**

em vez de:

**cargos fixos e permissões espalhadas pelo sistema.**

A pergunta final é:

**“Este modelo permite que uma agência organize sua equipe, seus serviços e suas automações sem obrigar todas as empresas a trabalhar da mesma forma?”**

Se a resposta for sim, o modelo está preservando a flexibilidade do Giraffe CRM.

Para as novas capacidades, aplique também estas perguntas:

**“Quem pode configurar a estrutura e quem apenas executa o trabalho?”**

**“Quem pode editar um Formulário e quem pode publicá-lo?”**

**“Quem pode escolher o destino dos dados?”**

**“Quem pode criar a Automação e quem pode colocá-la em operação?”**

**“Quem pode ver que uma Automação falhou e quem pode ver o detalhe do Log?”**

**“A IA está usando apenas o contexto autorizado?”**
