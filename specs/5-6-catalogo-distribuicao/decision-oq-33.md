# Decisão de Arquitetura — OQ-33 (Story 5.6: Catálogo e distribuição de Notificações in-app)

> **Gate obrigatório (epics §1640):** OQ-33 fechado na Arquitetura **antes** da implementação. Este documento é
> o artefato do gate. As decisões abaixo são derivadas das fontes autoritativas (PRD FR-30, RN-080..085,
> INV-NOTIF-01, epics §1624-1643) e dos padrões já materializados na base (5.3/5.4/5.5, 2.10, 2.16, 4.3).

## Contexto

A 5.3 entregou a **fonte única** de escrita (`NotificationsService.registrarNotificacao`) — idempotente por
`dedupeKey` (Org+evento+tipo+destinatário), imutável no conteúdo, auditada, com invalidação de tempo real (5.5)
já fiada. A 5.4 entregou as superfícies de leitura, as preferências por tipo e a **revalidação de acesso** por
`resourceType` (`notification-access.dispatcher.ts`). A 5.6 é o **produtor**: define o catálogo canônico de tipos
e **resolve destinatários** por evento, chamando a fonte única — **sem mecanismo paralelo**.

## OQ-33 (a) — Resolução de destinatários (por tipo → quais papéis/relações)

Cada tipo do catálogo declara uma **estratégia de destinatários**. Estratégias da Fase 1:

| Estratégia | Como resolve | Tipos que a usam |
|---|---|---|
| `ALVO_DIRETO` | O produtor fornece a(s) Membership(s)-alvo do evento (ex.: o **novo** Responsável). | `TASK_RESPONSIBLE_ASSIGNED`, `SOLICITACAO_RESPONSIBLE_ASSIGNED`, `CARD_RESPONSIBLE_ASSIGNED` |
| `RESPONSAVEL_TAREFA_ATUAL` | Lê o `responsavelMembershipId` **atual** da Tarefa (nulo ⇒ sem destinatário). | `TASK_OVERDUE` |
| `PARTES_DO_CARD` | Lê as partes do Card: **Responsável atual** (`CardResponsavel` ACTIVE) + **concessões diretas** (`CardGrant` ACTIVE com `podeLer`). | `CARD_MOVED_BY_AUTOMATION` |

Toda estratégia produz **candidatos** `{ membershipId, userId }` (o `userId` = `Account` global, derivado da
Membership). A resolução acontece **sob RLS** (`withTenantContext`/`definirContextoOrg`) — nunca há `where orgId`
manual, e nenhum destinatário fora da Organização do contexto pode ser resolvido (INV-NOTIF-01; RN-085).

## OQ-33 (b) — Deduplicação (mesma pessoa por múltiplos papéis → 1 Notificação)

Dois níveis, defesa em profundidade:

1. **No produtor (pré-entrega):** os candidatos são **colapsados por `membershipId`** antes de chamar a fonte
   (`colapsarPorMembership`). Uma pessoa resolvida por Responsável **e** concessão direta vira um único candidato.
2. **Na fonte única (garantia final):** o índice único `NotificationRecipient(orgId, dedupeKey)` colapsa o
   reprocesso e os papéis remanescentes — `dedupeKey = "{sourceEventId}|{type}|{membershipId}"` (5.3). Reexecutar
   a distribuição do **mesmo** evento (mesmo `sourceEventId`) é **idempotente**.

## OQ-33 (c) — Momento da resolução (na ocorrência do evento)

**Decisão: fiar no ponto de mutação (síncrono, in-band), como a 5.5** — **não** consumir o outbox `DomainEvent`
(4.3)/`MovementEvent` (2.16). Justificativa:

- O outbox é **INERTE por decisão** (4.3 CA4 / 2.16 CA4: "não dispara Automação/Notificação"). Seu único
  consumidor é o **motor de Automação (4.6)**. Construir um consumidor-de-outbox para Notificações criaria um
  **segundo mecanismo** de disparo (proibido: "sem mecanismos paralelos", epics §1626) e **antecipa infra** sem
  consumidor concreto (AD-11).
- Resolver no ponto de mutação garante **acesso e preferências ATUAIS** no instante da criação (d/e).

A distribuição é chamada **após o commit** da mutação, **best-effort e fault-isolated** (como o `realtime` da
5.5): uma falha na distribuição **não** derruba a mutação já persistida; a fonte é o banco e a fonte única é
idempotente por `sourceEventId`.

**`sourceEventId` por gatilho** (idempotência determinística):
- `*_RESPONSIBLE_ASSIGNED`: `randomUUID()` gerado no ato da atribuição bem-sucedida — cada atribuição é um evento
  distinto (atribuir A, depois B, depois A de novo = três eventos). A atribuição idempotente (mesmo Responsável)
  **não** dispara distribuição (retorno antecipado no serviço de mutação), então não há duplicata.
