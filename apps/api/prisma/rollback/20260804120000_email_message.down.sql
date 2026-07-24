-- Rollback da Story 6.1 (EmailMessage). Reverte TUDO que a migration criou, na ordem inversa.
-- ⚠️ DESTRUTIVO para dados de e-mail criados após a migration (aceitável no drill; em produção, avaliar).
DROP TABLE IF EXISTS "EmailMessage";
DROP TYPE IF EXISTS "EmailState";
