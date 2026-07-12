---
title: "PRD: Giraffe CRM — Fase 1"
status: final
created: 2026-07-11
updated: 2026-07-11
---

# PRD: Giraffe CRM — Fase 1

## 0. Propósito do Documento

Este PRD é a fonte oficial de requisitos do Giraffe CRM — Fase 1 para as etapas seguintes do processo BMAD (UX, Arquitetura, Épicos e Stories). Baseia-se no Product Brief aprovado (`docs/02-bmad/01-product-brief.md`) e na documentação oficial da Fase 1 (`docs/01-documentacao-base/`), sem ampliar o escopo macro aprovado nesses documentos. As funcionalidades estão agrupadas por módulo, com Requisitos Funcionais (FRs) numerados globalmente. Lacunas não sustentadas pelos documentos-fonte aparecem como `PENDENTE DE DECISÃO` em Questões em Aberto — nunca como suposição silenciosa.

## 1. Visão

O Giraffe CRM é uma plataforma de CRM operacional **low-code/no-code**: em vez de forçar a organização a adaptar seus processos ao molde rígido de um CRM tradicional, permite configurar Pipes (processos em Kanban), Databases (bases de registros), Formulários, automações básicas e apoio de IA de acordo com o jeito de trabalhar de cada organização.

A Fase 1 entrega o núcleo operacional interno — login, dashboard, Pipes/Kanban, Cards, Formulários, Database, Automações básicas, E-mails, IA básica assistiva, Tarefas e Solicitações, Notificações, Relatórios, Perfil e Painel Administrativo da Organização — com o Super Admin da Plataforma documentado como referência separada da Organização. Integrações externas (API, Webhooks, MCP, GraphQL pública) permanecem deliberadamente fora da Fase 1, como fronteira explícita da Fase 2.

O produto importa porque resolve um atrito real: equipes operacionais perdem contexto quando processos, dados, tarefas e comunicação ficam espalhados em ferramentas diferentes, e CRMs tradicionais agravam isso ao impor um modelo fixo. O foco inicial de mercado é agências de marketing — segmento em que múltiplos processos operacionais, dados, tarefas e comunicações precisam ser organizados de forma flexível.

## 2. Usuário-Alvo

### 2.1 Jobs To Be Done

- **Administrador da Organização**: garantir que a operação da própria organização esteja configurada, visível e sob controle — sem depender de terceiros e sem acessar funções que pertencem à Plataforma.
- **Membro**: executar o trabalho diário com clareza sobre o que fazer agora, sem perder contexto entre processos, dados e comunicação que hoje ficam dispersos em ferramentas diferentes.
- **Convidado**: acompanhar o que lhe é relevante com acesso limitado e seguro. Escopo definido em R1 (Modelo de Permissões Efetivas): sem acesso operacional org-wide por padrão; apenas recursos concedidos explicitamente.
- **Super Admin**: administrar a Plataforma como um todo (organizações, contas), sem interferir na operação interna de nenhuma organização específica.

### 2.2 Público Não Priorizado na Fase 1

- Segmentos de mercado além de agências de marketing — expansão é `PENDENTE DE DECISÃO`, não escopo confirmado da Fase 1.

**Atores externos não autenticados:** clientes, leads e contatos da organização são representados como Registros/dados dentro do Giraffe CRM, mas não autenticam nem acessam o produto diretamente.

### 2.3 Jornadas-Chave do Usuário

> **UJ-1. Administrador da Organização acessa o Giraffe CRM e vê o que precisa de atenção agora.**
> Persona + contexto: Administrador da Organização, responsável por acompanhar a operação da própria organização. **Estado de entrada:** não autenticado, abre o produto pela tela de login. **Caminho:** informa credenciais e autentica-se → chega ao Dashboard → vê identidade do usuário, organização atual, grade de Pipes e Databases, e notificações com badge de não lidas. **Clímax:** em um único painel, vê o que está em andamento e o que precisa de atenção. **Resolução:** contexto (usuário + organização) estabelecido para os fluxos seguintes. **Edge case:** falha de login (credenciais inválidas) é tratada com retorno claro ao usuário.

> **UJ-2. Membro move um Card entre Fases de um Pipe.**
> Persona + contexto: Membro, responsável por operar o trabalho do dia a dia. **Estado de entrada:** autenticado, no Dashboard. **Caminho:** abre um Pipe → vê o Kanban com fases → abre um Card → vê seus dados, fase atual e formulário da fase → move o card para a fase seguinte. **Clímax:** o card passa a pertencer à nova fase. **Resolução:** a movimentação é persistida e uma entrada é registrada no histórico do card; quando aplicável, pode disparar automação e/ou notificação. **Edge case:** a máquina de estados do Card e as regras de movimentação/transição entre Fases foram resolvidas em R2 (D2.3/D2.4/D2.7); o gatilho de Automação/Notificação por movimentação é opt-in (R2/D2.5), com distribuição resolvida em R6/D6.3. O detalhamento passo a passo da jornada fica para a etapa de UX.

Database, Automações básicas, E-mails e IA básica ainda não têm arquivo de fluxo em `07-fluxos-principais/` (marcados `[PENDENTE]` no índice). Isso não os exclui de Requisitos Funcionais — eles serão especificados na Seção 4 (Funcionalidades). O que fica para a etapa de UX é o detalhamento passo a passo da jornada (Key User Journey) desses módulos, quando o fluxo estiver documentado ou desenhado.

## 3. Glossário

- **Plataforma** — o Giraffe CRM acima das organizações; escopo do Super Admin.
- **Organização** — empresa/cliente que usa o CRM; limite de todo o trabalho operacional (Pipes, Databases, Cards, Usuários). Ex.: Giraffe Marketing.
- **Usuário** — pessoa com acesso ao Giraffe; possui um Papel de Plataforma e um Papel de Organização, dois eixos distintos.
- **Papel de Plataforma** — nível do usuário na Plataforma. Valor oficial: Super Admin.
- **Papel de Organização** — nível do usuário na Organização atual. Valores oficiais: Administrador da Organização, Membro, Convidado.
- **Administrador da Organização** — administra somente a própria Organização; não é Super Admin.
- **Membro** — usuário operacional dentro dos contextos permitidos da Organização.
- **Convidado** — acesso limitado dentro da Organização; escopo definido em R1 (só recursos concedidos explicitamente; sem acesso operacional org-wide).
- **Super Admin** — papel de Plataforma; administra a Plataforma, não a Organização. Área dedicada ainda `NÃO INTEGRADA AO PROTÓTIPO UNIFICADO`.
- **Pipe** — processo de trabalho em formato Kanban, composto por Fases. Pertence a uma Organização.
- **Fase** — etapa (coluna) de um Pipe. Pertence a exatamente um Pipe.
- **Card** — item de trabalho que pertence a um Pipe e está em uma Fase, com criador e Status.
- **Status do Card** — situação do Card (`ok`, `atrasado`, `expirado`, `vencido`, `finalizado`, `arquivado`). Distinto de Fase.
- **Database** — base de registros estruturados, separada de Pipe.
- **Registro** — entrada/linha de um Database. Distinto de Card.
- **Conexão Card ↔ Registro** — vínculo entre um Card e um Registro; N—N (R3/D3.6); mecanismo de referência = Arquitetura.
- **Formulário** — conjunto de campos configuráveis, em um de três contextos independentes: inicial do Pipe, de Fase, ou de Database.
- **Campo** — unidade de captura de um Formulário, com um tipo do catálogo visual comum.
- **Automação** — regra Evento → (Condição) → Ação, ligada a um Pipe; ações internas apenas (sem requisição HTTP externa na Fase 1).
- **Notificação** — aviso sobre um evento de um Card (`alarm`, `done`, `move` são tipos ilustrativos; catálogo oficial em R6/D6.3), com estado lido/não lido.
- **Tarefa** — trabalho com prazo ligado a um Pipe, com status `aberta`/`atrasada`/`concluída`.
- **Solicitação** — pedido em acompanhamento ligado a um Pipe, com status `aberta`/`resolvida`.
- **Template de E-mail** — mensagem reutilizável, usável em ação de Automação.
- **IA básica** — recursos de IA assistiva da Fase 1 (apoio revisável pelo usuário); sem agentes autônomos avançados.
- **Painel Administrativo da Organização** — área que configura a Organização (membros, estatísticas, auditoria, financeiro); distinta do Super Admin.
- **Log / Auditoria** — registro de eventos de nível Organização/Plataforma; distinto do Histórico do Card (nível item).
- **Busca global** — busca única sobre Pipes, Databases, Cards, Usuários e Notificações, respeitando a Organização atual.

## 4. Funcionalidades

### 4.1 Login e Sessão

**Descrição:** Ponto de entrada do Giraffe CRM. Autenticação real (não apenas fluxo visual) é capacidade de produto decidida pelo stakeholder para a Fase 1 — a tecnologia específica de implementação é decisão de Arquitetura/Direcionamentos Técnicos, não deste PRD. Realiza UJ-1.

**Requisitos Funcionais:**

#### FR-1: Autenticação de usuário

Usuário pode autenticar-se com credenciais para acessar o Giraffe CRM.

**Consequências (testáveis):**
- Credenciais inválidas são rejeitadas com mensagem clara, sem revelar se o e-mail/usuário existe.
- Autenticação bem-sucedida encaminha ao Dashboard operacional (RN-011).
- Logout encerra a sessão e retorna à tela de login (RN-012).

**Fora de escopo:** tecnologia/mecanismo técnico de autenticação — Arquitetura/Direcionamentos Técnicos.

#### FR-2: Sessão do usuário

**Decisões de Produto/Segurança** (o que deve acontecer):
- O sistema deve oferecer ao usuário autenticado uma sessão que persiste entre ações.
- Logout deve encerrar/invalidar a sessão corrente de forma imediata (RN-012).
- Após logout, ações que exigem autenticação voltam a solicitar login.

**Consequências (testáveis):**
- Logout invalida a sessão corrente (RN-012).
- Após logout, ações que exigem autenticação voltam a solicitar login.

**Decisões técnicas (Arquitetura)** (como implementar): duração de expiração por inatividade, mecanismo de renovação e formato de sessão/token — `PENDENTE DE DECISÃO`.

#### FR-3: Recuperação de senha

Usuário recupera o acesso à própria conta quando esquece a senha.

**Resolvido (R6/D6.1) → ver Modelo de Conta, Comunicação, Indicadores e IA:** recuperação por e-mail com resposta neutra, link de uso único/expirável, revogação de todas as sessões da Account, política única de senha e escopo global da Account (não altera Memberships). Token/rate limit/hashing/anti-abuso = Segurança/Arquitetura.

*Requisitos de segurança aplicáveis (senhas nunca em texto puro, limitação contra força bruta) estão centralizados nas NFRs Transversais, com rastreabilidade a FR-1/FR-2.*

### 4.2 Dashboard Operacional

**Descrição:** Painel inicial após o login. Realiza UJ-1.

**Requisitos Funcionais:**

#### FR-4: Visão inicial da operação

Usuário autenticado visualiza, no Dashboard, uma grade dos Pipes e Databases da sua Organização atual, com indicadores derivados de dados reais.

**Consequências (testáveis):**
- A grade reflete o catálogo real de Pipes e Databases da Organização atual — nenhuma contagem inventada (RN-131).
- Todo indicador exibido deriva de dados reais da Organização atual — nenhum valor fixo ou decorativo (RN-131).

**Resolvido (R6/D6.4) → ver Modelo de Conta, Comunicação, Indicadores e IA:** catálogo enxuto de indicadores, ordenação por relevância operacional (severidade canônica → prazo), distinção "Meus itens" × escopo autorizado; não recria "Estatísticas".

#### FR-5: Badge de notificações no Dashboard

Usuário visualiza, no Dashboard, a contagem de Notificações não lidas e pode marcá-las como lidas.

**Consequências (testáveis):**
- O badge exibe a contagem real de não lidas (RN-081).
- "Marcar todas como lidas" zera o badge e persiste entre páginas (RN-082).

### 4.3 Busca Global

**Descrição:** Busca única a partir do Dashboard/topbar, sobre o conjunto de entidades confirmado na documentação-fonte.

**Requisitos Funcionais:**

#### FR-6: Busca sobre entidades da Organização atual

Usuário busca e recebe resultados de Pipes, Databases, Cards, Usuários e Notificações — os cinco tipos confirmados em `glossario-fase-1.md` e RN-140.

**Consequências (testáveis):**
- Resultados cobrem exatamente os cinco tipos confirmados (RN-140); nenhum outro tipo é adicionado sem decisão de produto.
- Resultados ficam restritos à Organização atual (RN-141) — requisito transversal de isolamento por Organização (NFR-3).
- Resultados respeitam as permissões efetivas do usuário (ex.: um Convidado não deve receber resultados de módulos aos quais não tem acesso) — requisito transversal de autorização (NFR-4); o conjunto exato de permissões por módulo é `PENDENTE DE DECISÃO` (`04-permissoes/`).

**Fora de escopo:** comportamento da busca com múltiplas Organizações simultâneas — `NÃO CONFIRMADO`/`PENDENTE DE DECISÃO` (RN-141); buscas locais decorativas em telas específicas devem ser marcadas como demonstrativas ou implementadas — `PENDENTE DE DECISÃO` (RN-142).

> **Nota:** os NFRs transversais (NFR-1..NFR-42) foram consolidados em seção própria — ver **NFRs Transversais (consolidado)**, ao final da Seção 4, antes dos clusters de Constraints/Governança. As citações inline `NFR-N` ao longo desta seção resolvem para lá.

### 4.4 Pipes / Kanban

**Descrição:** Pipe organiza um processo de trabalho em formato Kanban, composto por Fases. Pipe ≠ Database (distinção estrutural, RN-023/RN-200). Realiza parte de UJ-2.

**Requisitos Funcionais:**

#### FR-7: Catálogo de Pipes

Usuário visualiza o catálogo de Pipes da sua Organização atual em qualquer tela onde Pipes aparecem (Dashboard, dentro do Pipe, Relatórios, Busca, Perfil).

**Consequências (testáveis):**
- O mesmo catálogo de Pipes é consistente em todas as telas onde aparece — nenhuma tela exibe um Pipe que não exista no catálogo da Organização (RN-024).
- Pipe pode estar bloqueado (`locked`) e/ou favoritado (`starred`); estes são atributos do Pipe, não permissões de usuário (`04-permissoes/` §15).
- Visualização do catálogo respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).

**Resolvido (R1/D1.4 e R2/D2.1) → ver Modelo de Permissões Efetivas e Modelo de Ciclo de Vida e Estados:** papéis de acesso por Pipe (Admin do Pipe, Membro do Pipe, Somente leitura; "Visão restrita" e "Apenas formulário inicial" são modos condicionais) e ciclo de vida do Pipe (Administrador da Organização cria/renomeia/arquiva/restaura; sem exclusão definitiva, duplicação ou reordenação global).

#### FR-8: Pipe é composto por Fases

Cada Pipe é composto por uma ou mais Fases; cada Fase pertence a exatamente um Pipe.

**Consequências (testáveis):**
- Não há Fase compartilhada entre Pipes (RN-030).

**Resolvido (R2/D2.2) → ver Modelo de Ciclo de Vida e Estados:** gerenciamento de Fases (Admin do Pipe/Administrador da Organização criam/renomeiam/reordenam/arquivam/restauram; sem exclusão definitiva; Pipe mantém ≥1 Fase ativa; nenhuma Fase migra entre Pipes — RN-030).

### 4.5 Cards

**Descrição:** Card é o item de trabalho que percorre as Fases de um Pipe, com criador, status e histórico. Card ≠ Registro (RN-062/RN-200). Realiza UJ-2.

**Requisitos Funcionais:**

#### FR-9: Card pertence a um Pipe e está em uma Fase

Todo Card pertence a exatamente um Pipe e está em exatamente uma Fase por vez.

**Consequências (testáveis):**
- Card não aparece fora do contexto do seu Pipe (RN-046).
- A associação Card–Fase permanece íntegra e consistente (NFR-5).
- Visualização do Card respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).

**Fora de escopo:** mecanismo de referência entre Card e Fase (identificador estável vs. nome-texto) — Arquitetura/modelagem de dados.

#### FR-10: Status do Card

Card possui um status dentre: `ok`, `atrasado`, `expirado`, `vencido`, `finalizado`, `arquivado`. Status é distinto da Fase (RN-043/RN-200: Fase ≠ Status do Card).

**Resolvido (R2/D2.3 e D2.7) → ver Modelo de Ciclo de Vida e Estados:** máquina de estados (eixos de ciclo de vida e saúde temporal, precedência, marcos por Fase com override por Card condicional a OQ-9/R3). Cálculo/agendamento da passagem de marco = Arquitetura.

#### FR-11: Movimentação do Card entre Fases

Usuário move um Card para outra Fase do mesmo Pipe. Realiza UJ-2.

**Consequências (testáveis):**
- A movimentação atualiza e **persiste** a nova Fase atual do Card.
- A movimentação gera uma entrada no Histórico do Card (FR-12).
- Movimentação respeita a Organização atual (NFR-3) e as permissões efetivas do usuário para mover o Card (NFR-4).

**Resolvido (R2/D2.4 e D2.5) → ver Modelo de Ciclo de Vida e Estados:** quem move e o conjunto mínimo de regras de transição; toda movimentação bem-sucedida gera evento canônico e pode disparar Automação/Notificação por configuração (opt-in), sem contornar confirmação humana. Motor = OQ-24/25/R4; distribuição de Notificações = OQ-33/R6.

#### FR-12: Histórico do Card

Card mantém um histórico cronológico dos eventos relevantes do próprio item.

**Consequências (testáveis):**
- Confirmados como eventos do histórico: criação do Card e mudança de Fase (associado ao FR-11).
- Histórico do Card é distinto do Log/Auditoria administrativo — histórico é por item, Log é por Organização/Plataforma (RN-170).

**Resolvido em parte (R2/D2.6) → ver Modelo de Ciclo de Vida e Estados:** catálogo funcional de eventos (núcleo + condicionais) e campos conceituais (tipo/resumo/ator/origem/data-hora/antes-depois/referência, com máscara de dados sensíveis e respeito à autorização). Estrutura física, versionamento e armazenamento = Arquitetura; falhas técnicas e observabilidade = trilha técnica; retenção, anonimização e exclusão legal = Governança/LGPD + Arquitetura.

#### FR-13: Conexão Card ↔ Registro

Card pode se conectar a um Registro de um Database, sem fundir os dois conceitos (RN-073).

**Resolvido (R3/D3.6) → ver Modelo de Formulários, Campos, Databases e Registros:** conexão Card↔Registro é N—N, vínculo explícito (RN-073), com autorização dupla; mecanismo de referência = Arquitetura.

**Notas:** Card pode agregar Tarefas e E-mails no seu contexto — requisitos detalhados nas seções de Tarefas e Solicitações e de E-mails (numeração final na consolidação); vínculo direto Tarefa↔Card e E-mail↔Card resolvido em R3/D3.6 (opcional, 0..1); mecanismo de referência = Arquitetura.

### 4.6 Formulários

**Descrição:** Formulário é um conjunto de campos configuráveis, em um de três contextos independentes: inicial do Pipe, de Fase, de Database. Os três contextos compartilham o mesmo catálogo visual de tipos de campo, mas devem manter estado de configuração independente (RN-053/RN-054).

**Requisitos Funcionais:**

#### FR-14: Três contextos independentes de Formulário

Sistema oferece três contextos de Formulário — inicial do Pipe, de Fase, de Database — cada um com configuração de campos própria.

**Consequências (testáveis):**
- Os três contextos compartilham o mesmo catálogo visual de tipos de campo (RN-053, confirmado).
- **Invariante INV-FORM-01:** alterar o Formulário de um contexto não deve alterar os demais — requisito de produto (RN-050, RN-051, RN-052, RN-054). A documentação-fonte marca a validação comportamental efetiva desse isolamento como `NÃO CONFIRMADO` ("regra declarada, comportamento não validado" — RN-054); confirmar que a implementação cumpre essa invariante é tarefa de QA/Arquitetura, não uma decisão de produto em aberto.
- Configuração de Formulário respeita a Organização atual (NFR-3) e as permissões efetivas do usuário para configurar (NFR-4).

**Resolvido (R3/D3.1, D3.2, D3.4) → ver Modelo de Formulários, Campos, Databases e Registros:** catálogo oficial de tipos e estrutura do Campo; edge behaviors de Campo; ciclo de configuração/publicação e quem configura/submete cada Formulário, incluindo o acesso público controlado do Formulário inicial. Tratamento de dados pessoais capturados permanece no inventário transversal de LGPD.

#### FR-15: Formulário inicial do Pipe

Formulário inicial do Pipe existe e captura dados no ponto de entrada de um Card em um Pipe (`entidades-fase-1.md` §11.3: "coletar dados na criação do card").

**Consequências (testáveis):**
- Formulário inicial oferece campos configuráveis próprios do contexto "inicial", isolados dos demais (INV-FORM-01).
- Configuração e submissão respeitam a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).

**Resolvido (R3/D3.3) → ver Modelo de Formulários, Campos, Databases e Registros:** a submissão do Formulário inicial cria um novo Card (nunca preenche existente); submissão pública configurável (triagem padrão ou criação direta) por ator externo quando o acesso público estiver habilitado.

#### FR-16: Formulário de Fase

Cada Fase de um Pipe pode ter um Formulário próprio, com campos associados àquela Fase (`entidades-fase-1.md` §12).

**Consequências (testáveis):**
- Formulário de Fase oferece campos configuráveis próprios daquele contexto, isolados dos demais (INV-FORM-01).
- Configuração e submissão respeitam a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).

**Resolvido (R3/D3.3) → ver Modelo de Formulários, Campos, Databases e Registros:** obrigatoriedade de campos por Fase bloqueia a transição; os valores preenchidos persistem, ficam visíveis e com edição restrita após o Card sair da Fase. Persistência = Arquitetura.

#### FR-17: Formulário de Database

Formulário do Database define a estrutura visual de campos de um Registro daquele Database (`entidades-fase-1.md` §13.3: "definir o schema visual de um registro").

**Consequências (testáveis):**
- Formulário do Database oferece campos configuráveis próprios daquele contexto, isolados dos demais (INV-FORM-01).
- Configuração respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).

