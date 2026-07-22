# Plan — Story 8.6: Remoção, saída voluntária e impacto sobre recursos

## Estratégia

Terceiro eixo do ciclo de Membership, reusando **integralmente** o substrato de 8.4/8.5 (step-up 1.12,
`AbilityCache` 1.6, contrato puro 2.10, evento `MembershipEvent` 8.4, padrão de tx interativa no client
raiz com `definirContextoOrg` + `SELECT … FOR UPDATE`). Nenhum núcleo de papel (8.4) ou estado (8.5) é
reaberto. O guard/`ability.ts` (C3) permanece congelado. **Menor mudança correta**: um núcleo puro novo,
um serviço, duas rotas, uma migration aditiva + REVOKE, testes.

## Classificação de risco: ALTO

Autenticação/autorização, RLS/multi-tenancy, concorrência, idempotência, operação destrutiva (soft) e
alteração de privilégio de banco (REVOKE). Gates: testes da área crítica; **integração real** (PostgreSQL
de verdade); regressão de segurança; **migration drill + rollback**; QA cruzada; CI no SHA exato;
validação pós-merge.

## Arquivos

### Novos
- `apps/api/src/organizations/members/membership-removal.core.ts` — núcleo PURO (`planejarRemocao`,
  `remocaoReduzAdmin`). Ordem: NOOP(REMOVED) → STEP_UP → ULTIMO_ADMIN → APLICAR. Sem `ehProprio` (a saída
  própria é permitida; a distinção é só auditoria).
- `apps/api/src/organizations/members/membership-removal.service.ts` — `remover(membershipId)` (Admin) e
  `sair()` (self-exit) convergindo em `encerrar` (tx interativa: lock+recount, revogações, limpeza de
  `activeOrganizationId`, evento, guarda otimista; `finalizar` traduz HTTP e invalida ability cache).
- `apps/api/prisma/migrations/20260725120000_membership_removal/migration.sql`.
- Testes: `membership-removal-core.test.ts` (puro), `membership-removal-rls.test.ts` (REVOKE DELETE +
  imutabilidade do evento REMOVED), `membership-removal-http.test.ts` (integração real).

### Alterados
- `members.controller.ts` — `POST me/leave` (`@Requer('ler','Organizacao')`, 200) e `POST
  :membershipId/remove` (`@Requer('administrar','Organizacao')`, 200). `me/leave` declarada antes das
  parametrizadas (sem ambiguidade de match).
- `organizations.module.ts` — registra `MembershipRemovalService`.
- `schema.prisma` — `MembershipEventType` ganha `REMOVED` (+ comentário).
- `test/rls.test.ts` e `test/rls-observability.test.ts` — reconciliação do REVOKE: faxina das linhas
  descartáveis pelo **migrator** (o runtime perdeu DELETE em Membership) e os testes de DELETE cruzado
  passam a provar **permission denied** (defesa migrou de policy → GRANT). Invariante mais forte.

## Decisões (AUTONOMOUS_DECISION)

- **AD-8.6-1 (tipo de evento único `REMOVED`):** um só valor de enum; remoção-por-Admin vs saída
  distinguidas por `payload.saidaVoluntaria` + `actorId`. Menor mudança correta; evita proliferar enum.
  RATIONALE: a distinção é derivável e LGPD-safe; SCOPE_IMPACT: NONE; REVERSIBILITY: HIGH.
- **AD-8.6-2 (self-exit por rota própria `me/leave`, sem id do cliente):** o alvo vem do contexto; guard
  `ler Organizacao` (piso). Um Admin ainda pode remover a si por `:id/remove` (barrado só pelo último
  Admin). RATIONALE: modela a autoridade "usuário sai de si" sem ampliar a superfície de `remove`.
- **AD-8.6-3 (revogação = só `CardGrant`/`CardResponsavel`, via contrato):** não revoga
  `PipeGrant`/`DatabaseGrant` (deny-by-default basta; `DEB-8-5-PIPE-DB-GRANT-REVOKE`). Não inventa regra.
- **AD-8.6-4 (REVOKE DELETE em Membership, fechando DEB-MEMBERSHIP-EVENT-CASCADE):** mandato da Story;
  nenhum consumidor de runtime de DELETE existe (grep vazio em `src/`). Reconcilia os testes fundacionais
  que codificavam o grant antigo, provando a nova invariante (mais forte). REVERSIBILITY: HIGH (GRANT de
  volta).

## Sequência

context7-check → pre-implementation-check → núcleo puro + testes puros → serviço + controller + módulo →
schema + migration → `prisma generate` → testes RLS/HTTP → reconciliar tests fundacionais → gates
(security/observability/migration/lgpd) → lint/typecheck/build → commit → PR → CI.
