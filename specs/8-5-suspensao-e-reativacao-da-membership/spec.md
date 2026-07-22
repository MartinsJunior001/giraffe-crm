# Spec — Story 8.5: Suspensão e reativação da Membership

> Épico 8 (Administração da Organização). Twin de comportamento da 8.4 (alteração de papel),
> mas no eixo de **estado** da Membership (`ACTIVE ↔ SUSPENDED`), não de papel.
> Idioma: pt-BR. Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md` §664–681.

## Contexto e intenção

**As a** Administrador, **I want** suspender e reativar membros com preflight e sessão org-scoped,
**so that** eu controle o acesso de forma reversível e segura.

Suspender uma Membership `ACTIVE → SUSPENDED` e reativar `SUSPENDED → ACTIVE`, pela autoridade
correta (Admin ativo da Org), de forma **atômica**, **auditada** e com **invalidação imediata de
acesso** — sem tocar outras Organizações do mesmo Account.

## Decisões consolidadas (D-1..D-4, APROVADAS — não reabrir)

- **D-1 (step-up):** suspender **e** reativar exigem step-up recente (reusa `StepUpService`, 1.12).
  Fora da janela → **403 `STEP_UP_REQUIRED`**. Resolvido server-side; nada em log/resposta.
- **D-2 (último Admin, atômico):** suspender **reduz** Admins ativos. Suspender o **último** Admin
  ativo → **409 `LAST_ADMIN_PROTECTED`**. Mesmo padrão da 8.4: transação interativa no client raiz
  com `definirContextoOrg` + `SELECT … FOR UPDATE` na linha da `Organization` + relê Admins ativos
  DENTRO da tx + revalida invariante + grava evento/auditoria na MESMA tx. Decisão pura em
  `membership-state.core.ts` (testável sem PostgreSQL). Teste concorrente prova que duas suspensões
  simultâneas nunca zeram Admin.
- **D-3 (sessão/abilities — ADITIVO central):** ao suspender, altera o `state` atomicamente e
  **invalida o acesso** na Org afetada: `AbilityCache.invalidar(accountId, orgId)`; **limpa**
  `AuthSession.activeOrganizationId` das sessões do alvo que apontam para a Org afetada. O
  `OrgContextResolver` (1.3) **já relê Membership ACTIVE por requisição** — um `SUSPENDED` cai em
  **deny-by-default** na próxima requisição sem coluna de "versão de autorização" nova.
  **NÃO** revoga a Account globalmente; outras Orgs intactas. **Reativação:** exige step-up, **NÃO**
  restaura concessões/atribuições/papéis de Pipe-Database revogados, **NÃO** promove papel; novo
  evento + auditoria.
- **D-4 (minimização LGPD):** `MembershipEvent` só com metadados sanitizados — NUNCA
  senha/hash/token/cookie/id de sessão/corpo HTTP/PII desnecessária.

## Autorização

- Guard grosso `@Requer('administrar','Organizacao')` (só Admin da Org na CASL 1.6 — C3 congelado).
- Autoridade fina no serviço (espelha 8.4): alvo cross-tenant/inexistente → **404 não-enumerante**;
  sem poder → 403 (guard). Deny-by-default.
- **Autossuspensão proibida** (spec: "usuário não se suspende"; saída própria é 8.6) → **403
  `AUTOSSUSPENSAO_PROIBIDA`**, verificada antes do step-up (não vaza requisito de uma ação vedada).
  A trava do último Admin continua valendo em qualquer caso.

## Preflight (contrato cross-epic, 2.10 D-OA3)

Consome as funções PURAS de `pipes/cards/access/membership-contract.ts`:
- `preflightEncerramentoMembership` — hoje **vacuamente verdadeiro** (`bloqueios: []`; a regra
  "Card exige Responsável ativo" não existe na Fase 1 — DIV-3). Se bloquear → **409
  `PREFLIGHT_BLOQUEADO`**, sem alteração parcial.
- `aoAlterarMembership` — para `SUSPENDED`: **revoga** `CardGrant` ativos e **remove** `CardResponsavel`
  ativos do alvo, e sinaliza reatribuição dos Cards órfãos. Para `ACTIVE` (reativação): plano vazio
  (**não restaura nada**). Aplicado na MESMA transação da suspensão.

## Escopo de revogação (AUTONOMOUS_DECISION — ver plan.md)

Suspensão revoga **`CardGrant` + `CardResponsavel`** conforme o contrato materializado
`aoAlterarMembership`. `PipeGrant`/`DatabaseGrant` **não** são fisicamente revogados: o
deny-by-default por releitura de Membership ACTIVE já torna todo acesso à Org inalcançável enquanto
suspenso, e o contrato puro da 2.10 deliberadamente os exclui. Divergência com a prosa do épico
(§591) registrada como `DEB-8-5-PIPE-DB-GRANT-REVOKE`.

## Migration

Uma migration mínima: `ALTER TYPE "MembershipEventType" ADD VALUE 'SUSPENDED' | 'REACTIVATED'`
(sem tabela, sem coluna, sem GRANT novo — validado no context7-check: Prisma/PG anexam membros de
enum via `ALTER TYPE ADD VALUE`, sem reescrita de tabela). `Membership` já tem GRANT
`SELECT/INSERT/UPDATE/DELETE` desde `init_tenancy_rls` — `state` já é coberto. `AuthSession`,
`CardGrant`, `CardResponsavel` já têm GRANT UPDATE.

## Evento canônico

`MembershipEvent` (append-only, imutável — 8.4). Suspensão: `type=SUSPENDED`; Reativação:
`type=REACTIVATED`. `fromRole=toRole=<papel inalterado>` (suspensão não muda papel). O estado e a
reconciliação vão no `payload` versionado: `{ fromState, toState, revokedCardGrants?,
removedResponsavelDe?, reatribuir? }` (sem PII). `eventId` determinístico (uuidv5).

## Acceptance Criteria (do épico §675–680)

- **AC1** — membro ativo suspenso (step-up + preflight sem bloqueio) → perde acesso/abilities/canais
  da Org afetada imediatamente (deny-by-default na próxima requisição), mantendo papel/histórico;
  sessões/Memberships em outras Orgs intactas; concessões operacionais (`CardGrant`) revogadas.
- **AC2** — responsabilidades obrigatórias não reatribuídas → preflight bloqueia (409), sem alteração
  parcial. (Hoje vacuamente verdadeiro — não bloqueia; teste garante o caminho.)
- **AC3** — Org suspensa é a ativa → `activeOrganizationId` limpo, sem troca silenciosa; último Admin
  ativo → suspender bloqueado (409).
- **AC4** — Membership suspensa reativada (step-up) → acesso retomado sem novo aceite, papel
  preservado; atribuições removidas na suspensão **não** restauradas; suspensão/reativação geram
  Auditoria e Evento pós-alteração.

## Fora do escopo

Remoção/saída voluntária (8.6); efeitos concretos sobre recursos em E2/E5; restauração de
atribuições; roster (8.7); read-side de auditoria (8.8).
