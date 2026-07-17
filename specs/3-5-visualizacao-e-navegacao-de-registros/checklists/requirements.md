# Checklist de requisitos — Story 3.5

## Cobertura dos ACs

- [ ] AC1 — tabela com paginação (offset, take≤100)/ordenação por Campo/estados honestos; ativos por padrão.
- [ ] AC2 — arquivados sob opção autorizada; `podeEditar` reflete Database/Registro arquivado.
- [ ] AC3 — filtros por tipo (contém/igual; número/data igual/maior/menor/intervalo; Seleção; Sim/Não), E;
  Campo/operador/valor inválido → 400 fail-closed.
- [ ] AC4 — INV-REPORT-01: sem acesso → 404 não-enumerante; contagem escopada ao Database; sem agregação
  cross-Database.
- [ ] AC5 — filtro `Arquivo possui/não possui` rejeitado (gated 3.7/3.8, AD-28).
- [ ] AC6 — RLS: outra Org/Database invisível; VIEWER lê (ler ≠ operar); `orgId`/`databaseId` nunca do cliente.
- [ ] AC7 — sem grupos complexos/filtros salvos/visualizações/fórmulas/agregações; sem Histórico/vínculo; sem
  migration/GRANT.

## Invariantes / segurança

- [ ] Read-side puro: sem migration, sem GRANT novo (runtime segue `SELECT`).
- [ ] Query raw **totalmente parametrizada** (Campo/operador/valor) + allowlist — sem injeção, sem coluna
  arbitrária.
- [ ] Raw roda sob `definirContextoOrg` (RLS aplicada) — cross-tenant invisível.
- [ ] `orgId`/`databaseId`/`idempotencyKey` fora da projeção; `valores` fora de log.
- [ ] Guard C3 congelado (`git diff -- kernel/authz/` vazio).

## Gates de execução

- [ ] context7-check (Prisma JSON filtering nativo; orderBy JSON = raw parametrizado).
- [ ] pre-implementation-check APROVADO.
- [ ] Fase vermelha (injeção): valor com aspas/operador forjado → 400, não executa.
- [ ] Isolamento cross-tenant provado (raw sob RLS).
- [ ] Regressão 3.4 (records-http/rls) verde.
- [ ] security/observability/performance-check (sem migration/lgpd/backup novos além de leitura).
