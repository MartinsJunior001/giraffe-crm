# Decisão — Notificações: contagem autorizada, revalidação de acesso e preferências (Story 5.4)

**Contexto:** a 5.3 entregou a fonte única (`Notification` append-only + `NotificationRecipient` mutável +
`NotificationsService`) e deixou explicitamente para a 5.4: as superfícies (badge/popover/página), a operação
HTTP de marcar-lido (uma/todas) com contagem no servidor, a **revalidação de acesso na leitura** (o AC3 do
epics §1571/§1574) e as **preferências por tipo** (§1586). Fontes: `epics.md` §1582–1601; CLAUDE.md
(read-side puro sem agendador — 2.9/2.13/3.5/4.8; GRANT como fronteira; C3 congelado; `file-authz.dispatcher`
como modelo de roteamento por `resourceType`).

## D1 — Contagem autorizada vs. performance (segurança + performance)

**Decisão:** a contagem e as superfícies **excluem** toda Notificação cujo recurso de origem o principal não
pode mais **ler**, via **revalidação PURA na leitura** (sem persistir, sem agendador), **limitada**:
- superfícies revalidam só a **janela exibida** (teto 100; popover ≤ 10);
- a contagem revalida a **janela de não-lidas disponíveis** até `CAP=100` e devolve `mais:true` se o bruto
  exceder o teto (badge "99+");
- resolução de poder **memoizada por Pipe/Database DISTINTO** (batch-load do dono por `resourceType`; uma
  resolução por dono, não por Notificação) → sem N+1; CARD é por-Card (composição de acesso) mas bounded.

**Alternativas descartadas:**
- **Persistir `SUPPRESSED` na leitura (lazy suppression):** a 5.3 até provê o GRANT de `availabilityState`, mas
  persistir num GET introduz write-on-read e **churn de re-acesso** (regained access exigiria des-suprimir),
  contrariando o padrão forte de read-side puro do código. Descartado.
- **Contagem sem revalidação (só `readAt IS NULL`):** viola §1574 ("contagens não incluem itens inacessíveis").
  Descartado.
- **Revalidar o conjunto inteiro sem teto:** DoS/latência ilimitada para um usuário com muitas não-lidas.
  Descartado (o CAP + `mais` resolve honestamente).

**Reversibilidade:** ALTA — o CAP e a memoização são internos; um consumidor futuro pode trocar por projeção
materializada (E7) sem mudar o contrato.

## D2 — Invalidação: recompute-no-request (5.4) vs. push tempo-real (5.5)

**Decisão:** a 5.4 recomputa no servidor a cada request (badge/popover/página coerentes por virem da mesma
fonte). A **propagação push** (Socket.IO invalidando o cliente sem novo request — §1587 "mesma invalidação")
é **5.5**. A 5.4 não abre WebSocket. Fronteira registrada.

## D3 — Metadados de preferência por tipo (5.4) vs. catálogo canônico (5.6)

**Decisão:** a 5.4 entrega um **registro mínimo** puro (`notification-type-registry.ts`): por tipo,
`{ padraoHabilitado, podeDesativar, obrigatorio }`, com **fallback seguro** (`habilitado/desativável/não-
obrigatório`) para tipos ainda não catalogados. O **catálogo canônico completo é 5.6** (o `type` é `String`
estrutural desde a 5.3). Nenhum tipo é declarado **obrigatório** aqui (nenhuma decisão de Produto explícita
existe — §1586); o mecanismo de obrigatoriedade é implementado e testável, mas o conjunto obrigatório nasce
**vazio** (não se inventa — Constitution).

**Reversibilidade:** ALTA — 5.6 popula o registro sem mudar a resolução efetiva.

## D4 — "Marcar todas" com corte do servidor

**Decisão:** `corte = now()` do servidor; `updateMany where recipientMembershipId=<principal> AND readAt IS
NULL AND createdAt <= corte → readAt=now`. Entregas concorrentes (após o corte) **não** são marcadas.
Idempotente. É write-side de `NotificationRecipient` → mora na **fonte única** como
`NotificationsService.marcarTodasComoLidas` (aditivo; preserva "único ponto de escrita"). Reusa o
`UPDATE(readAt)` column-scoped já concedido na 5.3 — **sem GRANT novo**.

## D5 — Guarda GROSSA sem sujeito CASL novo (C3 congelado)

**Decisão:** as rotas usam `@Requer('ler','Organizacao')` — o **piso** de qualquer Membership ativa (ler a
própria Organização). Ler as **próprias** Notificações é capacidade de piso; a autoridade fina ("são as
minhas") é o `recipientMembershipId` do principal resolvido no serviço. **Nenhum sujeito novo** em `ability.ts`
(C3 permanece congelado). A revalidação de acesso ao **recurso de origem** reusa `pipe-authz`/`database-authz`
(guardas finas puras), sem tocar o guard/`ability.ts`.

## D6 — `recipientMembershipId` nunca vem do cliente

Herdado da 5.3: a rota injeta o `recipientMembershipId` da Membership do **principal autenticado** (resolvida
sob RLS por `contexto.accountId`). Marcar-lido mira exatamente `(notificationId, recipientMembershipId)` — não
se marca Notificação alheia (404 não-enumerante).
