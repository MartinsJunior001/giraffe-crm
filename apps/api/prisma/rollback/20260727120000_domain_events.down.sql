-- Rollback da 20260727120000_domain_events (Story 4.3 — outbox canônico "DomainEvent").
--
-- ⚠️ DESTRUTIVO: apaga a trilha de integração "DomainEvent" INTEIRA. Como a tabela é o único objeto
-- criado pela migration — policies, índices, FKs e GRANTs são todos escopados a ela e caem junto no
-- DROP —, um único comando restaura o estado anterior por completo. A própria migration declara:
-- "REVERSÍVEL: DROP TABLE ... restaura o estado anterior".
--
-- A remoção da linha em `_prisma_migrations` NÃO vive aqui: é responsabilidade do runner
-- (`scripts/db-migrate.mjs`), sempre — ver o comentário no próprio script.

DROP TABLE IF EXISTS "DomainEvent";
