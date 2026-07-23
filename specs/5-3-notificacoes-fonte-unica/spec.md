# Spec — Story 5.3: Fonte única de Notificações (write-side, modelo canônico)

**Épico 5 (Tarefas, Solicitações e Notificações), 3ª Story.** Fonte: `epics.md` §1561–1581.
**Risco:** ALTO (migration + duas entidades novas + RLS + idempotência lógica + sanitização anti-XSS).

A 5.3 é **write-side/modelo**: entrega a **fonte única** de toda Notificação — o modelo canônico que
**separa** o evento/conteúdo (append-only, imutável) do estado de leitura por destinatário (mutável,
auditável) — mais o serviço de escrita que grava a partir de um "evento notificável", a operação de
marcar-lido e o núcleo puro de sanitização. **Não** entrega superfícies de leitura (badge/popover/página =
5.4), catálogo/distribuição de tipos (5.6), produtores concretos (5.6/5.7/E8) nem tempo-real (5.5).

## 1. Objetivo

Base do **INV-NOTIF-01** (uma única verdade para toda Notificação, tenant-safe e sanitizada). Duas entidades
org-scoped novas — **`Notification`** (conteúdo/evento canônico, imutável) e **`NotificationRecipient`** (um
registro por destinatário, mutável) — com **idempotência lógica** por *Org + Evento de origem + tipo +
destinatário*, GRANT-como-fronteira (Notification append-only; Recipient UPDATE column-scoped, sem DELETE) e
sanitização fail-closed dos parâmetros de renderização.

## 2. Decisão material — recorte write-side vs. 5.4/5.6 (a fronteira)

O Escopo (§1567) e o Fora do escopo (§1580) dividem a 5.3 do resto do Épico. Resolvido pelas fontes:

- **`readAt` e "marcar como lida":** o campo `readAt` (e o estado **derivado** lido/não-lido) é da 5.3
  (§1568 lista `readAt` no destinatário). A **operação HTTP** "marcar como lida" com **contagem no
  servidor** e o cursor de "marcar todas" são **explicitamente da 5.4** (§1583–1585). Resolução: a 5.3
  entrega **`marcarComoLida` como método de SERVIÇO** (write-side auditável, idempotente, guarda otimista),
  **sem rota HTTP**; a rota + contagem + cursor de "todas" são contrato-futuro consumido pela 5.4. Leitura
  mais defensável: a 5.4 é "Superfícies, leitura e preferências" e é dona de toda superfície.
- **Revalidação de acesso na leitura ("perda de acesso oculta/sanitiza/não conta"):** a 5.3 entrega o
  **modelo que a torna possível** — a `Notification` guarda **referência-por-id** ao recurso (nunca o
  conteúdo), o `availabilityState` e o `params` sanitizado; a **revalidação em si** (revalidar a autz atual,
  ocultar, excluir da contagem) é **read-side = 5.4** (§1571). A 5.3 não inventa o produtor da supressão.
- **Sem rota de criação pelo cliente:** criar Notificação é ato de **produtor de sistema** (5.6/5.7/E8),
  nunca do cliente. A 5.3 **não** abre rota HTTP de criação — isso seria superfície/produtor (fora do
  escopo). O **consumidor concreto** que evita "modelo vazio" é o **próprio serviço de escrita testado
  ponta-a-ponta** (idempotência, sanitização, readAt, isolamento) — não se cria um tipo/produtor concreto.

Ver `decisions/notification-canonical-model-5-3.md`.

## 3. Modelo de dados

### `Notification` (append-only, IMUTÁVEL; RLS ENABLE+FORCE + WITH CHECK INSERT/UPDATE; `MODELOS_AUDITADOS`)
- `id` (UUID, PK), `orgId` (UUID; FK `→Organization`, Cascade).
- `type` (TEXT — o **tipo** da Notificação; catálogo = 5.6, por isso `String`, como `CardHistory.type`),
  `typeVersion` (INT `@default(1)` — a **versão** do tipo, §1567).