- `TASK_OVERDUE`: `uuidv5(NS, "TASK_OVERDUE:{orgId}:{taskId}:{dueVersion}")` — estável por ocorrência; re-scan
  **não** re-notifica (dedupe na fonte). Alterar o prazo bumpa `dueVersion` (5.1) ⇒ nova ocorrência ⇒ novo evento.
- `CARD_MOVED_BY_AUTOMATION`: o `eventId` determinístico do `MovementEvent` (2.16) — uma movimentação = um evento.

## OQ-33 (d) — Comportamento após perda de acesso

Cada candidato precisa de **acesso ATUAL ao recurso no momento da criação** — **reusando a mesma lógica da 5.4**
(as guardas finas puras de `pipe-authz`/`database-authz`), não um segundo mecanismo:

- `CARD`: `resolverAcessoDaMembership(db, membershipId, cardId)` (2.10, não-lançante) — precisa de `podeLer`.
- `TASK`/`SOLICITACAO`: o recurso é **Pipe-scoped**; `resolverPoderDaMembershipNoPipe(db, membershipId, pipeId)`
  (novo em `pipe-authz`, espelho por-Membership de `resolverPoderNoPipe`) — precisa de qualquer poder (ler ≠ operar).

Quem **perdeu o acesso** (Membership suspensa/removida, concessão revogada, papel rebaixado) é **excluído**
(fail-closed). A **Notificação NUNCA concede acesso** (RN-084). Memberships **não-ACTIVE** são excluídas — as
guardas de acesso já reconfirmam `state = ACTIVE`.

## OQ-33 (e) — Aplicação de preferências (5.4) ANTES da entrega

Depois da revalidação de acesso e **antes** de criar a entrega, cada candidato tem sua **preferência efetiva**
resolvida (`resolverPreferenciaEfetiva(type, override)` — precedência `obrigatório › override › padrão`, 5.4). O
`override` vem de `NotificationPreference(orgId, membershipId, type)`. Candidato com preferência efetiva `false`
(tipo silenciado) é **excluído da entrega**. Tipo **obrigatório** nunca é silenciado (a preferência não o
silencia). Isso fecha o requisito "preferências por tipo aplicadas antes da criação da entrega" (epics §1633).

## OQ-33 (f) — Fan-out e limites operacionais

- **Bounded por construção:** `ALVO_DIRETO`/`RESPONSAVEL_TAREFA_ATUAL` resolvem **≤ 1** candidato;
  `PARTES_DO_CARD` é limitado pelas concessões de um Card (poucas). Um **CAP** (`MAX_DESTINATARIOS = 500`,
  fail-closed) protege contra fan-out patológico — excedente é truncado de forma determinística e logado.
- **Sem N+1:** a resolução é um punhado de queries indexadas; a revalidação de acesso é por-Membership e
  memoizável na janela (bounded pelo CAP).
- **Best-effort pós-commit:** o custo de distribuição não entra na latência da mutação crítica (a mutação já
  respondeu); um erro é logado, não propagado.

## Catálogo — CÓDIGO, não tabela (sem migration)

O catálogo de tipos é **código puro** (`notification-catalog.ts`), como os catálogos de Evento (4.3), Ação (4.5)
e Condição (4.4). **Nenhuma migration**: a distribuição usa a fonte 5.3 já existente; `Notification.type`/
`NotificationPreference.type` já são `String` estrutural. O registro mínimo da 5.4
(`notification-type-registry.ts`) passa a **derivar do catálogo** (fonte única dos metadados de preferência),
fechando **DEB-5.4-TIPO-OBRIGATORIO** (padrão/obrigatoriedade/desativável agora declarados por tipo).

### Tipos do catálogo (Fase 1)

| Tipo | resourceType | Estratégia | Ator | Padrão | Desativável | Obrigatório | Origem |
|---|---|---|---|---|---|---|---|
| `TASK_RESPONSIBLE_ASSIGNED` | TASK | ALVO_DIRETO | excluído | on | sim | não | E5 (implementado) |
| `SOLICITACAO_RESPONSIBLE_ASSIGNED` | SOLICITACAO | ALVO_DIRETO | excluído | on | sim | não | E5 (implementado) |
| `CARD_RESPONSIBLE_ASSIGNED` | CARD | ALVO_DIRETO | excluído | on | sim | não | E5 (implementado) |
| `TASK_OVERDUE` | TASK | RESPONSAVEL_TAREFA_ATUAL | n/a (sistema) | on | sim | não | E5 (implementado) |
| `CARD_MOVED_BY_AUTOMATION` | CARD | PARTES_DO_CARD | n/a (automação) | on | sim | não | E5 (implementado) |
| `AI_COMMAND_AWAITING_APPROVAL` | CARD | — (slot) | — | on | sim | não | E6 (slot) |
| `INVITE_ACCEPTED` | ORGANIZACAO | — (slot) | — | on | sim | não | E8 (slot) |

