# Fluxo — Login → Dashboard · Giraffe CRM · Fase 1

> Documentação **funcional** (não implementação) de um fluxo principal da Fase 1.
> Descreve **como o sistema deve se comportar** no protótipo unificado, sem
> inventar backend, autenticação real ou sessão real. Toda evidência vem de
> `giraffe-state.js`, do protótipo unificado e da auditoria pós-unificação.
>
> **Marcações:** `CONFIRMADO` · `NÃO CONFIRMADO` · `PENDENTE DE DECISÃO` · `FORA DA FASE 1`.
>
> **Aviso de fidelidade:** este documento não afirma que existe backend. O
> protótipo simula o fluxo no navegador. O que não pôde ser confirmado no
> protótipo/auditoria está marcado.

---

## 1. Objetivo do fluxo

Descrever o caminho de entrada no sistema: da abertura do protótipo por
`index.html`, passando pelo login, até o **Dashboard operacional** já com a
identidade do usuário, a organização atual e os dados de contexto carregados.
É o fluxo que estabelece **quem** está usando o sistema e **em qual
organização**.

---

## 2. Escopo

- **Inclui:** abertura por `index.html`, redirecionamento para login, entrada
  demonstrativa, carregamento do shell e do dashboard, carga de usuário,
  organização atual, pipes, databases e notificações, e exibição do badge de
  notificações não lidas.
- **Não inclui:** autenticação real, verificação de credenciais, sessão de
  servidor, recuperação real de senha, provisionamento de usuário. Esses pontos
  são `FORA DA FASE 1` como comportamento real (existem apenas como fluxo
  visual).

---

## 3. Entidades envolvidas

- **Usuário** — `state.currentUser` (ex.: *Martins Júnior*, `u-martins`). `CONFIRMADO`.
- **Organização** — `state.currentOrganization` (ex.: *Giraffe Marketing*, `org-giraffe`) e `state.organizations`. `CONFIRMADO`.
- **Sessão visual** — estado de "logado/deslogado" simulado no protótipo (navegação), **não** sessão de servidor. `NÃO CONFIRMADO` como sessão real.
- **Dashboard** — painel operacional (`dashboard-home.html`) com a grade de pipes/databases e agregados. `CONFIRMADO` (navegável).
- **Shell** — moldura da aplicação (topbar, menu do usuário, "Trocar de empresa", popover de notificações) compartilhada entre telas. `CONFIRMADO`.
- **Notificações** — `state.notifications` (popover, página e badge unificados). `CONFIRMADO`.

> Distinção oficial reforçada: **Usuário ≠ Organização** (identidade da pessoa
> vs empresa/cliente que é o escopo do trabalho).

---

## 4. Pré-condições

1. Protótipo aberto por `index.html`. `CONFIRMADO`.
2. Usuário demonstrativo disponível no state (`state.currentUser`). `CONFIRMADO`.
3. Organização atual definida (`state.currentOrganization`). `CONFIRMADO`.
4. State central carregado (`window.GIRAFFE.state`) antes das telas consumirem identidade e notificações. `CONFIRMADO` (para identidade, notificações, pipes/databases catálogo).

---

## 5. Passo a passo

1. **Abrir `index.html`.** É o ponto de entrada do protótipo. `CONFIRMADO`.
2. **Redirecionar para o login.** O sistema encaminha para a tela de login (`login.html`). `CONFIRMADO` (navegação).
3. **Preencher ou simular login.** O usuário informa credenciais **demonstrativas** ou apenas prossegue; não há verificação real. `NÃO CONFIRMADO` como autenticação real (é fluxo visual).
4. **Entrar no Dashboard.** Ao concluir o login, o sistema navega para `dashboard-home.html`. `CONFIRMADO` (Login leva ao Dashboard).
5. **Carregar o usuário.** O shell lê `state.currentUser` e exibe nome/iniciais no menu do usuário. `CONFIRMADO`.
6. **Carregar a organização atual.** O shell lê `state.currentOrganization` e exibe a empresa atual na topbar. `CONFIRMADO`.
7. **Carregar pipes.** O dashboard monta a grade de pipes a partir de `state.pipes`. `CONFIRMADO` (grade do dashboard consome o state).
8. **Carregar databases.** O dashboard monta a grade de databases a partir de `state.databases`. `CONFIRMADO` (catálogo consome o state).
9. **Carregar notificações.** O shell lê `state.notifications` para o popover e a página de notificações. `CONFIRMADO`.
10. **Exibir badge dinâmico.** O badge mostra o número de notificações **não lidas** (`read: false`). `CONFIRMADO`.

