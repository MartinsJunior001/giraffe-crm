# Fluxo — Pipe → Card → Fase · Giraffe CRM · Fase 1

> Documentação **funcional** (não implementação) de um fluxo principal da Fase 1.
> Descreve **como o sistema deve se comportar** no protótipo unificado, sem
> inventar backend nem fingir que Kanban, Cards e Fases já estão 100%
> centralizados no state. Toda evidência vem de `giraffe-state.js`, do protótipo
> unificado e da auditoria pós-unificação.
>
> **Marcações:** `CONFIRMADO` · `NÃO CONFIRMADO` · `PENDENTE DE DECISÃO` · `FORA DA FASE 1`.
>
> **Aviso de fidelidade:** o quadro Kanban, os cards e as fases ainda são, em
> parte, **dado local da tela** (espelhado no seed), não consumo pleno do state
> central. Isso é registrado como limite, não como comportamento validado.

---

## 1. Objetivo do fluxo

Descrever o caminho operacional do trabalho: a partir do Dashboard, abrir um
**Pipe**, visualizar seu **Kanban**, abrir um **Card**, executá-lo (comentar,
editar, tarefas), **movê-lo entre Fases** e ter o **histórico** do card
registrado, possivelmente disparando **automação** ou **notificação**.

---

## 2. Escopo

- **Inclui:** navegação Dashboard → Pipe → Kanban → Card; leitura da fase atual
  e do formulário da fase; histórico, comentários, tarefas e e-mails no contexto
  do card; movimentação entre fases; registro de evento no histórico; possível
  disparo de automação/notificação.
- **Não inclui:** máquina de estados formal do card, regras oficiais de
  movimentação, gatilhos oficiais de automação, envio real de e-mail e
  integrações externas (`FORA DA FASE 1`).

---

## 3. Entidades envolvidas

- **Organização** — `state.currentOrganization`; escopo de todo o trabalho. `CONFIRMADO`.
- **Pipe** — `state.pipes` (catálogo); **quadro Kanban = `dado local da tela`**. `CONFIRMADO` (catálogo) / `NÃO CONFIRMADO` (board consome o state).
- **Fase** — `state.phases` para o pipe navegável (*Contratos e Juridicos*); render do Kanban = `dado local da tela`. `CONFIRMADO` (fases seedadas do pipe navegável).
- **Card** — `state.cards` (catálogo); Kanban/modal = `dado local da tela`. `CONFIRMADO` (catálogo) / `NÃO CONFIRMADO` (board/modal).
- **Formulário da Fase** — campos associados a uma fase; contexto independente. `dado local da tela`. `NÃO CONFIRMADO` (isolamento de estado).
- **Histórico do Card** — linha do tempo de eventos do card (no modal). `dado local da tela`; não modelado no seed. `NÃO CONFIRMADO`.
- **Comentários** — no modal do card. `dado local da tela`. `NÃO CONFIRMADO`.
- **Tarefas** — `state.tasks` (ligadas a pipe). `CONFIRMADO`; vínculo direto Tarefa→Card por `cardId` `NÃO CONFIRMADO` (hoje é por pipe).
- **E-mails** — histórico de e-mail no modal do card. `dado local da tela`; sem coleção `emails` no state. `NÃO CONFIRMADO`.
- **Automação** — `state.automations` (catálogo); editor/lista na tela = `dado local da tela`. `CONFIRMADO` (catálogo).
- **Notificação** — `state.notifications`; hoje todas apontam para **card** (`cardId`). `CONFIRMADO`.

> Distinções oficiais reforçadas: **Card ≠ Registro**, **Histórico do Card ≠ Log
> Administrativo**, **Fase ≠ Status do Card**.

---

## 4. Pré-condições

