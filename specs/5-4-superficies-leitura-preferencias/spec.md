# Spec — Story 5.4: Notificações — superfícies, leitura e preferências por tipo

**Épico 5 (Tarefas, Solicitações e Notificações), 4ª Story.** Fonte: `epics.md` §1582–1601.
**Risco:** ALTO (migration de preferências + RLS + autorização/revalidação-de-acesso por recurso + read-side +
contagem no servidor).

A 5.4 é **read-side + operação + preferências**: entrega as **três superfícies** (badge/popover/página)
derivadas **exclusivamente** da fonte única de 5.3 (`Notification`/`NotificationRecipient` +
`NotificationsService`), a **operação idempotente** de marcar-lido (uma e todas), a **revalidação de acesso ao
recurso de origem na leitura** (o AC que a 5.3 deixou como contrato-futuro) e as **preferências por tipo** por
usuário+Organização. **Não** entrega tempo-real/Socket.IO (5.5), catálogo completo de tipos de Notificação
(5.6), distribuição nem produtores concretos (5.6/5.7/E8).

## 1. Objetivo

Entregar badge/popover/página **coerentes** (INV-NOTIF-01) — a mesma fonte, o mesmo estado, a **contagem
calculada no servidor** — com **revalidação da autorização atual** ao recurso de origem de cada Notificação
(quem perdeu acesso não vê nem conta), e **preferências pessoais por tipo** que reduzem ruído sem apagar
histórico e sem contornar avisos obrigatórios. Integra o badge do Dashboard (FR-5) expondo a contagem
consumível pelo E7, sem construir o Dashboard.

## 2. Decisões materiais (a fronteira 5.4 × 5.3/5.5/5.6)

Ver `decisions/notification-surfaces-5-4.md`. Resumo:

- **D1 — Estratégia de contagem autorizada vs. performance (o ponto central de segurança + performance).**
  A contagem (badge) e as superfícies **excluem** toda Notificação cujo recurso de origem o principal **não
  pode mais acessar** (§1571/§1574 — herdado da 5.3 como AC3). A revalidação é **derivação PURA na leitura**
  (sem persistir, sem agendador — coerente com Kanban 2.9 / saúde 2.13 / trilha 4.8; o recorte da 5.4 exclui
  tempo-real e side-effects de leitura). Para **não** virar N+1 nem varrer o tenant:
  - **Superfícies (popover/página):** revalida-se apenas a **janela exibida** (teto ≤ 100; popover ≤ 10),
    agrupando por recurso — resolução do poder por **Pipe/Database DISTINTO memoizada** (uma resolução por
    dono, não por Notificação). Inacessível → **oculta** (excluída da resposta, nunca um placeholder que
    revele existência).
  - **Contagem (badge):** carrega a **janela de não-lidas disponíveis** limitada por um **teto** (`CAP = 100`),
    revalida-a (mesmo batch memoizado) e conta as acessíveis; se o total bruto de não-lidas exceder o teto,
    devolve `mais: true` (badge "99+"). Correta para o subconjunto acessível, **servidor-autoritativa** e
    **limitada** (sem DoS). `availabilityState = SUPPRESSED` (produtor futuro pode setar) também é excluído —
    a 5.4 **respeita** o campo mas **não o persiste na leitura** (evita write-on-read e churn de re-acesso).
- **D2 — Recorte "invalidação: recompute-no-request agora vs. push 5.5".** §1587 pede "atualiza todas as
  superfícies pela mesma invalidação". A 5.4 entrega **recompute-no-servidor a cada request** (a mesma fonte
  produz badge/popover/página coerentes em qualquer chamada). A **propagação PUSH** (tempo-real que invalida o
  cliente sem novo request) é **explicitamente 5.5** — a 5.4 não abre Socket.IO.
- **D3 — Metadados de preferência por tipo vs. catálogo 5.6.** A 5.4 precisa, por tipo, de: **valor padrão**,
  **se pode ser desativado** e **se é obrigatório**. O **catálogo canônico e completo de tipos é 5.6** (o
  `type` é `String` estrutural desde a 5.3). A 5.4 entrega um **registro MÍNIMO** (`notification-type-registry.ts`,
  núcleo puro) para os tipos correntes + um **fallback seguro** para tipos ainda não catalogados
  (`padrão=habilitado`, `podeDesativar=true`, `obrigatorio=false`) — deixando o catálogo formal para 5.6
  (fronteira registrada). Nenhum tipo é declarado **obrigatório** sem decisão explícita de Produto (§1586).
