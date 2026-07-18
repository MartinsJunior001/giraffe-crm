# Analyze — Story 3.6 (consistência cruzada)

## Cobertura AC → componente/teste

| AC | Componente | Teste |
|----|-----------|-------|
| AC1 timeline | `verHistorico` findMany ordenado | `record-history-read-http` |
| AC2 projeção | `SELECT_EVENTO` allowlist | `record-history-read-http` (sem `orgId`/`recordId`) |
| AC3 404 sem acesso | `exigirLerDatabase` | `record-history-read-http` |
| AC4 não concede | gate por acesso atual (não por ator) | `record-history-read-http` |
| AC5 append-only | imutabilidade lida (2 eventos) | `record-history-read-http` |
| AC6 cursor/teto | `take+1`, `[createdAt,id]`, min/max 100 | `record-history-read-http` |
| AC7 isolamento | RLS + `withTenantContext` | `record-history-read-rls` |

## Consistência com invariantes/arquitetura

- `Card ≠ Registro`: domínio DISTINTO; espelha 2.17 sem reusar entidades de Card. ✔
- Read-side puro: sem migration/GRANT; `RecordHistory` já append-only (3.4). ✔
- AD-15/AD-30: projeção controlada; sem trilha de integração/binário/chave/URL. ✔
- Guard C3 congelado: `@Requer('ler','Database')` + guarda fina no serviço. ✔
- Sem antecipar 3.8/3.9/E8: taxonomia `type` aberta, nenhum evento fabricado. ✔

## Riscos e mitigação

- **Enumeração de Registro por status HTTP:** mitigada por 404 uniforme (sem acesso / inexistente / cross-Database
  / cross-Org indistinguíveis).
- **Vazamento de coluna futura de arquivo (3.8):** mitigado por allowlist explícita — colunas novas não entram sem
  edição consciente da projeção.
- **Divergência doc atual × plano:** nenhuma (context7-check: Prisma cursor pagination estável).

## Veredito

Plano coeso, sem lacuna de AC, sem antecipação de escopo. **Pronto para implementação.**