**Resolvido (R3/D3.2, D3.5) → ver Modelo de Formulários, Campos, Databases e Registros:** quem configura/submete o Formulário de Database; criação de Registro pela submissão e pela ação "Novo Registro". Persistência física real = Arquitetura.

### 4.7 Database e Registros

**Descrição:** Database é uma base de registros estruturados, conceitualmente separada de Pipe (RN-061). Registro é a entrada/linha de um Database, distinta de Card (RN-062).

**Requisitos Funcionais:**

#### FR-18: Catálogo de Databases da Organização

Usuário visualiza o catálogo de Databases da sua Organização atual (Dashboard, Busca, dentro do módulo Database).

**Consequências (testáveis):**
- O catálogo reflete dados reais da Organização atual — nenhuma contagem inventada (RN-131, já usada em FR-4).
- Visualização respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4); Convidado não acessa Database, conforme referência de produto (`permissoes-fase-1.md` §14, §17) — conjunto exato de permissões `PENDENTE DE DECISÃO` como sistema implementado.

**Resolvido (R3/D3.4) → ver Modelo de Formulários, Campos, Databases e Registros:** ciclo de vida do Database (Admin da Org: criar/renomear/arquivar/restaurar), papéis (Admin do Database, Membro do Database, Somente leitura) e acesso por concessão explícita. `orgId` forte e materialização do isolamento em dados = Arquitetura.

#### FR-19: Database mantém Registros

Database mantém uma coleção de Registros, cuja estrutura de campos é definida pelo Formulário do Database (FR-17).

**Consequências (testáveis):**
- Cada Registro pertence a exatamente um Database (RN-063, conceito confirmado).
- Database e Registro permanecem distintos de Pipe e Card, respectivamente — nenhuma fusão de conceitos (RN-061, RN-062, RN-073).

**Resolvido (R3/D3.5) → ver Modelo de Formulários, Campos, Databases e Registros:** ciclo de vida do Registro (criar/editar/arquivar/restaurar, sem exclusão definitiva) e trilha própria (Histórico do Registro). Persistência real e `databaseId` forte = Arquitetura.

#### FR-20: Visualização de Registros de um Database

Usuário visualiza os Registros de um Database em formato de tabela.

**Consequências (testáveis):**
- Visualização respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).

**Resolvido (R3/D3.4) → ver Modelo de Formulários, Campos, Databases e Registros:** navegação uniforme (paginação, ordenação por Campo, filtros por tipo, estados) em todos os Databases ativos.

### 4.8 Automações Básicas

**Descrição:** Automação é uma regra Evento → (Condição opcional) → Ação, ligada a um Pipe, com ações internas ao sistema (RN-100, RN-101).

**Requisitos Funcionais:**

#### FR-21: Modelo Evento → Condição → Ação

Automação é composta por um Evento, uma Ação, e opcionalmente uma Condição — sempre ligada a um Pipe.

**Requisito confirmado (Produto):**
- Toda Automação segue o modelo Evento → (Condição) → Ação (RN-100, confirmado quanto ao modelo).
- Automação pertence a exatamente um Pipe (`entidades-fase-1.md` §22).
- Ações executadas por Automação são internas ao sistema (RN-101).

**Regra de integridade funcional:**
- Uma Ação de Automação que referencia um Template de E-mail deve sempre resolver para um Template válido e existente — a Automação não deve executar apontando para um Template inexistente ou removido. **Produto** exige essa garantia de integridade; **Arquitetura** decide o mecanismo de referência (identificador, nome ou outro) que a sustenta (`entidades-fase-1.md` §21, evidência de pendência de vínculo).

**Resolvido (R4/D4.1) → ver Modelo de Automações:** catálogo de Eventos, Condições e Ações, composição das Condições (E/AND) e guardrails. Persistência/avaliação técnica = Arquitetura.

**Decisão técnica de Arquitetura (pendente):**
- Persistência e mecanismo de avaliação em tempo de execução das Condições, uma vez definido o catálogo/comportamento pelo Produto.
- Mecanismo de referência entre Ação e Template de E-mail (ver regra de integridade acima).

**Fora da Fase 1 (Non-Goal já estabelecido, não decisão em aberto):**
- Ação de requisição HTTP externa (RN-102).
- Webhook e API externa como gatilho/ação (RN-103).
- MCP como mecanismo de Automação (RN-104).

#### FR-22: Gestão de Automação no contexto do Pipe

Usuários autorizados gerenciam Automações no contexto de um Pipe.

**Requisito confirmado (transversal de permissões):**
- Gestão de Automação respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).
- Convidado não gerencia Automações (`permissoes-fase-1.md` §14, §17).

**Resolvido (R4/D4.3) → ver Modelo de Automações:** ciclo de vida (criar/editar/ativar/desativar/arquivar/restaurar/duplicar, sem exclusão definitiva) por Administrador da Organização/Admin do Pipe; Membro do Pipe apenas visualiza.

#### FR-23: Disparo de Automação

Quando o Evento configurado de uma Automação ativa ocorre, o sistema avalia a Automação para decidir se a Ação deve ser executada.

**Requisito confirmado (testável):**
- Somente Automações com status ativo são avaliadas para disparo — Automação inativa ou arquivada não produz efeito.
- Se a Automação tiver Condição definida, a Ação só é executada quando a Condição for satisfeita; sem Condição, a Ação é executada diretamente ao ocorrer o Evento.
- Toda avaliação (disparo, checagem de Condição, execução ou não da Ação) deve ser rastreável para auditoria (NFR-6).

**Resolvido (R4/D4.2 e R2/D2.5) → ver Modelo de Automações:** comportamento do motor (avaliar ativas → Condição AND sobre o estado resultante da alteração que originou o Evento → Ação revalidada), gatilhos oficiais por tipo de Evento e disparo opt-in por movimentação de Card. Implementação e validação do motor = Arquitetura + QA.

**Requisito transversal (inventário, não resolvido nesta rodada):**
- Prevenção de execução cíclica entre Automações (NFR-7).
- Dados pessoais manipulados por Ações de Automação seguem o inventário transversal de LGPD (NFR-8).

#### Resolvido na Rodada 4 (ver Modelo de Automações)

- Catálogo de Eventos/Condições/Ações (D4.1), comportamento do motor (D4.2), ciclo de vida da Automação (D4.3) e distinção IA-Ação × IA-auxiliar (D4.4).

**Pendências residuais:** mecanismo de referência Ação↔Template e prevenção de ciclos (OQ-26/Arquitetura); ciclo de vida de Template de E-mail (OQ-13/R6); disponibilidade do assistente de IA / AI Builder (OQ-30/OQ-31/R6); limites numéricos do motor (Arquitetura/Stories).

**Requisito transversal mantido:** conformidade com LGPD/NFR-8 em todas as execuções e registros.

#### Fora da Fase 1 (Non-Goal já estabelecido no Brief — não é pendência)

- Ação HTTP externa, Webhook, API externa, MCP como mecanismo de Automação.

### 4.9 E-mails

**Descrição:** E-mail é uma mensagem associada ao apoio operacional de um Card, com Templates reutilizáveis (`mvp-fase-1.md` §E-mails).

**Requisitos Funcionais:**

#### FR-24: Composer e histórico visual de E-mail

Usuário compõe e-mails e visualiza histórico de e-mail associado ao contexto de um Card, com apoio de Templates.

**Requisito confirmado (Produto):**
- Composer e histórico visual de e-mail — incluindo uma tela de caixa de entrada como elemento visual — fazem parte do escopo da Fase 1 (`mvp-fase-1.md` §E-mails; `glossario-fase-1.md`, "e-mail enviado a partir de um Card ou pela caixa").
- E-mail funciona como apoio ao trabalho em Cards.
- A **capacidade operacional** de caixa de entrada (recebimento real de mensagens) **não** é confirmada como parte do escopo da Fase 1 — ver Decisão de Produto abaixo.

**Regra de integridade funcional:**
- O histórico de e-mail exibido no contexto do Card e o que aparece na caixa de entrada devem representar a mesma informação de forma coerente — nenhuma das duas visualizações deve contradizer a outra (RN-114). Esta é uma regra de integridade a cumprir independentemente de qual fonte de dados a Arquitetura escolher para sustentá-la.
- **Regra de associação contextual E-mail ↔ Card:** um E-mail pode estar associado ao contexto de um Card (RN-110). Cardinalidade resolvida (0..1, R3/D3.6); mecanismo de referência = Arquitetura.

**Resolvido (R6/D6.5 e R3/D3.6) → ver Modelo de Conta, Comunicação, Indicadores e IA:** a Fase 1 tem envio **outbound real** (Composer + histórico de enviados + visualização por Card); **recebimento, caixa operacional e sincronização permanecem fora da Fase 1**. Associação E-mail↔Card opcional (0..1, D3.6). Provedor, identidade do remetente, armazenamento e mecanismo outbound = Arquitetura + Segurança.

**Decisão de Arquitetura (pendente, subsequente à decisão de Produto):**
- Uma vez que Produto decida o escopo funcional de envio/recebimento/sincronização, Arquitetura define o mecanismo técnico correspondente (protocolo, provedor, armazenamento).

**Requisito transversal de LGPD, segurança e permissões:**
- Uso de E-mail respeita a Organização atual (NFR-3) e as permissões efetivas do usuário (NFR-4).
- "Convidado não acessa E-mails" aparece nas matrizes de referência de permissões, mas o próprio documento-fonte marca essas matrizes como `PENDENTE DE DECISÃO` (Convidado não existe no seed — `permissoes-fase-1.md` §10.1, §17) — portanto **não** é tratado aqui como requisito confirmado, e sim como decisão pendente de permissões.
- Conteúdo de E-mail pode incluir dados pessoais de clientes/contatos — inventário transversal de LGPD (NFR-8); segurança de credenciais/conteúdo em trânsito e repouso (NFR-9); observabilidade de eventos de e-mail (NFR-10).

#### FR-25: Template de E-mail

Usuário utiliza Templates de E-mail reutilizáveis, manualmente ou por Ação de Automação (RN-111).

**Requisito confirmado (Produto):**
- Templates de E-mail existem como catálogo reutilizável; uso por Automação é confirmado conceitualmente (RN-111).
- A regra de integridade entre Ação de Automação e Template (referência sempre válida) já foi registrada em FR-21 (§4.8, Automações) — não é redecidida aqui.

**Resolvido (R6/D6.5) → ver Modelo de Conta, Comunicação, Indicadores e IA:** Templates da Organização (Admin da Org cria/edita/arquiva/restaura; Admin do Pipe só seleciona; sem exclusão definitiva), estrutura (nome/assunto/corpo/variáveis com autorização e base legal), aplicação em Automações e integridade de referência. Mecanismo de referência = OQ-26/Arquitetura.

#### Resolvido na Rodada 6 (ver Modelo de Conta, Comunicação, Indicadores e IA)

- Envio outbound real e Templates (D6.5); associação E-mail↔Card (D3.6). Recebimento e sincronização permanecem **fora da Fase 1**; provedor/identidade/armazenamento/outbound = Arquitetura + Segurança.

#### Decisões de Arquitetura (subsequentes às decisões de Produto acima)

- Mecanismo técnico de envio/recebimento/sincronização, uma vez definido o escopo funcional.
- Fonte de dados única que sustente a regra de integridade entre histórico do Card e caixa de entrada.
- Mecanismo de referência entre E-mail e Card.

#### Fora da Fase 1

Nenhum item novo nesta rodada — nenhuma fonte classifica algo de E-mails como `FORA DA FASE 1` explicitamente; os itens acima são decisões pendentes de Produto/Arquitetura, não exclusões confirmadas.

### 4.10 IA Básica

**Descrição:** IA básica é um conjunto de recursos de apoio assistivo da Fase 1 — sugestão e resumo revisáveis pelo usuário, sem autonomia avançada (RN-120, RN-123).

**Requisitos Funcionais:**

#### FR-26: IA básica assistiva

**Requisito confirmado (Produto, testável):**
- Toda saída gerada pela IA é claramente identificada como gerada por IA (NFR-11).
- Toda saída é revisável, editável, descartável e regenerável pelo usuário antes de qualquer uso (NFR-12).
- Uso da IA fica restrito ao contexto e à Organização para os quais o usuário tem permissão (NFR-13, NFR-3, NFR-4).
- Falha, indisponibilidade ou erro da IA não bloqueia o fluxo manual equivalente — o usuário sempre pode completar a ação (escrever o e-mail, mover o Card etc.) sem depender da IA (NFR-14).
- A Fase 1 não promete múltiplos agentes autônomos avançados — limite estrutural do produto, não decisão em aberto (RN-123; Non-Goal já estabelecido no Product Brief).

**Regra de integridade funcional (precisa):**
- A IA pode gerar sugestões automaticamente (texto, resumo, recomendação), mas **não pode** enviar comunicações, alterar dados, movimentar Cards ou executar qualquer efeito operacional sem confirmação explícita do usuário (NFR-17, guardrail).

**Resolvido (R4/D4.4 e R6/D6.6) → ver Modelo de Automações e Modelo de Conta, Comunicação, Indicadores e IA:** IA auxiliar de configuração × IA como Ação (D4.4); casos de uso da Fase 1 = sugestão de e-mail, resumo de Card e IA como Ação (D6.6); **AI Builder fora da Fase 1** (alternativa b); "Agente de IA" não vira entidade; agentes autônomos avançados = Non-Goal (RN-123).

**Decisão de Arquitetura (pendente, subsequente à decisão de Produto):**
- Mecanismo técnico de apoio da IA (modelo, integração, orquestração) — só depois que Produto decidir os casos de uso concretos acima. O Product Brief cita a stack de direção (OpenAI Agents SDK TS), mas isso é decisão de direção tecnológica, não requisito funcional deste PRD.

**Resolvido (R6/D6.6) → ver Modelo de Conta, Comunicação, Indicadores e IA:** "Administrar Parcial" da IA = o Administrador da Organização habilita/desabilita a IA por capacidade e consulta uso/custo (não configura modelo/provedor). Convidado, Somente leitura, Visão restrita e Apenas formulário inicial sem acesso à IA na Fase 1.

**Requisito transversal de LGPD:**
- Conteúdo processado pela IA (resumo de Card, sugestão de e-mail) pode envolver dados pessoais — mantido no inventário transversal de LGPD (NFR-8).

#### Decisões pendentes da Fase 1 (consolidado desta rodada)

- IA como Ação e distinção do auxiliar de configuração (D4.4); casos de uso, AI Builder fora da Fase 1, "Administrar Parcial" (habilitar/desabilitar + uso/custo) e Convidado sem IA (D6.6). Modelo/região/retenção = OQ-32/Arquitetura+Jurídico.

#### Decisões de Arquitetura (subsequentes)

- Mecanismo técnico de apoio da IA (modelo/integração/orquestração), definido somente após o escopo funcional acima.

#### Fora da Fase 1

- IA autônoma avançada, com múltiplos agentes — Non-Goal já estabelecido no Product Brief (RN-123).

### 4.11 Tarefas e Solicitações

**Descrição:** Tarefa é um trabalho operacional com prazo; Solicitação é um pedido em acompanhamento — ambas ligadas obrigatoriamente a um Pipe (RN-090, RN-091; INV-WORK-02).

**Requisitos Funcionais:**

#### FR-27: Visualização e acompanhamento de Tarefas

Usuários autorizados visualizam e acompanham Tarefas.

**Requisito confirmado (Produto, testável):**
- Tarefa é um trabalho operacional com **prazo definido**, associado a um Pipe (RN-090; `entidades-fase-1.md` §18).
- Tarefa possui status dentre `aberta`, `atrasada`, `concluída` (RN-090).

**Resolvido (R5/D5.2) → ver Modelo de Administração, Membros e Trabalho Operacional:** "atrasada" é condição derivada do prazo (opcional); ciclo de vida criar/editar/atribuir/concluir/reabrir/arquivar/restaurar. Cálculo/fuso = Arquitetura.

#### FR-28: Visualização e acompanhamento de Solicitações

Usuários autorizados visualizam e acompanham Solicitações.

**Requisito confirmado (Produto, testável):**
- Solicitação é um pedido em acompanhamento, associado a um Pipe (RN-091).
- Solicitação possui status dentre `aberta`, `resolvida` (RN-091).

**Resolvido (R5/D5.2) → ver Modelo de Administração, Membros e Trabalho Operacional:** ciclo de vida criar/editar/atribuir/resolver/reabrir/arquivar/restaurar; Solicitação tem Responsável.

#### Invariantes compartilhadas (Tarefas e Solicitações)

**INV-WORK-01 (regra de exibição de estado vazio):** a tela de Tarefas e Solicitações não deve exibir o estado vazio ("Tudo em dia") quando existem itens pendentes (RN-092, confirmado quanto à regra de não incoerência). Permanecem `PENDENTE DE DECISÃO` os critérios exatos: (a) se "itens pendentes" abrange apenas Tarefas/Solicitações em aberto/atrasadas, ou também Cards atrasados de Pipes; (b) se Cards atrasados realmente compõem a própria tela ou apenas influenciam a lógica do estado vazio por coerência externa.

**INV-WORK-02 (associação obrigatória com Pipe):** toda Tarefa e toda Solicitação pertence obrigatoriamente a um Pipe (RN-090, RN-091 — confirmado). O vínculo direto com Card é opcional (0..1 Card do mesmo Pipe), resolvido em R3/D3.6; mecanismo = Arquitetura.

#### Resolvido — matriz de acesso do módulo (R5/D5.2 sobre R1/D1.6)

**Resolvido (R5/D5.2 sobre R1/D1.6) → ver Modelo de Administração, Membros e Trabalho Operacional:** acesso do módulo por papel — Administrador da Organização e Admin do Pipe operam os itens do escopo; Membro do Pipe cria/opera conforme suas permissões; Somente leitura, Visão restrita e Apenas formulário inicial não recebem capacidade operacional por padrão; Convidado apenas visualiza itens vinculados a recursos concedidos. Sem exclusão definitiva (arquivamento reversível).

**Requisito transversal aplicado (NFR-3, NFR-4):**
- Visualização respeita a Organização atual (NFR-3) e as permissões efetivas do usuário, uma vez definidas (NFR-4).

#### Resolvido na Rodada 5 (ver Modelo de Administração, Membros e Trabalho Operacional)

- "atrasada" derivada (D5.2), ciclo de vida de Tarefa/Solicitação (D5.2), vínculo opcional com Card (R3/D3.6) e matriz de acesso do módulo (D5.2 sobre D1.6).

**Residual (detalhe de UX):** critérios exatos de INV-WORK-01 (composição da tela, papel dos Cards atrasados no estado vazio).

#### Decisões de Arquitetura (subsequentes)

- Mecanismo técnico de cálculo/armazenamento do prazo e do estado "atrasada" (se derivado), incluindo tratamento de fuso horário.
- Mecanismo técnico de referência Tarefa/Solicitação → Card, uma vez decidida a cardinalidade.

#### Fora da Fase 1

Nenhum item identificado nesta rodada.

### 4.12 Notificações

**Descrição:** Notificação é um aviso interno ao produto sobre um evento, hoje associado a um Card, exibido de forma unificada em popover, página dedicada e badge (RN-080, RN-083). **Delimitação de escopo:** esta seção trata exclusivamente de notificações internas ao produto; canais externos (e-mail, push, SMS) não são confirmados pelas fontes e não fazem parte desta seção.

**Requisitos Funcionais:**

#### FR-29: Notificações de fonte funcional única

Popover da topbar, página dedicada e badge (FR-5) derivam da mesma fonte funcional de Notificações.

**Requisito confirmado (testável):**
- Popover, página dedicada e badge derivam da mesma fonte funcional de Notificações — não são fontes independentes que podem divergir (RN-080, RN-083).
- Conteúdo, estado de leitura e contagem de não lidas devem ser consistentes entre os três pontos de exibição a qualquer momento (INV-NOTIF-01, abaixo).

**Decisão de Produto/UX (pendente):**
- Quantidade de itens exibidos, paginação e filtros no popover em comparação com a página dedicada — `PENDENTE DE DECISÃO`. A exigência de mesma fonte funcional não implica que os dois pontos de exibição mostrem literalmente a lista completa idêntica (ex.: popover pode limitar/paginar de forma diferente da página).

#### Invariante INV-NOTIF-01 (consistência entre badge, popover e página)

Badge, popover e página dedicada devem refletir, a qualquer momento, o mesmo conteúdo, o mesmo estado de leitura por notificação e a mesma contagem de não lidas — nenhum dos três pode divergir dos demais quanto a essas propriedades (RN-080, RN-081, RN-082, RN-083, confirmados no protótipo auditado).

#### FR-30: Notificação associada a um Card

Notificação informa eventos como expiração, conclusão ou movimentação, com associação funcional a um Card (RN-084).

**Requisito confirmado:**
- Notificação está funcionalmente associada a um Card existente quando o evento tem origem em um Card (RN-084). O mecanismo técnico dessa associação fica inteiramente para Arquitetura — este PRD não impõe referência polimórfica nem qualquer outro mecanismo específico.

**Resolvido (R6/D6.3) → ver Modelo de Conta, Comunicação, Indicadores e IA:** catálogo de tipos de Notificação, alvos, distribuição por evento, estado lido/não-lido **por destinatário** (instância pessoal) e o momento de leitura. A **distribuição** (quais eventos geram Notificação e para quem) é **distinta** da matriz de permissões de acesso ao módulo (quem vê/gerencia a tela) — ambas resolvidas: acesso ao módulo em R1/D1.6, distribuição em R6/D6.3. Geração só por mudança efetiva; sem duplicação por reprocessamento. Entrega e tempo real = Arquitetura.

**Requisito transversal aplicado:**
- Isolamento (NFR-19), autorização (NFR-20), consistência (NFR-21, ver INV-NOTIF-01), observabilidade (NFR-22), LGPD (NFR-23).

#### Resolvido na Rodada 6 (ver Modelo de Conta, Comunicação, Indicadores e IA)

- Catálogo de tipos, alvos, distribuição, estado lido/não-lido por destinatário, popover×página e preferências in-app (D6.3). Entrega/tempo real = Arquitetura.

#### Decisões de Arquitetura (subsequentes)

- Mecanismo técnico de associação Notificação ↔ Card (e demais alvos, se Produto decidir ampliar) — nenhum mecanismo específico é imposto neste PRD.

#### Fora da Fase 1

