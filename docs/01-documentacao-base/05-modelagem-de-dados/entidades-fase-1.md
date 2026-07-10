# Entidades — Giraffe CRM · Fase 1 (Modelagem Conceitual)

> Modelagem **conceitual** de dados da Fase 1. Não há schema de banco, Prisma,
> SQL ou migrations aqui — apenas entidades, seus campos conceituais e a origem
> atual dos dados. Toda evidência vem de `giraffe-state.js`, do protótipo
> unificado e da auditoria pós-unificação.
>
> **Marcações:** `CONFIRMADO` · `NÃO CONFIRMADO` · `PENDENTE DE DECISÃO` · `FORA DA FASE 1`
>
> **Fonte dos dados** (por entidade): `state central` (lido de `window.GIRAFFE.state`) ·
> `dado local da tela` (hardcoded na própria página, espelhado no seed) ·
> `não confirmado`.

---

## Nota sobre "fonte dos dados"

A auditoria confirmou que o **state central** (`giraffe-state.js`) é a fonte
canônica desta documentação, mas nem todas as telas o consomem ainda. Onde a
tela ainda usa dado próprio, isso é marcado como `dado local da tela` e listado
como pendência — **não** como erro de modelagem. O modelo conceitual assume o
state central como verdade.

---

## 1. Plataforma

1. **Nome:** Plataforma (Giraffe)
2. **Definição:** o produto Giraffe CRM acima das organizações; nível onde vive o Super Admin.
3. **Responsabilidade:** hospedar organizações e a administração global da plataforma.
4. **Onde aparece:** identidade de marca "Giraffe" na topbar; papel `Super Admin` do usuário.
5. **Fonte atual:** `não confirmado` (não existe objeto `platform` no seed; é implícita).
6. **Campos conceituais:** nome da plataforma; (futuro) configurações globais.
7. **Status possíveis:** —
8. **Observações:** Plataforma ≠ Organização. `Super Admin` é papel de plataforma.
9. **Pendências:** modelar objeto de Plataforma explícito. `PENDENTE DE DECISÃO`.

---

## 2. Organização

1. **Nome:** Organização (Organization)
2. **Definição:** empresa/cliente que usa o CRM; escopo de todo o trabalho operacional.
3. **Responsabilidade:** conter usuários, pipes, databases, cards e todo o dado operacional.
4. **Onde aparece:** topbar (empresa atual), menu "Trocar de empresa", painel administrativo.
5. **Fonte atual:** `state central` — `state.currentOrganization`, `state.organizations`.
6. **Campos conceituais:** `id`, `name`, `initials`.
7. **Status possíveis:** —
8. **Observações:** atual = *Giraffe Marketing* (`org-giraffe`); existe *Giraffe Contratos* (`org-contratos`). `CONFIRMADO`.
9. **Pendências:** vínculo explícito Organização→(pipes/databases/users) hoje é implícito (não há `orgId` nas entidades filhas). `NÃO CONFIRMADO`.

---

## 3. Usuário

1. **Nome:** Usuário (User)
2. **Definição:** pessoa com acesso ao Giraffe.
3. **Responsabilidade:** autenticar, criar/mover cards, operar o CRM segundo seus papéis.
4. **Onde aparece:** login, menu do usuário, perfil, criador dos cards, membros no painel admin.
5. **Fonte atual:** `state central` — `state.currentUser`, `state.users`.
6. **Campos conceituais:** `id`, `name`, `initials`, `email`, `username`, `role`, `orgRole`.
7. **Status possíveis:** —
8. **Observações:** usuário atual *Martins Júnior* (`u-martins`). Dois eixos de papel (ver 4 e 5). `CONFIRMADO`.
9. **Pendências:** `username` só existe no usuário atual; senha/sessão não modeladas (protótipo). `NÃO CONFIRMADO`.

---

## 4. Papel da Plataforma

