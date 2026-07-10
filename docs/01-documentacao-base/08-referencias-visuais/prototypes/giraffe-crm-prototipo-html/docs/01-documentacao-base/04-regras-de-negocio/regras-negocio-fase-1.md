# Regras de Negócio — Giraffe CRM · Fase 1

> Regras de negócio **oficiais** da Fase 1. Descrevem comportamento, ações
> permitidas, estados, exceções e pendências. Não há regra técnica de banco,
> schema, API ou backend. Toda regra tem evidência no protótipo, no
> `giraffe-state.js`, na auditoria pós-unificação ou nos documentos já criados
> (`glossario`, `modelo-conceitual`, `entidades`, `relacionamentos`).
>
> **Status por regra:** `CONFIRMADO` · `NÃO CONFIRMADO` · `PENDENTE DE DECISÃO` · `FORA DA FASE 1`.
>
> **Permissões** têm documento próprio (`04-permissoes/`); aqui só são referenciadas.

---

## Índice de regras

- Identidade e Organização — RN-001 a RN-005
- Login e Sessão — RN-010 a RN-013
- Pipes — RN-020 a RN-024
- Fases — RN-030 a RN-034
- Cards — RN-040 a RN-046
- Formulários — RN-050 a RN-054
- Database e Registros — RN-060 a RN-064
- Conexões — RN-070 a RN-073
- Notificações — RN-080 a RN-085
- Tarefas e Solicitações — RN-090 a RN-094
- Automações — RN-100 a RN-105
- E-mails — RN-110 a RN-114
- IA básica — RN-120 a RN-124
- Relatórios — RN-130 a RN-133
- Busca global — RN-140 a RN-142
- Painel Administrativo — RN-150 a RN-153
- Super Admin — RN-160 a RN-163
- Logs e Auditoria — RN-170 a RN-172
- Recursos "Em breve" — RN-180
- Limites da unificação — RN-190
- Distinções críticas — RN-200

---

## 1. Identidade e Organização

### RN-001 — Usuário não é Organização
**Status:** CONFIRMADO
**Escopo:** Usuário, Organização.
**Gatilho:** qualquer tela que exibe identidade.
**Resultado esperado:** o usuário logado (pessoa) e a organização atual (empresa) são entidades distintas, exibidas separadamente.
**Exceções:** nenhuma.
**Evidência:** `state.currentUser` (Martins Júnior) e `state.currentOrganization` (Giraffe Marketing) são objetos separados; auditoria confirma identidade não misturada.
**Observações:** base de todo o modelo; nunca derivar org a partir do usuário e vice-versa sem vínculo explícito.

### RN-002 — Organização atual define o contexto
**Status:** CONFIRMADO
**Escopo:** Organização (todo o app operacional).
**Gatilho:** navegação/consultas dentro do app.
**Resultado esperado:** pipes, databases, cards, notificações, tarefas, solicitações e busca operam no escopo da organização atual.
**Exceções:** "Trocar de empresa" altera o contexto (fluxo demonstrativo).
**Evidência:** grade do dashboard, relatórios e busca leem do state da org atual.
**Observações:** falta `orgId` explícito nas entidades filhas — ver RN-190.

### RN-003 — Plataforma é separada da Organização
**Status:** CONFIRMADO
**Escopo:** Plataforma, Organização.
**Gatilho:** conceitual/estrutural.
**Resultado esperado:** a Plataforma (Giraffe) está acima das organizações; configurações de plataforma não se confundem com as da organização.
**Exceções:** nenhuma.
**Evidência:** papel `Super Admin` (plataforma) vs `orgRole` (organização) no seed.
**Observações:** objeto de Plataforma explícito é PENDENTE (ver entidades §1).

### RN-004 — Super Admin é área da Plataforma
**Status:** NÃO CONFIRMADO (como tela integrada)
**Escopo:** Plataforma.
**Gatilho:** acesso administrativo de plataforma.
**Resultado esperado:** existe uma área de Super Admin, separada, no nível da plataforma.
**Exceções:** —
**Evidência:** hoje Super Admin existe só como `currentUser.role`; não há tela dedicada no protótipo unificado.
**Observações:** decisão oficial em RN-160. Status: NÃO INTEGRADO AO PROTÓTIPO UNIFICADO · REFERÊNCIA SEPARADA.

### RN-005 — Painel Administrativo é área da Organização
**Status:** CONFIRMADO
**Escopo:** Organização.
**Gatilho:** acesso ao painel administrativo.
**Resultado esperado:** o Painel Administrativo configura apenas a organização atual (membros, estatísticas, auditoria, financeiro).
**Exceções:** itens de API/Token/Webhooks aparecem como "Em breve" (Fase 2).
**Evidência:** `painel-administrativo.html`.
**Observações:** não confundir com Super Admin (RN-160).

---

## 2. Login e Sessão