**Obrigatoriedade nasce toda `false`** — não se **inventa** obrigatoriedade sem decisão explícita de Produto
(Constitution; espelha o "preflight vacuamente verdadeiro" da 2.10 e o "obrigatório vazio" da 5.4). O mecanismo
**existe e é testável**; o conjunto obrigatório é populável por decisão futura sem mudar o código de resolução.

**Regra do ator:** os tipos de designação **excluem o ator** — quem se atribui como Responsável não recebe
Notificação da própria ação (RN-082/§1632). `TASK_OVERDUE` e `CARD_MOVED_BY_AUTOMATION` são **de sistema/
automação** (ator não-humano) — nenhum destinatário-ator a excluir.

## Escopo IMPLEMENTADO vs. CONTRATO (recorte anti-especulação — AD-11)

**Wirado real (request context), end-to-end:**
- `TASK_RESPONSIBLE_ASSIGNED` — `TasksService.atribuirResponsavel` (5.1).
- `SOLICITACAO_RESPONSIBLE_ASSIGNED` — `SolicitacoesService.atribuirResponsavel` (5.2).
- `CARD_RESPONSIBLE_ASSIGNED` — `CardAccessService.atribuirResponsavel` (2.10).

**Wirado real (contexto de sistema):**
- `TASK_OVERDUE` — `TaskOverdueService.escanearOrg` distribui para cada ocorrência **nova** (o mecanismo é
  invocável; o driver contínuo segue deferido — `DEB-5-1-OVERDUE-DRIVER`, já existente).

**Capacidade implementada + testada real, TRIGGER deferido:**
- `CARD_MOVED_BY_AUTOMATION` — a **distribuição** (estratégia `PARTES_DO_CARD` + pipeline completo) é implementada
  e testada por invocação direta do serviço contra PostgreSQL real. O **gatilho automático** a partir do motor
  4.6 é deferido para a **5.7** (`DEB-5.6-CARD-MOVED-AUTOMATION-WIRING`), porque: (1) o outbox é inerte (CA4);
  (2) o caminho atual motor→`CardMovementService.mover` fixa `origin='MOVE'` sem um sinal distinto de "movido por
  automação"; (3) fiar esse sinal é **integração com E4**, que é literalmente o escopo da 5.7 ("Integração com o
  motor de Automação"). Registrar o tipo agora (contrato) + implementar a distribuição é o correto por AD-11.

**Apenas SLOT (registrado, não implementado — dono do produtor é outro Épico):**
- `AI_COMMAND_AWAITING_APPROVAL` (E6) e `INVITE_ACCEPTED` (E8) — declarados no catálogo (mesma fonte, sem
  mecanismo paralelo), mas **sem produtor** wirado (contrato-futuro AD-11). Tentar distribuir um tipo-slot é
  erro de programação (fail-closed).

## Resultado explícito (sem falha silenciosa)

`distribuir(...)` **sempre** devolve um `ResultadoDistribuicao` explícito e auditável:
- `entregue` — Notificação criada; `notificationId` + `destinatariosCriados`.
- `sem_destinatario` — nenhum candidato sobreviveu (ausente/perdeu acesso/silenciou tudo) — **não** chama a fonte
  (que exigiria ≥1 destinatário), loga o motivo e devolve o resultado. Nunca é falha silenciosa (epics §1634).

## Isolamento / GRANT / auditoria

- **Sem dado novo** ⇒ **sem migration, sem GRANT novo**. A escrita é 100% pela fonte 5.3 (RLS+FORCE+WITH CHECK já
  provados; `Notification`/`NotificationRecipient` em `MODELOS_AUDITADOS`).
- A fonte única ganha um caminho **aditivo** context-explícito (`registrarNotificacaoNoContexto(tenantCtx, ...)`)
  para suportar produtores de **sistema** (overdue) sem request context — **o corpo de escrita é o mesmo**
  (reparametriza só a origem do contexto, exatamente como `withTenantContext`/`definirContextoOrg` já são
  parametrizados). `registrarNotificacao(evento)` passa a delegar usando o request context. Não reimplementa a
  fonte; não altera semântica de escrita/idempotência/auditoria.
- C3 (`ability.ts`/guard) **congelado** — toda autoridade fina vive em funções puras no serviço (DBT-AUTHZ-01).

## Pré-implementação (gate)

- **Context7:** nenhuma API nova de biblioteca externa (Prisma/Nest já na stack, versões do lockfile). Padrões
  reusados: `$transaction([...definirContextoOrg, $queryRaw])` (5.5/3.5), `uuidV5` determinístico (2.16/4.3).
- **Risco:** ALTO (distribuição + autz/acesso + idempotência + preferências) — gates de risco alto aplicáveis.
- **Migration/rollback:** não aplicável (sem dado novo).
</content>
</invoke>