1. **Nome:** Papel da Plataforma (`role`)
2. **Definição:** nível do usuário **na plataforma** Giraffe.
3. **Responsabilidade:** distinguir Super Admin da plataforma de usuários comuns.
4. **Onde aparece:** `currentUser.role`, menu do usuário.
5. **Fonte atual:** `state central` — campo `role` do usuário.
6. **Campos conceituais:** valor do papel.
7. **Status possíveis (vistos no seed):** `Super Admin`, `Membro`. `CONFIRMADO`.
8. **Observações:** distinto do papel de organização (5).
9. **Pendências:** matriz de permissões por papel — `PENDENTE DE DECISÃO` (fica em `04-permissoes/`).

---

## 5. Papel da Organização

1. **Nome:** Papel da Organização (`orgRole`)
2. **Definição:** nível do usuário **dentro da organização** atual.
3. **Responsabilidade:** definir o que o usuário pode na organização.
4. **Onde aparece:** `currentUser.orgRole`, membros no painel administrativo.
5. **Fonte atual:** `state central` — campo `orgRole` do usuário.
6. **Campos conceituais:** valor do papel.
7. **Status possíveis (vistos no seed):** `Administrador da Organização`, `Editor`, `Visualizador`. `CONFIRMADO`.
8. **Observações:** **Administrador da Organização ≠ Super Admin.**
9. **Pendências:** permissões efetivas — `PENDENTE DE DECISÃO`.

---

## 6. Pipe

1. **Nome:** Pipe
2. **Definição:** processo de trabalho em formato Kanban, composto por fases.
3. **Responsabilidade:** organizar o fluxo de cards ao longo de fases.
4. **Onde aparece:** dashboard (grade de pipes), `pipe-kanban.html`, relatórios, busca, perfil.
5. **Fonte atual:** grade/dashboard/relatórios/busca = `state central` (`state.pipes`); **quadro Kanban em si = `dado local da tela`** (pendência).
6. **Campos conceituais:** `id`, `name`, `color`, `tone`, `count`, `countLabel`, `locked`, `starred`, `href`.
7. **Status possíveis:** `locked` (bloqueado) / não; `starred` (favorito) / não.
8. **Observações:** catálogo único de **10 pipes**; só *Contratos e Juridicos* navegável (`href`). **Pipe ≠ Database.** `CONFIRMADO`.
9. **Pendências:** falta `orgId`; Kanban lê dado local. `NÃO CONFIRMADO` que o board consome o state.

---

## 7. Fase

1. **Nome:** Fase (Phase)
2. **Definição:** etapa/coluna de um Pipe.
3. **Responsabilidade:** representar o estágio de um card dentro do pipe.
4. **Onde aparece:** colunas do Kanban em `pipe-kanban.html`.
5. **Fonte atual:** `state central` para o pipe navegável (`state.phases`); **render do Kanban = `dado local da tela`**.
6. **Campos conceituais:** `id`, `pipeId`, `name`, `color`, `done`.
7. **Status possíveis:** `done` (fase de conclusão) / não.
8. **Observações:** só há fases seedadas para *Contratos e Juridicos* (5 fases). Fase pertence a **um** pipe. `CONFIRMADO`.
9. **Pendências:** fases dos outros 9 pipes não estão no seed. `NÃO CONFIRMADO`.

---

## 8. Card

1. **Nome:** Card
2. **Definição:** item de trabalho que percorre as fases de um pipe.
3. **Responsabilidade:** carregar o trabalho, seu estado e seu histórico.
4. **Onde aparece:** Kanban e modal do card em `pipe-kanban.html`; referenciado por notificações.
5. **Fonte atual:** `state central` (`state.cards`) como catálogo; **Kanban/modal = `dado local da tela`** (pendência).
6. **Campos conceituais:** `id`, `title`, `pipeId`, `phase`, `status`, `creator`, `createdAt`.
7. **Status possíveis (seed):** `ok`, `atrasado`, `expirado`, `vencido`, `finalizado`, `arquivado`. `CONFIRMADO`.
8. **Observações:** 13 cards. **Card ≠ Registro.** Histórico/comentários/checklist/e-mails existem no modal como `dado local da tela`.
9. **Pendências:** `phase` é nome-texto, não `phaseId` (acoplamento fraco). Histórico não modelado no seed. `NÃO CONFIRMADO`.

