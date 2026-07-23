# Tasks — Story 5.6

- [ ] T1 — `notification-catalog.ts` (puro) + teste `notification-catalog.test.ts`.
- [ ] T2 — Refactor `notification-type-registry.ts` para derivar do catálogo (fecha DEB-5.4-TIPO-OBRIGATORIO);
      regressão `notification-type-registry.test.ts` verde.
- [ ] T3 — `notification-distribution.core.ts` (puro) + teste `notification-distribution.core.test.ts`
      (colapso/regra-ator/preferência/CAP/resultado explícito).
- [ ] T4 — `pipe-authz.ts`: `resolverPoderDaMembershipNoPipe` (por-Membership, não-lançante).
- [ ] T5 — `notifications.service.ts`: `registrarNotificacaoNoContexto` (aditivo); `registrarNotificacao` delega.
- [ ] T6 — `notification-distribution.service.ts`: estratégias + revalidação de acesso + preferências + dedup +
      resultado explícito + chamada à fonte; métodos por gatilho.
- [ ] T7 — Módulos: `NotificationsModule` provê/exporta a distribuição; imports em Tasks/Solicitacoes/Pipes.
- [ ] T8 — Wiring produtores: Task/Solicitação/Card Responsável (request) + overdue (sistema), best-effort.
- [ ] T9 — Integração PG real `notification-distribution-rls.test.ts`: resolução por tipo (só ativa + acesso
      atual; ninguém fora da Org), dedup (múltiplos papéis → 1), preferências antes (silenciado → sem entrega;
      obrigatório → sempre), ausência → resultado explícito, ator por regra, idempotência via fonte, isolamento
      cross-tenant, os 3 tipos E5 + CARD_MOVED_BY_AUTOMATION.
- [ ] T10 — Gates: prettier/lint/typecheck/build + suíte da API verde (incl. regressão 5.3/5.4/5.5).
</content>