---

## 6. Resultado esperado

O usuário chega ao **Dashboard operacional** autenticado de forma demonstrativa,
com:

- identidade do usuário visível (menu do usuário);
- organização atual visível na topbar (contexto de trabalho definido);
- grade de **pipes** e de **databases** renderizada a partir do state;
- popover/página de **notificações** disponíveis;
- **badge** refletindo a contagem de notificações não lidas.

O contexto (usuário + organização atual) fica estabelecido para todos os fluxos
seguintes (ex.: abrir um pipe — ver `fluxo-pipe-card-fase.md`).

---

## 7. Regras aplicadas

- **Usuário ≠ Organização.** Identidade da pessoa é distinta da empresa/cliente. `CONFIRMADO`.
- **Login leva ao Dashboard.** Concluir o login encaminha ao painel operacional. `CONFIRMADO`.
- **Sair volta ao Login.** A ação de logout retorna à tela de login. `CONFIRMADO` (navegação); encerramento de sessão real `NÃO CONFIRMADO`.
- **Organização atual define contexto.** Todo o trabalho subsequente ocorre dentro de `state.currentOrganization`. `CONFIRMADO` como intenção; vínculo explícito Organização→(pipes/databases/users) por `orgId` `NÃO CONFIRMADO` (hoje é implícito).
- **Badge depende de notificações não lidas.** Badge = contagem de `notifications` com `read: false`; "Marcar todas como lidas" persiste em `localStorage`. `CONFIRMADO`.

---

## 8. Exceções

- **Autenticação real não faz parte do protótipo.** Não há verificação de
  credenciais nem provedor de identidade. `NÃO CONFIRMADO` / `FORA DA FASE 1` como comportamento real.
- **Sessão real não é implementada.** Não há sessão de servidor, token ou
  expiração; o "estar logado" é simulado por navegação. `NÃO CONFIRMADO`.
- **Troca de empresa é demonstrativa.** "Trocar de empresa" alterna a
  organização atual no protótipo, mas não há isolamento de dados por
  organização garantido (falta `orgId` nas entidades filhas). `NÃO CONFIRMADO`.
- **Recuperação de senha (`forgot-password.html`) é fluxo visual**, sem envio
  real. `NÃO CONFIRMADO` como comportamento real.

---

## 9. Limites atuais do protótipo

- O state central **já cobre** identidade (usuário/organização), catálogo de
  pipes/databases, notificações, tarefas, relatórios e busca. `CONFIRMADO`.
- Autenticação, sessão e recuperação de senha **não** têm backend; são
  simulações visuais. `NÃO CONFIRMADO` como comportamento real.
- Não há `orgId` explícito ligando pipes/databases/users à organização; o
  isolamento por organização é implícito. `NÃO CONFIRMADO`.

---

## 10. Pendências para implementação futura

1. Autenticação real (credenciais, provedor de identidade). `PENDENTE DE DECISÃO`.
2. Sessão real (token, expiração, logout que encerra sessão). `PENDENTE DE DECISÃO`.
3. Recuperação de senha real. `PENDENTE DE DECISÃO`.
4. Isolamento efetivo por organização (`orgId` em pipes/databases/users) para que "Organização atual define contexto" seja garantido por dado, não só por UI. `PENDENTE DE DECISÃO`.
5. Modelagem explícita da entidade **Plataforma** e da área de **Super Admin** (fora do dashboard operacional). `PENDENTE DE DECISÃO` (ver `05-modelagem-de-dados` e `04-permissoes`).

---

## 11. Status geral

`CONFIRMADO` como **fluxo navegável** no protótipo (index → login → dashboard,
com carga de identidade, organização, pipes, databases, notificações e badge).

`NÃO CONFIRMADO` / `FORA DA FASE 1` para **autenticação real, sessão real e
troca de empresa com isolamento**, que permanecem simulações visuais.

`PENDENTE DE DECISÃO` para o modelo de autenticação/sessão/isolamento da
implementação futura.