---

## 9. Campo

1. **Nome:** Campo (Field)
2. **Definição:** unidade de captura de um formulário, de um tipo do catálogo.
3. **Responsabilidade:** definir um dado coletável (label, tipo, config).
4. **Onde aparece:** modais de configuração de campo (formulário inicial, de fase, de database).
5. **Fonte atual:** `dado local da tela` (config de campo gerida por `field-config.js` por contexto).
6. **Campos conceituais:** `label`, `tipo`, obrigatoriedade, opções (por tipo). `NÃO CONFIRMADO` o schema exato.
7. **Status possíveis:** —
8. **Observações:** catálogo **visual** de tipos é comum aos três formulários.
9. **Pendências:** lista oficial de tipos de campo a inventariar. `PENDENTE DE DECISÃO`.

---

## 10. Formulário

1. **Nome:** Formulário (Form)
2. **Definição:** conjunto de campos configuráveis, em um de três contextos.
3. **Responsabilidade:** estruturar a captura de dados de um contexto.
4. **Onde aparece:** modais de configuração no pipe e no database.
5. **Fonte atual:** `dado local da tela` (estado por contexto).
6. **Campos conceituais:** contexto (inicial/fase/database), lista de campos.
7. **Status possíveis:** —
8. **Observações:** os três contextos compartilham o catálogo de tipos, mas **têm estado independente** (ver 11, 12, 13).
9. **Pendências:** independência efetiva `NÃO CONFIRMADO` (falta teste comportamental).

---

## 11. Formulário inicial do Pipe

1. **Nome:** Formulário inicial do Pipe
2. **Definição:** campos capturados na entrada de um pipe.
3. **Responsabilidade:** coletar dados na criação do card.
4. **Onde aparece:** configuração do pipe (opções avançadas do formulário inicial).
5. **Fonte atual:** `dado local da tela`.
6. **Campos conceituais:** lista de campos do contexto "inicial".
7. **Status possíveis:** —
8. **Observações:** **≠ Formulário da Fase ≠ Formulário do Database.**
9. **Pendências:** isolamento de estado `NÃO CONFIRMADO`.

---

## 12. Formulário da Fase

1. **Nome:** Formulário da Fase
2. **Definição:** campos associados a uma fase específica do pipe.
3. **Responsabilidade:** coletar dados quando o card está/entra numa fase.
4. **Onde aparece:** configuração de campos por fase.
5. **Fonte atual:** `dado local da tela`.
6. **Campos conceituais:** lista de campos do contexto "fase".
7. **Status possíveis:** —
8. **Observações:** alterar a fase **não** pode alterar o formulário inicial nem o do database (regra).
9. **Pendências:** isolamento de estado `NÃO CONFIRMADO`.

---

## 13. Formulário do Database

1. **Nome:** Formulário do Database
2. **Definição:** campos que estruturam um registro de database.
3. **Responsabilidade:** definir o schema visual de um registro.
4. **Onde aparece:** configuração do database (`database-empresas-parceiras.html`).
5. **Fonte atual:** `dado local da tela`.
6. **Campos conceituais:** lista de campos do contexto "database".
7. **Status possíveis:** —
8. **Observações:** **não compartilha estado** com Pipe/Fase (regra).
9. **Pendências:** isolamento de estado `NÃO CONFIRMADO`.

---

## 14. Database

1. **Nome:** Database
2. **Definição:** base de registros estruturados, separada de Pipe.
3. **Responsabilidade:** armazenar dados de referência (empresas, acessos, etc.).
4. **Onde aparece:** dashboard (grade), `database-empresas-parceiras.html`, busca.
5. **Fonte atual:** catálogo = `state central` (`state.databases`); **registros na tela = `dado local da tela`**.
6. **Campos conceituais:** `id`, `name`, `color`, `tone`, `records`, `locked`, `href`.
7. **Status possíveis:** `locked` / não.
8. **Observações:** catálogo único de **4 databases**; só o primeiro navegável. **Database ≠ Pipe.** `CONFIRMADO`.
9. **Pendências:** falta `orgId`. `NÃO CONFIRMADO`.

