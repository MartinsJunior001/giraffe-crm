-- Rollback da Story 5.1 (Tarefas). Ordem: filhos e seus tipos primeiro, depois o índice aditivo em Card.
-- Nenhum dado pré-existente é tocado (tabelas novas + índice redundante), então o rollback restaura o estado
-- anterior exato. As policies caem junto com as tabelas (DROP TABLE remove policies/GRANTs da tabela).

DROP TABLE IF EXISTS "TaskOverdueOccurrence";
DROP TABLE IF EXISTS "TaskHistory";
DROP TABLE IF EXISTS "Task";

DROP TYPE IF EXISTS "TaskArchiveState";
DROP TYPE IF EXISTS "TaskLifecycleState";

-- Índice aditivo/redundante criado como destino da FK composta tenant-safe de `cardId`.
DROP INDEX IF EXISTS "Card_orgId_id_key";