Nenhum item identificado nesta rodada — canais de notificação externos ao produto (e-mail, push, SMS) não são Non-Goal formal, apenas não confirmados pelas fontes e fora da delimitação desta seção.

### 4.13 Relatórios

**Descrição:** Relatórios exibem indicadores operacionais básicos, com contagens coerentes com Pipes e Cards reais, dentro do escopo de Organização, permissões e filtros aplicáveis ao usuário (RN-130 a RN-133).

**Requisitos Funcionais:**

#### FR-31: Indicadores de Relatórios com dados reais e autorizados

Usuário visualiza indicadores operacionais básicos, com contagens derivadas de dados reais, dentro do escopo de Organização, permissões e filtros aplicáveis a ele.

**Requisito confirmado (testável):**
- Todo contador exibido em Relatórios deriva de dados reais da Organização atual (Pipes/Cards) — nenhum contador inventado (RN-131).
- O total de Pipes exibido corresponde ao catálogo real de Pipes visíveis/autorizados para o usuário (RN-132, autorização aplicada via NFR-25).
- O total de resultados (Cards) exibido corresponde aos Cards reais dentro do escopo autorizado do usuário (RN-133, idem).
- Um resultado igual a zero (ex.: "0 Cards atrasados") deve ser distinguível de uma falha, indisponibilidade ou carregamento incompleto do indicador — o sistema não deve apresentar os dois casos da mesma forma (NFR-27).

**Invariantes:**
- **INV-REPORT-01 (não vazamento por agregação):** contagens e indicadores agregados não podem revelar a um usuário a existência de recursos aos quais ele não possui acesso, mesmo de forma indireta (ex.: um total que varie de forma perceptível ao considerar itens que o usuário não pode ver). Consequência direta de NFR-4/NFR-25 aplicada especificamente a dados agregados.
- **INV-REPORT-02 (filtros autorizados e reais):** filtros de Relatórios devem operar apenas sobre recursos reais e autorizados para o usuário, e o resultado do filtro deve refletir corretamente nos indicadores exibidos (extensão de RN-133 — "filtros devem usar pipes reais" — incluindo a dimensão de autorização).

**Resolvido (R6/D6.4) → ver Modelo de Conta, Comunicação, Indicadores e IA:** catálogo agregado e regras de inclusão (ativos por padrão; arquivados só por filtro explícito; finalização por estado atual, sem "excluídos" — não há exclusão definitiva); filtros autorizados por E/AND; distinção Dashboard×Relatórios; acesso por escopo autorizado (D1.6). Fonte de verdade/agregação/cache/atualização/desempenho = Arquitetura.

**Decisão de Arquitetura (subsequentes):**
- Fonte de verdade para o cálculo dos indicadores.
- Mecanismo de agregação.
- Consistência entre múltiplas leituras/telas do mesmo indicador (NFR-26).
- Frequência/mecanismo de atualização — tempo real vs. periódico (NFR-28).
- Estratégia de cache.
- Desempenho do cálculo de indicadores agregados (NFR-29).
- Observabilidade — diagnóstico de falha vs. zero legítimo (NFR-27).

**Requisito transversal aplicado:** NFR-24 (isolamento), NFR-25 (autorização), NFR-26 (consistência), NFR-27 (observabilidade), NFR-28 (atualização), NFR-29 (desempenho).

**Fora da Fase 1 (Non-Goal já estabelecido no Brief, sem ampliação):**
- Analytics avançado (`mvp-fase-1.md` §Relatórios, "Limite").

#### Resolvido na Rodada 6 (ver Modelo de Conta, Comunicação, Indicadores e IA)

- Catálogo e regras de inclusão, filtros autorizados, distinção Dashboard×Relatórios e acesso por escopo autorizado (D6.4).

#### Decisões de Arquitetura (subsequentes)

- Fonte de verdade, mecanismo de agregação, consistência, atualização, cache, desempenho e observabilidade dos indicadores.

#### Fora da Fase 1

- Analytics avançado.

### 4.14 Perfil

**Descrição:** Área onde o usuário autenticado visualiza informações da própria conta e o contexto real da Organização atual (`mvp-fase-1.md` §Perfil).

**Requisitos Funcionais:**

#### FR-32: Perfil do usuário — visualização de dados próprios e contexto

Usuário autenticado visualiza informações da própria conta e o contexto real da Organização atual. **A existência da área de Perfil não confirma capacidade de edição** — ver Decisões de Produto abaixo.

**Requisito confirmado (Produto, mínimo, testável):**
- Existe uma área de Perfil onde o usuário autenticado visualiza dados da própria conta e o contexto real (dados reais, não decorativos) da Organização atual (`mvp-fase-1.md` §Perfil, coerente com RN-131 sobre não usar dados inventados).

**Distinção conceitual (Produto):** "dados do usuário" no Perfil se dividem em camadas distintas, que não devem ser fundidas:
1. **Dados globais da conta** — identidade do Usuário, válida além de qualquer Organização (ex.: nome, e-mail, senha, avatar).
2. **Dados de participação na Organização atual** — contexto operacional do usuário dentro da Organização atual (ex.: Pipes relacionados, preferências nesse contexto).
3. **Papel de Organização** do usuário (Administrador da Organização / Membro / Convidado).
4. **Eventual Papel de Plataforma** do usuário (Super Admin), quando aplicável — distinto dos três anteriores (`glossario-fase-1.md`: Usuário possui um Papel de Plataforma e um Papel de Organização, dois eixos distintos).

**Decisão de Produto (pendente):**
- Edição de nome, avatar e preferências — operações de menor sensibilidade — se são suportadas na Fase 1 e seu escopo exato — `PENDENTE DE DECISÃO`.
- Alteração de e-mail e senha — operações sensíveis, tratadas separadamente das anteriores por exigirem verificação adicional — se são suportadas na Fase 1 e seu mecanismo de confirmação — `PENDENTE DE DECISÃO`.
- "Pipes relacionados" exibidos no Perfil — finalidade e critérios (participação, criação, favoritos) — `PENDENTE DE DECISÃO`.
- Catálogo de "preferências básicas" — `PENDENTE DE DECISÃO`.
- Exibição do Papel de Organização e do eventual Papel de Plataforma no Perfil — `PENDENTE DE DECISÃO`.

**Delimitação de escopo:** esta seção cobre exclusivamente o Perfil do próprio usuário autenticado. Visualização e gerenciamento de outros usuários da Organização (lista de membros, papéis, convites) pertencem ao Painel Administrativo da Organização (§4.15), não a este FR.

**Decisão de Arquitetura (subsequentes):**
- Mecanismo técnico de identidade (armazenamento/atualização dos dados globais da conta).
- Mecanismo de participação organizacional (como o contexto de Organização atual é resolvido e exibido).
- Armazenamento de preferências.
- Armazenamento/processamento de avatar (upload, formato, tamanho).
- Gestão de sessões relacionada ao Perfil (ex.: encerrar outras sessões ativas) — ainda não confirmado como requisito de produto.
- Mecanismo de auditoria de alterações sensíveis.

**Requisito transversal aplicado:** NFR-30 (isolamento), NFR-31 (autorização), NFR-32 (LGPD), NFR-33 (segurança), NFR-34 (consistência), NFR-35 (auditoria).

#### Resolvido na Rodada 6 (ver Modelo de Conta, Comunicação, Indicadores e IA)

- Edição de nome/avatar/preferências; e-mail em duas etapas e senha com step-up; "Pipes relacionados" (leitura); papel da Org atual (D6.2). Mecanismos = Arquitetura/Segurança.

#### Decisões de Arquitetura (subsequentes)

- Identidade, participação organizacional, preferências, avatar, sessões e auditoria relacionados ao Perfil.

#### Fora da Fase 1

Nenhum item identificado nesta rodada.

### 4.15 Painel Administrativo da Organização

**Descrição:** Área onde o Administrador da Organização configura e acompanha informações administrativas da Organização atual, exclusivamente (RN-150 a RN-153).

**Requisitos Funcionais:**

#### FR-33: Painel Administrativo — administração da própria Organização atual

**Requisito confirmado (testável):**
- O Painel Administrativo configura somente a Organização atual (RN-150).
- O Painel Administrativo não configura a Plataforma (RN-151) e é uma área distinta do Super Admin (RN-152, RN-200).
- Somente o Administrador da Organização acessa a Administração da Organização (`permissoes-fase-1.md` §17; RN-150). O eventual acesso de um Super Admin da Plataforma a este painel de uma Organização específica **não é assumido nem confirmado** por este FR — é decisão separada, já registrada como pendente na documentação de permissões (`permissoes-fase-1.md` §11: regra de suporte/auditoria do Super Admin, `FORA DA FASE 1`/`PENDENTE DE DECISÃO`).

**Invariantes:**

- **INV-ADMIN-01 (separação de permissões e contextos):** permissões e contexto de Organização e permissões e contexto de Plataforma são eixos distintos e não devem ser fundidos (RN-150, RN-151, RN-152, RN-200):
  - (a) o Painel Administrativo nunca permite configurar ou visualizar dados administrativos de outra Organização;
  - (b) o Painel Administrativo nunca permite configurar dados da Plataforma;
  - (c) o Papel de Plataforma (Super Admin) não concede, por si só, nenhuma permissão dentro do Painel Administrativo de uma Organização específica — esse cruzamento é decisão separada e pendente, não consequência automática deste invariante.
- **INV-ADMIN-02 (sem dado fictício apresentado como real):** seções ainda não operacionais (ex.: Financeiro, Estatísticas, Auditoria, hoje ilustrativas) não podem apresentar dados fictícios como se fossem reais, nem simular persistência de ações do usuário. Em produção, cada seção deve usar dados reais ou permanecer oculta/desabilitada — nunca se apresentar como funcional sem sê-lo (extensão de RN-153, que hoje só exige declarar o conteúdo como ilustrativo).

**Resolvido (R5/D5.3) → ver Modelo de Administração, Membros e Trabalho Operacional:** Financeiro fica **fora da Fase 1** (sem menu, rota, placeholder, tela, Épico ou Story); Estatísticas **sem módulo implícito** (o nome não aparece na interface enquanto não houver finalidade e catálogo próprios; catálogo e distinção Dashboard×Relatórios = OQ-34/35/R6).

**Resolvido (R5/D5.1) → ver Modelo de Administração, Membros e Trabalho Operacional:** convite/aceite/expiração/reenvio/cancelamento; Membership (ativa/suspensa/encerrada); papel; suspensão; remoção; reativação; proteção do último Administrador ativo; revogação de sessão; destino de recursos atribuídos; multi-org; roster; convites conflitantes. Mecanismos (token, revogação de sessão, NFR-38) = Arquitetura.

**Auditoria administrativa (distinta de logs técnicos/observabilidade):**
Auditoria administrativa (visão de negócio sobre ações administrativas da Organização) é conceitualmente distinta de logs técnicos/observabilidade de sistema (Sentry/Pino, já cobertos pela skill `observability-check` do projeto).
- **Resolvido (R5/D5.3) → ver Modelo de Administração, Membros e Trabalho Operacional:** catálogo de eventos auditáveis (membros/acesso, segurança de conta, configuração estrutural), com ator/origem (usuário/sistema/processo) e antes/depois minimizado; acesso somente ao Administrador da Organização; separado dos logs técnicos. Retenção/anonimização/descarte e imutabilidade técnica = Governança/Arquitetura.

Caso a Auditoria administrativa venha a ser aprovada como capacidade real (não apenas ilustrativa):

**INV-AUDIT-01 (imutabilidade de eventos auditados):** eventos de Auditoria administrativa não podem ser alterados ou excluídos por fluxos comuns de uso — apenas acrescentados (append-only) — respeitando política de retenção e requisitos de LGPD. Este invariante só se aplica quando/se a Auditoria administrativa for aprovada como requisito real; enquanto ilustrativa, não se aplica.

**Decisão de Arquitetura (subsequentes, atualizadas):**
- Mecanismo técnico de identidade e resolução do contexto de Organização atual no Painel.
- Mecanismo de convite, papéis e revogação de acesso de membros.
- Estrutura de armazenamento da Auditoria administrativa (uma vez que Produto defina os eventos).
- Mecanismo de cálculo de Estatísticas administrativas (uma vez definido o escopo frente a Dashboard/Relatórios).
- Mecanismo de autorização que impeça cruzamento entre contexto de Organização e de Plataforma (suporte técnico a INV-ADMIN-01).

**Requisito transversal aplicado:** NFR-36 (isolamento), NFR-37 (autorização), NFR-38 (segurança), NFR-39 (auditoria), NFR-40 (LGPD), NFR-41 (consistência), NFR-42 (observabilidade).

**Fora da Fase 1 (preservado, sem ampliação):**
- API/Token/Webhooks no Painel Administrativo — referência de Fase 2 (`mvp-fase-1.md` §Painel Administrativo; já estabelecido no Product Brief).

#### Resolvido na Rodada 5 (ver Modelo de Administração, Membros e Trabalho Operacional)

- Financeiro fora da Fase 1 e Estatísticas sem módulo implícito (D5.3); gerenciamento de membros (D5.1); catálogo de eventos auditáveis e acesso à Auditoria (D5.3). Estatísticas/Relatórios concretos = OQ-34/35/R6.

#### Decisões de Arquitetura (subsequentes)

- Identidade, membros, convites, revogação, auditoria, estatísticas e autorização (separação Organização × Plataforma).

#### Fora da Fase 1

- API/Token/Webhooks no Painel Administrativo (referência de Fase 2, já estabelecido no Brief).

### 4.16 Super Admin

**Descrição:** Super Admin é um Papel de Plataforma, estruturalmente separado da Organização — referência documental nesta Fase 1, sem tela integrada ao protótipo unificado (RN-160 a RN-163).

**Requisitos Funcionais:**

#### FR-34: Super Admin — referência separada da Plataforma

**Requisito confirmado:**
- Super Admin é um Papel de Plataforma, distinto do Papel de Organização (RN-161, RN-162).
- Super Admin não é Administrador da Organização, nem um papel comum dentro da Organização (RN-161, RN-162, RN-200).
- Super Admin é conceitualmente uma área da Plataforma, separada da Organização — decisão oficial já registrada, mesmo sem tela integrada no protótipo (RN-160; `entidades-fase-1.md`, "Super Admin (decisão oficial)").
- Status desta Fase 1: `NÃO INTEGRADO AO PROTÓTIPO UNIFICADO · REFERÊNCIA SEPARADA` — este PRD não define fluxos operacionais de Super Admin além dessa referência (RN-163: "integrar depois; não reabrir a lógica agora").

**Invariante reaproveitada:** INV-ADMIN-01 (§4.15) já cobre a separação entre contexto de Organização e de Plataforma — aplicável aqui simetricamente (Super Admin não herda nem concede permissões de Organização por si só).

**Decisão de Produto (pendente — o próprio módulo está em aberto, não é bloqueio de outra rodada):**
- Tela/fluxo integrado de Super Admin — `PENDENTE DE DECISÃO` (RN-163); fora do escopo de implementação desta Fase 1 até decisão em contrário.
- Escopo concreto de administração (contas, organizações, usuários globais, configurações de plataforma, logs administrativos) — `PENDENTE DE DECISÃO` (`permissoes-fase-1.md` §11); citado como possibilidade na documentação, não como requisito confirmado.

**Fora da Fase 1 (reafirmado, sem ampliação):**
- Implementação funcional completa de Super Admin, além da referência conceitual — já registrado no Product Brief.
- Regra de suporte/auditoria para Super Admin acessar dados operacionais de uma Organização sem acesso silencioso — `FORA DA FASE 1` (`permissoes-fase-1.md` §11, §18).

**Nota sobre NFRs transversais:** NFR-3 (isolamento por Organização) e NFR-4 (autorização por permissões efetivas) foram definidos para recursos no escopo de uma Organização; Super Admin opera acima desse escopo, então não se aplicam da mesma forma. Isolamento/autorização em nível de Plataforma para Super Admin ficam como `PENDENTE DE DECISÃO`, sem novo NFR forçado nesta rodada — coerente com o módulo permanecer não implementado.

#### Decisões de Produto (pendentes, consolidado desta rodada)

- Tela/fluxo integrado de Super Admin.
- Escopo concreto de administração de Plataforma pelo Super Admin.
- Isolamento/autorização em nível de Plataforma (quando o módulo for implementado).

#### Decisões de Arquitetura (subsequentes)

Nenhuma identificada nesta rodada — não há base funcional aprovada para decisões técnicas subsequentes (RN-163).

#### Fora da Fase 1

- Implementação funcional completa de Super Admin.
- Regra de suporte/auditoria para acesso de Super Admin a dados de Organização.

## Requisitos Transversais

> Requisitos que atravessam todos os módulos da Fase 1 (NFRs, guardrails, governança de dados, compliance e dependências). Cada subseção abaixo mantém sua rastreabilidade aos FRs da Seção 4.

### NFRs Transversais (consolidado)

**Descrição:** Requisitos não-funcionais que atravessam múltiplas funcionalidades da Fase 1. Os IDs `NFR-1..NFR-42` são preservados como canônicos — as citações inline `NFR-N` ao longo da Seção 4 resolvem para esta seção. Onde um NFR por módulo é reaplicação de um princípio, ele aparece como **aplicação específica** do NFR canônico, sem duplicar a regra. **Observabilidade e Auditoria são distintas:** as famílias de Observabilidade (5) servem a **diagnóstico operacional**; as famílias de Auditoria (6) servem a **trilha administrativa / de conformidade** — propósitos, retenção e público diferentes.

#### 1. Segurança de credenciais, segredos e operações sensíveis
- **NFR-1** — Senhas, tokens, chaves, segredos de configuração e dados de sessão nunca são armazenados em texto puro nem expostos em logs, mensagens de erro, trilhas de auditoria ou entradas de IA. · *FR-1, FR-2 (e transversal)*
- **NFR-2** — Login possui limitação contra força bruta. · *FR-1*
- **NFR-9** — Credenciais de provedor e conteúdo sensível de e-mail protegidos em trânsito/repouso. **Condicional** à decisão de Produto sobre envio/recebimento real (ver seção de E-mails); mecanismo = Arquitetura. · *FR-24*
- **NFR-33** — Operações sensíveis de conta (alteração de e-mail/senha) exigem proteção adicional (ex.: reautenticação); mecanismo = Arquitetura. · *FR-32*
- **NFR-38** — Operações administrativas sensíveis (remoção de membro, alteração de papel, revogação de acesso) exigem proteção adicional; mecanismo = Arquitetura. · *FR-33*

#### 2. Isolamento por Organização (multi-tenant) — limite estrutural
- **NFR-3 (canônico)** — Toda consulta, leitura, escrita ou agregação respeita a Organização atual do usuário autenticado; nenhuma funcionalidade cruza dados entre Organizações. Aplicado transversalmente a todos os FRs de recurso organizacional da Seção 4. · *FR-4, FR-6 e todos os FRs de recurso organizacional*
  - Aplicações específicas: **NFR-13** (contexto de IA restrito à Organização), **NFR-19** (Notificações), **NFR-24** (Relatórios), **NFR-30** (Perfil), **NFR-36** (Painel Administrativo, ver INV-ADMIN-01). · *FR-26, FR-29/30, FR-31, FR-32, FR-33*

#### 3. Autorização por permissões efetivas
- **NFR-4 (canônico)** — Resultados e ações respeitam o papel efetivo do usuário no contexto aplicável: Administrador da Organização, Membro ou Convidado; o Super Admin existe somente no escopo da Plataforma e não recebe acesso automático aos dados de uma Organização. O vocabulário de permissões da Fase 1 segue o modelo híbrido: três verbos-base — Visualizar, Editar e Administrar — podendo incluir ações nomeadas quando aprovadas para comportamentos sensíveis ou semanticamente distintos, como Mover Card, Arquivar/Excluir, Publicar e Gerenciar membros/papéis. A associação dessas ações a step-up ou reautenticação não é automática e será definida por Produto e Segurança. A matriz exata por módulo permanece `PENDENTE DE DECISÃO` — ver OQ-1. · *FR-6 e todos os FRs de recurso organizacional*
  - Aplicações específicas: **NFR-20** (Notificações), **NFR-25** (Relatórios, incl. não vazamento por agregação — INV-REPORT-01), **NFR-31** (Perfil: só os próprios dados), **NFR-37** (Painel Admin: só o Administrador da Organização). · *FR-30, FR-31, FR-32, FR-33*

#### 4. Integridade e consistência de dados
- **NFR-5** — A associação Card–Fase permanece válida mesmo após alteração no nome da Fase (mecanismo = Arquitetura). · *FR-9*
- **NFR-26** — O mesmo indicador reflete de forma coerente o mesmo conjunto de dados subjacente em telas/momentos distintos. · *FR-31*
- **NFR-34** — Dados exibidos no Perfil (papel, contexto atual) refletem o estado real e atual, sem divergir de outras telas. · *FR-32*
- **NFR-41** — Dados exibidos no Painel Administrativo (membros, papéis) refletem o estado real e atual, sem divergir de Perfil/topbar. · *FR-33*
- **NFR-21** — Consistência de Notificações remetida a **INV-NOTIF-01** (badge, popover e página refletem o mesmo conteúdo, leitura e contagem). · *FR-29*

#### 5. Observabilidade (diagnóstico operacional)
- **NFR-6** — Toda avaliação/execução de Automação (evento, condição, ação) é rastreável para diagnóstico. · *FR-23*
- **NFR-10** — Eventos de e-mail (composição, uso de Template, futura tentativa de envio/recebimento) são rastreáveis. **Condicional** à aprovação de envio/recebimento real. · *FR-24, FR-25*
- **NFR-15** — Uso e desempenho dos recursos de IA são monitoráveis. · *FR-26*
- **NFR-22** — Geração/entrega (ou não geração) de Notificações é rastreável, para diagnosticar por que uma notificação foi ou não gerada. · *FR-30*
- **NFR-27** — Falha, indisponibilidade ou carregamento incompleto de um indicador é diagnosticável e distinguível de um zero legítimo. · *FR-31*
- **NFR-42** — Ações administrativas são diagnosticáveis/rastreáveis para suporte, distinto do log técnico de sistema. · *FR-33*