- `sourceEventId` (UUID — o **Evento de origem**; componente da idempotência; **referência-por-id, SEM FK** —
  os produtores 5.6/5.7/E8 têm origens distintas; um FK forçaria acoplamento/cascata).
- `resourceType` (TEXT), `resourceId` (UUID?) — **referência INTERNA ao recurso** (ids, NUNCA payload). É o
  que permite à 5.4 **revalidar a autz atual** e ocultar/sanitizar/excluir-da-contagem o inacessível.
  Referência-por-id SEM FK (a Notificação **nunca concede acesso**; perder o recurso não apaga a trilha).
- `actorId` (UUID?) — **ator/iniciador** (referência-por-id, como `MembershipEvent.actorId`/`CardHistory.actorId`).
- `occurredAt` (`@db.Timestamptz(3)` `@default(now())`) — data/hora do evento (instante absoluto).
- `params` (JSONB `@default("{}")`) — parâmetros mínimos **SANITIZADOS** para renderização (allowlist
  estrutural fail-closed; escapados contra HTML/script). **Nunca** payload bruto/token/segredo/URL/PII.
- `createdAt`.
- **Idempotência do conteúdo:** `@@unique([orgId, sourceEventId, type])` — 1 conteúdo por (Org, Evento de
  origem, tipo); reprocessar **não** cria 2º conteúdo nem **sobrescreve** o congelado (imutável).
- `@@unique([orgId, id])` — alvo da FK COMPOSTA tenant-safe do destinatário.
- **GRANT:** **SÓ `SELECT/INSERT`** — APPEND-ONLY imutável (como `MembershipEvent`/`CardHistory`/`FormVersion`).
  Sem UPDATE/DELETE de runtime.

### `NotificationRecipient` (MUTÁVEL, auditável; RLS ENABLE+FORCE + WITH CHECK INSERT/UPDATE; `MODELOS_AUDITADOS`)
- `id` (UUID, PK), `orgId` (UUID; FK `→Organization`, Cascade).
- `notificationId` (UUID; **FK COMPOSTA tenant-safe** `(orgId,notificationId)→Notification(orgId,id)`, Cascade).
- `recipientMembershipId` (UUID) — o destinatário (a pessoa **na Org** = a Membership). **Referência-por-id,
  SEM FK** (mesma decisão de `Solicitacao.responsavelMembershipId`/`CardResponsavel`: FK composta a
  Membership é inviável — `orgId` NOT NULL compartilhado impede `SetNull`, `Cascade` quebraria LGPD).
- `recipientUserId` (UUID) — a `Account` global do destinatário (referência-por-id, SEM FK; `Account` é
  global sem RLS — um FK com Cascade apagaria destinatários de **todas** as Orgs).
- `readAt` (`@db.Timestamptz(3)`?) — **nulo = não-lido / preenchido = lido**. O estado lido/não-lido é
  **DERIVADO** de `readAt` (função pura `estaLida`), **nunca** um booleano persistido.
- `deliveredAt` (`@db.Timestamptz(3)` `@default(now())`) — data de **entrega lógica**.
- `availabilityState` (`NotificationAvailability` `@default(AVAILABLE)`) — `AVAILABLE`/`SUPPRESSED` (estado de
  **disponibilidade**). A **transição** para `SUPPRESSED` (revalidação por perda de acesso) é 5.4; a 5.3
  entrega o campo + o GRANT que a permite.
- `dedupeKey` (TEXT) — **chave de deduplicação** determinística: `"{sourceEventId}|{type}|{recipientMembershipId}"`.
- `createdAt`, `updatedAt` (`@updatedAt`).
- **Idempotência (o coração da Story):** `@@unique([orgId, dedupeKey])` — **1 registro por (Org + Evento de
  origem + tipo + destinatário)**. Reprocessar o Evento **ou** múltiplos papéis que resolvam para a **mesma
  pessoa** (mesma Membership) colapsam na **mesma** `dedupeKey` → sem duplicidade.
