# Checklist — Segurança & Isolamento — Story 5.5

- [x] Handshake reusa a sessão existente (`PRINCIPAL_PROVIDER`) — sem token paralelo.
- [x] Deny-by-default: sem sessão → recusa; sem Membership ativa → recusa (via `OrgContextResolver`).
- [x] Org resolvida pela Membership ATIVA; pedido do cliente (`auth.orgId`/`x-org-id`) é conferido,
      nunca autoridade.
- [x] Sala escopada por `(userId, orgId)` — isolamento por Org E por usuário (teste: A não recebe B).
- [x] Payload do socket sem PII/conteúdo — só `id`+`at` (teste de sanitização).
- [x] Revalidação de acesso a recurso permanece na 5.4 (o socket não decide acesso).
- [x] Revogação por suspensão/remoção/troca-de-Org (teste: `revogarCanal` desconecta).
- [x] Tempo real não marca lido; não persiste estado (teste: `readAt` segue null).
- [x] Degradação: app funciona sem socket (teste: Notificação persiste sem conexão).
- [x] Backpressure: coalescing por sala + teto por usuário (teste unit + integração).
- [x] C3 (`ability.ts`/guard) congelado; sem migration; sem GRANT novo; `MODELOS_AUDITADOS` intocado.
- [x] CORS do socket sem wildcard + credentials (adapter lê a allowlist validada do `env.ts`).
- [x] Emissão fault-isolated pós-commit (não derruba a escrita da Notificação).