#### 6. Auditoria (trilha administrativa / de conformidade — distinta de logs técnicos)
- **NFR-16** — O uso de IA gera trilha de auditoria com **metadados, contexto e a decisão do usuário** (confirmação/descarte) sobre a sugestão. O armazenamento integral de prompts e respostas **não é exigido**; conteúdo bruto só é retido quando necessário, autorizado e com retenção definida (cruza com o cluster LGPD). · *FR-26*
- **NFR-35** — Alterações em dados sensíveis de conta (e-mail, senha) são registradas na trilha de auditoria. · *FR-32*
- **NFR-39** — Eventos administrativos definidos por Produto são registrados de forma confiável (ver INV-AUDIT-01, se aprovada). · *FR-33*

#### 7. LGPD / proteção de dados pessoais
- **NFR-8 (canônico)** — O tratamento de dados pessoais (Registros, contatos, conteúdo de e-mail/Notificação, dados de conta, dados de membros/Auditoria) observa: **finalidade** definida, **minimização** dos dados tratados, **acesso autorizado** (isolamento + permissões efetivas), **retenção** definida e **atendimento aos direitos do titular** aplicáveis — conforme detalhado no cluster de Compliance/Regulatório (LGPD). · *FR-23 e todos os FRs que tocam dados pessoais*
  - Aplicações específicas: **NFR-23** (conteúdo de Notificação), **NFR-32** (dados de conta no Perfil), **NFR-40** (dados de membros e Auditoria administrativa). · *FR-30, FR-32, FR-33*

#### 8. IA assistiva — transparência, revisão humana, guardrails
- **NFR-11** — Toda saída da IA é claramente identificada como gerada por IA. · *FR-26*
- **NFR-12** — Toda saída da IA é revisável, editável, descartável e regenerável pelo usuário **antes de uso definitivo, comunicação externa ou alteração operacional**. · *FR-26*
- **NFR-14** — Falha/indisponibilidade da IA não bloqueia o fluxo manual equivalente. · *FR-26*
- **NFR-17 (guardrail)** — A IA pode gerar sugestões automaticamente, mas não pode enviar comunicações, alterar dados, movimentar Cards ou executar qualquer efeito operacional sem confirmação explícita do usuário. · *FR-26*
- **NFR-18** — Consumo/custo dos recursos de IA é monitorável. · *FR-26*
- *(NFR-13, isolamento de contexto de IA, consolidado na família 2.)*

#### 9. Prevenção de execução cíclica (Automações)
- **NFR-7** — O sistema evita que uma Automação dispare a si mesma ou gere ciclo com outras (mecanismo = Arquitetura). · *FR-21, FR-23*

#### 10. Desempenho e atualização
- **NFR-28** — **Produto** define a defasagem máxima aceitável entre o dado real e o indicador exibido (para não enganar o usuário); **Arquitetura** define o mecanismo de atualização (tempo real vs. periódico). O valor da defasagem aceitável é `PENDENTE DE DECISÃO`. · *FR-31*
- **NFR-29** — O cálculo de indicadores agregados atende a uma meta mensurável de desempenho (ex.: tempo de carregamento sob volume esperado de dados). A meta e o volume esperado são `PENDENTE DE DECISÃO` (Produto define a meta; Arquitetura define como atendê-la). · *FR-31*

### Modelo de Permissões Efetivas (Fase 1)

**Descrição:** consolida a resolução de OQ-1..4 (decisões de Produto D1.1–D1.6). Materializa NFR-4 (autorização) e é o modelo que o mecanismo de autorização (AD-9) consome — não prescreve implementação. Reforça NFR-3 (isolamento) em todos os escopos.

**Princípios (fechados):** menor privilégio e acesso negado por padrão — a ausência de regra explícita significa acesso negado (alinhado a AD-9). Separação de escopos Plataforma › Organização › Pipe › Card: um papel não concede poderes em outro escopo por inferência; efeitos entre escopos somente existem quando declarados explicitamente neste modelo, como o acesso do Administrador da Organização a todos os Pipes.

**Vocabulário (modelo híbrido):** verbos-base Visualizar, Editar, Administrar; ações nomeadas apenas quando sensíveis ou semanticamente distintas — Mover Card, Arquivar/Excluir, Publicar, Gerenciar membros/papéis. Excluir irreversível = Administrar por padrão. A associação dessas ações a step-up/reautenticação não é automática (Produto + Segurança definem).

**Papéis de Organização — um único por Membership (alinhado a AD-7):**
- **Administrador da Organização** — administra a própria Organização; acessa todos os Pipes.
- **Membro** — operacional apenas nos recursos a que tem acesso; não administra a Organização. "Membro" não significa acesso irrestrito.
- **Convidado** — sem acesso operacional org-wide por padrão; acessa apenas recursos concedidos explicitamente.
- "Editor"/"Visualizador" são nomes legados do seed, não papéis oficiais.

**Matriz de ações por módulo (papel de Organização):**

| Módulo | Administrador da Organização | Membro | Convidado |
|---|---|---|---|
| Dashboard | Visualizar dados da Organização | Visualizar somente dados derivados dos recursos autorizados | Sem acesso por padrão; eventual visão filtrada depende de OQ-34/35 |
| Pipes | Administrar | Editar recursos acessíveis | Conforme papel de Pipe |
| Cards | Administrar | Editar; Mover Card separado | Conforme papel de Pipe/Card |
| Database | Administrar | Editar dados autorizados, sem administrar estrutura | Sem acesso por padrão |
| Automações | Administrar | Visualizar e ações operacionais aprovadas na R4 | Sem acesso |
| E-mails | Administrar Templates/configurações aprovadas | Editar composição autorizada | Sem acesso |
| IA | Administrar configurações aprovadas | Usar e revisar IA | Sem acesso |
| Administração da Organização | Administrar + Gerenciar membros/papéis | Sem acesso | Sem acesso |

Notas: **Mover Card** é ação nomeada separada — não incluída automaticamente em Editar (quem/condições = OQ-15/R2). **Publicar/despublicar** exige concessão explícita quando a capacidade existir (Administrar configura, não publica automaticamente). Verbos de IA: **Usar IA**, **Revisar/Aprovar saída**, **Administrar IA** (só configurações aprovadas). **Arquivar**: recurso operacional só quando aprovado no módulo; arquivamento de recursos estruturais (Pipe, Database, Formulário, Automação) não é liberado automaticamente ao Membro.

**Papéis de Pipe — concessão explícita por Pipe:** Admin do Pipe, Membro do Pipe, Somente leitura. O Administrador da Organização acessa todos os Pipes; Membro e Convidado só acessam Pipes onde receberam papel; **ausência de papel no Pipe = ausência de acesso**. Cada Membership possui no máximo um papel efetivo por Pipe. Admin do Pipe administra a configuração do Pipe conforme operações aprovadas; Membro do Pipe trabalha nos recursos operacionais autorizados; Somente leitura apenas consulta, sem editar ou mover Cards. "Visão restrita" e "Apenas formulário inicial" são modos condicionais, não papéis oficiais nesta etapa (o segundo atado a OQ-10). Admin do Pipe ≠ Administrador da Organização.

**Acesso, atribuições e concessões de Card — derivado do Pipe + concessão direta opcional:**
- Acesso normal deriva do papel de Pipe (Admin do Pipe / Membro do Pipe / Somente leitura).
- **Responsável não é papel de permissão** — é atribuição operacional do Card; as permissões de editar/mover/concluir continuam vindo do acesso efetivo ao Pipe/Card. Só pode ser atribuído a quem já possui acesso operacional ao Card.
- **Observador** — concessão de Card em modo leitura: visualiza; não edita; não move; não recebe Notificações automaticamente enquanto a distribuição estiver pendente (OQ-33).
- **Comentador** — condicional à aprovação da funcionalidade de comentários na Fase 1; quando aprovado: visualiza e comenta; não edita estrutura, move ou exclui. Não oficializado até essa confirmação.
- **"Restrito ao próprio"** — modificador de escopo do papel Membro do Pipe (não papel de Card); comportamento fechado na R2.
- **Concessão direta de um Card:** acessa apenas aquele Card, mesmo sem papel no Pipe; não libera a lista de outros Cards, nem configuração/métricas/administração do Pipe; mostra apenas nome do Pipe, Fase atual e contexto mínimo de navegação; vínculos, arquivos e Registros relacionados continuam sujeitos a autorização própria.
- **`creator`** — apenas metadado de proveniência: não concede acesso, não torna o usuário responsável, não impede perda posterior de acesso.

**Permissão efetiva** resulta de uma avaliação contextual e restritiva entre o papel da Organização, o papel do Pipe, as concessões específicas de Card e a autorização do recurso de origem. O papel da Organização estabelece o limite máximo; o papel de Pipe concede acesso ao respectivo escopo; uma concessão direta de Card é uma exceção explícita limitada somente àquele Card. A ausência de autorização aplicável significa acesso negado. Uma concessão de Card nunca concede administração do Pipe nem acesso a outros Cards.

**Acesso dos módulos transversais (OQ-4):**
- **Tarefas/Solicitações** — Administrador visualiza todos os itens da Organização e executa somente as operações aprovadas na OQ-12; Membro e Convidado veem somente itens ligados a recursos acessíveis. Atribuir uma Tarefa/Solicitação não concede acesso implícito ao Pipe/Card; eventual acesso direto é concessão explícita separada. (INV-WORK-01)
- **Notificações** — cada usuário acessa apenas as próprias; o Administrador não visualiza Notificações de terceiros por este módulo (auditoria técnica/administrativa é outra trilha); Convidado apenas as próprias, quando geradas por recursos concedidos. Distribuição/estado lido = OQ-33.
- **Relatórios** — Administrador vê agregados de toda a Organização; Membro vê apenas agregados dos recursos a que tem acesso, e nenhuma contagem org-wide pode revelar recursos restritos (INV-REPORT-01); Convidado sem acesso por padrão. Catálogo/fórmulas = OQ-34/35.
- **Perfil** — todos visualizam apenas o próprio Perfil; edição condicionada à OQ-36; administração de outros usuários ocorre no Painel Administrativo, não no Perfil (NFR-31).

**Pendências que permanecem abertas (não resolvidas por este modelo):** catálogos e operações por módulo — OQ-6/7, OQ-8, OQ-11, OQ-12, OQ-33, OQ-34/35, OQ-36; máquina de estados/movimentação do Card e o modo "Restrito ao próprio" — OQ-14/15 (R2); step-up/reautenticação — Produto + Segurança; aprovação da funcionalidade de comentários (papel Comentador).

### Modelo de Ciclo de Vida e Estados — Pipes, Fases e Cards (Fase 1)

**Descrição:** consolida a resolução de OQ-6, OQ-7, OQ-14, OQ-15, OQ-16 (parte de gatilho) e OQ-17 (parte de Produto) — decisões D2.1–D2.7. Comportamento de Produto; mecanismos (identificadores estáveis, persistência, agendamento, Outbox, formato de campos) = Arquitetura.

**Ciclo de vida do Pipe (D2.1):** o catálogo não é fixo — o seed é conteúdo inicial, não limitação funcional. O Administrador da Organização pode criar, renomear, arquivar e restaurar Pipes. Fora da Fase 1: exclusão definitiva, duplicação e reordenação global. O Admin do Pipe configura Pipes existentes, mas não controla seu ciclo de vida. Arquivamento é reversível, preserva todos os dados e fica bloqueado enquanto houver Cards ativos.

**Gerenciamento de Fases (D2.2):** Administrador da Organização e Admin do Pipe podem criar, renomear, reordenar (intra-Pipe), arquivar e restaurar Fases. Sem exclusão definitiva. Todo Pipe mantém pelo menos uma Fase ativa. Arquivar Fase é reversível, preserva os dados, retira a Fase do fluxo operacional e impede novos Cards ou movimentações para ela; fica bloqueado enquanto houver Cards ativos. Fases arquivadas não participam da ordem operacional; restaurar retorna a Fase ao final da ordem ativa (reordenável depois). Nenhuma Fase migra entre Pipes (RN-030). Reordenação é sempre intra-Pipe (≠ reordenação global de Pipes, fora da Fase 1).

**Estados do Card — ciclo de vida e saúde temporal (D2.3):**
- **Card ativo** = ciclo de vida aberto (estados `ok`/`atrasado`/`vencido`/`expirado`). `finalizado` e `arquivado` são inativos e reversíveis, não terminais definitivos.
- Dois eixos: **ciclo de vida** (por ação, com permissão) e **saúde temporal** (derivada de prazo, automática).
- **Precedência do estado efetivo:** `arquivado > finalizado > expirado > vencido > atrasado > ok`.
- Ciclo de vida: concluir → `finalizado`; arquivar → `arquivado` (reversível); **reabrir** um Card finalizado devolve-o ao ciclo aberto e recalcula sua saúde atual; **restaurar** um Card arquivado devolve-o ao ciclo de vida anterior ao arquivamento — se antes estava aberto, sua saúde é recalculada; se estava finalizado, permanece finalizado até uma ação explícita de reabertura.
- Saúde: `atrasado` após o prazo esperado; `vencido` após o vencimento; `expirado` após a data de corte/validade. Marcos ausentes são ignorados; não há limiares globais arbitrários.

**Marcos temporais — origem e escopo (D2.7):**
- Cada Fase pode definir opcionalmente **prazo esperado**, **vencimento** e **expiração** como **durações relativas à entrada do Card na Fase**, configuradas pelo Administrador da Organização ou Admin do Pipe (configuração estrutural; Membro não configura).
- Um **valor específico do Card** pode substituir individualmente cada marco, **condicionado à aprovação dos Campos Data / Data e hora (OQ-9/R3)**.
- Precedência: **valor do Card › configuração da Fase › ausência do marco**.
- A combinação efetiva respeita **prazo esperado ≤ vencimento ≤ expiração**.
- Ao mudar de Fase, os marcos relativos reiniciam a partir da nova entrada; retornar à Fase constitui nova entrada. Finalizar ou arquivar não reinicia prazos; reabrir/restaurar recalculam a saúde conforme a regra de ciclo de vida acima.
- Cálculo e agendamento da passagem do marco = Arquitetura.

**Movimentação do Card (D2.4):**
- Movem: Administrador da Organização, Admin do Pipe, Membro do Pipe dentro do seu escopo efetivo e usuário com concessão operacional direta que inclua explicitamente a ação Mover Card. Somente leitura, Observador, Comentador e concessão apenas de leitura não permitem movimentação.
- Movimentação livre por padrão entre Fases ativas do mesmo Pipe; não move para/de Fase arquivada; nunca entre Pipes (FR-11).
- Conjunto mínimo de **regras de transição** configuráveis: pares de Fase permitidos/bloqueados, confirmação manual, requisitos de entrada/saída. Campos obrigatórios (OQ-21/R3), Tarefas (OQ-12) e condições de Automação (OQ-24/25/R4) podem bloquear a transição — detalhados em suas rodadas.
- Só Cards de ciclo aberto podem ser movidos; saúde temporal não bloqueia por si só.
- **"Restrito ao próprio"** (modificador de Membro do Pipe): limita a Cards em que é Responsável atual ou tem concessão operacional direta; nunca `creator` nem concessão de leitura.
- Movimentações automáticas respeitam as mesmas regras e não contornam a confirmação humana quando a regra a exigir.

**Evento canônico de movimentação e gatilhos (D2.5 — OQ-16, gatilho):**
- Toda movimentação bem-sucedida gera um **evento canônico de Produto**, independentemente de haver Automação/Notificação configurada.
- Efeitos são **opt-in e independentes** (Automação e/ou Notificação, ou nenhuma). Sem configuração, ocorre apenas a movimentação e seu registro no Histórico.
- O evento existe apenas após a movimentação ser autorizada, cumprir as regras de transição, receber confirmação humana **quando exigida**, e ser concluída/persistida. Movimentação bloqueada, cancelada ou aguardando confirmação não dispara efeitos.
- O evento disponibiliza conceitualmente: Card, Pipe, Fase de origem, Fase de destino, origem (manual/Automação/integração), ator (quando aplicável), data/hora. Formato técnico = Arquitetura.
- A configuração pode selecionar: qualquer movimentação do Pipe; entrada em Fase específica; saída de Fase específica; par origem→destino específico. Filtros/condições adicionais = R4.
- Uma única movimentação lógica produz apenas um disparo lógico por configuração aplicável; retry/idempotência são técnicos e não podem gerar efeitos duplicados visíveis.
- Motor, catálogo de Ações e encadeamento/prevenção de ciclos = R4/AD-18; distribuição de Notificações (alvos/canais/preferências/estado lido) = OQ-33/R6; entrega confiável = Arquitetura.

**Histórico do Card (D2.6 — OQ-17, Produto):**
- Histórico do Card e Auditoria são **trilhas distintas**, embora um mesmo acontecimento **possa gerar registros em ambas**. O Histórico é por item, **append-only**, imutável, não é fonte de autorização; a Auditoria administrativa é outra trilha (RN-170, NFR-16/35/39/40, OQ-38/R5).
- **Núcleo de eventos:** criação; alteração de dados; movimentação/mudança de Fase; ciclo de vida; saúde temporal (apenas mudanças efetivas, sem recálculo sem mudança); atribuição de Responsável; concessão ou revogação direta de acesso ao Card.
- **Condicionais — somente se a respectiva funcionalidade for aprovada:** comentário; arquivo/anexo; Tarefa ou Solicitação; E-mail associado ou enviado; vínculo ou desvínculo de Registro; submissão de Formulário; execução de Automação. Para Automação, o Histórico mostra resumo e referência; os detalhes permanecem na trilha Execuções.
- Alterações feitas em uma única ação de salvar podem ser agrupadas em um único evento, listando os Campos alterados.
- **Campos conceituais por evento:** tipo do evento, resumo legível, data/hora, origem (manual, sistema, Automação ou integração), ator ou iniciador quando aplicável, antes/depois quando aplicável e referência ao recurso ou execução relacionada quando aplicável. Antes/depois respeita a autorização atual do observador e mascara dados sensíveis.
- Estrutura física, versionamento e armazenamento = Arquitetura; falhas técnicas e observabilidade = trilha técnica; retenção, anonimização e exclusão legal = Governança/LGPD + Arquitetura.

**Pendências que permanecem abertas (não resolvidas por este modelo):** catálogo de tipos de campo, incl. Data / Data e hora (OQ-9/R3 — condiciona o override de marco por Card); obrigatoriedade de Formulário de Fase para avançar (OQ-21/R3); Tarefas como requisito de transição (OQ-12); catálogo do motor de Automação e encadeamento (OQ-24/25/R4); distribuição de Notificações (OQ-33/R6).

### Modelo de Formulários, Campos, Databases e Registros (Fase 1)

**Descrição:** consolida a resolução (parte de Produto) de OQ-8, OQ-9, OQ-10, OQ-18, OQ-19, OQ-20, OQ-21, OQ-22, OQ-23 e OQ-47 — decisões D3.1–D3.6. Mecanismos (schema físico, persistência, versionamento, atomicidade, storage, agendamento) = Arquitetura; retenção/anonimização/exclusão legal = Governança/LGPD + Arquitetura.

**Catálogo e estrutura de Campo (D3.1):**
- Catálogo oficial (12 tipos): Texto curto, Texto longo, Número, Seleção única, Seleção múltipla, Sim/Não, Data, Data e hora, E-mail, Telefone, URL, Arquivo.
- Estrutura conceitual do Campo: identidade estável, rótulo, tipo, ajuda opcional, configuração do tipo, valor padrão, posição, estado ativo/arquivado. Opções de Seleção têm identidade estável.
- Catálogo comum aos três contextos (inicial/Fase/Database), instâncias independentes (INV-FORM-01). Obrigatoriedade pertence ao uso do Campo no contexto, não ao tipo global.
- Data e Data e hora sustentam o override temporal de D2.7. "Referência a Registro/Card" fica fora do catálogo (D3.6). Fora da Fase 1: regras condicionais entre campos, validação programável, exibição dinâmica.

**Ciclo dos Formulários e publicação (D3.2):**
- Estados: rascunho → salvar → pré-visualizar (simula sem submissão real) → publicar (versão ativa) → despublicar (bloqueia novas submissões, preserva config/versões/dados). Só a versão publicada recebe submissões.
- Após publicar: novas edições vão para novo rascunho; a versão publicada permanece inalterada até nova publicação; publicar de novo substitui a versão ativa; submissões já iniciadas permanecem vinculadas à versão de origem; despublicar bloqueia novas sessões mas permite concluir as já iniciadas.
- Publicar/Despublicar são ações nomeadas explícitas (não em Editar). Configuram/publicam: inicial e Fase → Admin da Org / Admin do Pipe; Database → Admin da Org / Admin do Database.

**Acesso público do Formulário inicial (D3.2):**
- Só o Formulário inicial pode ser público; Fase e Database nunca; público opcional, habilitado por Formulário. O ator externo não recebe Membership/papel/acesso ao CRM; a submissão não concede acesso a Pipe/Card/dados internos; vê apenas confirmação. Despublicar/revogar bloqueia novas submissões; anteriores preservadas.
- Guardrails obrigatórios de Produto: aviso de privacidade; consentimento quando aplicável; identificação da Organização; proteção contra abuso/automação; limites de envio; tratamento seguro de Campos Arquivo; mensagens que não revelem dados internos nem a existência de outros registros. Rate limit/CAPTCHA/análise de arquivo = Segurança/Arquitetura.
- "Apenas formulário inicial": modo interno autenticado (ver/submeter/confirmar; sem Kanban/Cards/config/métricas/Histórico). O ator externo não usa esse modo — usa canal público controlado.

**Submissão do Formulário inicial e criação de Card (D3.3):**
- Toda submissão interna válida e toda submissão pública configurada para criação direta criam um novo Card, na primeira Fase ativa, com dados capturados, referência ao Formulário e à versão publicada, e evento de criação no Histórico. Quando o Formulário público estiver configurado para revisão, a submissão não cria Card até ser aprovada. O Formulário inicial nunca preenche um Card existente.
- Submissão interna cria o Card imediatamente; uma submissão lógica gera no máximo um Card (retry não duplica); deduplicação por Campo não é automática (futuro: regra/Automação).
- Submissão pública configurável por Formulário: revisão antes da criação (padrão) ou criação direta (explícita). A triagem não é estado do Card — pertence ao ciclo da Submissão pública (pendente de revisão / aprovada / rejeitada / convertida em Card). Revisam: Admin da Org, Admin do Pipe, e Membro do Pipe só com a ação "Revisar submissões públicas". Aprovar cria um único Card (origem registrada); rejeitar não cria Card e preserva a submissão conforme Governança/LGPD.