1. Usuário logado (ver `fluxo-login-dashboard.md`). `CONFIRMADO` (fluxo).
2. Organização atual definida (`state.currentOrganization`). `CONFIRMADO`.
3. Pipe existente no catálogo (`state.pipes`). `CONFIRMADO`.
4. Fases existentes para o pipe navegável (`state.phases`, *Contratos e Juridicos*). `CONFIRMADO` (só para o pipe navegável).
5. Cards existentes (`state.cards`). `CONFIRMADO` (catálogo).

> Nota: no protótipo, apenas o pipe *Contratos e Juridicos* é totalmente
> navegável (tem `href`, fases e cards seedados). Os outros pipes existem no
> catálogo, mas não têm fases/cards no seed. `NÃO CONFIRMADO` para os demais.

---

## 5. Passo a passo

1. **Usuário acessa o Dashboard.** Vê a grade de pipes. `CONFIRMADO`.
2. **Usuário seleciona um Pipe.** Abre o pipe navegável (`pipe-kanban.html`). `CONFIRMADO` (para o pipe com `href`).
3. **Sistema abre o Kanban.** Renderiza o quadro do pipe. `CONFIRMADO` (visual) / `NÃO CONFIRMADO` (dado do board vem do state).
4. **Sistema lista as fases do Pipe.** Colunas do Kanban a partir das fases do pipe. `CONFIRMADO` (fases do pipe navegável) / render = `dado local da tela`.
5. **Sistema lista os Cards por Fase.** Cada card aparece na coluna da sua fase atual. `CONFIRMADO` (visual) / `NÃO CONFIRMADO` (consumo do state).
6. **Usuário abre um Card.** Abre o modal do card. `CONFIRMADO` (visual).
7. **Sistema mostra os dados do Card.** Título, criador, datas, status. `CONFIRMADO` (campos existem no catálogo `state.cards`).
8. **Sistema mostra a fase atual.** A fase em que o card está no pipe. `CONFIRMADO` (visual); hoje `phase` é **nome-texto**, não `phaseId`. `NÃO CONFIRMADO` (acoplamento fraco).
9. **Sistema mostra o formulário da fase.** Campos do contexto "fase". `dado local da tela`; isolamento de estado `NÃO CONFIRMADO`.
10. **Sistema mostra o histórico.** Linha do tempo de eventos do card. `dado local da tela`; não modelado no seed. `NÃO CONFIRMADO`.
11. **Usuário comenta, edita ou executa tarefa.** Interações no contexto do card. `CONFIRMADO` (visual) / persistência real `NÃO CONFIRMADO`.
12. **Usuário move o Card para outra Fase.** Arrasta/seleciona nova fase. `CONFIRMADO` (visual) / regra oficial de movimentação `PENDENTE DE DECISÃO`.
13. **Sistema atualiza a fase atual.** O card passa a pertencer à nova fase. `CONFIRMADO` (visual) / persistência no state `NÃO CONFIRMADO`.
14. **Sistema registra o evento no histórico.** Movimentação vira entrada no histórico do card. `NÃO CONFIRMADO` (histórico não modelado no seed).
15. **Sistema pode disparar automação ou notificação.** Um evento (ex.: card movido) pode acionar automação/notificação. `NÃO CONFIRMADO` como gatilho real; catálogo de automações/notificações `CONFIRMADO`.

---

## 6. Resultado esperado

O usuário opera um card dentro de um pipe: vê seus dados, a fase atual e o
formulário da fase, interage (comentários/tarefas/e-mail) e move o card entre
fases. Idealmente, cada movimentação:

- atualiza a **fase atual** do card;
- gera uma entrada no **histórico do card**;
- e, quando aplicável, dispara **automação** e/ou **notificação**.

No protótipo atual, o comportamento é **visualmente coerente**, mas a
persistência no state central e os gatilhos automáticos ainda **não** estão
plenamente implementados (ver limites e pendências).

---

## 7. Regras aplicadas

