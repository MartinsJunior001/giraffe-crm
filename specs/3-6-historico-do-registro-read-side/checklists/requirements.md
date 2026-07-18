# Checklist de requisitos — Story 3.6

- [ ] RF-1 timeline cronológica paginada por cursor (`[createdAt, id]`, teto 100) — AC1/AC6
- [ ] RF-2 projeção allowlist (`id/type/summary/actorId/occurredAt`); sem `orgId`/`recordId`/binário/chave/URL — AC2
- [ ] RF-3 autorização por acesso atual ao Database dono (`exigirLerDatabase`); 404 não-enumerante — AC3
- [ ] RF-3b histórico não concede acesso (ator sem acesso atual → 404) — AC4
- [ ] RF-4 correção = novo evento; original preservado (imutabilidade lida) — AC5
- [ ] Isolamento por Organização/Database via RLS + `withTenantContext`; cross-tenant → 404 — AC7
- [ ] Sem migration / sem GRANT / `MODELOS_AUDITADOS` inalterado
- [ ] Guard C3 congelado (`@Requer('ler','Database')` grosso + guarda fina no serviço)
- [ ] Sem antecipar 3.8/3.9/E8 (nenhum evento fabricado; taxonomia `type` aberta)
- [ ] Testes: `record-history-read-rls` + `record-history-read-http` verdes em PostgreSQL real
- [ ] Regressão 3.4/3.5 verde; suíte serial verde (gate autoritativo = CI)
