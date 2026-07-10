# Modelo Conceitual — Giraffe CRM · Fase 1

> Visão **conceitual** (de negócio) das entidades da Fase 1 e de como se
> relacionam. Não é modelagem física de banco — isso vive em
> `05-modelagem-de-dados/`. Todas as entidades e cardinalidades vêm de
> `giraffe-state.js` e do comportamento do protótipo. O que não é observável
> está marcado.

---

## 1. Entidades conceituais

| Entidade | Descrição | Evidência no seed |
|----------|-----------|-------------------|
| **Plataforma** | O Giraffe acima das organizações; escopo do Super Admin | papel `role: Super Admin` |
| **Organização** | Empresa/cliente; escopo de todo o trabalho | `organizations` (2) |
| **Usuário** | Pessoa com acesso; papel de plataforma + papel de org | `users` (5) |
| **Pipe** | Processo em Kanban | `pipes` (10) |
| **Fase** | Etapa/coluna de um Pipe | `phases` (5, do pipe navegável) |
| **Card** | Item que percorre as Fases de um Pipe | `cards` (13) |
| **Formulário** | Configuração de campos (inicial / fase / database) | contextos no protótipo |
| **Campo** | Item de um formulário, de um tipo do catálogo | catálogo visual comum |
| **Database** | Base de registros, separada de Pipe | `databases` (4) |
| **Registro** | Entrada de um Database | tela do database (`state.records` vazio) |
| **Notificação** | Aviso sobre evento de um Card | `notifications` (15) |
| **Tarefa** | Trabalho com prazo ligado a um Pipe | `tasks` (4) |
| **Solicitação** | Pedido em acompanhamento ligado a um Pipe | `requests` (3) |
| **Automação** | Regra Evento→Condição→Ação ligada a um Pipe | `automations` (2) |
| **Template de e-mail** | Mensagem reutilizável | `emailTemplates` (2) |
| **Agente de IA** | Recurso de IA básica | `aiAgents` (vazio) |
| **Log** | Registro de auditoria | `logs` (vazio) |

---

## 2. Relacionamentos principais

```
Plataforma (Giraffe)
  └─ 1..N ─ Organização
              ├─ 0..N ─ Usuário (membro)        [via papel na organização]
              ├─ 1..N ─ Pipe
              │           ├─ 1..N ─ Fase
              │           ├─ 0..N ─ Card ── está em ──> 1 Fase
              │           │           └─ criado por ──> 1 Usuário
              │           ├─ 0..N ─ Automação
              │           └─ 1 ─── Formulário inicial
              │                    (+ 1 Formulário por Fase)
              ├─ 1..N ─ Database
              │           ├─ 0..N ─ Registro
              │           └─ 1 ─── Formulário de Database
              ├─ 0..N ─ Notificação ── refere-se a ──> 1 Card
              ├─ 0..N ─ Tarefa ─────── ligada a ─────> 1 Pipe
              ├─ 0..N ─ Solicitação ── ligada a ─────> 1 Pipe
              └─ 0..N ─ Template de e-mail
```

### Cardinalidades confirmadas

- **Organização 1 — N Pipe.** Cada pipe pertence a uma organização.
- **Pipe 1 — N Fase.** Fase tem `pipeId`; pertence a exatamente um pipe.
- **Pipe 1 — N Card.** Card tem `pipeId`.
- **Fase 1 — N Card.** Card tem `phase` (nome da fase dentro do pipe).
- **Usuário 1 — N Card.** Card tem `creator` (id de usuário).
- **Card 1 — N Notificação.** Notificação tem `cardId`.
- **Pipe 1 — N Automação / Tarefa / Solicitação.** Cada uma tem `pipeId`.
- **Database 1 — N Registro.** `records` no protótipo é gerido pela tela.

### Relacionamentos existentes mas não detalhados

- **Card ↔ Registro (conexão).** Existe conceitualmente; a cardinalidade
  (1—N ou N—N) é `PENDENTE DE DECISÃO`.
- **Automação → Template de e-mail.** A ação "Enviar template de email"
  referencia um template; o vínculo por id é `NÃO CONFIRMADO` no seed
  (a automação nomeia a ação, não um `templateId`).
- **Formulário → Campo → Tipo.** A relação existe; a lista de tipos e o schema
  de um campo serão detalhados em `05-modelagem-de-dados/`.

---

## 3. Regras conceituais observáveis

1. **Organização é o limite de tudo.** Pipes, Databases, Cards, Usuários,
   Notificações, Tarefas e Solicitações pertencem à organização atual. A busca
   global opera dentro desse limite.
2. **Usuário e Organização são entidades distintas** (dois eixos de papel:
   plataforma e organização).
3. **Um Card pertence a um único Pipe e está em uma única Fase** por vez.
4. **Fase pertence a um único Pipe** — não há fase compartilhada entre pipes.
5. **Notificação sempre aponta para um Card existente.**
6. **Formulário inicial, de Fase e de Database são independentes** entre si,
   apesar de compartilharem o catálogo de tipos de campo (regra de negócio;
   validação comportamental `NÃO CONFIRMADO`).
7. **Database é separado de Pipe** — bases de dados não são pipes.
8. **Automação segue Evento → (Condição) → Ação** e é ligada a um Pipe.

---

## 4. Fronteira com a Fase 2 (conceitual)

Entidades/recursos de integração externa **não fazem parte** deste modelo
conceitual da Fase 1 e aparecem apenas como "Em breve":
Token/GraphQL API, Webhooks, MCP, integrações externas genéricas e a ação de
**requisição HTTP** em automações. Serão modelados quando a Fase 2 for aberta.

---

## 5. Itens em aberto (para as próximas seções)

- Cardinalidade e semântica da **conexão Card ↔ Registro** — `PENDENTE DE DECISÃO`.
- Lista oficial de **tipos de campo** — a inventariar em `06`.
- Vínculo **Automação → Template** por id — `NÃO CONFIRMADO`.
- **Super Admin** como entidade/área separada da Organização — `NÃO CONFIRMADO`.
- Schema de **Registro** de Database (campos por database) — a definir em `06`.
