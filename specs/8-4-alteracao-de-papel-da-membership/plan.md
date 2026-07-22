# Plano — Story 8.4

## Classificação de risco: ALTO
Toca autorização, multi-tenancy, concorrência/atomicidade, migration e evento canônico. Gates altos:
integração real (banco de verdade), regressão de segurança, migration drill + rollback, typecheck/lint/build,
QA cruzada, CI no SHA exato.

## Decisões de design (menor mudança correta; reusa padrões existentes)

1. **Sem novo GRANT em `Membership`.** O runtime já tem `GRANT SELECT/INSERT/UPDATE/DELETE ON "Membership"`
   (migration inicial) e a policy `membership_update` (USING+WITH CHECK por `current_org_id()`). A alteração
   de papel é um `UPDATE role`. Nada a conceder.
2. **Evento canônico = tabela `MembershipEvent`** (twin de `MovementEvent`, 2.16): append-only, RLS ENABLE+FORCE,
   GRANT só SELECT+INSERT, `@@unique([orgId, eventId])` com `eventId` determinístico (outbox idempotente).
   D-2/D-3 exigem "evento + auditoria na MESMA transação" — um log não é transacional, então o fato é persistido.
   Consumidores concretos AGORA (8.4) e imediatos (8.5/8.6) → não é abstração especulativa (AD-11). **1 migration.**
3. **Sem coluna de versão de autorização.** `Membership` não tem `authorizationVersion` e o mecanismo de
   D-3 já existe: `AbilityCache.invalidar` (1.6) + contexto que RELÊ a Membership ACTIVE a cada requisição
   (`OrgContextResolver`, 1.3). Adicionar coluna seria migration sem consumidor. **Evita migration extra.**
4. **Step-up reusa 1.12** (`StepUpService`, exportado global): `sessaoAtual` + `janelaValida`. A janela NÃO é
   consumida por alteração de papel (permite operações administrativas em sequência na mesma janela — desenho
   do próprio StepUpService; e habilita o teste concorrente com um único step-up).
5. **Autoridade fina no serviço** (não no guard/`ability.ts` — C3 congelado), espelhando `pipe-authz`/`database-authz`.
   Guard grosso = `administrar Organizacao` (Admin-only). Núcleo PURO `membership-role.core.ts` decide.
6. **Proteção do último Admin (D-2)**: `SELECT … FOR UPDATE` na linha da `Organization` (runtime tem
   `SELECT,UPDATE ON Organization` → privilégio suficiente para FOR UPDATE), reléitura in-tx, guarda otimista.

## Arquivos

- `apps/api/prisma/schema.prisma` — enum `MembershipEventType`, model `MembershipEvent`, relações.
- `apps/api/prisma/migrations/20260723120000_membership_events/migration.sql` — tabela + RLS + GRANT.
- `apps/api/src/kernel/db/tenant-context.ts` — `MembershipEvent` em `MODELOS_AUDITADOS`.
- `apps/api/src/organizations/members/` — `membership-role.core.ts` (puro), `membership-role.dto.ts`,
  `membership-role.service.ts`, `members.controller.ts`.
- `apps/api/src/organizations/organizations.module.ts` — wiring.
- Testes: `membership-role-core.test.ts`, `membership-role-http.test.ts`, `membership-events-rls.test.ts`.

## Migration drill + rollback
Forward: `db:migrate`. Rollback: `db:rollback` (reverte a migration mais recente) — `DROP TABLE
"MembershipEvent"; DROP TYPE "MembershipEventType";`. Sem perda de dados de outras entidades (tabela nova,
sem alterar existentes). Evidência registrada em `gates/8-4/migration-check.md`.

## context7
`context7-check` executado (Prisma `/prisma/web`): interactive transaction `$transaction(async tx)`,
`tx.$queryRaw` tagged-template parametrizado, `SELECT … FOR UPDATE`, `Prisma.sql`/`isolationLevel`.
Confirmado o padrão usado. Better Auth via `StepUpService` (1.12, já validado). Sem API nova inventada.