- **D4 — "Marcar todas" com corte do servidor.** Um `corte = now()` do servidor; marca-se `readAt` de todo
  destinatário do principal com `readAt IS NULL AND createdAt <= corte`. Notificações materializadas **após** o
  corte (entrega concorrente) **não** são marcadas. Idempotente. É write-side → mora na **fonte única**
  (`NotificationsService.marcarTodasComoLidas`, aditivo — preserva o invariante "único ponto de escrita de
  `NotificationRecipient`").

## 3. Modelo de dados — 1 entidade nova (`NotificationPreference`)

`Notification`/`NotificationRecipient` **já existem** (5.3) — a 5.4 **não** as altera (nenhuma migration nelas,
nenhum GRANT novo nelas: já têm `SELECT` para ler e o `UPDATE` column-scoped de `readAt` para marcar).

### `NotificationPreference` (preferência do usuário por tipo; RLS ENABLE+FORCE + WITH CHECK INSERT/UPDATE; `MODELOS_AUDITADOS`)
- `id` (UUID, PK), `orgId` (UUID; FK `→Organization`, Cascade).
- `membershipId` (UUID) — a pessoa **na Org** (a Membership). **Referência-por-id, SEM FK** (mesma decisão de
  `NotificationRecipient.recipientMembershipId`/`CardResponsavel`: FK composta a Membership é inviável —
  `orgId` NOT NULL compartilhado impede `SetNull`; `Cascade` quebraria LGPD).
- `type` (TEXT) — o tipo de Notificação a que a preferência se aplica (catálogo = 5.6; `String` estrutural,
  validado `^[A-Z][A-Z0-9_]*$` no núcleo puro).
- `enabled` (BOOLEAN) — a escolha do usuário: entregar (`true`) ou silenciar (`false`) este tipo.
- `createdAt`, `updatedAt` (`@updatedAt`).
- **Unicidade (1 preferência por pessoa+tipo):** `@@unique([orgId, membershipId, type])` — o set é um **upsert**
  (mudar a preferência = UPDATE de linha existente; nunca duplica). Base do índice do upsert.
- `@@index([orgId, membershipId])` — carregar todas as preferências de um usuário (resolução efetiva na leitura).
- **GRANT:** `SELECT/INSERT` + **UPDATE COLUMN-SCOPED** de **só** `enabled`, `updatedAt`. **NÃO**
  `orgId`/`membershipId`/`type` (imutáveis por GRANT — a identidade da preferência não migra). **Sem DELETE**
  (mudar preferência é UPDATE/upsert, nunca remover linha — simetria com o resto do domínio).
- **RLS:** ENABLE+FORCE, policies `select/insert/update/delete` por `orgId = current_org_id()` com WITH CHECK no
  INSERT **e** no UPDATE (defesa contra mover a linha para outra Org). Toda query por `withTenantContext`.
- **Enum `TIMESTAMPTZ(3)`** em quaisquer colunas temporais absolutas (nenhuma aqui além dos timestamps de
  auditoria em `TIMESTAMP(3)` como o resto do schema); a migration usa `TIMESTAMPTZ(3)` onde aplicável.

**Preferência afeta o FUTURO, não apaga o passado (§1586):** silenciar um tipo **não** apaga
`Notification`/`NotificationRecipient` já materializados — apenas os **filtra** das superfícies e da contagem
enquanto silenciado; reabilitar volta a exibi-los (a preferência é read-side; o histórico é imutável). Um
produtor futuro (5.6/5.7) consultará a mesma preferência para **não entregar** entregas futuras — contrato-
futuro (AD-11), não implementado aqui.

## 4. Núcleo puro (`notification-type-registry.ts` + resolução de preferência) — fail-closed, testável

- `metadadosDoTipo(type): { padraoHabilitado, podeDesativar, obrigatorio }` — registro **mínimo** dos tipos
  correntes + **fallback** seguro para tipo desconhecido (`padraoHabilitado=true, podeDesativar=true,
  obrigatorio=false`). O catálogo completo é 5.6 (fronteira registrada). Nenhum tipo obrigatório sem decisão de
  Produto explícita.
- `resolverPreferenciaEfetiva(type, override?: boolean): boolean` — **precedência**: tipo **obrigatório** →
  sempre `true` (a preferência não desativa aviso obrigatório — §1586); senão `override` (a escolha do usuário)
  se existir; senão `padraoHabilitado` do registro. Fonte única da derivação.
- `validarSetPreferencia(type, enabled): void | erro` — `enabled=false` num tipo **obrigatório** ou **não
  desativável** → `BadRequestException` (fail-closed); `type` fora de `^[A-Z][A-Z0-9_]*$` → `BadRequestException`.
- `tiposSilenciadosPara(overrides): string[]` — deriva o conjunto de tipos silenciados de um usuário (registro
  + overrides), **excluindo** obrigatórios — consumido como filtro `type NOT IN (...)` nas superfícies/contagem.

## 5. Revalidação de acesso na leitura (`notification-access.dispatcher.ts`) — segurança #1

Espelho do `file-authz/file-authz.dispatcher.ts` (roteamento por `resourceType` para a guarda fina pura do
recurso dono, deny-by-default, fail-closed), aplicado à **leitura** de Notificações. Para cada Notificação
exibida/contada, revalida a **autorização ATUAL** de **ler** o recurso de origem:

| `resourceType` | Dono resolvido sob RLS | Guarda fina (pura) | Nega → |
|----------------|------------------------|--------------------|--------|
| `CARD`         | o próprio `resourceId` (cardId) | `exigirLerCard(db, principal, cardId)` (compõe papel-de-Pipe + `CardGrant` + `restritoAoProprio` + Responsável) | oculta + fora da contagem |
| `TASK`         | `Task.pipeId` | `resolverPoderNoPipe(db, principal, pipeId)` (qualquer poder = pode ler) | idem |
| `SOLICITACAO`  | `Solicitacao.pipeId` | `resolverPoderNoPipe(db, principal, pipeId)` | idem |
| `RECORD`       | `Record.databaseId` | `exigirLerDatabase(db, principal, databaseId)` | idem |
| desconhecido   | — | — (deny-by-default) | oculta + fora da contagem |

**Regras invioláveis:**
- A guarda **lança** 404/403; o dispatcher traduz **qualquer** negativa (ou `resourceType`/recurso
  inexistente/cross-tenant) em **`false`** (fail-closed) → a Notificação é **oculta** (excluída da resposta,
  **nunca** um placeholder) e **não entra na contagem**. **A Notificação NUNCA concede acesso** e **não revela**
  título/conteúdo/existência do recurso inacessível.
- `resourceId` nulo (Notificação sem recurso, ex.: aviso de sistema) → **acessível** por construção (não há
  recurso a revalidar). Tipos assim são raros; tratados como sempre-visíveis (não vazam nada — não têm
  referência a recurso).
- **Eficiência (performance #1) — sem N+1:** a revalidação opera sobre a **janela** (bounded). Para
  TASK/SOLICITACAO/RECORD, o dono (`pipeId`/`databaseId`) é **batch-carregado** por `resourceType` (um
  `findMany … where id in [...]`) e o **poder por dono DISTINTO** é resolvido **uma vez** e memoizado
  (`Map<ownerId, acessivel>`) — N Notificações do mesmo Pipe/Database custam **uma** resolução. CARD é
  inerentemente por-Card (composição de acesso), mas ainda bounded pela janela. A **contagem** usa a mesma
  janela + memoização, limitada por `CAP=100`.

## 6. Superfícies e operação (`NotificationsReadService` + rotas)

Todas as rotas: guarda GROSSA `@Requer('ler','Organizacao')` (piso de qualquer Membership ativa — não se toca o
`ability.ts`/C3; nenhum sujeito novo de CASL). A autoridade FINA — "são as **MINHAS** notificações" — vive no
serviço: o `recipientMembershipId` é o da **Membership do principal autenticado**, resolvido sob RLS a partir
do `contexto.accountId` (`db.membership.findFirst({ where: { accountId } })`), **NUNCA** aceito do cliente
(ponto de fronteira herdado da 5.3). `orgId` fora de toda resposta.

- `GET /notifications` — **página** (conjunto completo autorizado). Paginação por **cursor determinístico**
  `[createdAt, id]` DESC (mais recente primeiro; teto 100), `?cursor=&limite=&incluirLidas=`. Revalida a janela
  fetchada, oculta inacessíveis, filtra tipos silenciados (preferência efetiva). O `proximoCursor` avança pelo
  **último fetchado** (não pelo último devolvido) — determinístico e completo mesmo com ocultações (padrão
  4.8). Projeção sanitizada (§7).
- `GET /notifications/recentes` — **popover** (subconjunto recente, limite pequeno fixo ≤ 10). Mesma fonte,
  mesma revalidação/filtro; não-lidas priorizadas (ordem recência). Sem cursor (é "recentes").
- `GET /notifications/contagem` — **badge**. `{ naoLidas: number, mais: boolean }`, calculado **no servidor**
  (D1: janela ≤ CAP, revalidada, filtrada por preferência). Zero legítimo → `{ naoLidas: 0, mais: false }`
  (vazio útil, **não** falha). Consumível pelo Dashboard (FR-5).
- `POST /notifications/:notificationId/read` — **marcar como lida** (idempotente). Consome
  `NotificationsService.marcarComoLida(notificationId, <recipientMembershipId do principal>)`. Persiste `readAt`;
  destinatário inexistente/alheio → **404** (não-enumerante, herdado do serviço). Devolve
  `{ recipient, naoLidas }` (contagem **recomputada no servidor** após a marcação).
- `POST /notifications/read-all` — **marcar todas como lidas** (idempotente). Consome
  `NotificationsService.marcarTodasComoLidas(<principal>, corte=now())` (D4). Devolve `{ marcadas, naoLidas }`.
- `GET /notifications/preferences` — **ler preferências** do próprio usuário: lista efetiva `{ type,
  enabled(efetivo), podeDesativar, obrigatorio, padrao }` para os tipos do registro + overrides do usuário.
  Registro vazio + sem overrides → lista vazia (honesto; catálogo é 5.6).
- `PUT /notifications/preferences/:type` — **setar** a preferência do próprio usuário (`{ enabled }`). Upsert
  column-scoped (`enabled`). `enabled=false` em tipo obrigatório/não-desativável → **400**. `type` malformado →
  400. Afeta o **futuro** (não apaga histórico).

## 7. Projeção sanitizada (o que a superfície devolve) — AD-30

`NotificacaoVisao` (por item, só do acessível): `id` (notificationId), `type`, `typeVersion`, `resourceType`,
`resourceId`, `actorId`, `occurredAt`, `params` (**já sanitizado** no write da 5.3 — HTML-escapado, escalar),
`readAt`, `lida` (derivado), `deliveredAt`. **FORA da fronteira:** `orgId`, `dedupeKey`, `availabilityState`
bruto (é filtro interno), qualquer conteúdo do recurso (a Notificação nunca concede acesso — só a referência-
por-id, que o cliente usa para navegar **se** ainda tiver acesso). Nunca há item para recurso inacessível
(oculto). `valores`/PII do recurso **jamais** entram (a Notificação nem os tem — 5.3).

## 8. Isolamento multi-tenant (invariante-mãe) + GRANT como fronteira

`NotificationPreference`: RLS ENABLE+FORCE, policies por `orgId=current_org_id()` com WITH CHECK no INSERT **e**
no UPDATE; toda query por `withTenantContext`; `orgId` fora do payload/resposta; em `MODELOS_AUDITADOS`. GRANT
`SELECT/INSERT` + UPDATE column-scoped (`enabled`/`updatedAt`), **sem DELETE**. **Fase vermelha provada**
(quebrar WITH CHECK/GRANT → teste falha). A leitura de Notificações reusa o `SELECT` já concedido (5.3); a
marcação reusa o `UPDATE(readAt)` já concedido (5.3) — **sem GRANT novo em `Notification`/`NotificationRecipient`**.

## 9. Critérios de aceite (§1593–1596) → testes

- **AC1 (superfícies coerentes + contagem no servidor):** badge/popover/página derivam da **mesma** fonte com
  estado coerente; a contagem é do servidor → `notifications-read` (contagem = nº de não-lidas acessíveis;
  popover ⊆ página; zero legítimo = `{0,false}`).
- **AC2 (marcar lida / marcar todas):** marcar-lida persiste `readAt` idempotente (2ª vez sem erro, mesmo
  `readAt`); marcar-alheio → 404; "todas" usa **corte do servidor** e **não** marca itens criados após o corte;
  concorrência → sem sobre-marcação → `notifications-read` + `notifications-markall`.
- **AC3 (revalidação de acesso — segurança #1):** perda de acesso ao recurso (Card/Tarefa/Solicitação/Registro)
  → a Notificação é **oculta** e **fora da contagem**; nunca vaza título/conteúdo/existência; por `resourceType`
  → `notifications-access-revalidation` (fase vermelha: conceder acesso torna visível; revogar oculta).
- **AC4 (preferências por tipo):** afetam **futuro** (não apagam antigas); respeitam **padrão/obrigatoriedade**
  (obrigatório não silencia → 400; badge/popover/página respeitam a preferência); não contornam obrigatórios →
  `notification-type-registry` (puro) + `notifications-preferences` (HTTP/RLS).
- **Isolamento/GRANT:** cross-tenant negado pelo banco (fase vermelha); `NotificationPreference` UPDATE só de
  `enabled`, sem DELETE, `orgId`/`membershipId`/`type` imutáveis → `notification-preferences-rls`.
- **Paginação determinística:** cursor `[createdAt,id]` estável; ocultação não pula linhas (cursor pelo
  fetchado) → `notifications-read`.

## 10. Fora do escopo (contrato-futuro — AD-11)

Tempo-real/Socket.IO e a **invalidação push** que atualiza superfícies sem novo request (**5.5**); catálogo
canônico completo de tipos + distribuição + produtores concretos que **entregam** respeitando a preferência
(**5.6/5.7/E8**); persistência de `availabilityState=SUPPRESSED` na leitura (a 5.4 respeita o campo, não o
seta); badges/priorização no Dashboard (E7 — a 5.4 só **expõe** a contagem consumível). A 5.4 registra os hooks
(preferência por tipo, revalidação de acesso, contagem no servidor) que essas Stories consumirão.
