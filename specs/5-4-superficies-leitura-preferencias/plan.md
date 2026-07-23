# Plan — Story 5.4: Notificações (superfícies, leitura e preferências)

**Risco:** ALTO. Gates: migration + rollback drill; RLS fase-vermelha; revalidação de acesso por `resourceType`;
read-side + contagem no servidor; typecheck/lint/build; suíte da API contra PG real; regressão 5.3.

## Contexto7 (verificação documental)

Stack já instalada e usada por 5.3/3.5/4.8: Prisma 6.19.3 (client `../generated/prisma`), NestJS 11, Vitest 4.
Nenhuma API nova de biblioteca é introduzida — reuso de `withTenantContext`/`definirContextoOrg`,
`createMany/updateMany/findMany` (cursor), `@Requer` (CASL), padrões idênticos aos serviços existentes. Prisma
6.19.3 **não** expressa índice parcial nem `orderBy` em JSON — **não** preciso de nenhum dos dois aqui
(`NotificationPreference` usa `@@unique` composto simples; a ordenação de superfície é por `createdAt/id`
nativos). Sem dependência nova. `context7-check`: N/A material (nenhuma assinatura nova de terceiros).

## Arquivos (todos aditivos; nada de outro Writer)

### Migration (fila da Lane 0 — slot desta Story)
- `apps/api/prisma/migrations/20260802120000_notification_preferences/migration.sql` — cria
  `NotificationPreference` (tabela + índices + FK orgId + RLS ENABLE+FORCE + 4 policies + GRANT
  `SELECT/INSERT` + `UPDATE(enabled,updatedAt)`; **sem DELETE**). `TIMESTAMPTZ(3)` onde aplicável.
- `apps/api/prisma/rollback/20260802120000_notification_preferences.down.sql` — `DROP TABLE` (policies/GRANT
  caem junto). Tabela nova → rollback restaura estado exato.
- `apps/api/prisma/schema.prisma` — model `NotificationPreference` + back-relation em `Organization`.

### Kernel
- `apps/api/src/kernel/db/tenant-context.ts` — adicionar `'NotificationPreference'` a `MODELOS_AUDITADOS`.

### Domínio (`apps/api/src/notifications/`)
- `notifications.service.ts` — **estender** com `marcarTodasComoLidas(recipientMembershipId, corte)` (D4,
  write-side na fonte única; guarda column-scoped `readAt`; auditoria).
- `read/notification-type-registry.ts` — núcleo **puro** (D3): `metadadosDoTipo`,
  `resolverPreferenciaEfetiva`, `validarSetPreferencia`, `tiposSilenciadosPara`.
- `read/notification-access.dispatcher.ts` — revalidação por `resourceType` (§5): `revalidarAcessos(db,
  principal, itens) → Map<notificationId, boolean>` com batch-load do dono + memoização por Pipe/Database.
- `read/notifications-read.service.ts` — superfícies (página/popover/contagem) + resolução do
  `recipientMembershipId` do principal + filtro por preferência + revalidação + projeção sanitizada.
- `read/notification-preferences.service.ts` — ler/setar preferências do próprio usuário (upsert column-scoped).
- `read/notifications-read.dto.ts` — `NotificacaoVisao`, `PaginaNotificacoes`, `ContagemVisao`, parseCursor/
  parseLimite, `PreferenciaVisao`, parse do body de set.
- `notifications.controller.ts` — 7 rotas (§6), todas `@Requer('ler','Organizacao')`.
- `notifications.module.ts` — declarar controller + providers novos (o `NotificationsService` já é provider).

### Testes (`apps/api/test/`)
- `notification-type-registry.test.ts` (puro): precedência (obrigatório › override › padrão); fallback;
  validarSet (obrigatório/não-desativável → erro); tiposSilenciados.
- `notification-access-revalidation.test.ts` (PG real): por `resourceType` (CARD/TASK/SOLICITACAO/RECORD) —
  acesso ⇒ visível; perda de acesso ⇒ oculta + fora da contagem; nunca vaza; tipo desconhecido ⇒ oculta;
  fase vermelha (conceder torna visível / revogar oculta).
- `notifications-read.test.ts` (PG real, HTTP): página/popover/contagem coerentes; contagem no servidor;
  zero legítimo; cursor determinístico; ocultação não pula linhas; marcar-lida idempotente + 404 alheio;
  contagem recomputada; preferências filtram superfícies.
- `notifications-markall.test.ts` (PG real): corte do servidor (não marca pós-corte); idempotente; concorrência.
- `notifications-preferences.test.ts` (PG real, HTTP): setar/ler; obrigatório não silencia (400); afeta futuro
  (não apaga antigas); cross-tenant.
- `notification-preferences-rls.test.ts` (PG real): RLS fase-vermelha (WITH CHECK INSERT/UPDATE), GRANT
  (sem DELETE; UPDATE só `enabled`; `orgId`/`membershipId`/`type` imutáveis).

## Sequência de implementação

1. schema + migration + rollback + `MODELOS_AUDITADOS`; `db:migrate`; provar RLS/GRANT (fase vermelha).
2. núcleo puro `notification-type-registry.ts` + teste puro (rápido, sem banco).
3. `marcarTodasComoLidas` na fonte única + teste markall.
4. dispatcher de revalidação + teste de revalidação (o ponto de segurança).
5. read-service (superfícies/contagem) + preferences-service + DTOs + controller + module.
6. testes HTTP (read, preferences) + rls.
7. gates: prettier/lint/typecheck/build; suíte API; regressão 5.3.

## Riscos e mitigação

- **N+1 na revalidação** → batch-load do dono por `resourceType` + memoização por dono DISTINTO (D1). Teste com
  N Notificações do mesmo Pipe prova 1 resolução (via contagem de queries ou por construção do batch).
- **Contagem sem teto = DoS** → `CAP=100` + `mais` (D1).
- **Write-on-read** → evitado: revalidação é pura, não persiste `SUPPRESSED` (D1).
- **Marcar alheio** → `recipientMembershipId` do principal, nunca do cliente (D6); serviço 5.3 já dá 404.
- **Índice parcial / orderBy JSON** → não necessários (evita a limitação do Prisma 6.19.3).
