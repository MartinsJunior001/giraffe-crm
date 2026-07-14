# Pre-Implementation Check — Story 2.11 (Ciclo de vida do Card)

> Gate obrigatório antes de código. Status: **APROVADO**.

## Escopo
Concluir/arquivar/reabrir/restaurar Cards: estados canônicos ATIVO/FINALIZADO/ARQUIVADO; `reaberto`/`restaurado`
são transições. Estado anterior ao arquivamento preservado; cada transição gera evento no `CardHistory`.

## Decisão arquitetural central (derivada, não em aberto)
**1º UPDATE de `Card` em runtime, column-scoped.** `GRANT UPDATE ("lifecycleState","previousLifecycleState",
"updatedAt")` — `phaseId` (movimentação, 2.14), `valores`, `orgId` seguem sem UPDATE. Reconcilia "ciclo de vida sim,
movimentação não". Pré-registrado na migration da 2.7. Alternativa (tabela `CardLifecycle` append-only) rejeitada: o
estado é intrínseco ao Card e a diretriz permite UPDATE narrow.

## context7-check
- **PostgreSQL** — `GRANT UPDATE (col, ...) ON tabela TO role` (column-level privileges) é recurso padrão e estável;
  interage com a policy RLS `card_update` (WITH CHECK orgId) por conjunção (precisa dos dois). Confirmado o
  comportamento: `permission denied for column` quando o UPDATE toca coluna sem privilégio.
- **Prisma 6.19.3** — `update`/`updateMany` geram `UPDATE SET <colunas do data> + updatedAt(@updatedAt)`; por isso
  `updatedAt` entra no GRANT. Sem API nova além do já validado (transação interativa, `set_config`).

## Verificações
- **Sem antecipar escopo:** sem saúde temporal (2.13), sem movimentação (2.14), sem tabela nova. `CardHistory`
  reusado (novos `type` apenas).
- **C3 congelado:** autorização fina no serviço (`exigirOperarCard`), guard/CASL intocados.
- **Invariantes:** `Fase ≠ Status do Card`; `phaseId` sem UPDATE; sem DELETE; isolamento por RLS.

**Veredito: APROVADO.**