### RN-010 — index abre o login
**Status:** CONFIRMADO
**Escopo:** Login.
**Gatilho:** abrir `index.html`.
**Resultado esperado:** a entrada do protótipo é a tela de login.
**Exceções:** nenhuma.
**Evidência:** `index.html` → login (auditoria, seção Login).
**Observações:** —

### RN-011 — Login leva ao dashboard
**Status:** CONFIRMADO
**Escopo:** Login → Dashboard.
**Gatilho:** submeter o login.
**Resultado esperado:** o usuário chega ao dashboard operacional.
**Exceções:** —
**Evidência:** fluxo login → `dashboard-home.html`.
**Observações:** —

### RN-012 — Sair volta para o login
**Status:** CONFIRMADO
**Escopo:** Sessão.
**Gatilho:** ação "Sair" no menu do usuário.
**Resultado esperado:** retorna à tela de login.
**Exceções:** —
**Evidência:** ação Sair → login (shell/menu do usuário).
**Observações:** —

### RN-013 — Autenticação real não faz parte do protótipo
**Status:** NÃO CONFIRMADO (intencional — fora do protótipo)
**Escopo:** Login/Sessão.
**Gatilho:** login.
**Resultado esperado:** o protótipo não valida credenciais reais; a sessão é sempre Martins Júnior.
**Exceções:** —
**Evidência:** usuário fixo no seed; sem verificação de senha.
**Observações:** autenticação/segurança serão definidas na implementação; **serviço ativo ≠ serviço validado** (RN-200).

---

## 3. Pipes

### RN-020 — Pipe organiza processos
**Status:** CONFIRMADO
**Escopo:** Pipe.
**Gatilho:** uso do Kanban.
**Resultado esperado:** um pipe representa um processo de trabalho em formato de funil/Kanban.
**Exceções:** —
**Evidência:** `pipe-kanban.html`, `state.pipes`.
**Observações:** —

### RN-021 — Pipe possui fases
**Status:** CONFIRMADO
**Escopo:** Pipe, Fase.
**Gatilho:** estrutura do pipe.
**Resultado esperado:** cada pipe é composto por fases (colunas).
**Exceções:** fases seedadas apenas para *Contratos e Juridicos*.
**Evidência:** `state.phases[*].pipeId`.
**Observações:** fases dos demais pipes — NÃO CONFIRMADO.

### RN-022 — Pipe possui cards
**Status:** CONFIRMADO
**Escopo:** Pipe, Card.
**Gatilho:** criação/movimentação de cards.
**Resultado esperado:** cards pertencem a um pipe.
**Exceções:** —
**Evidência:** `state.cards[*].pipeId`.
**Observações:** —

### RN-023 — Pipe é diferente de Database
**Status:** CONFIRMADO
**Escopo:** Pipe, Database.
**Gatilho:** conceitual.
**Resultado esperado:** pipe (processo/fluxo) e database (base de registros) são módulos distintos.
**Exceções:** —
**Evidência:** listas separadas `state.pipes` e `state.databases`.
**Observações:** ver RN-200.

### RN-024 — Lista oficial de Pipes vem do catálogo central
**Status:** CONFIRMADO (catálogo) / NÃO CONFIRMADO (Kanban consome o state)
**Escopo:** Pipe.
**Gatilho:** exibir pipes.
**Resultado esperado:** dashboard, relatórios, busca e perfil usam `state.pipes` (10 pipes).
**Exceções:** o **quadro Kanban** ainda usa dado local da tela (RN-190).
**Evidência:** auditoria (dashboard 10 pipes, relatórios 10 pipes).
**Observações:** unificar o board é pendência de implementação.

---

## 4. Fases

### RN-030 — Fase pertence a um Pipe
**Status:** CONFIRMADO
**Escopo:** Fase.
**Gatilho:** estrutura.
**Resultado esperado:** cada fase pertence a exatamente um pipe; não há fase compartilhada.
**Exceções:** —
**Evidência:** `phase.pipeId`.
**Observações:** —

### RN-031 — Fase guia a execução atual
**Status:** CONFIRMADO
**Escopo:** Fase, Card.
**Gatilho:** card em uma fase.
**Resultado esperado:** a fase atual indica o estágio de execução do card.
**Exceções:** —
**Evidência:** `card.phase` (nome da fase).
**Observações:** **Fase ≠ Status do Card** (RN-200): a fase é a etapa; o status é a saúde/situação do card.

### RN-032 — Fase pode ter formulário próprio
**Status:** CONFIRMADO (existência) / NÃO CONFIRMADO (isolamento)
**Escopo:** Fase, Formulário da Fase.
**Gatilho:** configuração de campos por fase.
**Resultado esperado:** cada fase pode ter um formulário próprio.
**Exceções:** —
**Evidência:** modais de configuração de campo por contexto.
**Observações:** independência de estado — ver RN-050 a RN-054.

