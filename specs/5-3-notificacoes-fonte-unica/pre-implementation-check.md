# Pre-Implementation Check — Story 5.3

**Status: APROVADO.** Risco: ALTO (migration + 2 entidades novas + RLS + idempotência lógica + sanitização
anti-XSS).

## Gate documental (context7)
Stack idêntica a 5.1/5.2 (Prisma 6.19.3, NestJS 11, PostgreSQL 16). Primitivos reusados e já validados:
índice único (composto/simples), RLS/GRANT/FORCE por raw SQL na migration, tx interativa no client raiz com
`definirContextoOrg`, `createMany({ skipDuplicates })`, guarda otimista via `updateMany`. **Nenhuma API nova
de biblioteca** — nada a reconferir além do baseline.

## Migration
- **Aditiva:** 1 enum + 2 tabelas novas; **nenhuma** coluna alterada em tabela existente. Backfill não se
  aplica (tabelas vazias).
- **Reversível:** rollback DROP filho→pai→enum; não toca objetos de terceiros. Drill obrigatório antes do PR.
- **Slot** `20260801120000` livre (última é `20260731120000_solicitacoes`).

## Isolamento / GRANT
Padrão replicado de `MembershipEvent` (append-only) + `Solicitacao` (ledger column-scoped): RLS ENABLE+FORCE,
WITH CHECK INSERT/UPDATE, GRANT column-scoped, sem DELETE. Fase vermelha exigida em `notifications-rls`.

## Autorização
5.3 é write-side/modelo: **sem** rota de criação (produtor de sistema) e **sem** rota de leitura (5.4). O
guard/`ability.ts` (C3) fica **intocado**. `marcarComoLida` é método de serviço (a rota é 5.4).

## Anti-especulação (Constitution — "sem antecipar escopo")
- **Consumidor concreto:** o serviço de escrita testado ponta-a-ponta É o consumidor do modelo. Não se cria
  tipo/produtor concreto (5.6/5.7/E8) nem superfície (5.4/5.5).
- `availabilityState` existe como campo (§1568), mas sua **transição** (supressão por perda de acesso) é 5.4 —
  registrado como contrato-futuro, não implementado.
- Sem `NotificationHistory` (não pedido) — o mutável auditável é a própria `NotificationRecipient`.

## Decisão material
Recorte write-side vs. 5.4/5.6 + idempotência por `dedupeKey` — `decisions/notification-canonical-model-5-3.md`.
Não é decisão de Produto que exija o dono (as fontes §1567–1580 já a determinam).

**Prossegue para implementação.**
