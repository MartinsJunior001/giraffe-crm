# Story 8.4 — Alteração de papel da Membership

> Spec Kit CONSOLIDADO (Fast Track por Épicos). As decisões de gate D-1..D-4 do Épico 8 já estão
> APROVADAS (`_bmad-output/implementation-artifacts/decisions/epic-8-gate-decisions-d1-d4.md`) e são
> autoritativas — esta spec as instancia, não as reabre.

## Intento

Permitir que o **Admin da Organização** altere o papel de uma **Membership ativa** (ADMIN/MEMBER/GUEST)
de forma **transacional, atômica, auditada e segura**, preservando o isolamento multi-tenant e o
invariante INV-ADMIN-01 (toda Org mantém ≥ 1 Admin ativo).

Rastreabilidade: FR-33; D5.1; NFR-38; AD-9, AD-13, AD-30; INV-ADMIN-01. Épico 8 (E8), depende de 8.1,
1.6, 1.12.

## Requisitos (do épico + D-1..D-3)

- **RN-1** Só **Membership `state=ACTIVE`** muda de papel; suspensa/encerrada → recusa (409 `MEMBERSHIP_INATIVA`).
- **RN-2** Só o **Admin da Org ativo** executa (deny-by-default; MEMBER/GUEST → 403; alvo cross-tenant → 404 não-enumerante).
- **RN-3** Papel final ∈ {ADMIN, MEMBER, GUEST}. Alterar para o mesmo papel é **no-op idempotente** (200, sem escrita/evento).
- **RN-4 (D-1)** **Promover→Admin** e **rebaixar Admin** exigem **step-up recente** (janela 10 min, 1.12). Fora da janela → 403 `STEP_UP_REQUIRED`. Trocas entre não-Admins **não** exigem step-up.
- **RN-5 (D-2)** **Proteção atômica do último Admin**: qualquer alteração que reduza a quantidade de Admins ativos abre transação, **bloqueia a linha da `Organization` com `SELECT … FOR UPDATE`**, RELÊ os Admins ativos e o alvo DENTRO da tx, valida o invariante e só então aplica + grava evento/auditoria na MESMA tx. Rebaixar o último Admin (inclusive por concorrência) → 409 `LAST_ADMIN_PROTECTED`. Convites pendentes e Memberships suspensas/encerradas **não contam** como Admin ativo.
- **RN-6** **Rebaixamento** executa o **preflight** (responsabilidades obrigatórias) e **revoga atomicamente** concessões **incompatíveis** com o novo papel; **não** restaura em promoção futura. Na Fase 1: preflight de Card é **vacuamente verdadeiro** (a regra "Card exige Responsável ativo" não existe — DIV-3); a única incompatibilidade materializada é o **teto AD-9** (Convidado só `VIEWER` em `DatabaseGrant`), revogado ao rebaixar para GUEST.
- **RN-7 (D-3)** Pós-alteração: **invalida a ability em cache** do alvo na Org afetada; o contexto RELÊ a Membership ACTIVE a cada requisição (novo papel já vale). **Não** revoga a Account globalmente; outras Orgs intactas. Revalidação anti-TOCTOU na fronteira transacional.
- **RN-8** Cada alteração escreve o **evento canônico** `MembershipEvent` (`ROLE_CHANGED`, from→to, ator) na MESMA tx (append-only, outbox idempotente por `eventId` determinístico) + trilha de **auditoria** (FR-214). Minimização LGPD (D-4): nunca senha/token/sessão/e-mail/corpo HTTP/PII desnecessária.

## Contrato HTTP

`PATCH /organizations/members/:membershipId/role` · guard `@Requer('administrar','Organizacao')` (Admin-only).
Corpo: `{ "role": "ADMIN" | "MEMBER" | "GUEST" }` (allowlist; outra chave → 400). Nenhum `orgId` do cliente.

Respostas: 200 `{ id, role, previousRole, revokedDatabaseGrants[] }` · 400 corpo/id inválido · 401 sem sessão ·
403 não-Admin **ou** `STEP_UP_REQUIRED` · 404 alvo de outra Org · 409 `MEMBERSHIP_INATIVA` | `LAST_ADMIN_PROTECTED` | conflito de concorrência.

## Fora de escopo

Suspensão/reativação (8.5); remoção/saída voluntária (8.6); efeitos concretos sobre recursos (E2/E3/E5);
teto GUEST de `PipeGrant` (débito aberto `DEB-PIPEGRANT-GUEST-CEILING`); read-side/UI do roster (8.7).

## Critérios de aceite (verificáveis)

Mapeados 1:1 nos testes `membership-role-http.test.ts` / `membership-events-rls.test.ts` / `membership-role-core.test.ts`:
AC1 alteração com step-up → 200 + ability invalidada + evento; AC2 gate de step-up (exige/escopado);
AC3 último Admin atômico (inclui **teste concorrente**: um 200, um 409, nunca 0 Admins); AC4 revogação
incompatível AD-9 sem restauração; autorização/isolamento/validação/idempotência.
