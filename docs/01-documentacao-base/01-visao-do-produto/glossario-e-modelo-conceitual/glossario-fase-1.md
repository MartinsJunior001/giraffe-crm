# Glossário — Giraffe CRM · Fase 1

> Vocabulário oficial da Fase 1. Cada termo reflete exatamente o que existe no
> protótipo unificado e em `giraffe-state.js`. Termos não confirmados estão
> marcados. Não há termos inventados.

---

## Plataforma e organização

**Plataforma (Giraffe)**
O produto Giraffe CRM como um todo, acima das organizações. É o nível onde vive
o papel **Super Admin**. No protótipo aparece como identidade de marca (topbar
"Giraffe") e como o papel `role: "Super Admin"` do usuário atual.

**Organização (Organization)**
A empresa/cliente que usa o CRM. É o escopo de todo o trabalho operacional
(pipes, databases, cards, usuários). No protótipo a organização atual é
**Giraffe Marketing** (`id: org-giraffe`). Existe uma segunda organização de
exemplo, **Giraffe Contratos** (`id: org-contratos`), usada no fluxo de
"trocar de empresa".

> **Organização ≠ Usuário.** O usuário logado (Martins Júnior) pertence à
> organização (Giraffe Marketing), mas são entidades distintas. A auditoria
> confirma que a identidade não está mais misturada.

**Trocar de empresa (Switch Organization)**
Ação no menu do usuário que alterna a organização atual entre as organizações
disponíveis. No protótipo é um fluxo demonstrativo.

---

## Pessoas e acesso

**Usuário (User)**
Pessoa com acesso ao Giraffe. Tem `name`, `email`, `username`, um **papel de
plataforma** (`role`) e um **papel na organização** (`orgRole`).
Usuário atual: **Martins Júnior** (`u-martins`), `role: Super Admin`,
`orgRole: Administrador da Organização`.

**Papel de plataforma (`role`)**
Nível do usuário na plataforma Giraffe. Valores vistos no seed: `Super Admin`,
`Membro`.

**Papel na organização (`orgRole`)**
Nível do usuário dentro da organização atual. Valores vistos no seed:
`Administrador da Organização`, `Editor`, `Visualizador`.

> O detalhamento do que cada papel pode fazer é `PENDENTE DE DECISÃO` e será
> tratado em `04-permissoes/`. O glossário apenas registra que os dois eixos de
> papel existem e são distintos.

**Membro da organização (Member)**
Usuário que participa da organização atual. No seed: Jhenipher martins,
Alexsandro Ignacio, Lucas Andrade, Hiago Ferreira.

---

## Trabalho operacional

**Pipe**
Processo de trabalho em formato de funil/Kanban, composto por **Fases**. É a
unidade central do trabalho. Cada pipe tem nome, cor, contagem de itens e pode
estar **bloqueado** (`locked`) e/ou **favoritado** (`starred`).
Catálogo único: **10 pipes** (ex.: *Contratos e Juridicos*, *Criação de Artes
Giraffe*, *Estrutura do Tráfego*). Apenas *Contratos e Juridicos* é navegável no
protótipo; os demais aparecem como "Em breve neste protótipo".

**Fase (Phase)**
Etapa de um Pipe (coluna do Kanban). Pertence a **um** Pipe. Tem nome e cor, e
pode ser marcada como concluída (`done`). Exemplo (pipe *Contratos e
Juridicos*): Caixa de Entrada → Preparação do Contrato → Enviado ao cliente →
Pagamento Realizado → Fase de implementação.

**Card**
Item de trabalho que percorre as Fases de um Pipe. Pertence a **um** Pipe, está
em **uma** Fase, tem um **criador** (usuário), data de criação e um **status**.
Catálogo: **13 cards** no seed.

**Status do Card**
Situação do card. Valores confirmados no seed: `ok`, `atrasado`, `expirado`,
`vencido`, `finalizado`, `arquivado`.

**Formulário (Form)**
Conjunto de campos configuráveis. Existem três contextos, cada um com
**configuração própria e independente**:
1. **Formulário inicial do Pipe** — captura na entrada do pipe;
2. **Formulário de Fase** — campos de uma fase específica;
3. **Formulário do Database** — campos de um registro de database.
Todos compartilham o mesmo **catálogo visual de tipos de campo**, mas o estado
de configuração é separado por contexto (não devem se contaminar).

