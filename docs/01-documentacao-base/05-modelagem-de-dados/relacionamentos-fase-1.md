# Relacionamentos — Giraffe CRM · Fase 1 (Modelagem Conceitual)

> Relacionamentos **conceituais** entre as entidades da Fase 1 (ver
> `entidades-fase-1.md`). Sem schema, sem chaves estrangeiras físicas, sem SQL.
> Notação: `A —(cardinalidade)→ B`. Evidência em `giraffe-state.js` e no
> protótipo. Marcações: `CONFIRMADO` · `NÃO CONFIRMADO` · `PENDENTE DE DECISÃO` · `FORA DA FASE 1`.

---

## 1. Mapa geral

```
Plataforma
  └─(1—N)→ Organização
              ├─(1—N)→ Usuário (membro)
              ├─(1—N)→ Pipe
              │          ├─(1—N)→ Fase
              │          ├─(1—N)→ Card
              │          │          ├─(N—1)→ Fase atual
              │          │          ├─(N—1)→ Usuário (criador)
              │          │          ├─(1—N)→ Histórico (evento do card)
              │          │          ├─(1—N)→ E-mail
              │          │          └─(N—N)→ Registro   [Conexão — PENDENTE]
              │          ├─(1—N)→ Automação
              │          ├─(1—1)→ Formulário inicial
              │          └─(1—N)→ Formulário da Fase   [1 por fase]
              ├─(1—N)→ Database
              │          ├─(1—N)→ Registro
              │          └─(1—1)→ Formulário do Database
              ├─(1—N)→ Notificação
              ├─(1—N)→ Tarefa
              ├─(1—N)→ Solicitação
              └─(1—N)→ Template de e-mail
```

---

## 2. Relacionamentos por entidade

### Organização → possui usuários
`Organização —(1—N)→ Usuário`.
- Evidência: `state.users` + `state.currentOrganization`.
- **Status:** `CONFIRMADO` conceitualmente; vínculo por `orgId` no usuário `NÃO CONFIRMADO` (o seed não guarda `orgId` no usuário).

### Organização → possui pipes
`Organização —(1—N)→ Pipe`.
- Evidência: `state.pipes` (catálogo da organização atual).
- **Status:** `CONFIRMADO` conceitualmente; falta `orgId` no pipe. `NÃO CONFIRMADO` no dado.

### Organização → possui databases
`Organização —(1—N)→ Database`.
- Evidência: `state.databases`.
- **Status:** `CONFIRMADO` conceitualmente; falta `orgId`. `NÃO CONFIRMADO` no dado.

### Usuário → pertence a uma organização
`Usuário —(N—1)→ Organização`.
- Evidência: usuário atual opera dentro de *Giraffe Marketing*; "Trocar de empresa" alterna a org.
- **Status:** `CONFIRMADO` conceitualmente. `NÃO CONFIRMADO` se um usuário pode pertencer a **várias** organizações (há 2 orgs no seed, mas o vínculo não é explícito).

### Usuário → possui papel na organização
`Usuário —(1—1)→ Papel da Organização` (`orgRole`).
- Evidência: `currentUser.orgRole` e `orgRole` dos membros.
- **Status:** `CONFIRMADO`. Valores: Administrador da Organização, Editor, Visualizador.

### Usuário → pode possuir acesso de plataforma
`Usuário —(1—1)→ Papel da Plataforma` (`role`).
- Evidência: `currentUser.role = "Super Admin"`; demais `Membro`.
- **Status:** `CONFIRMADO`. **Super Admin ≠ Administrador da Organização.**

### Pipe → possui fases
`Pipe —(1—N)→ Fase`.
- Evidência: `state.phases[*].pipeId` aponta para o pipe.
- **Status:** `CONFIRMADO` (fases seedadas só para *Contratos e Juridicos*; demais pipes `NÃO CONFIRMADO`).

### Pipe → possui cards
`Pipe —(1—N)→ Card`.
- Evidência: `state.cards[*].pipeId`.
- **Status:** `CONFIRMADO`.

### Fase → pertence a um pipe
`Fase —(N—1)→ Pipe`.
- Evidência: `phase.pipeId`.
- **Status:** `CONFIRMADO`. Não há fase compartilhada entre pipes.

### Card → pertence a um pipe
`Card —(N—1)→ Pipe`.
- Evidência: `card.pipeId`.
- **Status:** `CONFIRMADO`.

### Card → está em uma fase atual
`Card —(N—1)→ Fase`.
- Evidência: `card.phase` (nome-texto da fase).
- **Status:** `CONFIRMADO` conceitualmente; vínculo é por **nome**, não `phaseId`. `NÃO CONFIRMADO` como referência forte.

### Card → possui histórico
`Card —(1—N)→ Evento de histórico`.
- Evidência: aba de histórico no modal do card (`dado local da tela`).
- **Status:** `NÃO CONFIRMADO` no state (histórico não modelado no seed). **Histórico do Card ≠ Log Administrativo.**

### Card → pode possuir tarefas
`Card —(1—N)→ Tarefa` (proposto).
- Evidência atual: `Tarefa.pipeId` liga a **pipe**, não a card.
- **Status:** `NÃO CONFIRMADO` (vínculo hoje é por pipe). `PENDENTE DE DECISÃO` se tarefa deve referenciar `cardId`.

