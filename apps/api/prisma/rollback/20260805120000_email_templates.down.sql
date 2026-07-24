-- Rollback da Story 6.2 (Templates). Ordem inversa; destrutivo para dados criados após a migration.
DROP TABLE IF EXISTS "EmailTemplateVersion";
DROP TABLE IF EXISTS "EmailTemplate";
DROP TYPE IF EXISTS "EmailTemplateState";