**Formulário de Fase (D3.3):**
- Configurável como informativo/opcional, requisito de entrada ou de saída (Admin da Org / Admin do Pipe). Campos obrigatórios não preenchidos bloqueiam a transição: Card permanece na Fase, requisitos faltantes exibidos, nenhum evento de movimentação, nenhuma Automação/Notificação de movimentação, valores informados preservados.
- Salvar não movimenta automaticamente, salvo em ação explícita de transição; preenchimento+movimentação juntos só concluem após requisitos, sem descartar dados válidos (transacional = Arquitetura; UX = ação única coerente).
- Valores de Fase persistem no Card após a saída, visíveis a autorizados, não descartados ao mover/finalizar/arquivar/reabrir, com referência ao Campo/contexto. Fora da Fase de origem: somente leitura no fluxo normal; correção posterior exige ação explícita autorizada e gera evento antes/depois (sem sobrescrita silenciosa); retorno à Fase preserva a rastreabilidade da nova passagem.

**Databases (D3.4):**
- Ciclo de vida (Admin da Org): criar/renomear/arquivar/restaurar. Fora da Fase 1: exclusão definitiva, duplicação, transferência entre Organizações.
- Arquivar Database (reversível): bloqueia novos Registros/submissões/vínculos; existentes preservados e consultáveis em somente leitura; referências não quebradas; vai para arquivados; não é bloqueado por Registros vinculados a Cards. Restaurar preserva identidade/Registros/Campos/vínculos.
- Papéis: Admin do Database (configura/publica/administra estrutura), Membro do Database (cria/edita Registros), Somente leitura (consulta). Admin do Database não controla ciclo de vida nem Memberships e não concede poderes fora do Database.
- Acesso por concessão explícita por Database: Admin da Org acessa todos; Membro/Convidado só onde receberam papel; ausência de papel = sem acesso; no máximo um papel efetivo por Database; papel de Database nunca supera o da Organização. Convidado só recebe Somente leitura em Database na Fase 1.
- Navegação uniforme (Databases ativos): paginação, ordenação por Campo, filtros por tipo, indicação de filtros ativos, limpar filtros, estados (carregando/vazio/sem permissão). Filtros mínimos: combinação por E; texto contém/igual; número e datas igual/maior/menor/intervalo; seleção contém opção; Sim/Não; Arquivo possui/não possui. Fora da Fase 1: grupos E/OU complexos, filtros salvos, visualizações personalizadas, fórmulas, agregações avançadas. Nenhuma consulta revela contagens de Registros inacessíveis.
- Edge behaviors de Campo (sem perda silenciosa): mudança de tipo permitida somente quando não houver valores salvos nem submissões vinculadas ao Campo; com valores ou submissões existentes, a alteração direta fica bloqueada e deve ser criado um novo Campo, preservando o anterior; renomear rótulo/ajuda/exibição não altera identidade. Arquivar Campo é reversível e preserva valores (somente leitura), bloqueado enquanto o Campo for obrigatório em Formulário publicado, requisito de Fase ou marco temporal (D2.7). Opções: removíveis só se nunca publicadas e nunca usadas; após publicação/uso, apenas arquiváveis (valores antigos mantêm o rótulo; restaurar preserva identidade). Alterações de validação valem para novas submissões/edições, sem invalidar histórico silenciosamente.

**Registros (D3.5):**
- Estados ativo/arquivado; operações criar/visualizar/editar/arquivar/restaurar; sem exclusão definitiva pelo usuário. Registro pertence a exatamente um Database, não transferível.
- Criação por: Formulário de Database; ação "Novo Registro" (mesmos Campos/validações da versão publicada); Automação (se aprovada em R4); integração (futuro). O Formulário de Database não é a única forma e permanece autenticado. Uma ação lógica cria no máximo um Registro.
- Criam/editam: Admin da Org, Admin do Database, Membro do Database; Somente leitura consulta. Operações respeitam papel da Org + papel do Database + estado do Database + estado do Registro + autorização do Campo quando aplicável.
- Arquivar (reversível): sai das consultas ativas, sem edição/novos vínculos no fluxo normal; dados/arquivos/vínculos preservados e consultáveis; não bloqueado por vínculos. Restaurar preserva identidade/valores/arquivos/Histórico/vínculos.
- Histórico do Registro (append-only, só a autorizados): criação, alteração de valores, arquivamento, restauração, inclusão/substituição/remoção lógica de arquivo, vínculo/desvínculo com Card. Evento: tipo, resumo, ator/iniciador, origem, data/hora, antes/depois, referência ao recurso. Não substitui a Auditoria.

**Arquivos (D3.5 — OQ-47):**
- Campo Arquivo: único ou múltiplos; mantém identidade, nome original, tipo, tamanho, estado, referência à submissão/alteração. Substituir arquivo único não apaga silenciosamente o anterior e gera evento.
- Anexo geral (associado ao recurso, não valor de Campo): aprovado para Card e Registro, e — a partir de R5/D5.2 — também para Tarefa e Solicitação. Não incluído em E-mail (módulo próprio), Pipe, Fase, Database-catálogo. Formulário público recebe arquivo só via Campo Arquivo publicado; não há anexo geral público.
- Operações: enviar/visualizar/baixar/substituir (arquivo único)/adicionar/remover logicamente. Remoção pelo usuário retira da visualização e gera evento, mas não é exclusão física imediata (respeita retenção/backup/LGPD). Em Card/Registro arquivado, arquivos existentes são visualizáveis/baixáveis; uploads/substituições/remoções bloqueados no fluxo normal.
- Permissão: o arquivo herda a autorização do recurso (ver/baixar = leitura; enviar/substituir/remover = edição); acesso a um recurso não libera arquivos de recursos relacionados; sem links públicos permanentes; Histórico/metadados não revelam arquivos não autorizados.
- Tipos/limites: bloquear executáveis/scripts/formatos inseguros; lista segura por Produto+Segurança+Arquitetura; tamanho máximo por arquivo e limite total por recurso = configuração operacional global da Plataforma, exibidos antes do envio; limites por Org/Formulário fora da Fase 1. Valores numéricos fixados antes das Stories de upload (não reabrem o comportamento funcional). Arquivos entram no inventário LGPD; storage/validação/quarentena/antivírus/checksum/entrega segura = Arquitetura/Segurança.

**Relacionamentos (D3.6):**
- Card↔Registro: N—N; o mesmo par não se vincula mais de uma vez; vínculo explícito, não funde nem copia dados, só dentro da mesma Organização. Vincular/desvincular exige edição no Card + visualização no Registro + a ação de relacionamento; o vínculo não concede acesso ao recurso relacionado (a interface pode indicar "referência restrita" sem revelar dados). Gera evento nos Históricos do Card e do Registro; desvincular só encerra o relacionamento. Recursos arquivados preservam vínculos; novos vínculos exigem recursos ativos.
- Tarefa↔Card: Tarefa liga-se opcionalmente a no máximo um Card; um Card pode ter várias Tarefas; a Tarefa pode existir só no Pipe. Quando ligada, o Pipe da Tarefa é o do Card; o vínculo e a atribuição não concedem acesso ao Card. Ciclo de vida = OQ-12/R5.
- E-mail↔Card: mensagem associa-se opcionalmente a no máximo um Card; um Card pode ter várias mensagens; o mesmo E-mail não é associado a vários Cards na Fase 1; contexto de Pipe compatível; o vínculo não concede acesso a anexos/conteúdo sem autorização. Envio/recebimento/thread/anexos = OQ-28/29/R6.
- Regras comuns: relacionamentos opcionais; isolamento por Organização; autorização de ambos; sem acesso implícito; identidade estável; sem exclusão em cascata; sem transferência de ownership; sem cópia automática de dados.

**Pendências que permanecem abertas:** valores numéricos de limites de arquivo (config operacional obrigatória antes das Stories de upload); OQ-13 (Templates de E-mail) → R6 — módulo de E-mails (a R4 apenas referencia Templates como dependência/recurso de uma Ação de Automação; não decide seu ciclo de vida); comportamento completo de Tarefas (OQ-12/R5) e E-mails (OQ-28/29/R6); mecanismos (schema físico, persistência, versionamento, atomicidade, storage, `orgId`/`databaseId`/`recordId` fortes) = Arquitetura; retenção/anonimização/exclusão legal e residência = Governança/LGPD + Arquitetura.

### Modelo de Automações (Fase 1)

**Descrição:** consolida a resolução (parte de Produto) de OQ-24, OQ-25, OQ-11 e OQ-27 — decisões D4.1–D4.4. Implementação/validação do motor, persistência, executionChainId, snapshot/versionamento e limites numéricos = Arquitetura + QA; mecanismo de referência Ação↔Template e prevenção de ciclos = Arquitetura (OQ-26); ciclo de vida de Template de E-mail = R6. Non-Goals do catálogo de Ações da Fase 1: chamada HTTP externa, Webhook de saída, chamada de API externa e MCP.

**Catálogo de Eventos, Condições e Ações (D4.1):**
- Eventos (opt-in; emitidos só após mudança persistida com sucesso — tentativas/reenvios/updates sem mudança real não geram Evento): Card criado (origem interna ou submissão pública aprovada — triagem não dispara); Card movido (entrada/saída de Fase, par origem→destino, qualquer movimentação do Pipe); mudança efetiva de saúde (atrasado/vencido/expirado); Card finalizado/arquivado/reaberto/restaurado; Responsável atribuído/alterado; valor de Campo do Card alterado; vínculo Card↔Registro criado/removido; Registro criado/arquivado/restaurado; valor de Campo do Registro alterado; submissão de Formulário de Fase; Tarefa criada/concluída/atrasada (habilitados em R5/D5.2); E-mail enviado (habilitado em R6/D6.5 — E-mail recebido permanece indisponível na Fase 1, sem inbound).
- Condições (opcionais): domínios Card, Campo/valor, prazo/marco, relacionamento, Fase; operadores por tipo (D3.4); combinação apenas E/AND na Fase 1; sem Condição, a Ação executa direto.
- Ações: Card — mover, atribuir/alterar Responsável, alterar valor de Campo, finalizar, arquivar, adicionar Tarefa (habilitado em R5/D5.2); Registro — criar, editar (alvo determinístico: o Registro que originou o Evento, um Registro vinculado ao Card, ou um definido explicitamente na config; sem atualização ampla/indeterminada); E-mail — enviar usando Template (envio real outbound confirmado em R6/D6.5); Notificação — gerar (distribuição = OQ-33/R6); IA como Ação (abaixo).
- Guardrails: nenhuma Ação contorna confirmação humana exigida para qualquer Ação sensível (mover/finalizar/arquivar/alterar dados protegidos, não só transições); Ações respeitam a permissão efetiva do principal Automação (AD-9), o isolamento por Organização (NFR-3), a validação de Campo e a LGPD (NFR-8); Ação que emite Evento é rastreável e compatível com prevenção de ciclos.

**Comportamento do motor (D4.2):**
- Avalia apenas Automações ativas inscritas no Evento; Condição avaliada sobre o estado resultante da alteração que originou o Evento; sem Condição, Ação direta.
- Cada Ação revalida, no momento da execução, permissões, regras de negócio, requisitos de transição e existência do alvo — uma Condição verdadeira não garante Ação válida.
- Dentro de uma Automação, as Ações executam na ordem configurada; a ordem entre Automações diferentes não é contrato; Automações são independentes.
- Encadeamento limitado permitido, com prevenção de ciclos (executionChainId, profundidade — Arquitetura/AD-18).
- Idempotência: uma ocorrência lógica de Evento gera no máximo um disparo lógico por Automação; retry/reprocessamento não produzem efeitos duplicados visíveis.
- Falha (best-effort): efeitos já concluídos permanecem, sem rollback automático; a Ação falha é registrada; as Ações posteriores da mesma Automação ficam não executadas/bloqueadas por falha anterior (a Fase 1 não identifica automaticamente "Ações independentes"); outras Automações do mesmo Evento continuam.
- Confirmação humana não é falha técnica: a Ação fica "aguardando confirmação"/"bloqueada por confirmação humana", conforme o fluxo do recurso.
- Conflitos: múltiplas Automações alterando o mesmo recurso a partir do mesmo Evento não garantem ordem nem valor final; todas passam pelas validações do domínio e ficam rastreáveis.
- Toda avaliação (disparo, Condição, execução/não-execução, falha) é rastreável na trilha Execuções, sanitizada (sem payloads/segredos/prompts). Falhas e estados da execução aparecem obrigatoriamente na trilha Execuções. A geração de alertas, seus canais e destinatários permanecem em OQ-33/R6.
- Implementação/validação, retries/backoff/timeout, profundidade máxima e retenção das Execuções = Arquitetura + QA (definidos antes da implementação).

**Ciclo de vida da Automação (D4.3):**
- Operações: criar, editar, ativar, desativar, arquivar, restaurar, duplicar. Sem exclusão definitiva.
- Administram todo o ciclo de vida: Administrador da Organização e Admin do Pipe correspondente. O Super Admin da Plataforma não gerencia Automações de uma Organização. Convidado sem acesso.
- Estados: ativa (avaliada), inativa (config preservada, não avaliada), arquivada (fora de uso, reversível, preserva Execuções). Só a ativa dispara.
- Editar Automação ativa é permitido; mudanças aplicam-se só a novas avaliações; execuções já iniciadas permanecem vinculadas à configuração vigente quando disparadas; a UX alerta sobre edição de Automação ativa (snapshot/versionamento = Arquitetura). Ativar/editar não reprocessa Eventos passados.
- Desativar/arquivar impede novas avaliações assim que efetivado; não cancela execuções já iniciadas; não reverte efeitos; preserva a trilha Execuções. Arquivar Automação ativa implica desativação automática. Restaurar volta sempre como inativa (exige ativação explícita).
- Duplicar cria nova identidade e novo nome editável; copia apenas a configuração (não o histórico de Execuções); nasce inativa; passa novamente pelas validações de referências/permissões/recursos antes da ativação.
- Membro do Pipe: acesso somente leitura à configuração, ao estado e aos resultados/Execuções relacionados a recursos que já pode acessar; visualização sanitizada.
- Rastreabilidade administrativa: criar/editar/ativar/desativar/arquivar/restaurar/duplicar registram ator, data e operação.

**IA no contexto de Automações (D4.4 — OQ-27):**
- IA como Ação e IA auxiliar de configuração são papéis distintos.
- IA como Ação (tempo de execução) pode produzir conteúdo, classificação ou sugestão como saída; qualquer alteração do sistema (mover Card, alterar Campo, criar Registro, enviar E-mail, criar Tarefa etc.) é efeito operacional e não ocorre por si só — uma classificação da IA não grava valor automaticamente. Saída que alimente alteração operacional gera um comando proposto, sujeito ao fluxo separado de aprovação (AD-20/NFR-17); não pode ser encadeada automaticamente a outra Ação para contornar a aprovação.
- Comando proposto tem estado explícito (aguardando aprovação / aprovado / rejeitado / expirado ou inválido quando o contexto mudou) e permanece sem efeito enquanto pendente (mecanismo/limites temporais = Arquitetura/Stories).
- Só aprova quem tem permissão para a operação proposta; a aprovação não amplia poderes; a execução revalida permissão atual do aprovador, escopo do principal Automação, regras de negócio e estado/existência do alvo. Se o contexto mudou desde a geração, o comando pode ser bloqueado como inválido, sem efeito parcial ou silencioso.
- Fail-closed para efeitos automatizados: falha/timeout/indisponibilidade da IA não produz comando nem efeito; o fluxo manual equivalente permanece disponível.
- A trilha distingue: geração da saída pela IA, criação do comando proposto, decisão humana, tentativa de execução, resultado final. Prompts completos, segredos e dados pessoais desnecessários ficam fora dos registros visíveis (NFR-11/13).
- IA auxiliar de configuração: reconhecida como assistiva (sugere config; nada é ativado automaticamente; o usuário revisa/edita/aprova e a config passa por todas as validações). Disponibilidade concreta, interface, geração por linguagem natural e inclusão no MVP dependem de OQ-30/OQ-31 (R6) — sem compromisso nesta rodada.

**Pendências que permanecem abertas:** ciclo de vida de Template de E-mail (OQ-13/R6); disponibilidade do assistente de IA / AI Builder (OQ-30/OQ-31/R6); modelo/região/retenção da IA (OQ-32/Arquitetura+Jurídico); mecanismo de referência Ação↔Template e prevenção de ciclos (OQ-26/Arquitetura); limites numéricos do motor (profundidade, tentativas, timeout, retenção — Arquitetura/Stories); distribuição de alertas/Notificações (OQ-33/R6).

### Modelo de Administração, Membros e Trabalho Operacional (Fase 1)

**Descrição:** consolida a resolução (parte de Produto) de OQ-37, OQ-12 e OQ-38 — decisões D5.1–D5.3, sobre o modelo AD-7 (Account global · Membership por Org · papel único · activeOrganizationId). Mecanismos (token de convite, revogação de sessão, imutabilidade, cálculo de prazo, referências) = Arquitetura; retenção/anonimização = Governança/LGPD + Arquitetura. Preserva o isolamento Plataforma × Organização.

**Membros — Convite, Membership e sessão (D5.1):**
- Três conceitos distintos: Convite (pendente/aceito/expirado/cancelado); Membership (ativa/suspensa/encerrada); revogação de sessão = operação de segurança, não estado da Membership.
- Convite: o Administrador da Organização convida por e-mail com papel inicial; expira por prazo; reenviar atua sobre o existente (invalida o token anterior); cancelar invalida o pendente. E-mail com Account existente → permanece apenas o Convite pendente; ao aceitar, é criada e ativada a Membership naquela Organização. Para usuário novo, o aceite cria a Account e, em seguida, a Membership ativa. Não existe estado "Membership pendente".
- Aceite: por Account autenticada com o mesmo e-mail verificado do convite; o convite mostra a Organização e o papel; o aceite nunca altera outra Membership em outra Organização.
- Papel: um por Membership; alterar papel é operação sensível (NFR-38), auditada, invalida abilities em cache imediatamente (AD-9).
- Último Administrador ativo: só Memberships ativas com papel Administrador contam (convite pendente não conta); não pode ser removido, suspenso, rebaixado nem sair voluntariamente.
- Suspensão: bloqueia temporariamente todo o acesso à Organização e preserva o papel e o histórico da Membership; as responsabilidades operacionais seguem as regras de cada recurso — em Tarefas e Solicitações, a atribuição é removida e o item fica sinalizado para reatribuição, conforme D5.2. Não permite novo convite ao mesmo e-mail enquanto suspensa; retomada por reativação administrativa (não novo aceite).
- Remoção: encerra o acesso, preserva o registro histórico; convite futuro concede novo acesso sem apagar o ciclo anterior.
- Multi-org: N Memberships por Account (uma por Org), independentes; remoção/suspensão em uma Org não afeta as outras. Se a Org afetada estiver em activeOrganizationId, o contexto é limpo e o usuário vai ao seletor ou ao estado sem acesso — sem troca silenciosa.
- Saída voluntária: encerra a própria Membership (exceto último Administrador).
- Recursos do membro removido: propriedade e histórico permanecem na Organização (AD-10); concessões diretas são revogadas; atribuições operacionais ficam sem responsável e sinalizadas; quando uma regra exigir responsável ativo, a remoção exige reatribuição antes de concluir; `creator` permanece como metadado.
- Convites conflitantes: membro ativo → bloqueado; suspenso → reativar (não convidar); pendente → reenviar/cancelar o existente; encerrada → novo convite permitido; Membership em outra Org não gera conflito.
- Roster: o Administrador vê convites pendentes e membros ativos/suspensos/encerrados conforme autorização; o Membro vê apenas o básico dos ativos (nome/avatar/papel), sem e-mail/histórico administrativo/detalhes de segurança; o Convidado não acessa o roster, mas pode ver a identidade de participantes vinculados aos recursos que já acessa.
- Sessões/permissões: rebaixamento, suspensão e remoção revogam o acesso à Organização afetada; as sessões e Memberships em outras Organizações permanecem intactas. Mecanismos (token, revogação, NFR-38) = Arquitetura.
- Super Admin da Plataforma não administra membros internos como operação comum; suporte/impersonation ficam fora (OQ-39/futuro, com segurança/auditoria explícitas).

**Tarefas e Solicitações (D5.2):**
- Tarefa: operações criar/editar/atribuir/concluir/reabrir/arquivar/restaurar; estados aberta ↔ concluída; prazo opcional; "atrasada" é condição derivada automaticamente (aberta + prazo passou), nunca manual nem persistente, e emite Evento funcional para Automações ao ocorrer.
- Solicitação: operações criar/editar/atribuir/resolver/reabrir/arquivar/restaurar; estados aberta ↔ resolvida; tem Responsável (quem conduz operacionalmente, não necessariamente quem criou).
- Sem exclusão definitiva (arquivamento reversível). Item arquivado não é editado/concluído/resolvido/reaberto antes de restaurar; restaurar recupera o estado de ciclo de vida anterior ao arquivamento, recalcula imediatamente a condição "atrasada" com base no prazo atual e não restaura automaticamente um Responsável que tenha deixado de ser elegível; efeitos e histórico preservados. Reabrir preserva a conclusão/resolução anterior no histórico e recalcula o atraso.
- Associação: obrigatória a um Pipe (INV-WORK-02); opcional a um Card do mesmo Pipe (D3.6, 0..1).
- Escopo (INV-WORK-01, D1.6): Administrador da Org e Admin do Pipe operam os itens do escopo; Membro do Pipe cria/opera conforme suas permissões; Somente leitura, Visão restrita e Apenas formulário inicial não recebem capacidade operacional por padrão; Convidado apenas visualiza itens vinculados a recursos concedidos.
- Responsável elegível: só Membership ativa com acesso ao Pipe; ser Responsável concede acesso operacional apenas à própria Tarefa/Solicitação dentro do Pipe já acessível, sem acesso implícito a outros recursos/Campos/histórico restrito do Card; se removido/suspenso, o item fica sem responsável e sinalizado.
- Anexos: Tarefas e Solicitações aceitam anexo geral, sob as mesmas regras de segurança/autorização/retenção/upload (D3.5); limites numéricos pendentes antes das Stories.
- Rastreabilidade: criar/editar/atribuir/concluir/resolver/reabrir/arquivar/restaurar, mudança/remoção de prazo, mudança de vínculo com Card e transição automática para "atrasada"; alterações derivadas identificam o sistema como origem.