---

## 15. Registro

1. **Nome:** Registro (Record)
2. **Definição:** entrada/linha de um Database.
3. **Responsabilidade:** guardar um item concreto da base.
4. **Onde aparece:** tabela em `database-empresas-parceiras.html`.
5. **Fonte atual:** `dado local da tela` — `state.records` está **vazio** no seed.
6. **Campos conceituais:** dependem do formulário do database (schema por database). `NÃO CONFIRMADO`.
7. **Status possíveis:** —
8. **Observações:** **Registro ≠ Card.**
9. **Pendências:** modelar `records` no state central e o schema por database. `PENDENTE DE DECISÃO`.

---

## 16. Conexão

1. **Nome:** Conexão (Card ↔ Registro)
2. **Definição:** vínculo entre um Card de um pipe e um Registro de um database.
3. **Responsabilidade:** relacionar trabalho operacional a dados de referência.
4. **Onde aparece:** conceito no modal do card ("card conectado" aparece como "Em breve").
5. **Fonte atual:** `não confirmado`.
6. **Campos conceituais:** `cardId`, `recordId` (proposto). `NÃO CONFIRMADO`.
7. **Status possíveis:** —
8. **Observações:** cardinalidade (1—N ou N—N) em aberto.
9. **Pendências:** semântica e cardinalidade. `PENDENTE DE DECISÃO`.

---

## 17. Notificação

1. **Nome:** Notificação (Notification)
2. **Definição:** aviso sobre um evento de um card.
3. **Responsabilidade:** informar mudanças (expiração, conclusão, movimentação).
4. **Onde aparece:** popover da topbar, `minhas-notificacoes.html`, badge.
5. **Fonte atual:** `state central` — `state.notifications` (popover, página e badge unificados). `CONFIRMADO`.
6. **Campos conceituais:** `id`, `kind`, `cardId`, `text`, `at`, `rel`, `read`.
7. **Status possíveis:** `kind` = `alarm` | `done` | `move`; `read` = true/false.
8. **Observações:** 15 notificações; badge = nº de não lidas; "Marcar todas como lidas" persiste em localStorage. Hoje todas apontam para **card**.
9. **Pendências:** o pedido prevê apontar também para tarefa/solicitação/usuário/sistema — hoje só `cardId`. `NÃO CONFIRMADO` para os demais alvos.

---

## 18. Tarefa

1. **Nome:** Tarefa (Task)
2. **Definição:** trabalho com prazo ligado a um pipe.
3. **Responsabilidade:** acompanhar pendências com vencimento.
4. **Onde aparece:** `tarefas-solicitacoes.html`.
5. **Fonte atual:** `state central` — `state.tasks`. `CONFIRMADO`.
6. **Campos conceituais:** `id`, `title`, `pipeId`, `status`, `receivedAt`, `dueAt`.
7. **Status possíveis:** `aberta`, `atrasada`, `concluida`.
8. **Observações:** coerente com cards atrasados (não mostra "Tudo em dia" indevidamente).
9. **Pendências:** vínculo direto Tarefa→Card é por pipe, não por `cardId`. `NÃO CONFIRMADO`.

---

## 19. Solicitação

1. **Nome:** Solicitação (Request)
2. **Definição:** pedido em acompanhamento ligado a um pipe.
3. **Responsabilidade:** rastrear demandas até resolução.
4. **Onde aparece:** `tarefas-solicitacoes.html`.
5. **Fonte atual:** `state central` — `state.requests`. `CONFIRMADO`.
6. **Campos conceituais:** `id`, `title`, `pipeId`, `status`, `updatedAt`.
7. **Status possíveis:** `aberta`, `resolvida`.
8. **Observações:** 3 solicitações no seed.
9. **Pendências:** —