> A independência efetiva dos três estados de formulário é `NÃO CONFIRMADO`
> nesta auditoria (requer teste dedicado) — a regra de negócio está definida,
> mas a validação comportamental ainda não foi feita.

**Tipo de campo (Field type)**
Cada campo tem um tipo (texto, número, data, seleção, etc.) do catálogo visual
comum. `NÃO CONFIRMADO` a lista completa de tipos neste documento — será
inventariada em `05-modelagem-de-dados/`.

---

## Bases de dados

**Database**
Base de registros estruturados, **separada de Pipe**. Tem nome, cor, contagem de
registros e pode estar bloqueada. Catálogo único: **4 databases** (ex.:
*1.Empresas Parceiras e contratos*). Apenas o primeiro é navegável no protótipo.

**Registro (Record)**
Linha/entrada de um Database. No protótipo, os registros são exibidos pela
própria tela do database; a lista central `state.records` está vazia
(`NÃO CONFIRMADO` como fonte única de registros — ver auditoria).

**Conexão Card ↔ Registro**
Relação entre um Card de um Pipe e um Registro de um Database. Existe
conceitualmente no protótipo; o detalhamento é `PENDENTE DE DECISÃO`.

---

## Comunicação e acompanhamento

**Notificação (Notification)**
Aviso sobre um evento de um Card. Tem tipo (`kind`: `alarm`, `done`, `move`),
texto, referência ao card, horário e flag **lido/não lido** (`read`). Fonte
única: **15 notificações**. O **badge** da topbar é o número de não lidas.
"Marcar todas como lidas" zera as não lidas e persiste em localStorage.

**Tarefa (Task)**
Trabalho atribuído com prazo, ligado a um Pipe. Tem status (`aberta`,
`atrasada`, `concluida`), data de recebimento e vencimento. No seed há tarefas
abertas e atrasadas — coerente com os cards atrasados.

**Solicitação (Request)**
Pedido em acompanhamento ligado a um Pipe, com status (`aberta`, `resolvida`) e
data de atualização.

**E-mail / Template de e-mail**
Mensagem enviada a partir de um Card ou pela caixa. Templates são reutilizáveis.
Seed: 2 templates. O envio real não existe no protótipo (fluxo visual).

---

## Automação e IA

**Automação (Automation)**
Regra no modelo **Evento → (Condição) → Ação**, ligada a um Pipe. Ex.: "Card
movido para fase → Enviar template de email". Seed: 2 automações ativas.
A ação **requisição HTTP** é **Fase 2** e aparece como "Em breve".

**Evento / Condição / Ação**
Componentes de uma automação: o gatilho, o filtro opcional e o que é executado.

**IA básica**
Recursos de IA do escopo da Fase 1 (ex.: AI Builder no dashboard, tela de
Assistentes de IA). **Não** há agentes autônomos avançados: `state.aiAgents`
está vazio por padrão. O AI Builder é demonstrativo (`PENDENTE DE DECISÃO`
quanto a conectá-lo a um fluxo real).

---

## Administração

**Painel Administrativo da Organização**
Área que configura a **organização** (membros, estatísticas, auditoria,
financeiro). Itens de API/Token/Webhooks aparecem como "Em breve" (Fase 2).

**Super Admin**
Papel de **plataforma** (acima da organização). Hoje existe como `role` do
usuário; uma área de Super Admin dedicada e separada do Painel Administrativo é
`NÃO CONFIRMADO` como tela.

**Log / Auditoria**
Registro de eventos. `state.logs` existe mas está vazio no seed; as telas de
Logs/Auditoria são ilustrativas.

---

## Busca e navegação

**Busca global**
Busca única sobre o seed da organização atual. Retorna Pipes, Databases, Cards,
Usuários e Notificações. No protótipo opera sobre uma só organização, portanto
o isolamento por organização é coerente mas `NÃO CONFIRMADO` com múltiplos
conjuntos de dados.

**Shell / Topbar**
Runtime compartilhado (`giraffe-shell.js`) que injeta topbar, identidade,
notificações, menu do usuário e busca em todas as telas do app.

**"Em breve"**
Marcação para recursos de Fase 2 presentes visualmente mas bloqueados
(clique gera aviso, não abre o recurso).
