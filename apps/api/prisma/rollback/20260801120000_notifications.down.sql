-- Rollback da Story 5.3 (Notificações — fonte única). Ordem: filho primeiro, depois a tabela dona e o tipo.
-- Nenhum dado pré-existente é tocado (tabelas novas), então o rollback restaura o estado anterior exato.
-- As policies e GRANTs caem junto com as tabelas (DROP TABLE remove policies/GRANTs da tabela).

DROP TABLE IF EXISTS "NotificationRecipient";
DROP TABLE IF EXISTS "Notification";

DROP TYPE IF EXISTS "NotificationAvailability";