### RN-033 — Fase pode ter regras de movimentação
**Status:** PENDENTE DE DECISÃO
**Escopo:** Fase, Card.
**Gatilho:** mover card entre fases.
**Resultado esperado:** regras de transição (ordem, bloqueios, obrigatoriedade) podem existir.
**Exceções:** —
**Evidência:** não há regras de movimentação formalizadas no seed.
**Observações:** definir catálogo de regras de transição na implementação.

### RN-034 — phaseId ainda é NÃO CONFIRMADO quando o card usa nome-texto
**Status:** NÃO CONFIRMADO
**Escopo:** Card, Fase.
**Gatilho:** vínculo card→fase.
**Resultado esperado:** o card deve referenciar a fase de forma forte (`phaseId`).
**Exceções:** —
**Evidência:** `card.phase` é nome-texto, não id.
**Observações:** resolver na modelagem física (RN-190 / relacionamentos §5).

---

## 5. Cards

### RN-040 — Card pertence a um Pipe
**Status:** CONFIRMADO
**Escopo:** Card.
**Gatilho:** criação do card.
**Resultado esperado:** todo card pertence a um único pipe.
**Exceções:** —
**Evidência:** `card.pipeId`.
**Observações:** —

### RN-041 — Card está em uma fase atual
**Status:** CONFIRMADO
**Escopo:** Card, Fase.
**Gatilho:** posição no Kanban.
**Resultado esperado:** o card está em exatamente uma fase por vez.
**Exceções:** —
**Evidência:** `card.phase`.
**Observações:** vínculo por nome (RN-034).

### RN-042 — Card representa trabalho em andamento
**Status:** CONFIRMADO
**Escopo:** Card.
**Gatilho:** conceitual.
**Resultado esperado:** o card carrega o trabalho, seu estado e seu histórico.
**Exceções:** —
**Evidência:** modal do card.
**Observações:** —

### RN-043 — Card possui status
**Status:** CONFIRMADO
**Escopo:** Card.
**Gatilho:** ciclo de vida do card.
**Resultado esperado:** o status é um de: `ok`, `atrasado`, `expirado`, `vencido`, `finalizado`, `arquivado`.
**Exceções:** —
**Evidência:** `state.cards[*].status`.
**Observações:** **Status ≠ Fase** (RN-200).

### RN-044 — Gatilhos dos estados do Card
**Status:** PENDENTE DE DECISÃO
**Escopo:** Card.
**Gatilho:** transições de status.
**Resultado esperado:** cada status precisa de um gatilho documentado (o que torna um card `atrasado`, `expirado`, `vencido`, etc.).
**Exceções:** —
**Evidência:** os status existem no seed, mas os gatilhos (prazos/datas que os disparam) não estão formalizados; notificações de `alarm` sugerem prazo, sem regra explícita.
**Observações:** definir regra de prazo → status na implementação.

### RN-045 — Card pode ter tarefas, e-mails, comentários, histórico e conexões
**Status:** NÃO CONFIRMADO (no state)
**Escopo:** Card.
**Gatilho:** uso do modal do card.
**Resultado esperado:** o card agrega tarefas, e-mails, comentários, histórico e conexões.
**Exceções:** —
**Evidência:** essas abas existem no modal como dado local da tela; não há coleções correspondentes no state.
**Observações:** ver relacionamentos §5 (vínculos a materializar).

### RN-046 — Nenhum card aparece fora do seu pipe
**Status:** CONFIRMADO
**Escopo:** Card, Pipe.
**Gatilho:** exibição.
**Resultado esperado:** um card só aparece no contexto do seu pipe.
**Exceções:** —
**Evidência:** `card.pipeId` filtra o contexto; auditoria não encontrou cards fora de contexto.
**Observações:** —

---

## 6. Formulários

### RN-050 — Formulário inicial do Pipe é independente
**Status:** NÃO CONFIRMADO (isolamento efetivo)
**Escopo:** Formulário inicial.
**Gatilho:** editar campos do formulário inicial.
**Resultado esperado:** alterações ficam restritas ao formulário inicial.
**Exceções:** —
**Evidência:** contexto "inicial" gerido localmente (`field-config.js`).
**Observações:** requer teste comportamental dedicado.

### RN-051 — Formulário da Fase é independente
**Status:** NÃO CONFIRMADO (isolamento efetivo)
**Escopo:** Formulário da Fase.
**Gatilho:** editar campos de uma fase.
**Resultado esperado:** alterações ficam restritas ao formulário daquela fase.
**Exceções:** —
**Evidência:** contexto "fase" gerido localmente.
**Observações:** requer teste dedicado.

### RN-052 — Formulário do Database é independente
**Status:** NÃO CONFIRMADO (isolamento efetivo)
**Escopo:** Formulário do Database.
**Gatilho:** editar campos do database.
**Resultado esperado:** alterações ficam restritas ao formulário do database.
**Exceções:** —
**Evidência:** contexto "database" gerido localmente.
**Observações:** requer teste dedicado.

