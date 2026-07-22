# Fase vermelha — Story 8.4 (evidência)

A convenção da base: um teste de segurança só vale se a fase vermelha for provada — quebre a proteção de
propósito e confirme que o teste falha.

## GRANT como fronteira do append-only (`MembershipEvent`)
Quem garante a imutabilidade do evento canônico é o GRANT (SELECT+INSERT, sem UPDATE/DELETE), não o ORM.

Prova executada contra o banco real (papel `giraffe_app`):
1. `GRANT UPDATE, DELETE ON "MembershipEvent" TO giraffe_app;` (temporário).
2. `vitest run membership-events-rls -t "permission denied"` → **2 FAILED** (UPDATE e DELETE deixam de bater
   em `permission denied` — as mutações passam). Confirma que o teste realmente depende do GRANT.
3. `REVOKE UPDATE, DELETE ON "MembershipEvent" FROM giraffe_app;` (volta ao estado da migration).
4. Suíte `membership-events-rls` → **7 passed** (verde restaurado).

## WITH CHECK / RLS
O INSERT cross-tenant é provado via `createMany` (sem RETURNING — que esbarraria na policy de SELECT e
poderia mascarar um WITH CHECK desligado), rejeitado por `row-level security`. Padrão idêntico ao
`movement-event-rls` (2.16), cuja fase vermelha do WITH CHECK já é doutrina da base.

## Ability invalidation (D-3)
O teste AC1 prova a invalidação de forma NÃO trivial: o alvo (MEMBER) chama `/organizations/admin-scope` →
403 e CACHEIA a ability de MEMBER; após a promoção a ADMIN, a MESMA chamada → 200. Sem `AbilityCache.invalidar`
(D-3), o cache manteria o 403 — o 200 é a prova de que a invalidação ocorreu.
