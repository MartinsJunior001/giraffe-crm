# Pre-Implementation Check — Story 5.2

**Status: APROVADO.** Risco: ALTO (migration + entidade nova + RLS + autz + wiring E8 + anexos).

## Gate documental (context7)
Stack idêntica à 5.1 (Prisma 6.19.3, NestJS 11, PostgreSQL 16). Primitivos reusados e já validados na 5.1:
índice único composto, RLS/GRANT por raw SQL na migration, tx interativa no client raiz com
`definirContextoOrg`, guarda otimista via `updateMany`. **Nenhuma API nova de biblioteca** — nada a
reconferir além do baseline da 5.1.

## Migration
- Aditiva: duas tabelas novas + enums; nenhuma coluna alterada em tabela existente (reusa `Card_orgId_id_key`
  da 5.1 e o par de `Pipe` da 4.1). Backfill não se aplica (tabelas vazias).
- Reversível: rollback DROP tables/types; **não** toca índices de terceiros. Drill obrigatório antes do PR.
- Slot de migration `20260731120000` livre (última é `20260730120000_tasks`).

## Isolamento / GRANT
Padrão replicado de `Task` (RLS ENABLE+FORCE, WITH CHECK INSERT/UPDATE, GRANT column-scoped sem DELETE,
History append-only). Fase vermelha exigida no `solicitacoes-rls`.

## Autorização
Reusa `pipe-authz` (funções puras) — guard/`ability.ts` intocados (C3 congelado).

## Toques aditivos (regressão sob controle)
`membership-contract` (campos opcionais), `membership-state`/`membership-removal` (nova consulta/esvaziamento
+ campo de resposta), dois dispatchers de arquivo (nova branch). Todos aditivos; suíte E8 e 5.1 na régua.

## Escopo
Sem Notificações (5.3+), sem motor (5.7), sem mecanismo temporal. Sem antecipação.

## Decisão material
Responsável 0..1 opcional (`decisions/responsavel-0-1-5-2.md`) — não é decisão de produto que exija o dono
(o Escopo já a determina; só se resolve a redação do AC1).

**Prossegue para implementação.**