### RN-053 — Todos usam o mesmo catálogo visual de campos
**Status:** CONFIRMADO
**Escopo:** Formulários.
**Gatilho:** adicionar/editar campo.
**Resultado esperado:** os três contextos oferecem o mesmo catálogo de tipos de campo.
**Exceções:** —
**Evidência:** modais de tipo de campo comuns.
**Observações:** a lista oficial de tipos é PENDENTE (entidades §9).

### RN-054 — Alterar um formulário não altera outro
**Status:** NÃO CONFIRMADO
**Escopo:** Formulários.
**Gatilho:** editar qualquer um dos três.
**Resultado esperado:** inicial, fase e database mantêm estados separados (nenhuma contaminação cruzada).
**Exceções:** —
**Evidência:** regra de negócio declarada; comportamento não validado.
**Observações:** **regra crítica** — ver RN-200; validar antes de implementar.

---

## 7. Database e Registros

### RN-060 — Database guarda registros persistentes
**Status:** CONFIRMADO (conceito) / NÃO CONFIRMADO (persistência real)
**Escopo:** Database.
**Gatilho:** uso do database.
**Resultado esperado:** um database mantém registros estruturados.
**Exceções:** —
**Evidência:** `database-empresas-parceiras.html`; `state.databases` (4).
**Observações:** persistência real não existe no protótipo.

### RN-061 — Database não é Pipe
**Status:** CONFIRMADO
**Escopo:** Database, Pipe.
**Gatilho:** conceitual.
**Resultado esperado:** database e pipe são módulos distintos.
**Exceções:** —
**Evidência:** listas separadas no state.
**Observações:** RN-200.

### RN-062 — Registro não é Card
**Status:** CONFIRMADO
**Escopo:** Registro, Card.
**Gatilho:** conceitual.
**Resultado esperado:** registro (database) e card (pipe) são entidades distintas.
**Exceções:** —
**Evidência:** entidades §8 e §15.
**Observações:** RN-200.

### RN-063 — Registro pertence a um Database
**Status:** CONFIRMADO (conceito)
**Escopo:** Registro.
**Gatilho:** criação de registro.
**Resultado esperado:** cada registro pertence a um database.
**Exceções:** —
**Evidência:** registros exibidos dentro de um database.
**Observações:** `databaseId` a materializar (RN-190).

### RN-064 — Fonte única de registros é NÃO CONFIRMADO
**Status:** NÃO CONFIRMADO
**Escopo:** Registro.
**Gatilho:** exibir registros.
**Resultado esperado:** registros deveriam vir do state central.
**Exceções:** —
**Evidência:** `state.records` está **vazio**; a tela usa dado local.
**Observações:** modelar `state.records` com `databaseId`.

---

## 8. Conexões

### RN-070 — Card pode se conectar a Registro
**Status:** PENDENTE DE DECISÃO
**Escopo:** Conexão (Card↔Registro).
**Gatilho:** conectar card a registro.
**Resultado esperado:** um card pode referenciar registros de database.
**Exceções:** —
**Evidência:** "card conectado" aparece como "Em breve".
**Observações:** cardinalidade (1—N/N—N) em aberto.

### RN-071 — Card pode se conectar a Card
**Status:** NÃO CONFIRMADO
**Escopo:** Conexão (Card↔Card).
**Gatilho:** conectar cards.
**Resultado esperado:** cards podem se relacionar entre si.
**Exceções:** —
**Evidência:** não há evidência no seed/protótipo.
**Observações:** validar se é escopo da Fase 1.

### RN-072 — Registro pode se conectar a Registro (se aplicável)
**Status:** NÃO CONFIRMADO
**Escopo:** Conexão (Registro↔Registro).
**Gatilho:** relacionar registros.
**Resultado esperado:** registros podem se relacionar, se aplicável.
**Exceções:** —
**Evidência:** sem evidência no protótipo.
**Observações:** PENDENTE DE DECISÃO se entra na Fase 1.

### RN-073 — Conexão não deve misturar entidades
**Status:** CONFIRMADO (regra)
**Escopo:** Conexão.
**Gatilho:** qualquer conexão.
**Resultado esperado:** uma conexão relaciona entidades sem fundi-las (card continua card; registro continua registro).
**Exceções:** —
**Evidência:** distinções Card≠Registro (RN-200).
**Observações:** —

---

## 9. Notificações

### RN-080 — Notificações vêm de fonte única
**Status:** CONFIRMADO
**Escopo:** Notificação.
**Gatilho:** exibir notificações.
**Resultado esperado:** popover e página leem a mesma origem (`state.notifications`).
**Exceções:** —
**Evidência:** auditoria (popover + página + badge unificados).
**Observações:** —

### RN-081 — Badge é calculado por não lidas
**Status:** CONFIRMADO
**Escopo:** Notificação.
**Gatilho:** mudança em `read`.
**Resultado esperado:** o badge exibe o número de notificações não lidas (não um valor fixo).
**Exceções:** badge oculto quando zero.
**Evidência:** `unreadCount()`; auditoria confirma fim do "9+" fixo.
**Observações:** —

