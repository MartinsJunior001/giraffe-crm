# Tasks — Story 5.4: Notificações (superfícies, leitura e preferências)

Ordem dependente. `[x]` ao concluir com evidência.

## T1 — Modelo + migration + RLS/GRANT (risco ALTO)
- [x] T1.1 `schema.prisma`: model `NotificationPreference` (id/orgId/membershipId/type/enabled/createdAt/
      updatedAt; `@@unique([orgId,membershipId,type])`; `@@index([orgId,membershipId])`; FK orgId Cascade;
      `@@map`) + back-relation em `Organization`.
- [x] T1.2 migration `20260802120000_notification_preferences/migration.sql`: CREATE TABLE + índices + FK +
      RLS ENABLE+FORCE + 4 policies (`orgId=current_org_id()`, WITH CHECK INSERT+UPDATE) + GRANT SELECT/INSERT
      + UPDATE(`enabled`,`updatedAt`); **sem DELETE**. `TIMESTAMPTZ(3)` onde aplicável.
- [x] T1.3 rollback `.down.sql`: DROP TABLE.
- [x] T1.4 `MODELOS_AUDITADOS += 'NotificationPreference'`.
- [x] T1.5 `db:migrate`; `prisma generate`; `db:status` up-to-date.
- [x] T1.6 `notification-preferences-rls.test.ts`: WITH CHECK INSERT+UPDATE (fase vermelha), GRANT sem DELETE,
      UPDATE só `enabled`, `orgId`/`membershipId`/`type` imutáveis, cross-tenant negado.

## T2 — Núcleo puro do registro de tipos (D3)
- [x] T2.1 `read/notification-type-registry.ts`: `metadadosDoTipo` (registro mínimo + fallback seguro;
      OBRIGATORIOS = ∅), `resolverPreferenciaEfetiva` (obrigatório › override › padrão), `validarSetPreferencia`
      (obrigatório/não-desativável → erro; type malformado → erro), `tiposSilenciadosPara`.
- [x] T2.2 `notification-type-registry.test.ts` (puro): precedência, fallback, validação, silenciados.

## T3 — Marcar todas (write-side na fonte única, D4)
- [x] T3.1 `notifications.service.ts`: `marcarTodasComoLidas(recipientMembershipId, corte)` — tx raiz
      `definirContextoOrg` + `updateMany where recipientMembershipId+readAt=null+createdAt<=corte → readAt=now`;
      idempotente; auditoria só se marcou>0; devolve `{ marcadas }`.
- [x] T3.2 `notifications-markall.test.ts`: corte (não marca pós-corte), idempotente, concorrência.

## T4 — Revalidação de acesso por resourceType (segurança #1, §5)
- [x] T4.1 `read/notification-access.dispatcher.ts`: `revalidarAcessos(db, principal, itens)` →
      `Map<notificationId,boolean>`; batch-load Task→pipeId / Solicitacao→pipeId / Record→databaseId;
      memoiza poder por Pipe/Database DISTINTO (`resolverPoderNoPipe`/`exigirLerDatabase` → boolean fail-closed);
      CARD via `exigirLerCard` (por-card, fail-closed); `resourceId` nulo → acessível; tipo desconhecido → false.
- [x] T4.2 revalidação por `resourceType` (PG real): CARD/TASK/SOLICITACAO/RECORD acesso⇒visível,
      perda⇒oculta+fora da contagem, tipo desconhecido⇒oculta; fase vermelha (conceder/revogar).
      **Consolidado em `notifications-read.test.ts` (AC3)** — setup único de recursos/notificações reais.

## T5 — Read-service (superfícies + contagem, D1)
- [x] T5.1 `read/notifications-read.dto.ts`: `NotificacaoVisao`, `PaginaNotificacoes`, `ContagemVisao`,
      `parseCursor`/`parseLimite`, projeção sanitizada (sem orgId/dedupeKey).
- [x] T5.2 `read/notifications-read.service.ts`: resolve `recipientMembershipId` do principal; `listar` (cursor
      `[createdAt,id]` DESC, revalida janela, oculta, filtra silenciados, proximoCursor pelo fetchado);
      `recentes` (popover ≤10); `contar` (janela ≤ CAP=100, revalida, filtra, `{naoLidas,mais}`).

## T6 — Preferences-service + controller + module
- [x] T6.1 `read/notification-preferences.service.ts`: `listar` (efetiva: registro+overrides); `setar` (upsert
      column-scoped `enabled`; valida via núcleo puro → 400).
- [x] T6.2 `read/notifications-read.dto.ts` (+preferências): `PreferenciaVisao`, parse do body de set.
- [x] T6.3 `notifications.controller.ts`: 7 rotas `@Requer('ler','Organizacao')` (GET /notifications,
      /recentes, /contagem, POST /:id/read, /read-all, GET/PUT /preferences[/:type]).
- [x] T6.4 `notifications.module.ts`: controller + providers (read/preferences/dispatcher).

## T7 — Testes HTTP de superfície + preferências
- [x] T7.1 `notifications-read.test.ts` (HTTP): coerência badge/popover/página; contagem no servidor; zero;
      cursor; ocultação não pula; marcar-lida idempotente + 404 alheio; contagem recomputada; preferências filtram.
- [x] T7.2 preferências (HTTP): setar/ler; silencia superfícies+contagem; afeta futuro (não apaga antigas).
      **Consolidado em `notifications-read.test.ts` (AC4)**. Nota: o caso "obrigatório→400" é vacuamente
      coberto (OBRIGATORIOS=∅ por decisão de escopo — sem tipo obrigatório de Produto; mecanismo provado no
      núcleo puro `validarSetPreferencia`; a fronteira do catálogo de tipos é a 5.6 — DEB-5.4-TIPO-OBRIGATORIO).

## T8 — Gates
- [x] T8.1 `prettier --check` + `lint` + `typecheck` + `build`.
- [x] T8.2 suíte API (PG real) verde, incl. regressão `notifications-write`/`notifications-rls` (5.3).
- [x] T8.3 migration+rollback drill provado.
- [ ] T8.4 `commit-check` → `commit` → push → PR.