**Financeiro, Estatísticas e Auditoria (D5.3):**
- Financeiro: totalmente ausente na Fase 1 — sem item de menu, rota, placeholder, tela vazia, Épico ou Story. Cobrança/planos/faturamento exigem rodada própria futura.
- Estatísticas: sem módulo implícito — a Fase 1 tem apenas o Dashboard operacional e os Relatórios (catálogo em OQ-34/35/R6); o nome "Estatísticas" não aparece na interface enquanto não houver finalidade e catálogo próprios.
- Auditoria administrativa: trilha append-only no uso operacional (INV-AUDIT-01), não editável nem removível por usuários pela aplicação, distinta do Histórico e dos logs técnicos; retenção, anonimização e descarte controlado por Governança/LGPD são exceções permitidas, auditáveis e implementadas pela Arquitetura.
  - Catálogo de eventos auditáveis: membros/acesso (convite emitido/aceito/expirado/reenviado/cancelado; Membership ativada/papel alterado/suspensa/reativada/removida/saída; concessão/revogação direta de Card; atribuição/alteração/remoção de papel de Pipe/Database; bloqueio de operação sobre o último Administrador ativo, identificando a recusa pela regra de proteção); segurança de conta em nível administrativo (revogação de sessões decorrente de alterações administrativas de Membership ou papel; estas também podem gerar registros na trilha de segurança) — alterações self-service de e-mail e senha, recuperação de senha e seus eventos de sessão pertencem à trilha de segurança definida em D6.1/D6.2, não à Auditoria administrativa geral; configuração estrutural (ciclos administrativos relevantes de Formulário — criar/editar config/publicar/despublicar/arquivar/restaurar — e o mesmo princípio a Pipe, Fase, Database, Campo e Automação).
  - Cada evento: Organização, ator e origem (distinguindo usuário/sistema/processo automatizado — expiração de convite e transição derivada = sistema), alvo, operação, antes/depois com minimização (só atributos relevantes alterados, nunca senha/token/sessão/segredo/payload bruto/conteúdo pessoal desnecessário), data/hora.
  - Separação de logs: tentativas de login, falhas técnicas, exceções e infraestrutura ficam nos logs técnicos/de segurança; a Auditoria administrativa registra operações de gestão e mudanças relevantes de configuração/acesso.
  - Acesso: somente o Administrador da Organização; Admin do Pipe/Membro/Convidado não acessam; o Super Admin da Plataforma não tem acesso operacional comum; suporte excepcional fica fora.

**Pendências que permanecem abertas:** limites numéricos de anexos (antes das Stories); retenção/exportação/anonimização/descarte/proteção criptográfica da Auditoria (Governança/Arquitetura, antes das Stories de Auditoria; cruza OQ-40/42); catálogo de Estatísticas/Relatórios e distinção Dashboard×Relatórios (OQ-34/35/R6); mecanismos (token de convite, revogação de sessão, imutabilidade, cálculo de prazo/"atrasada", referências) = Arquitetura.

### Modelo de Conta, Comunicação, Indicadores e IA (Fase 1)

**Descrição:** consolida a resolução (parte de Produto) de OQ-48, OQ-36, OQ-33, OQ-34, OQ-35, OQ-28, OQ-13, OQ-30 e OQ-31 — decisões D6.1–D6.6 (OQ-29 confirmada em D3.6). Mecanismos (token/rate limit/hashing, provedor de e-mail, tempo real, agregação, orquestração de IA) = Arquitetura/Segurança; região/retenção/fornecedor da IA = OQ-32/Arquitetura+Jurídico.

**Recuperação de senha (D6.1):**
- Solicitação por e-mail com **resposta neutra completa** (mesma mensagem/comportamento para conta existente/inexistente/convite sem Account; sem sinais de tempo/entrega — mecanismos = Segurança).
- Link de **uso único com expiração**, associado à Account e à finalidade; nova solicitação válida invalida as anteriores; alterar o e-mail durante a pendência também invalida o link.
- Ao redefinir: link consumido; **todas as sessões e abilities da Account revogadas**; usuário direcionado ao login (nenhuma sessão criada pelo fluxo); notificação de segurança ao e-mail (sem senha/token).
- Escopo **global da Account**: não cria/ativa/reativa/altera Memberships; vale para todas as Orgs; não altera papéis/activeOrganizationId. Convite pendente sem Account: recuperação não cria conta (resposta neutra) — o caminho é o aceite.
- **Política única de senha** (criação/alteração/recuperação); requisitos/bloqueio de senhas comprometidas/histórico = Produto+Segurança. Sem acesso administrativo (Admin da Org e Super Admin não veem nem redefinem senha de terceiros). Registro de segurança sanitizado; falha segura sem expor motivo técnico. Token/rate limit/hashing/anti-abuso = Segurança/Arquitetura.

**Perfil e preferências (D6.2):**
- Dados **globais da Account**: nome, avatar, e-mail, senha (refletem em todas as Orgs). Papel da Org e papéis/acessos de Pipe = Memberships, não editados pelo Perfil. Perfil acessível mesmo sem Org/Membership ativa (sem exibir papel atual/Pipes relacionados nesse caso).
- Edição de baixa sensibilidade: nome, avatar (enviar/substituir/remover), preferências. **Senha** (autenticada): step-up; política de D6.1; mantém a sessão atual e revoga as demais; invalida links de recuperação; notificação de segurança.
- **E-mail em duas etapas**: solicitar não altera; novo endereço verificado; até a confirmação o atual vale para login; colisão bloqueada com mensagem neutra. Confirmação: atualiza o login global; não altera Memberships/papéis/recursos; invalida links de recuperação; revoga sessões antigas preservando só a que concluiu o fluxo; confirma ao novo e avisa ao anterior. Convites pendentes ao e-mail anterior não migram automaticamente.
- **"Pipes relacionados"**: só Pipes da Org atual acessíveis (nome, estado, papel/nível efetivo), somente leitura, sem conceder acesso. Papéis: papel da Org atual + papel por Pipe; não exibe papel de Plataforma nem agrega outras Orgs. Preferências mínimas sem módulo vazio (Notificação = D6.3; idioma/fuso/aparência só com requisito confirmado).
- Rastreabilidade: e-mail/senha na trilha de segurança; nome/avatar registro funcional mínimo; nunca senha/token/link/conteúdo bruto. Sem administração de terceiros pelo Perfil.

**Notificações (D6.3):**
- Pessoais, **in-app** na Fase 1; por Organização (badge/popover/página só da Org ativa, sem agregação silenciosa). O módulo de Notificações de FR-29/FR-30 é exclusivamente in-app na Fase 1. E-mails transacionais de segurança de D6.1/D6.2 e e-mails outbound do CRM de D6.5 são capacidades separadas e não constituem canais externos deste módulo.
- Instância pessoal por destinatário (leitura/preferências independentes). Geração só por **mudança efetiva** (sem duplicação por reprocessamento; nova transição pode gerar nova).
- Catálogo: designação como Responsável (Card/Tarefa/Solicitação) e comando de IA aguardando aprovação = **obrigatórios** (não totalmente desativáveis); Tarefa atrasada e notificações por Automação = liga/desliga por tipo. Comentário/Menção permanece condicional à aprovação da funcionalidade. E-mail não gera um tipo nativo automático de Notificação; uma Notificação relacionada a E-mail somente é criada por Automação ou regra explicitamente configurada.
- Destinatários da Ação de Notificação (Automação): Responsável atual do Card, da Tarefa/Solicitação; membro ativo selecionado com acesso legítimo; Admin do Pipe. Sem acesso → não recebe conteúdo restrito. Ao abrir, autorização revalidada; se perdeu acesso, mostra só indisponibilidade.
- Leitura: marcar individual; abrir com sucesso pode marcar lida; "marcar todas" atua sobre todas as não lidas da Org ativa. Consistência badge/popover/página (INV-NOTIF-01); tempo real best-effort com reconciliação. Popover = recentes + ações rápidas; página = histórico + filtros. Preferências afetam só novas. Comando de IA só a quem está apto a aprovar (revalidação na aprovação). Retenção/expurgo = Governança/Arquitetura; usuário gerencia leitura, não exclui registros. Entrega/tempo real = Arquitetura.

**Dashboard e Relatórios (D6.4):**
- Propósitos distintos: Dashboard = visão operacional imediata (escopo autorizado; "Meus itens" iniciam as listas, com opção "Todos que posso acessar"); Relatórios = indicadores agregados com filtros. Fonte pode ser compartilhada; Relatórios não é "Dashboard com filtros".
- Catálogo enxuto e real (RN-131): Pipes autorizados; **total de Cards ativos/não finalizados no escopo autorizado**; Cards por saúde canônica (D2.3); Cards por Fase; Cards atualmente finalizados; Tarefas (abertas no prazo/atrasadas/concluídas); Solicitações (abertas/resolvidas). O total operacional não mistura Cards ativos, finalizados ou arquivados. Sem "Card pendente" (usar ativo/não finalizado). Dashboard usa subconjunto operacional; Relatórios o catálogo agregado completo.
- Sem dupla contagem (Card ativo em uma única categoria de saúde; "atrasada" não somada em "aberta"). Finalização por estado atual (reabrir deixa de contar); com período, usar a data da transição vigente mais recente. Filtro de período só em indicadores com referência temporal (estado atual não vira "criados no período"; base temporal visível). Arquivados fora por padrão; "incluir arquivados" explícito. Filtros Pipe/Fase/saúde-estado/período/Responsável quando aplicáveis, por E/AND, respeitando escopo autorizado (INV-REPORT-01/02); salvos/construtor/personalizados fora.
- Ordenação do Dashboard: Cards por severidade canônica → prazo/marco mais crítico; Tarefas atrasadas → prazo mais próximo → sem prazo; Solicitações abertas mais antigas primeiro; empates estáveis (UX/Arquitetura); sem pontuação opaca nem priorização por IA. Drill-down revalida autorização (soma e itens = mesmo escopo). Zero × falha distinguíveis (NFR-27). Não recria "Estatísticas". Fonte/agregação/cache/atualização/desempenho = Arquitetura (AD-10).

**E-mail e Templates (D6.5):**
- **Outbound real** (envio via provedor), **sem recebimento/sincronização**; Fase 1 = Composer + histórico de enviados + visualização por Card; caixa não é operacional (limitação explícita; respostas externas não aparecem). Comunicação operacional; campanhas/newsletter/rastreamento/unsubscribe/marketing fora.
- Estados do envio: rascunho, em processamento, enviado, falhou. "Enviado" = provedor aceitou; entrega/bounce/leitura só com suporte real, sem inferência. Remetente/destinatário determinísticos (manual = remetente autorizado + destinatário explícito; Automação define a origem — Campo de e-mail do Card/Registro ou endereço fixo autorizado; ausente/inválido/ambíguo bloqueia e registra falha; sem envios amplos).
- Associação a Card (D3.6): manual opcional; por Automação no contexto de um Card → automática; vínculo não concede acesso.
- Templates da Organização: Admin da Org cria/edita/arquiva/restaura; Admin do Pipe só seleciona um Template ao configurar Automação; Membro/Convidado não gerenciam; arquivado não usável em novos envios. Não arquivar Template referenciado por Automação ativa até remover/substituir; Automação inativa mantém referência histórica mas falha na validação antes de reativar se indisponível (mecanismo = OQ-26/Arquitetura).
- Estrutura: nome, assunto, corpo, **variáveis** (catálogo explícito/permitido; obrigatória sem valor bloqueia; autorização revalidada na resolução; permissão interna não substitui base legal para dado pessoal ao externo). Enviados preservam assunto/corpo/variáveis resolvidas/anexos do envio; alterações no Template não mudam o histórico; novo envio usa a versão salva; execução iniciada usa snapshot.
- Confirmação humana: nem todo envio automático exige aprovação — Automação ativa e validamente configurada envia direto; aprovação separada só quando uma regra exigir, o conteúdo/comando vier da IA (D4.4), ou houver guardrail sensível configurado. Anexos: upload ou arquivo existente; acesso/validade/segurança revalidados no envio; histórico preserva a referência ao enviado; limites antes das Stories. Notificação não é automática por envio/vínculo (só com Automação/regra). Provedor/identidade do remetente/verificação de domínio/credenciais/idempotência/retries/observabilidade = Arquitetura+Segurança (gate antes das Stories); recebimento e sincronização permanecem fora da Fase 1. LGPD (NFR-8/9/10).

**IA (D6.6):**
- Casos mínimos: sugestão de conteúdo de e-mail (rascunho revisável; aceitar ≠ enviar; envio pelas regras da D6.5); resumo de Card (sob demanda; só dados que o usuário acessa; identificado como IA; não é fonte de verdade — copiar exige ação explícita); IA como Ação (exatamente sob D4.4 — saída informativa × comando proposto com aprovação separada e revalidação; sem encadeamento automático que contorne a aprovação).
- Todos identificados (NFR-11), revisáveis (NFR-12), escopados (NFR-13/3/4); falha da IA não bloqueia o fluxo manual (NFR-14). **Fail-closed** para efeitos automatizados (falha/timeout/indisponibilidade não produz comando nem efeito).
- Quem usa: Admin da Org, Admin do Pipe e Membro do Pipe, só dentro dos recursos/dados que já acessam. Habilitar/desabilitar IA = exclusivo do Admin da Org, **por capacidade** (sugestão de e-mail, resumo de Card, IA em Automação; nada ativado silenciosamente); Admin do Pipe não altera a política global. Convidado/Somente leitura/Visão restrita/Apenas formulário inicial sem IA.
- Desativação pela Org: bloqueia novas sugestões/resumos/execuções; não apaga histórico; Automações com Ação de IA não produzem efeito de IA enquanto desabilitado (execução registrada como bloqueada/indisponível, sem impedir o fluxo manual).
- Uso e custo: Admin da Org consulta consumo agregado por período e capacidade (execuções/consumo/custo quando disponível); sem prompts/respostas completas/segredos/conteúdo pessoal; limites/orçamento/alertas/bloqueio por custo = Arquitetura/Produto antes das Stories. Contexto enviado à IA: mínimo e necessário; autorização/escopo revalidados na geração; Campos restritos/anexos/e-mails/históricos não enviados só por vínculo ao Card. Mascaramento/retenção/região/fornecedor = OQ-32/Arquitetura/Jurídico.
- **AI Builder totalmente ausente** na Fase 1 (sem menu/rota/botão/placeholder/tela/protótipo funcional/Épico/Story); IA auxiliar de configuração = conceito futuro (retomada exige nova decisão). **Sem "Agente de IA"**, sem objetivos contínuos/decisões autônomas/ações em segundo plano fora de Automação configurada, sem memória transversal (agentes autônomos avançados = Non-Goal, RN-123).
- Rastreabilidade: capacidade, Organização, ator/Automação, recurso de contexto, data/hora, resultado, consumo; distingue geração/aceitação/comando proposto/aprovação/efeito; sem prompts completos/payloads/dados pessoais desnecessários visíveis.

**Pendências que permanecem abertas:** requisitos numéricos de senha, limites de anexos de e-mail e limites/orçamento de IA (Produto+Segurança/Arquitetura antes das Stories); modelo/região/retenção/fornecedor da IA (OQ-32/Arquitetura+Jurídico); mecanismos (token/rate limit/hashing, provedor de e-mail e verificação de domínio, tempo real, agregação/cache, orquestração de IA) = Arquitetura/Segurança.

### Constraints e Guardrails Transversais

**Descrição:** Restrições e barreiras estruturais que o produto deve respeitar em toda a Fase 1 — não são funcionalidades, são limites que nenhuma funcionalidade pode violar. Cobrem isolamento multiempresa, menor privilégio, proteção de credenciais/segredos, transparência e uso de IA — não apenas privacidade. A verificação de conformidade destes guardrails é feita pelas skills de qualidade já existentes no projeto (`security-check`, `lgpd-check`); Arquitetura, implementação, testes e operação são responsáveis por materializar os controles correspondentes — este PRD define o guardrail de Produto, não o mecanismo técnico.

#### Isolamento multiempresa

- **Isolamento multiempresa é um limite estrutural, não uma feature opcional.** Nenhuma funcionalidade da Fase 1 pode expor dados de uma Organização a outra — o guardrail mais crítico do produto, reforçado transversalmente pela NFR-3 em cada FR da Seção 4 e citado como risco central no addendum do Product Brief.
- O isolamento deve ser **comprovável** (testável/auditável), não apenas presumido pela ausência de evidência em contrário. O mecanismo técnico exato (identificador direto de Organização, particionamento ou outro) é decisão de Arquitetura — este PRD não o prescreve. Hoje a materialização técnica ainda não está confirmada (identificador de Organização ausente em Pipe, Database, Usuário, Notificação, Tarefa e Solicitação, conforme addendum do Product Brief), mas essa é uma lacuna de implementação, não uma reinterpretação do guardrail.

#### Menor privilégio

- **Menor privilégio e acesso negado por padrão são confirmados como guardrail fechado de Produto:** o acesso mais restrito é o padrão e **a ausência de regra explícita significa acesso negado** (alinhado a AD-9); poderes são concedidos explicitamente (`permissoes-fase-1.md` §2). A **matriz detalhada** de quem pode o quê por módulo e papel continua `PENDENTE DE DECISÃO` (já registrado em cada FR da Seção 4) — a lacuna é o detalhamento operacional, não o princípio, que este PRD confirma.

#### Proteção de credenciais, segredos e dados sensíveis

Nenhuma funcionalidade da Fase 1 deve expor, além do estritamente necessário: senhas, tokens, chaves de API, segredos de configuração, identificadores de sessão, conteúdo de logs de erro, ou dados de Auditoria — nem estes devem ser enviados a recursos de IA além do necessário à tarefa (NFR-1, NFR-9, NFR-13, NFR-33, NFR-38, NFR-39).

#### Transparência (dado e ação real vs. simulado)

Nenhuma seção ou ação do produto pode apresentar **dado fictício** ou **ação simulada** como se fosse real — nem informação inventada, nem uma ação que pareça ter tido efeito sem tê-lo tido. Guardrail já formalizado como INV-REPORT-01 (Relatórios) e INV-ADMIN-02 (Painel Administrativo); reafirmado aqui como princípio geral transversal.

#### Guardrail de IA (efeitos operacionais vs. sugestão)

A IA pode **gerar sugestões automaticamente** (texto, resumo, recomendação) — isso não é restringido. O que exige confirmação explícita do usuário são os **efeitos operacionais**: enviar comunicação, alterar dado, movimentar Card ou executar qualquer ação com efeito persistente. Guardrail já detalhado como NFR-17 (cluster IA assistiva, NFRs Transversais); reafirmado aqui como constraint transversal, não específico de um único FR.

#### Guardrails mínimos de dados pessoais (finalidade, minimização, contexto)

Todo dado pessoal tratado por qualquer funcionalidade da Fase 1 deve seguir, no mínimo:
- **Finalidade definida** — nenhuma coleta sem propósito claro e documentado.
- **Minimização** — coleta limitada ao necessário para a finalidade.
- **Acesso contextual** — acesso restrito à Organização atual e às permissões efetivas do usuário (NFR-3, NFR-4).
- **Uso por IA sujeito aos mesmos princípios** — dados enviados a recursos de IA seguem finalidade definida, minimização e acesso contextual, sem exceção.

Estes são guardrails mínimos; o tratamento completo de base legal, retenção, direitos do titular e demais obrigações da LGPD é objeto do próximo cluster (Compliance and Regulatory).

#### Decisões de Produto (pendentes)

- Matriz detalhada de menor privilégio por módulo/papel (o princípio já é confirmado; falta o detalhamento).

#### Decisões de Arquitetura (subsequentes)

- Mecanismo técnico que torna o isolamento multiempresa comprovável (identificador direto, particionamento ou outro).
- Materialização técnica da proteção de credenciais/segredos/sessões/logs listada acima.

#### Fora da Fase 1

Nenhum item novo — este cluster consolida guardrails já cobertos por FRs/NFRs anteriores, sem introduzir novo escopo.

### Data Governance

**Descrição:** Governança de dados em nível de Produto — quem é dono de cada dado, quão crítico ele é, por quanto tempo deve ser retido, e como recuperabilidade e evolução de schema são tratadas como requisito de negócio, não apenas de implementação. A verificação de conformidade destes requisitos é feita pelas skills já existentes no projeto (`backup-check`, `migration-check`); Arquitetura e implementação são responsáveis por executar backup, restore e migrations — este PRD define a exigência de Produto, não o mecanismo.

#### Propriedade dos dados

- **Organização é o limite de propriedade dos dados operacionais de negócio** — Pipes, Cards, Databases, Registros, Tarefas, Solicitações, Notificações, E-mails (confirmado no mapa geral de relacionamentos, `relacionamentos-fase-1.md` §1; reforçado transversalmente pela NFR-3).
- Dados de conta, autenticação, sessão e logs técnicos podem ter escopo de Plataforma (ex.: um Usuário existe independentemente de uma Organização específica) — mesmo assim, o isolamento por Organização deve ser preservado para todos os dados operacionais associados a cada contexto de participação do usuário.

#### Fonte de verdade

Cada dado deve possuir uma **fonte de verdade única e consistente** — hoje isso não está confirmado para todas as entidades (RN-190, já citado no addendum do Product Brief). Consolidar essa fonte única por entidade é `PENDENTE DE DECISÃO`; o mecanismo técnico (onde e como cada dado é a fonte de verdade) é decisão de Arquitetura, não deste PRD.

#### Classificação de criticidade de dados (proposta, pendente de validação de Produto)

Proposta inicial para orientar futuras decisões de retenção e recuperação — **não é uma decisão confirmada**, apenas ponto de partida a ser validado por Produto:
- **Crítico:** dados de autenticação/sessão, permissões, Cards, Registros, dados pessoais de clientes/leads/contatos, Auditoria administrativa (quando aprovada).
- **Alto impacto, recuperável com custo:** configuração de Pipes/Fases/Formulários, Automações, Templates de E-mail.
- **Impacto operacional moderado:** Notificações, Tarefas, Solicitações.
- **Derivado/reconstruível:** indicadores de Dashboard/Relatórios.

