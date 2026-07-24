# Plan — Story 5.6

Arquitetura e decisões: `decision-oq-33.md`. Sem migration (catálogo = código; escrita pela fonte 5.3).

## Componentes

1. **`notifications/notification-catalog.ts`** (puro) — catálogo canônico: tipo → `{ resourceType, estrategia,
   incluirAtor, padraoHabilitado, podeDesativar, obrigatorio, origem, implementado }`. Lookups fail-closed.
2. **`notifications/read/notification-type-registry.ts`** (refactor) — `metadadosDoTipo`/`REGISTRO` derivam do
   catálogo (fonte única dos metadados de preferência). Fecha DEB-5.4-TIPO-OBRIGATORIO. Assinaturas 5.4 intactas.
3. **`notifications/distribution/notification-distribution.core.ts`** (puro) — `colapsarPorMembership`,
   `aplicarRegraAtor`, decisão de preferência por candidato, tipo `ResultadoDistribuicao`, CAP de fan-out.
4. **`notifications/distribution/notification-distribution.service.ts`** — `NotificationDistributionService`:
   resolve candidatos por estratégia (sob RLS), revalida acesso atual (reusa 5.4/2.10), aplica preferências,
   dedup, resultado explícito, chama a fonte única. Métodos por gatilho.
5. **`notifications/notifications.service.ts`** (aditivo) — `registrarNotificacaoNoContexto(tenantCtx, evento)`;
   `registrarNotificacao` delega com o request context.
6. **`pipes/pipe-authz.ts`** (aditivo) — `resolverPoderDaMembershipNoPipe(db, membershipId, pipeId): Poder|null`
   (espelho por-Membership, não-lançante) para revalidar acesso de destinatário a recurso Pipe-scoped.
7. **Wiring dos produtores:** `TasksService`, `SolicitacoesService`, `CardAccessService` (Responsável, request
   context); `TaskOverdueService` (overdue, sistema). Best-effort pós-commit.
8. **Módulos:** `NotificationsModule` provê+exporta `NotificationDistributionService`; `TasksModule`,
   `SolicitacoesModule`, `PipesModule` importam `NotificationsModule`. Sem ciclo (distribuição usa funções puras
   de authz, não módulos).

## Riscos e mitigação

- **Ciclo de módulo:** evitado — authz fino é função pura (padrão já usado pelo dispatcher 5.4).
- **Distribuição derrubar mutação:** best-effort pós-commit + `try/catch` + log (padrão realtime 5.5).
- **Regressão 5.1 overdue:** `escanearOrg` ganha `RETURNING` para obter ocorrências novas; retorno `count`
  preservado; distribuição isolada em `try/catch`.
- **Idempotência:** `sourceEventId` determinístico por gatilho (ver decisão) + `dedupeKey` da fonte.
</content>