### RN-082 — Marcar todas como lidas zera o badge
**Status:** CONFIRMADO
**Escopo:** Notificação.
**Gatilho:** ação "Marcar todas como lidas".
**Resultado esperado:** todas ficam lidas e o badge zera; persiste entre páginas.
**Exceções:** —
**Evidência:** `markAllRead()` + persistência em localStorage (verificado na auditoria).
**Observações:** persistência é só das flags de leitura.

### RN-083 — Popover e página usam a mesma origem
**Status:** CONFIRMADO
**Escopo:** Notificação.
**Gatilho:** abrir popover ou página.
**Resultado esperado:** mesmo conjunto de notificações nos dois lugares.
**Exceções:** —
**Evidência:** ambos leem `state.notifications`.
**Observações:** —

### RN-084 — Notificação pode apontar para Card
**Status:** CONFIRMADO
**Escopo:** Notificação, Card.
**Gatilho:** evento de card.
**Resultado esperado:** a notificação referencia um card existente (`cardId`).
**Exceções:** —
**Evidência:** todas as 15 notificações têm `cardId`.
**Observações:** tipos `alarm`, `done`, `move`.

### RN-085 — Notificação para tarefa/solicitação/usuário/sistema
**Status:** NÃO CONFIRMADO
**Escopo:** Notificação.
**Gatilho:** eventos não-card.
**Resultado esperado:** notificações poderiam apontar para outros alvos.
**Exceções:** —
**Evidência:** hoje só `cardId` existe.
**Observações:** ampliar alvos na implementação.

---

## 10. Tarefas e Solicitações

### RN-090 — Tarefa representa uma ação operacional
**Status:** CONFIRMADO
**Escopo:** Tarefa.
**Gatilho:** criação de tarefa.
**Resultado esperado:** a tarefa é um trabalho com prazo, com status `aberta`/`atrasada`/`concluida`.
**Exceções:** —
**Evidência:** `state.tasks`.
**Observações:** —

### RN-091 — Solicitação representa pedido ou demanda
**Status:** CONFIRMADO
**Escopo:** Solicitação.
**Gatilho:** criação de solicitação.
**Resultado esperado:** a solicitação é um pedido em acompanhamento, com status `aberta`/`resolvida`.
**Exceções:** —
**Evidência:** `state.requests`.
**Observações:** —

### RN-092 — Não mostrar "Tudo em dia" com cards atrasados
**Status:** CONFIRMADO
**Escopo:** Tarefas e Solicitações.
**Gatilho:** carregar a tela.
**Resultado esperado:** o estado vazio ("Tudo em dia") não aparece se há cards atrasados/tarefas pendentes.
**Exceções:** só mostrar vazio quando realmente não há pendências.
**Evidência:** auditoria; seed com tarefas abertas/atrasadas coerentes com cards atrasados.
**Observações:** manter coerência entre estados vazio e preenchido.

### RN-093 — Relação Tarefa↔Card
**Status:** PENDENTE DE DECISÃO
**Escopo:** Tarefa, Card.
**Gatilho:** vincular tarefa a trabalho.
**Resultado esperado:** definir se a tarefa referencia um card (`cardId`) ou só o pipe.
**Exceções:** —
**Evidência:** hoje `task.pipeId` (por pipe, não por card).
**Observações:** —

### RN-094 — Relação Solicitação↔Card
**Status:** PENDENTE DE DECISÃO
**Escopo:** Solicitação, Card.
**Gatilho:** vincular solicitação a trabalho.
**Resultado esperado:** definir vínculo com card ou só pipe.
**Exceções:** —
**Evidência:** hoje `request.pipeId`.
**Observações:** —

---

## 11. Automações

### RN-100 — Modelo Evento → Condição → Ação
**Status:** CONFIRMADO (modelo) / NÃO CONFIRMADO (condição como dado)
**Escopo:** Automação.
**Gatilho:** criar/editar automação.
**Resultado esperado:** toda automação segue Evento → (Condição) → Ação.
**Exceções:** —
**Evidência:** `automation.event` e `automation.action`; UI do editor.
**Observações:** condição não modelada no seed (RN-105).

### RN-101 — Automação da Fase 1 executa ações internas
**Status:** CONFIRMADO
**Escopo:** Automação.
**Gatilho:** disparo da automação.
**Resultado esperado:** ações internas (ex.: enviar template, notificar responsável) são permitidas.
**Exceções:** ações externas não (RN-102).
**Evidência:** `state.automations` (2 ativas).
**Observações:** catálogo oficial de ações internas é PENDENTE.

### RN-102 — Ação HTTP externa é Fase 2
**Status:** FORA DA FASE 1
**Escopo:** Automação.
**Gatilho:** tentar usar requisição HTTP.
**Resultado esperado:** a ação de requisição HTTP fica bloqueada como "Em breve".
**Exceções:** —
**Evidência:** clique gera aviso e não abre o construtor (auditoria).
**Observações:** —