#### Retenção e ciclo de vida

- Política de retenção por categoria de dado — `PENDENTE DE DECISÃO` em todos os casos; nenhuma fonte confirma prazos.
- Exclusão/arquivamento de dados (ex.: Card arquivado, Registro excluído) — `PENDENTE DE DECISÃO`; cruza com os direitos do titular a tratar no próximo cluster (Compliance and Regulatory).
- **Encerramento de uma Organização** — comportamento ainda não definido: retenção, exportação, bloqueio de acesso, anonimização e exclusão de dados — `PENDENTE DE DECISÃO`; nenhuma fonte trata este cenário.

#### Recuperabilidade (backup/restore) — decisão de negócio + execução técnica

- **RPO e RTO são decisões de Produto/Negócio** (quanto de perda de dados e de indisponibilidade são aceitáveis) — `PENDENTE DE DECISÃO`. Arquitetura define **como** atendê-los tecnicamente, não os valores em si.
- Backup e restore devem preservar **isolamento entre Organizações**, respeitar **autorização** (quem pode acionar/acessar um restore) e nunca misturar dados de Organizações diferentes — guardrail obrigatório, verificado pela skill `backup-check`.

#### Evolução de schema (migrations) — decisão de negócio + execução técnica

- **Nenhuma alteração destrutiva pode ocorrer sem estratégia aprovada de preservação, transformação, recuperação ou exclusão intencional autorizada.** Esta é a regra de Produto; a técnica (expand-and-contract, backfill, janelas de manutenção) é responsabilidade da skill `migration-check` e da Arquitetura.
- A modelagem de dados desta Fase 1 (`05-modelagem-de-dados/`) é puramente conceitual — qualquer schema físico e sua evolução são decisão de Arquitetura, reafirmando o já estabelecido no Product Brief.

#### Consistência e qualidade de dados

Reaproveita os invariantes já estabelecidos por módulo, sem redefini-los: INV-FORM-01, INV-NOTIF-01, INV-REPORT-01/02, INV-ADMIN-02.

#### Decisões de Produto (pendentes)

- Política de retenção por categoria de dado.
- Regras de exclusão/arquivamento por entidade.
- Comportamento de encerramento de uma Organização (retenção, exportação, bloqueio, anonimização, exclusão).
- RPO e RTO (valores de negócio).
- Validação da classificação de criticidade proposta acima (ainda não confirmada).

#### Decisões de Arquitetura (subsequentes)

- Consolidação de cada entidade em fonte única.
- Mecanismo técnico para atender RPO/RTO definidos por Produto.
- Estratégia de migration/expand-contract para cada evolução de schema.

#### Fora da Fase 1

Nenhum item novo.

### Compliance and Regulatory (LGPD)

**Descrição:** Requisitos de conformidade legal com a Lei Geral de Proteção de Dados Pessoais (LGPD) que o produto deve atender, em nível de Produto — o que deve ser garantido ao titular dos dados, não como implementar tecnicamente. A skill `lgpd-check` já existente no projeto é apenas o **mecanismo de verificação técnica** — a conformidade real depende da combinação de decisões jurídicas, Arquitetura, implementação, contratos (com provedores/subprocessadores) e operação, não apenas da skill. Este cluster complementa — não substitui — os guardrails mínimos já registrados em Constraints e Guardrails Transversais (finalidade, minimização, acesso contextual, uso por IA).

#### Titulares e categorias de dados pessoais tratados

O Giraffe CRM Fase 1 trata dados pessoais de, no mínimo:
- **Usuários** (Administrador da Organização, Membro, Convidado) — nome, e-mail, credenciais.
- **Clientes, leads e contatos** representados como Registros dentro de Databases (Database/Registro como conceito é confirmado; o schema técnico exato dos campos permanece para a Arquitetura, conforme a resolução de OQ-9 (R3/D3.1, §8.2)).

Cada categoria e cada campo pessoal específico ainda não têm finalidade, base legal e retenção documentadas individualmente — `PENDENTE DE DECISÃO`.

#### Base legal

- Nenhuma base legal específica está confirmada nas fontes para nenhuma categoria de dado tratada — `PENDENTE DE DECISÃO` para cada finalidade (autenticação, operação de Cards/Registros, e-mail, IA, Auditoria).
- Este PRD não presume "legítimo interesse" nem "consentimento" por padrão — a escolha da base legal por finalidade é decisão de Produto/Jurídico, a ser tomada antes da implementação de cada fluxo que trata dado pessoal.

#### Papéis de Controlador, Operador e Suboperadores (decisão jurídico-organizacional)

A definição de quem é Controlador, Operador e Suboperador em cada fluxo de dados é uma decisão jurídico-organizacional pendente, especialmente entre:
- **Organização cliente** (empresa que usa o Giraffe CRM) — provável Controladora dos dados de seus próprios clientes/leads/contatos.
- **Giraffe CRM** (a plataforma) — provável Operador em relação aos dados da Organização cliente.
- **Provedor de IA** (ex.: OpenAI) — provável Suboperador quando dados forem enviados para apoio de IA.

Nenhum desses papéis está formalmente definido nas fontes — `PENDENTE DE DECISÃO` (jurídico/organizacional).

#### Direitos do titular

O produto deve prever, quando aplicável, mecanismo para atender: confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamento, e oposição. Nenhum desses mecanismos está confirmado como desenhado nas fontes — `PENDENTE DE DECISÃO` para cada direito, incluindo canal de solicitação, prazo de atendimento, e cobertura de integrações e de IA quando envolverem dado pessoal.

Quando aplicável — e apenas se decisões vierem a ser tomadas exclusivamente por tratamento automatizado — o titular deve poder solicitar **revisão e obter informações sobre os critérios de decisões automatizadas**. Este item permanece **condicional**: a IA da Fase 1 é assistiva, com revisão humana antes de qualquer efeito operacional (NFR-11 a NFR-18, cluster IA assistiva, NFRs Transversais) — não há decisão exclusivamente automatizada confirmada nas fontes. Se isso mudar, este direito passa a ser aplicável.

#### Transferência internacional

- O uso do **OpenAI Agents SDK TS** (`stack-fase-1.md` §11) **não configura, por si só,** transferência internacional de dados pessoais. O risco surge especificamente **quando dados pessoais são efetivamente enviados à API da OpenAI (ou de outro provedor de IA) ou a seus subprocessadores** — não pelo simples uso do SDK.
- Se e quando dados pessoais forem enviados a um provedor de IA como parte do apoio de IA (FR-26), a avaliação deve identificar, no mínimo: dados enviados, finalidade, países envolvidos, exportador, importador, subprocessadores, transferências posteriores, e o mecanismo legal aplicável conforme a LGPD e a **Resolução CD/ANPD nº 19/2024**. Nenhuma dessas avaliações foi feita nas fontes — `PENDENTE DE DECISÃO`/`PENDENTE DE AVALIAÇÃO`.
- A avaliação deve considerar também contrato/DPA (Data Processing Agreement) com o provedor, subprocessadores declarados, política de retenção do provedor, região do projeto/conta utilizada, e eventuais recursos de residência de dados disponíveis para a conta — todos `PENDENTE DE DECISÃO`.
- Nenhuma outra transferência internacional está identificada nas fontes desta Fase 1 (demais integrações externas são `FORA DA FASE 1`).

#### Dados sensíveis e de crianças/adolescentes

Nenhum caso de uso intencional de dados sensíveis (saúde, biometria etc.) ou de dados de crianças/adolescentes está aprovado para a Fase 1. Qualquer habilitação futura desse tratamento exige, previamente: finalidade específica, base legal adequada, controles reforçados de acesso/proteção, e validação jurídica prévia — nenhuma dessas condições deve ser presumida ou antecipada por este PRD.

#### Retenção e exclusão (cross-referência)

A política de retenção/exclusão por categoria de dado já está registrada como pendente no cluster Data Governance — este cluster reforça que a retenção de dado pessoal, especificamente, deve também atender a princípios de proporcionalidade e finalidade da LGPD, não apenas critérios operacionais.

#### Encarregado (DPO) — decisão jurídica e organizacional

A designação de um Encarregado (DPO) é uma **decisão jurídica e organizacional**, não uma decisão de produto — `PENDENTE DE DECISÃO`. Agentes de tratamento de pequeno porte podem ter dispensa da designação formal em determinadas condições previstas na regulamentação, mas ainda assim precisam disponibilizar um **canal de comunicação ao titular** — esse canal mínimo permanece uma exigência, independentemente da dispensa formal do cargo.

#### Processo de resposta a incidentes (distinto do canal de direitos do titular)

Distinto do canal de atendimento aos direitos do titular (acima), o produto/organização deve ter um processo de resposta a incidentes de segurança envolvendo dados pessoais, cobrindo, quando aplicável: identificação do incidente, avaliação de escopo e impacto, documentação, e comunicação (aos titulares afetados e/ou à ANPD, conforme exigido). Nenhum processo desse tipo está confirmado nas fontes — `PENDENTE DE DECISÃO`.

#### Mecanismo de verificação (não é conteúdo deste PRD)

A skill `lgpd-check.md` já existente no projeto é apenas o mecanismo de verificação técnica de conformidade durante implementação e code review — ela não substitui as decisões jurídicas (base legal, papéis de Controlador/Operador, DPO, mecanismo de transferência internacional), que devem ser tomadas antes da instrumentação técnica.

#### Decisões de Produto (pendentes)

- Base legal por finalidade/categoria de dado pessoal.
- Mecanismo e canal de atendimento aos direitos do titular (incluindo revisão de decisão automatizada, condicional).
- Retenção de dado pessoal (ângulo LGPD, complementar ao Data Governance).

#### Decisões Jurídicas e Organizacionais

- Papéis de Controlador, Operador e Suboperador entre Organização cliente, Giraffe CRM e provedor de IA.
- Designação de Encarregado (DPO) ou aplicabilidade de dispensa, mantendo canal de comunicação ao titular.
- Avaliação de transferência internacional (dados enviados, finalidade, países, exportador/importador, subprocessadores, transferências posteriores, mecanismo legal LGPD/Resolução CD/ANPD nº 19/2024).
- Contrato/DPA com provedor de IA e subprocessadores.
- Validação jurídica prévia para qualquer habilitação futura de dado sensível ou de criança/adolescente.
- Processo de resposta a incidentes de segurança envolvendo dados pessoais.

#### Decisões de Arquitetura (subsequentes)

- Instrumentação técnica dos direitos do titular.
- Mecanismo de minimização de dados enviados à IA.
- Recursos técnicos de residência de dados/região, quando definidos pela avaliação jurídica de transferência internacional.

#### Fora da Fase 1

Nenhum item novo — dados sensíveis e de crianças/adolescentes permanecem não aprovados, não é escopo confirmado nem exclusão formal.

---

### Integração e Dependências

Este cluster distingue **integrações do produto** (capacidades voltadas ao cliente para conectar o Giraffe CRM a sistemas externos) de **dependências técnicas internas** (serviços de infraestrutura dos quais o produto depende por baixo, sem serem ofertados como integração ao cliente). A fronteira Fase 1 × Fase 2 está estabelecida em `docs/01-documentacao-base/06-integracoes-externas/fase-1-vs-fase-2.md` e no Product Brief; este cluster consolida essa fronteira sem ampliá-la.

#### Integrações do produto na Fase 1

Na Fase 1, o produto **não oferece integrações externas ao cliente**. Não há API pública, Webhooks configuráveis, conectores ou marketplace disponíveis para a Organização. As capacidades voltadas ao cliente são internas ao próprio produto:

- Notificações internas.
- E-mails e templates como fluxo operacional (envio real ainda `PENDENTE DE DECISÃO`, ver seção de E-mails).
- Automações internas básicas (Evento → Condição → Ação), sem requisição HTTP externa.
- IA básica assistiva.

Usar um provedor técnico por baixo de qualquer dessas capacidades (quando a Arquitetura o definir) **não** transforma o produto em uma plataforma de integrações externas para clientes na Fase 1.

#### Dependências técnicas internas (não são integrações ofertadas ao cliente)

Os serviços a seguir são **dependências de infraestrutura interna**, não integrações voltadas ao cliente. Sua existência por baixo do produto não constitui abertura de integração externa. A direção de stack está no Product Brief / `stack-fase-1.md`; este PRD não especifica implementação nem substitui a Arquitetura:

- Fila e processamento assíncrono.
- Cache.
- Comunicação em tempo real interna (se a Arquitetura confirmar necessidade).
- Armazenamento de arquivos — **dependência condicional** à aprovação, no produto, das capacidades de arquivos/anexos (hoje `PENDENTE DE DECISÃO` nas seções de Formulários e Cards). Enquanto essa capacidade de produto não for aprovada, o armazenamento não é uma dependência confirmada da Fase 1.
- Observabilidade e logs técnicos como suporte operacional.

#### Callbacks técnicos de provedores

Webhooks públicos ou configuráveis por clientes estão fora da Fase 1 (ver Non-Goals). **Callbacks técnicos de provedores aprovados** (por exemplo, confirmação de status vinda de um provedor de e-mail ou de IA, caso a Arquitetura os utilize) podem existir como **detalhe interno de Arquitetura** — não são um recurso de integração exposto ao cliente e não devem ser lidos como abertura de Webhooks na Fase 1.

#### Dependências externas confirmadas e pendências associadas

- **Provedor de IA (OpenAI) — direção confirmada.** A IA básica assistiva e a direção OpenAI (OpenAI Agents SDK TS, `stack-fase-1.md` §11) estão confirmadas como stack. Permanecem `PENDENTE DE DECISÃO`: modelo, conta, região, retenção, controles de dados e orquestração — **não** a existência de um provedor. Ver também transferência internacional no cluster de Compliance/LGPD.
- **Provedor real de e-mail (envio/recebimento) — `PENDENTE DE DECISÃO`** (ver seção de E-mails). Citado como direção, não confirmado como implementado na Fase 1.

#### Decisões de Produto (pendentes)

- Aprovação das capacidades de arquivos/anexos, que condiciona a dependência de armazenamento (cruza com Formulários e Cards).
- Escopo funcional do provedor de e-mail (cruza com a seção de E-mails).
- Escopo funcional efetivo da IA (cruza com a seção de IA básica).

#### Decisões de Arquitetura (subsequentes)

- Confirmação e implementação dos serviços técnicos internos (fila, cache, tempo real, armazenamento, observabilidade).
- Modelo, conta, região, retenção, controles de dados e orquestração do provedor de IA, uma vez confirmados os parâmetros jurídicos e de produto.
- Provedor real de e-mail, uma vez que Produto confirme o escopo funcional.
- Eventuais callbacks técnicos de provedores aprovados como detalhe interno.
- **CI/CD** — decisão de **Engenharia/Arquitetura**, não Non-Goal de Produto. Não é requisito funcional da Fase 1 nem exclusão de produto; é definida na etapa de Arquitetura/Engenharia.
- Versões exatas, estrutura de repositórios, contratos de API interna, schema físico, estratégia de multi-tenant, política de fila/retry, deploy por ambiente (`stack-fase-1.md` §14).

#### Fora da Fase 1 — integrações externas

Exclusões já confirmadas no Product Brief e em `fase-1-vs-fase-2.md` §5, reafirmadas aqui (não são decisões pendentes):

- API externa pública para clientes/parceiros.
- Webhooks para clientes (públicos ou configuráveis).
- MCP como capacidade do produto.
- GraphQL pública.
- Requisição HTTP customizada em Automações.
- Marketplace de conectores.

Se um fluxo visual do protótipo sugerir qualquer um desses itens, deve ser lido como demonstrativo / "Em breve", nunca como requisito funcional.

#### Outros Non-Goals consolidados (não são integrações propriamente ditas)

Itens fora da Fase 1 que não pertencem à categoria de integrações externas, agrupados aqui para não os confundir com a fronteira de integrações:

- SSO/SAML avançado.
- Impersonation de suporte.
- Billing/cobrança complexa.
- Analytics avançado.
- Permissões extremamente granulares por campo/ação/regra customizada complexa.

---

## 5. Non-Goals (Fora da Fase 1)

**Descrição:** Consolida, num único lugar, tudo o que a Fase 1 **deliberadamente não faz**. Nenhum item aqui é pendência — são exclusões confirmadas. Pendências (`PENDENTE DE DECISÃO`) ficam na Seção 8. A fonte de cada exclusão está citada.

### 5.1 Integrações externas (fronteira explícita da Fase 2)

- API externa pública para clientes/parceiros.
- Webhooks para clientes (públicos ou configuráveis). *Callbacks técnicos de provedores aprovados podem existir como detalhe interno de Arquitetura — ver cluster Integração e Dependências.*
- MCP como capacidade do produto.
- GraphQL pública.
- Requisição HTTP customizada em Automações.
- Marketplace de conectores.

*Fonte: Product Brief §Escopo; `fase-1-vs-fase-2.md` §5.*

### 5.2 Outros Non-Goals (não são integrações)

- SSO/SAML avançado.
- Impersonation de suporte.
- Billing/cobrança complexa.
- Analytics avançado.
- Permissões extremamente granulares (por campo/ação/regra customizada complexa).
- App mobile nativo.
- Automações avançadas — além do modelo confirmado para a Fase 1 nas fontes: Evento → Condição → Ação com ações internas (a requisição HTTP externa em automações já consta em 5.1). Comportamentos de automação não detalhados nas fontes **não** são transformados em exclusão aqui; quando aplicável, permanecem como pendência (Seção 8).
- IA autônoma avançada com múltiplos agentes.

*Fonte: Product Brief §Escopo, §Diferencial; `fase-1-vs-fase-2.md`.*

### 5.3 Super Admin — funcionalmente fora da Fase 1

- O Super Admin permanece como **referência separada da Plataforma**, sem implementação operacional completa na Fase 1.
- O papel de Super Admin **não concede acesso automático aos dados das Organizações**. Qualquer capacidade futura de suporte ou acesso excepcional exigirá requisitos próprios de autorização, auditoria e LGPD.

*Fonte: Product Brief §A Solução/§A Quem Serve; trailer da subseção 4.16.*

### 5.4 Limites deste PRD e das referências existentes

- O protótipo HTML unificado é referência visual e de fluxo — **não** é implementação, arquitetura, schema de banco ou contrato de API.
- A modelagem de dados em `05-modelagem-de-dados/` é **puramente conceitual**, sem schema físico.
- Este PRD não antecipa UX, Arquitetura, Épicos, Stories nem Spec Kit.

*Fonte: Product Brief §Escopo; regras do workflow.*

**Nota de rastreabilidade:** esta seção consolida exclusões já documentadas nas fontes e nos trailers "Fora da Fase 1" das rodadas e clusters; é agregadora, não introduz exclusão nova.

---

## 6. MVP Scope (Escopo da Fase 1)

**Descrição:** Delimita o que compõe o incremento mínimo entregável da Fase 1 — o núcleo operacional interno. Cada módulo remete aos FRs já definidos na Seção 4. Subcapacidades **pendentes** ou **condicionais** são marcadas; não são compromissos do MVP até a decisão correspondente (Seção 8).

**Vocabulário de status (padronizado):**
- **Obrigatório no MVP** — capacidade confirmada, entra no incremento.
- **Obrigatório com subcapacidades pendentes** — o módulo entra no MVP com suas capacidades mínimas confirmadas; subcapacidades listadas ficam pendentes.
- **Condicional à decisão de Produto** — só entra no MVP se e quando a decisão de Produto aprovar.
- **Referência fora da entrega operacional** — presente no PRD como referência, sem entrega funcional na Fase 1.

### 6.1 Núcleo do MVP (módulos da Fase 1)

| # | Módulo | FRs | Status | Subcapacidades pendentes / condicionais |
|---|---|---|---|---|
| 1 | Login e Sessão | FR-1 – FR-3 | Obrigatório com subcapacidades pendentes | Autenticação, sessão e **recuperação de senha reais** no MVP (recuperação resolvida em R6/D6.1). Token/rate limit/hashing = Segurança/Arquitetura. |
| 2 | Dashboard operacional | FR-4, FR-5 | Obrigatório no MVP | — |
| 3 | Busca Global | FR-6 | Obrigatório com subcapacidades pendentes | Busca restrita à Organização atual é **obrigatória**; comportamento para múltiplas Organizações simultâneas permanece pendente. |
| 4 | Pipes / Kanban | FR-7, FR-8 | Obrigatório no MVP | — |
| 5 | Cards | FR-9 – FR-13 | Obrigatório com subcapacidades pendentes | Máquina de estados do Card resolvida (R2/D2.3, D2.7). Cálculo/agendamento de marcos = Arquitetura. |
| 6 | Formulários (3 contextos independentes) | FR-14 – FR-17 | Obrigatório com subcapacidades pendentes | Comportamento de arquivos/anexos resolvido (R3/D3.5); limites numéricos + storage = pré-Stories/Arquitetura. |
| 7 | Database e Registros | FR-18 – FR-20 | Obrigatório com subcapacidades pendentes | Cardinalidade Card↔Registro resolvida (R3/D3.6: N—N). Mecanismo de referência = Arquitetura. |
| 8 | Automações básicas | FR-21 – FR-23 | Obrigatório no MVP | No MVP com **motor operacional** Evento → Condição → Ação e ações internas. Configurações demonstrativas não comprovam a execução. |
| 9 | E-mails e Templates | FR-24, FR-25 | Obrigatório com subcapacidades pendentes | Composição, uso de Template e **envio outbound real** no MVP (R6/D6.5). Recebimento/sincronização **fora da Fase 1**; provedor/identidade/armazenamento = Arquitetura+Segurança. |
| 10 | IA básica assistiva | FR-26 | Obrigatório com subcapacidades pendentes | Apoio revisável no MVP. Modelo/conta/região/retenção/orquestração `PENDENTE`. |
| 11 | Tarefas e Solicitações | FR-27, FR-28 | Obrigatório com subcapacidades pendentes | Ciclo de vida e acesso do módulo resolvidos (R1/D1.6, R5/D5.2). Matriz detalhada por módulo/papel em refinamento (não bloqueante). |
| 12 | Notificações internas | FR-29, FR-30 | Obrigatório com subcapacidades pendentes | Catálogo/alvos/distribuição/estado lido por destinatário resolvidos (R6/D6.3). Entrega/tempo real = Arquitetura. |
| 13 | Relatórios | FR-31 | Obrigatório com subcapacidades pendentes | Catálogo e regras de inclusão resolvidos (R6/D6.4). Fonte de verdade/agregação/cache/desempenho = Arquitetura. |
| 14 | Perfil | FR-32 | Obrigatório com subcapacidades pendentes | Perfil próprio no MVP; edição de nome/avatar/preferências, e-mail (2 etapas) e senha (step-up) resolvidos (R6/D6.2). Mecanismos = Arquitetura/Segurança. |
| 15 | Painel Administrativo da Organização | FR-33 | Obrigatório com subcapacidades pendentes | Limitado à própria Organização. Gerenciamento de membros resolvido (R5/D5.1); Financeiro fora da Fase 1, Estatísticas sem módulo (R5/D5.3). Mecanismos = Arquitetura. |

