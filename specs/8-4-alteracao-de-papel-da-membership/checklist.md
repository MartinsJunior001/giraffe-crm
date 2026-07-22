# Checklist — Story 8.4

## Requisitos ↔ implementação
- [x] Só Membership ACTIVE muda de papel (409 MEMBERSHIP_INATIVA).
- [x] Só Admin da Org (guard + defesa fina); MEMBER/GUEST → 403; cross-tenant → 404 não-enumerante.
- [x] Papel ∈ {ADMIN,MEMBER,GUEST}; mesmo papel = no-op idempotente (sem escrita/evento).
- [x] Step-up (D-1) para promover→Admin / rebaixar Admin; escopado (não blanket).
- [x] Proteção atômica do último Admin (D-2): FOR UPDATE + reléitura in-tx + guarda otimista + teste concorrente.
- [x] Rebaixamento revoga concessões incompatíveis (AD-9 DatabaseGrant) atomicamente; não restaura.
- [x] Invalidação de ability do alvo (D-3); contexto relê ACTIVE; sem revogação global da Account.
- [x] Evento canônico `MembershipEvent` (ROLE_CHANGED) + auditoria na MESMA tx; append-only; outbox idempotente.
- [x] Minimização LGPD (D-4): sem senha/token/sessão/e-mail/corpo HTTP em log/evento/resposta.

## Segurança / invariantes
- [x] RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE) em `MembershipEvent`.
- [x] GRANT mínimo (SELECT+INSERT; sem UPDATE/DELETE); fase vermelha provada.
- [x] Nenhuma query fora de `withTenantContext`/tx com `definirContextoOrg`; nenhum `orgId` do cliente.
- [x] Guard/`ability.ts` intocados (C3 congelado); autoridade fina no serviço.

## Gates
- [x] pre-implementation-check APROVADO · context7-check · security-check · observability-check · migration-check.
- [ ] lint · typecheck · test (API) · build — execução registrada no PR.
