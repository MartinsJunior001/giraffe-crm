-- Rollback da Story 5.2 (Solicitações). Ordem: filho primeiro, depois a tabela dona e seus tipos.
-- Nenhum dado pré-existente é tocado (tabelas novas), então o rollback restaura o estado anterior exato.
-- As policies e GRANTs caem junto com as tabelas (DROP TABLE remove policies/GRANTs da tabela).
--
-- IMPORTANTE: NÃO se dropa `Card_orgId_id_key` — ele foi criado pela migration da 5.1 (`..._tasks`) e é o
-- destino da FK composta de `cardId` também da 5.1; removê-lo aqui quebraria a 5.1. A 5.2 apenas o REUSA.

DROP TABLE IF EXISTS "SolicitacaoHistory";
DROP TABLE IF EXISTS "Solicitacao";

DROP TYPE IF EXISTS "SolicitacaoArchiveState";
DROP TYPE IF EXISTS "SolicitacaoLifecycleState";
