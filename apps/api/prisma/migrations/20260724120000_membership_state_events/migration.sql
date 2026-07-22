-- Story 8.5 — Suspensão e reativação da Membership: tipos de EVENTO da transição de ESTADO.
--
-- A 8.5 opera no eixo de ESTADO da Membership (`ACTIVE ↔ SUSPENDED`), não no de papel (8.4). Não há
-- tabela, coluna nem GRANT novo:
--   • `Membership.state` já é escrito pelo runtime — `GRANT ... UPDATE ... ON "Membership"` existe
--     desde `init_tenancy_rls`, com a policy `membership_update` (USING + WITH CHECK por
--     `current_org_id()`). A suspensão/reativação é um UPDATE de `state` sob a MESMA fronteira.
--   • `MembershipEvent` (8.4) já é append-only/imutável (GRANT só SELECT+INSERT). A 8.5 só ACRESCENTA
--     os tipos do evento — a imutabilidade e o isolamento seguem provados por `membership-events-rls`.
--   • A limpeza de `AuthSession.activeOrganizationId` (D-3) e a revogação de
--     `CardGrant`/`CardResponsavel` (contrato 2.10) usam GRANTs de UPDATE já existentes.
--
-- `ALTER TYPE ... ADD VALUE` ANEXA membros ao enum nativo do PostgreSQL SEM reescrever tabela
-- (confirmado no context7-check contra a doc do Prisma). Esta migration apenas ADICIONA os valores;
-- não os USA na mesma transação — logo é segura sob o wrapper transacional do Prisma (a restrição do
-- PG é usar o valor recém-criado na mesma transação, não criá-lo).
--
-- `IF NOT EXISTS` torna o replay idempotente (defesa; o Prisma aplica cada migration uma vez).

ALTER TYPE "MembershipEventType" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "MembershipEventType" ADD VALUE IF NOT EXISTS 'REACTIVATED';