### RN-103 — Webhook e API externa são Fase 2
**Status:** FORA DA FASE 1
**Escopo:** Automação/Integrações.
**Gatilho:** —
**Resultado esperado:** não funcionais; "Em breve".
**Exceções:** —
**Evidência:** painel de API "Em breve".
**Observações:** ver RN-180.

### RN-104 — MCP é Fase 2
**Status:** FORA DA FASE 1
**Escopo:** Integrações.
**Gatilho:** —
**Resultado esperado:** não funcional; "Em breve".
**Exceções:** —
**Evidência:** não presente como funcional no protótipo.
**Observações:** —

### RN-105 — Condições precisam de catálogo oficial
**Status:** PENDENTE DE DECISÃO
**Escopo:** Automação (Condição).
**Gatilho:** montar condição.
**Resultado esperado:** um catálogo oficial de condições disponíveis.
**Exceções:** —
**Evidência:** condição ausente no seed.
**Observações:** definir na implementação.

---

## 12. E-mails

### RN-110 — E-mail pode estar ligado a Card
**Status:** NÃO CONFIRMADO (no state)
**Escopo:** E-mail, Card.
**Gatilho:** enviar/ver e-mail de um card.
**Resultado esperado:** o e-mail pode referenciar o card de origem.
**Exceções:** —
**Evidência:** histórico de e-mail no modal do card (dado local).
**Observações:** não há coleção `emails` no state.

### RN-111 — Template pode ser usado em ação de automação
**Status:** CONFIRMADO (uso conceitual)
**Escopo:** Template, Automação.
**Gatilho:** ação "Enviar template de email".
**Resultado esperado:** a automação usa um template.
**Exceções:** —
**Evidência:** `automation.action` = "Enviar template de email".
**Observações:** vínculo por id — RN-112.

### RN-112 — Vínculo Template→Ação por id é NÃO CONFIRMADO
**Status:** NÃO CONFIRMADO
**Escopo:** Template, Automação.
**Gatilho:** referenciar template na ação.
**Resultado esperado:** a ação deveria referenciar `templateId`.
**Exceções:** —
**Evidência:** ação é texto, não referência.
**Observações:** materializar `templateId`.

### RN-113 — Envio real não precisa existir no protótipo
**Status:** NÃO CONFIRMADO (intencional)
**Escopo:** E-mail.
**Gatilho:** "enviar".
**Resultado esperado:** o fluxo é visual; não há envio real.
**Exceções:** —
**Evidência:** composer sem backend.
**Observações:** o fluxo deve ser claro mesmo sem envio.

### RN-114 — Histórico de e-mail no state é NÃO CONFIRMADO
**Status:** NÃO CONFIRMADO
**Escopo:** E-mail.
**Gatilho:** ver histórico.
**Resultado esperado:** histórico coerente entre card e caixa de entrada.
**Exceções:** —
**Evidência:** histórico é dado local; sem coleção no state.
**Observações:** o histórico no card não deve contradizer a caixa.

---

## 13. IA básica

### RN-120 — IA básica apoia o usuário
**Status:** CONFIRMADO (escopo) / NÃO CONFIRMADO (dado)
**Escopo:** IA.
**Gatilho:** uso de recursos de IA.
**Resultado esperado:** a IA apoia (sugestão, resumo), sem autonomia avançada.
**Exceções:** —
**Evidência:** `agentes-ia.html`, AI Builder; `state.aiAgents` vazio.
**Observações:** —

### RN-121 — IA pode sugerir resposta e resumir Card
**Status:** PENDENTE DE DECISÃO
**Escopo:** IA, Card, E-mail.
**Gatilho:** pedir sugestão/resumo.
**Resultado esperado:** IA sugere resposta de e-mail e resume card.
**Exceções:** —
**Evidência:** recursos demonstrativos.
**Observações:** definir escopo real de apoio.

### RN-122 — IA pode ajudar em automações básicas
**Status:** PENDENTE DE DECISÃO
**Escopo:** IA, Automação.
**Gatilho:** montar automação com IA.
**Resultado esperado:** IA auxilia na criação de automações básicas.
**Exceções:** —
**Evidência:** demonstrativo.
**Observações:** —

### RN-123 — Sem múltiplos agentes autônomos avançados
**Status:** CONFIRMADO
**Escopo:** IA.
**Gatilho:** conceitual.
**Resultado esperado:** a Fase 1 **não** promete agentes autônomos avançados.
**Exceções:** —
**Evidência:** `state.aiAgents` vazio por padrão.
**Observações:** evitar overpromise.

### RN-124 — AI Builder é demonstrativo
**Status:** PENDENTE DE DECISÃO
**Escopo:** IA.
**Gatilho:** usar AI Builder.
**Resultado esperado:** conectar a fluxo real ou marcar claramente como demonstrativo.
**Exceções:** —
**Evidência:** AI Builder sem fluxo real.
**Observações:** —