- `@@index([orgId, notificationId])` (listar destinatários de uma Notificação); `@@index([orgId,
  recipientMembershipId])` (Notificações de um destinatário — base da leitura/contagem da 5.4).
- **GRANT:** `SELECT/INSERT` + **UPDATE COLUMN-SCOPED** de **só** `readAt`, `availabilityState`, `updatedAt`.
  **NÃO** `notificationId`/`recipient*`/`orgId`/`deliveredAt`/`dedupeKey` (imutáveis por GRANT). **Sem DELETE**
  (não se apaga o dado do titular — LGPD; suprimir = `availabilityState`).

### Enum
`enum NotificationAvailability { AVAILABLE, SUPPRESSED }`.

**Sem tabela de Histórico separada:** o *append-only auditável* é a própria `Notification`; o *mutável
auditável* é a `NotificationRecipient` (o `readAt`/`availabilityState` é a trilha do estado). O epics não pede
`NotificationHistory` — não se inventa (Constitution).

## 4. Núcleo puro de sanitização (`notification-content.core.ts`) — fail-closed, testável

- `escaparHtml(s)`: escapa `& < > " '` para entidades (defesa anti-XSS no **write**; `<script>` → `&lt;script&gt;`).
- `sanitizarValorRenderizavel(s)`: `trim` + escape HTML + teto de comprimento (500). Remove chars de controle.
- `sanitizarParametros(raw)`: **allowlist estrutural** — raw não-objeto → `{}`; chaves fora de
  `^[a-zA-Z][a-zA-Z0-9_]*$` (bloqueia `__proto__`/`constructor`/`prototype`) → descartadas; teto de chaves
  (20); **só valores escalares** (string escapada / número finito / booleano) — objeto/array/null/função →
  **descartado** (nunca aninha payload). Fail-closed: o que não casa **não é ecoado cru**.
- `validarType(s)`/`validarResourceType(s)` (`^[A-Z][A-Z0-9_]*$`) e `validarUuid(s)` — retornam boolean; o
  serviço compõe e lança `BadRequestException` sanitizada (contrato do produtor). O núcleo é PURO (sem Nest).
- `estaLida(readAt)`: `readAt !== null` — o estado **derivado** (o que NÃO se persiste é o booleano).

## 5. Serviço de escrita "fonte única" (`NotificationsService`)

`registrarNotificacao(evento: EventoNotificavel)` — o **único** ponto de escrita de Notificação. Dado
`{ type, typeVersion?, sourceEventId, resourceType, resourceId, actorId, occurredAt?, params, recipients[] }`:
1. **Sanitiza/valida** (núcleo puro): `type`/`resourceType` estruturais, `sourceEventId`/ids UUID,
   `params` allowlist. Malformado → `BadRequestException`.
2. **Colapsa** os destinatários por `recipientMembershipId` em memória (múltiplos papéis → 1 pessoa) e computa
   a `dedupeKey` de cada um.
3. **Uma transação interativa no client raiz** (`definirContextoOrg`, pois `withTenantContext` recusa
   `$transaction`): grava a `Notification` **idempotente** (`createMany` + `skipDuplicates` → reprocesso é
   no-op, conteúdo congelado), **relê** o `id` canônico por `(orgId,sourceEventId,type)` e grava os N
   `NotificationRecipient` **idempotentes** (`createMany` + `skipDuplicates` sobre `@@unique([orgId,dedupeKey])`).
4. `skipDuplicates` (`ON CONFLICT DO NOTHING`) evita `P2002`/abort-de-tx; ainda assim P2002/P2028 inesperado →
   caminho **idempotente** (relê e devolve), **nunca 500**.
5. Auditoria manual (FR-214) no sucesso; `orgId` fora da resposta.