### 6.2 Super Admin — referência de Plataforma (fora da entrega operacional)

- **FR-34 — Super Admin.** Status: **Referência fora da entrega operacional.** Referência de Plataforma presente no PRD, mas sem entrega operacional na Fase 1 (ver 5.3).

### 6.3 O que atravessa todo o MVP

- **Isolamento por Organização** (NFR-3) e **autorização por permissões efetivas** (NFR-4) são condição de todo o MVP, não módulos.
- Os NFRs Transversais (NFR-1..NFR-42) aplicam-se ao MVP conforme a seção consolidada.
- Guardrails de Constraints, Data Governance, Compliance/LGPD e Integração/Dependências valem para todo o MVP.

### 6.4 Fronteira do MVP

- Nenhum item da Seção 5 (Non-Goals) faz parte do MVP.
- **Uma subcapacidade pendente não retira automaticamente o módulo do MVP** — apenas não pode ser considerada compromisso até sua decisão. As capacidades mínimas confirmadas de cada módulo continuam obrigatórias.
- Subcapacidades marcadas **condicional/`PENDENTE`** entram no escopo apenas se e quando decididas (Seção 8).
- As decisões antes **bloqueantes** (permissões efetivas — R1; gerenciamento de membros — R5) já estão **resolvidas**; permanecem como pré-Stories apenas os parâmetros numéricos (limites de arquivo/e-mail, requisitos de senha, limites do motor, orçamento de IA).

*Fonte: `02-mvp/mvp-fase-1.md`; Product Brief §Escopo; Seção 4 (FR-1..FR-34) e seção consolidada de NFRs deste PRD.*

---

## 7. Success Metrics

**Descrição:** Define como se reconhece sucesso na Fase 1. Os critérios **qualitativos** estão sustentados pela documentação-fonte; **métricas quantitativas** de negócio/uso não existem nas fontes e permanecem `PENDENTE DE DECISÃO` — este PRD não fabrica alvos numéricos.

### 7.1 Critérios qualitativos de resultado do produto

| ID | Critério | Rastreável a |
|---|---|---|
| SM-1 | Mais clareza sobre o que está em andamento na operação. | Brief §Critérios de Sucesso |
| SM-2 | Menos dispersão entre processos e bases de dados (Pipes/Cards e Databases num só lugar). | Brief §Critérios de Sucesso |
| SM-3 | Melhor rastreabilidade de Cards, Tarefas e Notificações. | Brief §Critérios de Sucesso |

**Critérios de qualidade e segurança do MVP** (não são métricas de adoção):

| ID | Critério | Rastreável a |
|---|---|---|
| SM-4 | Automações internas operando sem abrir integrações externas prematuramente. | Brief §Critérios de Sucesso; Seção 5 |
| SM-5 | IA assistiva controlada, sem prometer autonomia avançada. | Brief §Critérios de Sucesso; NFR-17 |

### 7.2 Critérios de prontidão e controle de escopo

| ID | Critério | Rastreável a |
|---|---|---|
| SM-6 | Escopo macro da Fase 1 documentado e preservado (sem crescimento indevido). | Brief §Critérios de Sucesso |
| SM-7 | Distinções conceituais centrais preservadas (Pipe≠Database, Card≠Registro, Super Admin≠Admin da Organização etc.). | Brief §Diferencial |
| SM-8 | Fase 2 explicitamente bloqueada no escopo atual. | Brief §Escopo; Seção 5 |

### 7.3 Métricas quantitativas de negócio/uso — `PENDENTE DE DECISÃO`

Categorias candidatas citadas no Brief como **ainda não definidas** (nenhum alvo numérico existe nas fontes; listadas apenas para decisão futura, não como compromisso): adoção, retenção, substituição da ferramenta atual, redução de tempo operacional.

Para **cada** métrica quantitativa futura, permanecem `PENDENTE DE DECISÃO`:
- Definição (o que exatamente a métrica representa).
- Fórmula de cálculo.
- Fonte de dados.
- Baseline (ponto de partida).
- Meta (alvo).
- Responsável.
- Periodicidade de medição.
- Cuidados de LGPD (dado pessoal envolvido, base legal, minimização, retenção).

**Regra de faseamento:** essas métricas devem ser **aprovadas antes da validação operacional do MVP com usuários** — mas **não bloqueiam agora** o avanço para UX e Arquitetura.

### 7.4 Contra-métricas / violações bloqueantes para liberação

Condições que, se presentes, indicam falha mesmo com "features prontas". CM-1 a CM-4 são **violações bloqueantes para liberação** — não apenas sinais de alerta:

| ID | Contra-sinal | Status |
|---|---|---|
| CM-1 | Vazamento de dados entre Organizações (violação do isolamento — NFR-3). | Violação bloqueante para liberação |
| CM-2 | Dados fictícios ou ações simuladas apresentados como reais (INV-ADMIN-02 e guardrail de transparência). | Violação bloqueante para liberação |
| CM-3 | Crescimento indevido de escopo (Fase 2 tratada como Fase 1). | Violação bloqueante para liberação |
| CM-4 | IA produzindo efeito operacional sem confirmação (violação de NFR-17). | Violação bloqueante para liberação |
| CM-5 | Contra-métricas quantitativas correspondentes às métricas aprovadas na Seção 7.3. | `PENDENTE DE DECISÃO` |

*Fonte: Product Brief §Critérios de Sucesso, §Diferencial, §Riscos e Pendências; NFRs e invariantes deste PRD.*

---

## 8. Open Questions (Questões em Aberto)

**Descrição:** Consolida todo `PENDENTE DE DECISÃO` / `NÃO CONFIRMADO` acumulado no PRD. Nada aqui é suposição silenciosa. Cada questão bloqueia **apenas o módulo ou a etapa indicada** — nenhuma delas trava o PRD inteiro.

**Prazo de decisão:** `antes da UX do módulo` · `antes da Arquitetura` · `antes de Stories/Implementação` · `antes da produção` · `futuro/Fase 2`.

**Dono (separação de natureza da decisão):** **P** = Produto (catálogo e comportamento) · **A** = Arquitetura (estrutura, persistência, referências, prevenção de ciclos, RPO/RTO técnico, orquestração) · **J** = Jurídico/Organizacional.

### 8.1 Permissões e papéis
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-1 | Matriz efetiva de permissões por módulo (o que "Editar"/"Administrar" incluem); escopo do Convidado. | §4.x, `04-permissoes/`, Constraints | P | **✔ RESOLVIDO (R1/D1.1–D1.3) → ver Modelo de Permissões Efetivas** |
| OQ-2 | Papéis de Pipe. | §4.4, `04-permissoes/` §7 | P | **✔ RESOLVIDO (R1/D1.4) → ver Modelo de Permissões Efetivas** |
| OQ-3 | Modelo de acesso, atribuições e concessões de Card. | §4.5, `04-permissoes/` §8 | P | **✔ RESOLVIDO (R1/D1.5) → ver Modelo de Permissões Efetivas** |
| OQ-4 | Matriz de permissões dos módulos sem matriz: Tarefas/Solicitações, Notificações, Relatórios, Perfil. | §4.11–4.14 | P | **✔ ACESSO RESOLVIDO (R1/D1.6); operações seguem em OQ-12/33/34/35/36** |

### 8.2 Ciclo de vida e configuração de recursos
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-6 | Ciclo de vida do Pipe (criar/renomear/arquivar/restaurar). | §4.4 | P | **✔ RESOLVIDO (R2/D2.1) → ver Modelo de Ciclo de Vida e Estados** |
| OQ-7 | Operações de gerenciamento de Fases (criar/renomear/reordenar/arquivar/restaurar; quem/quando). | §4.4 | P | **✔ RESOLVIDO (R2/D2.2) → ver Modelo de Ciclo de Vida e Estados** |
| OQ-8 | Ciclo de vida do Database (criar/renomear/arquivar/restaurar), papéis e acesso. | §4.7 | P | **✔ RESOLVIDO (R3/D3.4) → ver Modelo de Formulários, Campos, Databases e Registros** |
| OQ-9 | Catálogo oficial de tipos de campo e **estrutura funcional do Campo**. | §4.6, `entidades-fase-1.md` §9 | P | **✔ RESOLVIDO (R3/D3.1; edge behaviors D3.4)** |
| OQ-10 | Quem configura/visualiza/submete cada um dos 3 Formulários; acesso público do Formulário inicial. | §4.6 | P | **✔ RESOLVIDO (R3/D3.2, D3.3) → ver Modelo de Formulários, Campos, Databases e Registros** |
| OQ-11 | Automações: operações de ciclo de vida e escopo do Membro. | §4.8 | P | **✔ RESOLVIDO (R4/D4.3) → ver Modelo de Automações** |
| OQ-12 | Tarefas/Solicitações: operações de ciclo de vida. | §4.11 | P | **✔ RESOLVIDO (R5/D5.2) → ver Modelo de Administração, Membros e Trabalho Operacional** |
| OQ-13 | Templates de E-mail: ciclo de vida, estrutura, permissões, aplicação em Automações. | §4.9 | P | **✔ RESOLVIDO (R6/D6.5) → ver Modelo de Conta, Comunicação, Indicadores e IA** |

### 8.3 Card — estados, movimentação e histórico
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-14 | Máquina de estados do Card (ciclo de vida + saúde temporal, marcos). | §4.5, RN-044 | P | **✔ RESOLVIDO (R2/D2.3, D2.7) → ver Modelo de Ciclo de Vida e Estados** |
| OQ-15 | Regras de restrição de movimentação entre Fases (quem, ordem, bloqueios). | §4.5, RN-033 | P | **✔ RESOLVIDO (R2/D2.4) → ver Modelo de Ciclo de Vida e Estados** |
| OQ-16 | Se a movimentação de Card dispara Automação e/ou Notificação, e quando. | §4.5/4.8/4.12 | P | **✔ GATILHO RESOLVIDO (R2/D2.5); motor → OQ-24/25/R4, distribuição → OQ-33/R6** |
| OQ-17 | Catálogo de tipos de evento no Histórico do Card (Produto); estrutura dos campos (= Arquitetura). | §4.5 | P / A | **✔ PRODUTO RESOLVIDO (R2/D2.6); estrutura de campos = Arquitetura** |

### 8.4 Persistência e modelo de dados (conceitual)
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-18 | Conexão Card↔Registro: cardinalidade (Produto) e mecanismo de referência (= Arquitetura). | §4.5/4.7, RN-070 | P / A | **✔ PRODUTO RESOLVIDO (R3/D3.6: N—N); mecanismo = Arquitetura** |
| OQ-19 | Ciclo de vida do Registro (criação, edição, arquivamento, validação; comportamento = Produto; persistência = Arquitetura). | §4.7, RN-060/064 | P / A | **✔ PRODUTO RESOLVIDO (R3/D3.5); persistência = Arquitetura** |
| OQ-20 | Se a submissão do Formulário inicial **cria** o Card ou **preenche** um Card existente. | §4.6 | P | **✔ RESOLVIDO (R3/D3.3: cria) → ver Modelo de Formulários, Campos, Databases e Registros** |
| OQ-21 | Formulário de Fase: obrigatoriedade para avançar (Produto); persistência/visibilidade/edição dos valores após sair da Fase (mecanismo = Arquitetura). | §4.6 | P / A | **✔ PRODUTO RESOLVIDO (R3/D3.3); persistência = Arquitetura** |
| OQ-22 | Navegabilidade uniforme dos Databases; filtros/ordenação/paginação de Registros. | §4.7 | P | **✔ RESOLVIDO (R3/D3.4) → ver Modelo de Formulários, Campos, Databases e Registros** |
| OQ-23 | Vínculo direto Tarefa↔Card e E-mail↔Card: obrigatoriedade/cardinalidade (Produto) e mecanismo (Arquitetura). | §4.5/4.9/4.11 | P / A | **✔ PRODUTO RESOLVIDO (R3/D3.6); mecanismo = Arquitetura; comportamento Tarefa→R5, E-mail→R6** |

### 8.5 Automações
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-24 | Catálogo oficial de Eventos, Condições e Ações internas (= Produto); persistência/avaliação técnica (= Arquitetura). | §4.8 | P / A | **✔ PRODUTO RESOLVIDO (R4/D4.1); persistência/avaliação técnica = Arquitetura** |
| OQ-25 | **Comportamentos esperados do motor** de Automação (= Produto); **implementação e validação** = Arquitetura + QA. | §4.8 | P (comportamento) / A + QA (implementação/validação) | **✔ PRODUTO RESOLVIDO (R4/D4.2); implementação/validação = Arquitetura + QA** |
| OQ-26 | Mecanismo de referência entre Ação e Template; mecanismo de prevenção de ciclos. | §4.8 | A | antes da Arquitetura |
| OQ-27 | IA auxiliando a criação de Automações vs. IA como Ação dentro de Automações. | §4.8/4.10 | P | **✔ RESOLVIDO (R4/D4.4) → ver Modelo de Automações** |

### 8.6 E-mails
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-28 | Escopo funcional de envio de e-mail (outbound). | §4.9 | P | **✔ PRODUTO RESOLVIDO (R6/D6.5: outbound real); provedor/identidade/armazenamento/outbound = Arquitetura+Segurança; recebimento e sincronização fora da Fase 1** |
| OQ-29 | Associação E-mail↔Card: cardinalidade (Produto) e mecanismo de referência (Arquitetura). | §4.9 | P / A | **✔ PRODUTO RESOLVIDO (R3/D3.6: 0..1, ver OQ-23); mecanismo de referência = Arquitetura** |

### 8.7 IA básica
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-30 | Casos de uso concretos da IA e escopo efetivo. | §4.10 | P | **✔ RESOLVIDO (R6/D6.6) → ver Modelo de Conta, Comunicação, Indicadores e IA** |
| OQ-31 | Destino do AI Builder. | §4.10 | P | **✔ RESOLVIDO (R6/D6.6: AI Builder fora da Fase 1)** |
| OQ-32 | Modelo, conta, região, controles de dados (Produto/Jurídico); retenção técnica e orquestração (Arquitetura). Direção OpenAI já confirmada. | Integração | A / J | antes da produção |

### 8.8 Notificações, Relatórios, Dashboard, Perfil
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-33 | Notificações: catálogo, alvos, distribuição, estado lido/não-lido, popover×página. | §4.12 | P | **✔ RESOLVIDO (R6/D6.3); entrega/tempo real = Arquitetura** |
| OQ-34 | Relatórios: catálogo/regras de inclusão; filtros; distinção Dashboard × Relatórios. | §4.13/4.2 | P | **✔ RESOLVIDO (R6/D6.4); agregação/cache = Arquitetura** |
| OQ-35 | Dashboard: catálogo de indicadores e priorização/ordenação. | §4.2 | P | **✔ RESOLVIDO (R6/D6.4)** |
| OQ-36 | Perfil: edição de dados próprios, e-mail/senha, "Pipes relacionados", preferências, papéis. | §4.14 | P | **✔ RESOLVIDO (R6/D6.2); mecanismos = Arquitetura/Segurança** |

### 8.9 Painel Administrativo e Super Admin
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-37 | Gerenciamento de membros (convite, papéis, remoção, último administrador, revogação, recursos atribuídos). | §4.15 | P | **✔ PRODUTO RESOLVIDO (R5/D5.1); mecanismos = Arquitetura** |
| OQ-38 | Financeiro, Estatísticas administrativas e Auditoria administrativa (catálogo e acesso). | §4.15 | P | **✔ PRODUTO RESOLVIDO (R5/D5.3); retenção/imutabilidade = Governança/Arquitetura** |
| OQ-39 | Super Admin: tela/fluxo integrado, escopo concreto de administração de Plataforma, isolamento/autorização em nível de Plataforma. | §4.16 | P | futuro/Fase 2 |

### 8.10 Governança de dados
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-40 | Política de retenção por categoria (Produto); regras de exclusão/arquivamento por entidade (Produto define, Arquitetura executa). | Data Governance | P / A | antes da produção |
| OQ-41 | Comportamento de encerramento de Organização (retenção, exportação, bloqueio, anonimização, exclusão). | Data Governance | P / A | antes da produção |
| OQ-42 | RPO e RTO — valores de negócio (Produto); mecanismo técnico para atendê-los e classificação de criticidade (Arquitetura). | Data Governance | P / A | antes da produção |

### 8.11 Compliance / LGPD e decisões jurídicas
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-43 | Base legal por finalidade/categoria; canal e mecanismo de atendimento aos direitos do titular (incl. revisão de decisão automatizada, condicional); retenção (ângulo LGPD). | Compliance | P / J | antes de tratar dados pessoais reais em produção |
| OQ-44 | Papéis de Controlador/Operador/Suboperador; DPO ou dispensa (com canal ao titular); avaliação de transferência internacional; DPA com provedor de IA/subprocessadores. | Compliance | J | antes de tratar dados pessoais reais e usar IA em produção |
| OQ-45 | Processo de resposta a incidentes de segurança envolvendo dados pessoais. | Compliance | J | antes da produção |
| OQ-46 | Dados sensíveis ou de crianças/adolescentes: validação jurídica prévia, base legal, controles reforçados. | Compliance | J | antes de habilitar qualquer caso de uso desse tipo |

### 8.12 Integração/dependências e outros
| ID | Questão | Fonte | Dono | Prazo de decisão |
|---|---|---|---|---|
| OQ-47 | Aprovação das capacidades de arquivos/anexos (condiciona a dependência de armazenamento). | Integração | P | **✔ COMPORTAMENTO DE PRODUTO RESOLVIDO (R3/D3.5); storage/segurança = Arquitetura; limites numéricos operacionais permanecem pendentes e devem ser definidos antes das Stories de upload** |
| OQ-48 | Recuperação de senha real (FR-3). | §4.1 | P | **✔ RESOLVIDO (R6/D6.1); FR-3 confirmado; mecanismos = Segurança/Arquitetura** |
| OQ-49 | Busca com múltiplas Organizações simultâneas (a busca restrita à Org atual já é obrigatória e confirmada). | §4.3, RN-141 | P | futuro/Fase 2 |
| OQ-50 | Métricas quantitativas de negócio/uso (Seção 7.3) — aprovar antes da validação operacional com usuários; não bloqueia UX/Arquitetura agora. | §7.3 | P | antes da produção |

**Nota de triagem:** cada `BLOQUEANTE` restringe somente o módulo/etapa da sua linha, não o PRD como um todo. O Finalize triará estas questões pelo Prazo de decisão — priorizando as marcadas `antes da UX do módulo` e `antes da Arquitetura`, e deixando as de `antes da produção` e `futuro/Fase 2` com owner e condição de revisão registrados.

---

## 9. Assumptions Index

**Descrição:** Este PRD **não usa suposições silenciosas sobre o comportamento do produto**. Toda lacuna não sustentada pelas fontes foi registrada como `PENDENTE DE DECISÃO` / `NÃO CONFIRMADO` na Seção 8 (Open Questions), nunca embutida como fato. Esta seção indexa apenas **premissas metodológicas e de precedência documental** — não são suposições sobre como o produto se comporta, e sim o alicerce de método e de hierarquia de fontes acordado para o documento.

### 9.1 Premissas de base (metodológicas e de precedência documental)

| ID | Premissa | Rastreável a | Se falsa, revisar |
|---|---|---|---|
| AS-1 | O Product Brief aprovado é a baseline do **escopo macro** da Fase 1 — sem substituir as fontes detalhadas da documentação base. | `docs/02-bmad/01-product-brief.md` (status approved) | Escopo macro (Seções 1, 5, 6) |
| AS-2 | Precedência de fontes: `docs/01-documentacao-base/` para **requisitos detalhados**; Product Brief aprovado para **direção e escopo macro**; `docs/_arquivo-legado/` apenas como **referência histórica** (nunca fonte oficial). | Regras do workflow; Brief §Riscos | Seções 4–8 |
| AS-3 | O protótipo HTML unificado é referência visual/de fluxo — não implementação, arquitetura, schema ou contrato de API. | Brief §Escopo | Seção 4; `NÃO CONFIRMADO` diversos |
| AS-4 | A modelagem de dados em `05-modelagem-de-dados/` é **puramente conceitual**, sem schema físico. | Brief §Escopo | Seções 4.5–4.7, 8.4 |
| AS-5 | A stack escolhida é **direcionamento e restrição arquitetural**. O PRD não define versões, configuração ou forma de implementação. | `09-stack-escolhida/stack-fase-1.md` | Clusters transversais; decisões de Arquitetura |
| AS-6 | Este PRD **não detalha nem substitui** UX, Arquitetura, Épicos, Stories ou Spec Kit — essas etapas consomem este documento. | Regras do workflow | Handoffs do Finalize |
| AS-7 | As skills de qualidade do projeto (`security-check`, `lgpd-check`, `observability-check`, `backup-check`, `migration-check`) **auxiliam a verificação**, mas não garantem conformidade sozinhas — a conformidade depende de decisões, Arquitetura, implementação, contratos e operação. | Clusters transversais | Constraints, Data Governance, Compliance |

**Regra de revisão:** caso qualquer premissa de base deixe de ser verdadeira, as seções impactadas (coluna "Se falsa, revisar") devem **retornar para revisão antes da implementação**.

### 9.2 O que esta seção deliberadamente NÃO contém

- Nenhuma inferência de comportamento, permissão, persistência, cardinalidade ou catálogo — tudo isso está na Seção 8 como decisão em aberto, com dono e prazo.
- Nenhum alvo de métrica quantitativa (ver Seção 7.3).
- Nenhuma decisão jurídica presumida (ver Seção 8.11).

*Fonte: regras do workflow bmad-prd; Product Brief §Escopo/§Riscos; addendum §2.*