---

## 14. Relatórios

### RN-130 — Relatórios derivam de dados reais do state
**Status:** CONFIRMADO
**Escopo:** Relatórios.
**Gatilho:** abrir relatórios.
**Resultado esperado:** números vêm do state (pipes/cards reais).
**Exceções:** —
**Evidência:** auditoria (10 pipes / 13 cards reais).
**Observações:** —

### RN-131 — Contadores não podem ser falsos
**Status:** CONFIRMADO
**Escopo:** Relatórios.
**Gatilho:** exibir contadores.
**Resultado esperado:** nenhum contador inventado.
**Exceções:** —
**Evidência:** auditoria (falsos "13 pipes/3769 resultados" foram removidos).
**Observações:** —

### RN-132 — Total de Pipes bate com catálogo oficial
**Status:** CONFIRMADO
**Escopo:** Relatórios, Pipe.
**Gatilho:** contagem de pipes.
**Resultado esperado:** total = 10 (catálogo).
**Exceções:** —
**Evidência:** `state.pipes`.
**Observações:** —

### RN-133 — Total de resultados bate com Cards reais
**Status:** CONFIRMADO
**Escopo:** Relatórios, Card.
**Gatilho:** contagem de resultados.
**Resultado esperado:** total = 13 (cards reais).
**Exceções:** —
**Evidência:** `state.cards`.
**Observações:** filtros devem usar pipes reais.

---

## 15. Busca global

### RN-140 — Busca encontra Pipes, Cards, Databases, Usuários e Notificações
**Status:** CONFIRMADO
**Escopo:** Busca.
**Gatilho:** digitar na busca.
**Resultado esperado:** retorna os cinco tipos do seed.
**Exceções:** —
**Evidência:** `search()` no state (verificado na auditoria).
**Observações:** —

### RN-141 — Busca respeita a Organização atual
**Status:** CONFIRMADO (conceito) / NÃO CONFIRMADO (multi-org)
**Escopo:** Busca, Organização.
**Gatilho:** busca.
**Resultado esperado:** resultados apenas da organização atual.
**Exceções:** —
**Evidência:** o seed tem uma org operacional; isolamento não testado com múltiplos conjuntos.
**Observações:** validar com multi-org.

### RN-142 — Busca local decorativa deve ser marcada
**Status:** PENDENTE DE DECISÃO
**Escopo:** Busca.
**Gatilho:** buscas locais em telas específicas.
**Resultado esperado:** buscas decorativas marcadas como demonstrativas ou implementadas.
**Exceções:** —
**Evidência:** buscas locais de tela não unificadas.
**Observações:** —

---

## 16. Painel Administrativo da Organização

### RN-150 — Configura somente a Organização atual
**Status:** CONFIRMADO
**Escopo:** Painel Administrativo.
**Gatilho:** usar o painel.
**Resultado esperado:** configura apenas a organização atual.
**Exceções:** —
**Evidência:** `painel-administrativo.html`.
**Observações:** —

### RN-151 — Não configura a Plataforma inteira
**Status:** CONFIRMADO
**Escopo:** Painel Administrativo.
**Gatilho:** —
**Resultado esperado:** não altera configurações de plataforma.
**Exceções:** —
**Evidência:** escopo de organização.
**Observações:** plataforma = Super Admin (RN-160).

### RN-152 — Não confundir com Super Admin
**Status:** CONFIRMADO
**Escopo:** Painel Administrativo, Super Admin.
**Gatilho:** conceitual.
**Resultado esperado:** áreas distintas.
**Exceções:** —
**Evidência:** organização vs plataforma.
**Observações:** RN-200.

### RN-153 — Financeiro, Estatísticas e Auditoria podem ser ilustrativos
**Status:** CONFIRMADO (se documentados assim)
**Escopo:** Painel Administrativo.
**Gatilho:** abrir essas seções.
**Resultado esperado:** conteúdo ilustrativo é aceitável desde que declarado.
**Exceções:** —
**Evidência:** seções ilustrativas no painel.
**Observações:** documentar como ilustrativo.

---

## 17. Super Admin

### RN-160 — Super Admin é área da Plataforma
**Status:** NÃO CONFIRMADO (como tela integrada) — decisão oficial registrada
**Escopo:** Plataforma.
**Gatilho:** administração de plataforma.
**Resultado esperado:** Super Admin é uma área da plataforma, separada da organização.
**Exceções:** —
**Evidência:** hoje só existe como `role`; sem tela integrada.
**Observações:** Status oficial: **NÃO INTEGRADO AO PROTÓTIPO UNIFICADO · REFERÊNCIA SEPARADA**.