### Card → pode possuir e-mails
`Card —(1—N)→ E-mail`.
- Evidência: histórico de e-mail no modal do card (`dado local da tela`).
- **Status:** `NÃO CONFIRMADO` no state (não há coleção `emails`). Regra: histórico no card não deve contradizer a caixa de entrada.

### Card → pode se conectar a registros
`Card —(N—N)→ Registro` (Conexão).
- Evidência: "card conectado" aparece como "Em breve".
- **Status:** `PENDENTE DE DECISÃO` (cardinalidade e semântica em aberto). **Card ≠ Registro.**

### Database → possui registros
`Database —(1—N)→ Registro`.
- Evidência: tabela em `database-empresas-parceiras.html`.
- **Status:** `CONFIRMADO` conceitualmente; `state.records` **vazio** — registros são `dado local da tela`. `NÃO CONFIRMADO` no state central.

### Registro → pertence a um database
`Registro —(N—1)→ Database`.
- Evidência: registros exibidos dentro de um database específico.
- **Status:** `CONFIRMADO` conceitualmente; `recordId/databaseId` `NÃO CONFIRMADO` no seed.

### Automação → pertence a um pipe ou contexto
`Automação —(N—1)→ Pipe`.
- Evidência: `automation.pipeId`.
- **Status:** `CONFIRMADO` (contexto atual = pipe). Outros contextos `NÃO CONFIRMADO`.

### Automação → possui evento, condições e ações
`Automação —(1—1)→ Evento`, `Automação —(0—N)→ Condição`, `Automação —(1—N)→ Ação` (modelo).
- Evidência: `automation.event` e `automation.action` (texto); condição não modelada como dado.
- **Status:** Evento/Ação `CONFIRMADO` como texto; **Condição `NÃO CONFIRMADO`** (ausente no seed). Ação "requisição HTTP" = `FORA DA FASE 1`.

### E-mail → pode estar ligado a card
`E-mail —(N—1)→ Card` (opcional).
- Evidência: histórico de e-mail no card.
- **Status:** `NÃO CONFIRMADO` no state.

### Template de e-mail → pode ser usado em ação de automação
`Template —(1—N)→ Ação de Automação` (uso).
- Evidência: ação "Enviar template de email" nomeia o template.
- **Status:** `NÃO CONFIRMADO` como vínculo por `templateId` (a ação é texto, não referência).

### Notificação → pode apontar para card, tarefa, solicitação, usuário ou sistema
`Notificação —(N—1)→ Card` **(hoje)**; demais alvos propostos.
- Evidência: `notification.cardId` — **todas** as 15 notificações apontam para card.
- **Status:** Card `CONFIRMADO`. Tarefa/Solicitação/Usuário/Sistema `NÃO CONFIRMADO` (não existem no seed atual).

### IA básica → pode apoiar card, e-mail, automação e resumo
`IA —(apoio)→ Card | E-mail | Automação | Resumo`.
- Evidência: AI Builder e Assistentes de IA (demonstrativos); `state.aiAgents` vazio.
- **Status:** `NÃO CONFIRMADO` como vínculo de dado; `PENDENTE DE DECISÃO` quanto ao escopo de apoio.

---

## 3. Distinções que estruturam os relacionamentos

- **Pipe ≠ Database** — dois ramos separados da Organização. `CONFIRMADO`.
- **Card ≠ Registro** — card vive em pipe/fase; registro vive em database. `CONFIRMADO`.
- **Histórico do Card ≠ Log Administrativo** — histórico é por item (card); log/auditoria é por organização.
- **Super Admin ≠ Administrador da Organização** — plataforma vs organização.
- **Formulário inicial ≠ Formulário da Fase ≠ Formulário do Database** — três relações independentes; alterar um não afeta os outros (isolamento `NÃO CONFIRMADO`).
- **Serviço ativo ≠ serviço validado** — a existência do relacionamento na UI não valida o comportamento.
- **API / Webhook / MCP → `FORA DA FASE 1`** — não há relacionamentos de integração externa na Fase 1.

---

## 4. Cardinalidades em aberto (resumo)

| Relacionamento | Cardinalidade | Status |
|----------------|---------------|--------|
| Card ↔ Registro (Conexão) | 1—N ou N—N | `PENDENTE DE DECISÃO` |
| Usuário ↔ Organização | 1—1 ou N—N | `NÃO CONFIRMADO` |
| Card ↔ Tarefa | por pipe hoje; por card? | `PENDENTE DE DECISÃO` |
| Automação ↔ Condição | 0—N | `NÃO CONFIRMADO` (ausente) |
| Template ↔ Ação de automação | por id? | `NÃO CONFIRMADO` |
| Notificação ↔ (tarefa/solicitação/usuário/sistema) | N—1 | `NÃO CONFIRMADO` (só card hoje) |

---

## 5. Vínculos que faltam no dado (para a implementação)

Estes vínculos existem **conceitualmente** mas **não estão materializados** no
seed atual — devem ser resolvidos antes da implementação:

- `orgId` em Pipe, Database, Usuário, Notificação, Tarefa, Solicitação.
- `phaseId` no Card (hoje `phase` é nome-texto).
- `cardId` em E-mail e (talvez) em Tarefa.
- `templateId` na Ação de automação.
- coleção de **Registros** no state (`state.records` vazio) com `databaseId`.
- estrutura de **Histórico do Card** e de **Log/Auditoria**.