`marcarComoLida(notificationId, recipientMembershipId)` — write-side auditável (a **rota** é 5.4):
- Já lido → idempotente (sem escrita/áudio de falso denied). Senão: **guarda otimista** `updateMany where
  notificationId+recipientMembershipId+readAt=null → readAt=now` (UPDATE column-scoped) na tx raiz; devolve a
  visão com `lida` **derivado**. A "auto-marcação" (a pessoa marca a **própria**) é responsabilidade do
  chamador (a rota 5.4 passa o principal autenticado); o serviço opera sob `withTenantContext` (RLS impede
  cross-org) e mira **exatamente** `(notificationId, recipientMembershipId)`.

## 6. Isolamento multi-tenant (invariante-mãe) + GRANT como fronteira

Ambas: RLS ENABLE+FORCE, policies `select/insert/update/delete` por `orgId=current_org_id()` com WITH CHECK
no INSERT **e** no UPDATE; toda query por `withTenantContext`/`definirContextoOrg` (nenhum `where orgId`
manual); `orgId`/`organizationId` fora do payload/resposta, nunca do cliente; ambas em `MODELOS_AUDITADOS`.
FK COMPOSTA tenant-safe `(orgId,notificationId)→Notification(orgId,id)`. **Fase vermelha provada** (quebrar
WITH CHECK/GRANT → teste falha). GRANT: `Notification` append-only (`SELECT/INSERT`); `NotificationRecipient`
`SELECT/INSERT` + UPDATE column-scoped (`readAt`/`availabilityState`/`updatedAt`), **sem DELETE**.

## 7. "Notificação NUNCA concede acesso"

A `Notification` guarda **referência-por-id** (`resourceType`/`resourceId`), **não** o conteúdo do recurso;
`params` é o **mínimo sanitizado** para renderização, sem PII desnecessária/URL/token. Assim a leitura (5.4)
pode **revalidar a autz atual** e ocultar/sanitizar/excluir-de-contagem o que perdeu acesso. A 5.3 entrega o
modelo + o campo `availabilityState`; a revalidação-na-leitura é 5.4.

## 8. Critérios de aceite (§1572–1575) → testes

- **AC1 (gera Notificação):** evento notificável → conteúdo/evento canônico gravado **uma vez** (imutável) +
  1 registro por destinatário com `readAt` (estado **derivado**), respeitando a idempotência lógica →
  `notifications-write` + `notification-content.core`.
- **AC2 (sem duplicidade):** mesmo Evento reprocessado **ou** múltiplos papéis do mesmo destinatário → **sem**
  duplicidade (mesma `dedupeKey`) → `notifications-write`.
- **AC3 (perda de acesso — modelo):** a Notificação guarda **referência-por-id** (não concede acesso, não
  revela conteúdo) e tem `availabilityState`, tornando possível ocultar/sanitizar/não-contar na leitura
  (revalidação = 5.4) → `notifications-write` (modelo) + doc de decisão.
- **AC4 (sanitização):** sem payload bruto/token/segredo/URL; `<script>` em `params` → **escapado** (não
  ecoado cru) → `notification-content.core` (injeção) + `notifications-write` (persistido escapado).
- **Isolamento/GRANT:** cross-tenant negado pelo banco (fase vermelha); `Notification` sem UPDATE/DELETE;
  `NotificationRecipient` UPDATE só das colunas mutáveis, sem DELETE; `orgId`/`dedupeKey` imutáveis →
  `notifications-rls`.
- **`readAt`/derivado:** `marcarComoLida` idempotente persiste `readAt`; `estaLida` derivado →
  `notifications-write` + `notification-content.core`.

## 9. Fora do escopo (contrato-futuro — AD-11)

Superfícies badge/popover/página, "marcar como lida"/"todas" via HTTP com contagem no servidor, revalidação
de acesso na leitura, preferências por tipo (**5.4**); tempo-real/Socket.IO (**5.5**); catálogo de tipos +
distribuição + produtores concretos [mudança de Responsável, movimentação, "convite aceito"] (**5.6/5.7/E8**).
A 5.3 registra os *hooks* (`type`/`typeVersion`/`sourceEventId`/`availabilityState`/`params`) que essas
Stories consumirão.