### RN-161 — Super Admin não é Administrador da Organização
**Status:** CONFIRMADO
**Escopo:** Super Admin, Papel da Organização.
**Gatilho:** conceitual.
**Resultado esperado:** papéis de níveis diferentes (plataforma vs organização).
**Exceções:** —
**Evidência:** `role` vs `orgRole`.
**Observações:** RN-200.

### RN-162 — Super Admin não é role comum da Organização
**Status:** CONFIRMADO
**Escopo:** Super Admin.
**Gatilho:** conceitual.
**Resultado esperado:** não tratar Super Admin como papel comum dentro da org.
**Exceções:** —
**Evidência:** modelo de dois eixos de papel.
**Observações:** —

### RN-163 — Documentar Super Admin como módulo separado
**Status:** PENDENTE DE DECISÃO
**Escopo:** Plataforma.
**Gatilho:** documentação/implementação.
**Resultado esperado:** Super Admin documentado como módulo de plataforma separado, mesmo sem integração atual.
**Exceções:** —
**Evidência:** decisão oficial (entidades — Super Admin).
**Observações:** integrar depois; não reabrir a lógica agora.

---

## 18. Logs e Auditoria

### RN-170 — Histórico do Card ≠ Log Administrativo
**Status:** CONFIRMADO (distinção)
**Escopo:** Card, Log.
**Gatilho:** conceitual.
**Resultado esperado:** histórico é por item (card); log/auditoria é por organização.
**Exceções:** —
**Evidência:** modal do card (histórico) vs painel (auditoria).
**Observações:** RN-200.

### RN-171 — Log de Automação ≠ Auditoria da Plataforma
**Status:** CONFIRMADO (distinção) / NÃO CONFIRMADO (dado)
**Escopo:** Automação, Auditoria.
**Gatilho:** conceitual.
**Resultado esperado:** logs de automação são distintos da auditoria de plataforma.
**Exceções:** —
**Evidência:** `state.logs` vazio; telas ilustrativas.
**Observações:** —

### RN-172 — Estrutura final de Log/Auditoria é PENDENTE
**Status:** PENDENTE DE DECISÃO
**Escopo:** Log, Auditoria.
**Gatilho:** implementação.
**Resultado esperado:** definir eventos, campos e níveis (item/organização/plataforma).
**Exceções:** —
**Evidência:** `state.logs` vazio.
**Observações:** —

---

## 19. Recursos "Em breve" (Fase 2)

### RN-180 — Recursos fora da Fase 1 aparecem bloqueados/"Em breve"
**Status:** FORA DA FASE 1
**Escopo:** Integrações.
**Gatilho:** tentar acessar recurso de Fase 2.
**Resultado esperado:** ficam bloqueados ou marcados "Em breve":
- API externa;
- Webhooks;
- MCP;
- GraphQL API pública;
- Requisição HTTP externa;
- integrações externas genéricas.
**Exceções:** —
**Evidência:** Token/GraphQL, requisição HTTP e painel de API aparecem como "Em breve" (auditoria).
**Observações:** não implementar na Fase 1.

---

## 20. Limites da unificação

### RN-190 — State central × dado local
**Status:** CONFIRMADO (diagnóstico) / PENDENTE DE DECISÃO (resolução)
**Escopo:** todo o app.
**Gatilho:** implementação.
**Resultado esperado:** reconhecer o que já é fonte única e o que ainda é dado local.

O **state central** já cobre: `currentUser`, `currentOrganization`,
`organizations`, `users`, `pipes`, `databases`, `notifications`, `tasks`,
`requests`, dados de relatórios e busca.

Ainda há **dado local da tela** em: Kanban, Cards, Fases, registros do Database,
templates de e-mail e lista de automações.

**Exceções:** aceitável para a documentação da Fase 1.
**Evidência:** auditoria pós-unificação (fontes de verdade); `grep` mostrando que só shell/state referenciam `window.GIRAFFE`.
**Observações:** **deve ser resolvido antes da implementação** — unificar essas telas ao state central.

---

## 21. Distinções críticas (regra guarda-chuva)

### RN-200 — Distinções oficiais que o sistema deve respeitar
**Status:** CONFIRMADO
**Escopo:** todo o sistema.
**Gatilho:** modelagem, UI e implementação.
**Resultado esperado:** as seguintes distinções nunca podem ser fundidas:

- **Usuário ≠ Organização**
- **Plataforma ≠ Organização**
- **Super Admin ≠ Administrador da Organização**
- **Pipe ≠ Database**
- **Card ≠ Registro**
- **Fase ≠ Status do Card**
- **Formulário inicial do Pipe ≠ Formulário da Fase ≠ Formulário do Database**
- **Histórico do Card ≠ Log Administrativo**
- **Serviço ativo ≠ Serviço validado** (existir na UI não valida o comportamento)
- **API / Webhook / MCP → Fase 2**

**Exceções:** nenhuma.
**Evidência:** consolidado do glossário, modelo conceitual, entidades e relacionamentos.
**Observações:** esta é a régua de coerência da Fase 1.