---

## 20. E-mail

1. **Nome:** E-mail
2. **Definição:** mensagem enviada a partir de um card ou caixa.
3. **Responsabilidade:** comunicação com o cliente/contato.
4. **Onde aparece:** composer, histórico de e-mail no modal do card, caixa de entrada.
5. **Fonte atual:** `dado local da tela` (não há coleção `emails` no state).
6. **Campos conceituais:** remetente, destinatário, assunto, corpo, data, `cardId` (quando ligado). `NÃO CONFIRMADO`.
7. **Status possíveis:** —
8. **Observações:** envio real não existe (fluxo visual); histórico no card não deve contradizer a caixa.
9. **Pendências:** modelar coleção de e-mails no state. `PENDENTE DE DECISÃO`.

---

## 21. Template de E-mail

1. **Nome:** Template de E-mail
2. **Definição:** mensagem reutilizável.
3. **Responsabilidade:** padronizar comunicações e alimentar ações de automação.
4. **Onde aparece:** telas de e-mail; ação de automação "Enviar template de email".
5. **Fonte atual:** catálogo = `state central` (`state.emailTemplates`); **uso nas telas = `dado local da tela`** (pendência).
6. **Campos conceituais:** `id`, `name`.
7. **Status possíveis:** —
8. **Observações:** 2 templates. `CONFIRMADO` (catálogo).
9. **Pendências:** corpo/assunto do template não modelados; vínculo por id na automação `NÃO CONFIRMADO`.

---

## 22. Automação

1. **Nome:** Automação (Automation)
2. **Definição:** regra Evento → (Condição) → Ação, ligada a um pipe.
3. **Responsabilidade:** executar ações automáticas dentro do pipe.
4. **Onde aparece:** `automacoes-pipe.html`.
5. **Fonte atual:** catálogo = `state central` (`state.automations`); **editor/lista na tela = `dado local da tela`** (pendência).
6. **Campos conceituais:** `id`, `event`, `action`, `pipeId`, `status`, `updatedAt`, `updatedBy`.
7. **Status possíveis:** `ativo` (outros não confirmados).
8. **Observações:** 2 automações ativas. Ação **requisição HTTP** = `FORA DA FASE 1` ("Em breve").
9. **Pendências:** condições não estão modeladas como dado (só o modelo Evento→Condição→Ação existe na UI). `NÃO CONFIRMADO`.

---

## 23. Evento de Automação

1. **Nome:** Evento
2. **Definição:** gatilho que dispara a automação.
3. **Responsabilidade:** iniciar a regra.
4. **Onde aparece:** editor de automação.
5. **Fonte atual:** `state central` (campo `event` na automação, como texto).
6. **Campos conceituais:** descrição do evento (ex.: "Card movido para fase", "Card criado").
7. **Status possíveis:** —
8. **Observações:** hoje é texto livre, não um enum. `NÃO CONFIRMADO` a lista fechada.
9. **Pendências:** catálogo oficial de eventos. `PENDENTE DE DECISÃO`.

---

## 24. Condição de Automação

1. **Nome:** Condição
2. **Definição:** filtro opcional entre evento e ação.
3. **Responsabilidade:** restringir quando a ação ocorre.
4. **Onde aparece:** modelo Evento→Condição→Ação na UI.
5. **Fonte atual:** `não confirmado` (não há campo de condição no seed das automações).
6. **Campos conceituais:** critérios. `NÃO CONFIRMADO`.
7. **Status possíveis:** —
8. **Observações:** existe conceitualmente; não modelada como dado.
9. **Pendências:** modelar condição. `PENDENTE DE DECISÃO`.

---

## 25. Ação de Automação