- **Pipe organiza o processo.** É o container Kanban de fases e cards. `CONFIRMADO`.
- **Fase guia a execução atual.** Indica em que etapa o card está. `CONFIRMADO`.
- **Card representa trabalho em andamento.** É o item que percorre as fases. `CONFIRMADO`.
- **Fase ≠ Status do Card.** Fase é a coluna/etapa no pipe; `status` (ok, atrasado, etc.) é um atributo próprio do card. `CONFIRMADO`.
- **Histórico do Card ≠ Log Administrativo.** Histórico é do item; log é da organização. `CONFIRMADO` (distinção); histórico não modelado no seed `NÃO CONFIRMADO`.
- **Formulário da Fase é independente.** Não compartilha estado com o formulário inicial nem com o do database. `NÃO CONFIRMADO` (isolamento a validar).
- **Card pertence a um Pipe.** Via `pipeId`. `CONFIRMADO`.
- **Card está em uma Fase atual.** Hoje representada por `phase` (nome-texto). `CONFIRMADO` (existe) / `NÃO CONFIRMADO` (deveria ser `phaseId`).

---

## 8. Estados possíveis do Card

Valores vistos no seed (`state.cards.status`). `CONFIRMADO` (existem como valores):

- `ok`
- `atrasado`
- `expirado`
- `vencido`
- `finalizado`
- `arquivado`

> A **máquina de estados** (transições válidas entre esses valores) ainda **não**
> está definida. `PENDENTE DE DECISÃO`.

---

## 9. Limites atuais do protótipo

- **Kanban ainda usa dados locais.** O quadro é `dado local da tela`, espelhado no seed. `NÃO CONFIRMADO` (consumo do state).
- **Cards/Fases ainda não consomem totalmente o state central.** Existem no catálogo (`state.cards`, `state.phases`), mas o board/modal usa cópia local. `NÃO CONFIRMADO`.
- **`phaseId` ainda pode estar como nome-texto.** O card guarda `phase` como texto, não referência forte à fase. `NÃO CONFIRMADO`.
- **Histórico no state ainda não está confirmado.** Não há coleção de histórico do card no seed. `NÃO CONFIRMADO`.

> Registro de contexto (auditoria): o state central **já** cobre navegação,
> identidade, pipes, databases, notificações, tarefas, relatórios e busca. Mas
> **Kanban, Cards, Fases, registros do Database, templates e automações** ainda
> têm dados locais no protótipo. Aceitável para a documentação da Fase 1, mas
> deve ser resolvido antes da implementação.

---

## 10. Pendências para implementação futura

1. **Consolidar Cards no state central** (board/modal lendo de `state.cards`). `PENDENTE DE DECISÃO`.
2. **Consolidar Fases no state central** (Kanban lendo de `state.phases`). `PENDENTE DE DECISÃO`.
3. **Definir a máquina de estados do Card** (transições válidas entre os status). `PENDENTE DE DECISÃO`.
4. **Definir regras oficiais de movimentação entre Fases** (o que é permitido, para quem, com quais efeitos). `PENDENTE DE DECISÃO`.
5. **Definir gatilhos de automação ao mover Card** (evento → condição → ação). `PENDENTE DE DECISÃO`.
6. **Modelar histórico do Card** como dado no state. `PENDENTE DE DECISÃO`.
7. **Trocar `phase` (texto) por `phaseId`** (referência forte à fase). `PENDENTE DE DECISÃO`.

---

## 11. Status geral

`CONFIRMADO` como **fluxo navegável e visualmente coerente** para o pipe
*Contratos e Juridicos*: Dashboard → Pipe → Kanban → Card → fase atual →
formulário da fase → interações → movimentação (visual).

`NÃO CONFIRMADO` para **consumo pleno do state central** por Kanban/Cards/Fases,
para **histórico persistido** e para **gatilhos automáticos** de
automação/notificação ao mover o card.

`PENDENTE DE DECISÃO` para **máquina de estados do card, regras de movimentação,
gatilhos de automação e modelagem do histórico**.

`FORA DA FASE 1`: envio real de e-mail, requisição HTTP em automação e
integrações externas.
