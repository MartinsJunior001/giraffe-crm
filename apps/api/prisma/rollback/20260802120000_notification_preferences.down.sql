-- Rollback da Story 5.4 (Notificações — preferências por tipo). Tabela NOVA, sem backfill: o rollback restaura
-- o estado anterior exato. As policies e o GRANT caem junto com a tabela (DROP TABLE remove policies/GRANTs).
-- As tabelas da 5.3 (`Notification`/`NotificationRecipient`) não foram tocadas pela 5.4 — nada a reverter nelas.

DROP TABLE IF EXISTS "NotificationPreference";