1. **Nome:** Ação
2. **Definição:** o que a automação executa.
3. **Responsabilidade:** produzir o efeito da regra.
4. **Onde aparece:** editor de automação; campo `action`.
5. **Fonte atual:** `state central` (campo `action`, como texto).
6. **Campos conceituais:** descrição da ação (ex.: "Enviar template de email", "Notificar responsável").
7. **Status possíveis:** —
8. **Observações:** ações internas = Fase 1; **requisição HTTP externa = `FORA DA FASE 1`**.
9. **Pendências:** catálogo oficial de ações internas. `PENDENTE DE DECISÃO`.

---

## 26. Agente de IA / IA básica

1. **Nome:** IA básica / Agente de IA
2. **Definição:** recursos de IA do escopo da Fase 1 (apoio, não autonomia avançada).
3. **Responsabilidade:** apoiar card, e-mail, automação e resumos.
4. **Onde aparece:** `agentes-ia.html`, AI Builder no dashboard.
5. **Fonte atual:** `state central` — `state.aiAgents` (vazio por padrão).
6. **Campos conceituais:** (a definir) nome, tipo de apoio. `NÃO CONFIRMADO`.
7. **Status possíveis:** —
8. **Observações:** **sem agentes autônomos avançados**; AI Builder é demonstrativo.
9. **Pendências:** conectar AI Builder a fluxo real ou marcar melhor. `PENDENTE DE DECISÃO`.

---

## 27. Log

1. **Nome:** Log
2. **Definição:** registro de eventos do sistema.
3. **Responsabilidade:** rastrear o que aconteceu.
4. **Onde aparece:** telas de logs/auditoria (ilustrativas).
5. **Fonte atual:** `state central` — `state.logs` (vazio).
6. **Campos conceituais:** (a definir) ator, ação, alvo, data. `NÃO CONFIRMADO`.
7. **Status possíveis:** —
8. **Observações:** **Histórico do Card ≠ Log Administrativo** (ver relacionamentos).
9. **Pendências:** modelar estrutura de log. `PENDENTE DE DECISÃO`.

---

## 28. Auditoria

1. **Nome:** Auditoria
2. **Definição:** visão administrativa dos logs da organização.
3. **Responsabilidade:** transparência e rastreabilidade administrativa.
4. **Onde aparece:** painel administrativo (seção ilustrativa).
5. **Fonte atual:** `dado local da tela` (ilustrativa).
6. **Campos conceituais:** derivam de Log.
7. **Status possíveis:** —
8. **Observações:** distinta do histórico do card (nível de organização, não de item).
9. **Pendências:** definir eventos auditáveis. `PENDENTE DE DECISÃO`.

---

## Distinções oficiais (resumo)

- **Pipe ≠ Database** — `CONFIRMADO`.
- **Card ≠ Registro** — `CONFIRMADO`.
- **Histórico do Card ≠ Log Administrativo** — card = item; log = organização.
- **Super Admin ≠ Administrador da Organização** — plataforma vs organização.
- **Formulário inicial ≠ Formulário da Fase ≠ Formulário do Database** — estados independentes (isolamento `NÃO CONFIRMADO`).
- **Serviço ativo ≠ serviço validado** — aparecer na UI não implica comportamento validado.
- **API / Webhook / MCP → `FORA DA FASE 1`.**

---

## Limites da unificação (state central × dado local)

**Já no state central:** `currentUser`, `currentOrganization`, `organizations`,
`users`, `pipes`, `databases`, `notifications`, `tasks`, `requests`, dados de
relatórios e busca.

**Ainda em dado local da tela (pendência antes da implementação):** Kanban,
Cards, Fases, registros do Database, templates de e-mail (uso) e a lista/editor
de automações. Aceitável para a documentação da Fase 1; deve ser resolvido antes
de implementar.

---

## Super Admin (decisão oficial)

- **Super Admin é uma área da Plataforma.**
- **Painel Administrativo é uma área da Organização.**
- Super Admin deve ser documentado como **módulo separado da Plataforma**, mesmo
  não estando integrado ao protótipo unificado.
- **Status:** `NÃO INTEGRADO AO PROTÓTIPO UNIFICADO` · `REFERÊNCIA SEPARADA`.
- Super Admin **não** é papel comum da organização.
