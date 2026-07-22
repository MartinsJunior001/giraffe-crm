-- Story 8.6 — Remoção e saída voluntária da Membership: tipo de EVENTO do encerramento + fechamento
-- do débito DEB-MEMBERSHIP-EVENT-CASCADE (REVOKE DELETE em "Membership").
--
-- A 8.6 encerra o vínculo (`ACTIVE`/`SUSPENDED → REMOVED`) por remoção administrativa OU saída
-- voluntária. O encerramento é SOFT-DELETE (`state = REMOVED`), NUNCA DELETE físico de linha:
--   • `Membership.state` já é escrito pelo runtime — `GRANT ... UPDATE ... ON "Membership"` existe
--     desde `init_tenancy_rls`, com a policy `membership_update` (USING + WITH CHECK por
--     `current_org_id()`). Encerrar é um UPDATE de `state` sob a MESMA fronteira.
--   • `MembershipEvent` (8.4) já é append-only/imutável (GRANT só SELECT+INSERT). A 8.6 só ACRESCENTA
--     o tipo `REMOVED` — imutabilidade e isolamento seguem provados por `membership-events-rls`.
--   • A limpeza de `AuthSession.activeOrganizationId` (D-3) e a revogação de
--     `CardGrant`/`CardResponsavel` (contrato 2.10) usam GRANTs de UPDATE já existentes.
--
-- (1) ENUM — `ALTER TYPE ... ADD VALUE` ANEXA o membro ao enum nativo do PostgreSQL SEM reescrever a
-- tabela (context7-check contra a doc do Prisma/PG 16). Esta migration apenas ADICIONA o valor; não o
-- USA na mesma transação — logo é segura sob o wrapper transacional do Prisma (a restrição do PG é
-- USAR o valor recém-criado na mesma transação, não CRIÁ-lo). `IF NOT EXISTS` torna o replay idempotente.

ALTER TYPE "MembershipEventType" ADD VALUE IF NOT EXISTS 'REMOVED';

-- (2) FECHA O BURACO — DEB-MEMBERSHIP-EVENT-CASCADE.
--
-- Desde `init_tenancy_rls`, o runtime tem `GRANT SELECT, INSERT, UPDATE, DELETE ON "Membership"`. O
-- DELETE ali NUNCA foi usado por nenhum caminho de produção (a remoção lógica sempre foi `state`), mas
-- ele é uma porta perigosa: a FK `MembershipEvent_membershipId_fkey` é `ON DELETE CASCADE`, e ações
-- referenciais (cascade) rodam com **bypass de row security** E como o DONO da tabela — ignorando o
-- GRANT append-only de `MembershipEvent`. Ou seja: um DELETE de `Membership` (mesmo escopado à Org pela
-- policy `membership_delete`) apagaria em cascata os eventos append-only DAQUELA Organização, burlando a
-- imutabilidade que o GRANT de `MembershipEvent` deveria garantir. A 8.6 materializa a remoção, então
-- FECHA a porta: o runtime não precisa de DELETE em `Membership` (remoção = `state = REMOVED`;
-- reativação/reingresso = UPDATE/INSERT via aceite de Convite, 8.3).
--
-- A partir daqui, um `DELETE ON "Membership"` pelo runtime bate em `permission denied` — provado por
-- `membership-removal-rls` (com a fase vermelha registrada em gates/8-6/red-phase.md). As policies
-- `membership_delete` (USING) e o próprio DELETE do dono/migrator permanecem intactos (faxina de teste,
-- cascatas legítimas de Organization/Account seguem funcionando).
--
-- ROLLBACK (drill em migration-check.md): `GRANT DELETE ON "Membership" TO giraffe_app;` restaura o
-- estado anterior. Aditivo do enum não precisa (nem pode facilmente) ser revertido — valores de enum
-- são forward-only e inertes enquanto ninguém os usa.

REVOKE DELETE ON "Membership" FROM giraffe_app;
