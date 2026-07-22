# Spec — Story 8.6: Remoção, saída voluntária e impacto sobre recursos

> Épico 8 (Administração da Organização). Fecha o eixo do ciclo de Membership (papel 8.4 · estado 8.5 ·
> **encerramento 8.6**). Idioma: pt-BR. Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md`
> §682–698 (Story 8.6).

## Contexto e intenção

**As a** Administrador (ou como o próprio usuário), **I want** encerrar uma Membership com preflight,
step-up e rastreabilidade, **so that** eu controle o acesso sem perder histórico nem consistência.

Encerrar uma Membership (`ACTIVE`/`SUSPENDED → REMOVED`) por **remoção administrativa** (Admin ativo
sobre um alvo) ou **saída voluntária** (o próprio usuário sai de si), de forma **atômica**, **auditada**
e com **invalidação imediata de acesso** na Organização afetada — sem tocar outras Organizações do mesmo
Account, sem excluir a Account, preservando autoria/Histórico. `REMOVED` é terminal pela API: o
reingresso exige **novo Convite + aceite** (8.3) e **não restaura** papel/concessões/atribuições.

## Decisões consolidadas (D-1..D-4, APROVADAS — não reabrir)

- **D-1 (step-up):** remover **e** sair exigem step-up recente (reusa `StepUpService`, 1.12). Fora da
  janela → **403 `STEP_UP_REQUIRED`**. Resolvido server-side; nada em log/resposta.
- **D-2 (último Admin, atômico):** encerrar reduz Admins ativos quando o alvo é **Admin ATIVO**. Encerrar
  o **último** Admin ativo (por remoção OU saída) → **409 `LAST_ADMIN_PROTECTED`**. Mesmo padrão de
  8.4/8.5: transação interativa no client raiz com `definirContextoOrg` + `SELECT … FOR UPDATE` na linha
  da `Organization` + relê Admins ativos e o alvo DENTRO da tx (anti-TOCTOU) + revalida invariante +
  grava evento/auditoria na MESMA tx. Decisão pura em `membership-removal.core.ts`. **Teste concorrente
  REAL com alvos DISTINTOS** (dois Admins removendo um ao outro): um sucede, o outro 409, `count` final =
  1, **nunca 0** — a guarda otimista por-alvo NÃO pega essa corrida; só o lock+recount.
- **D-3 (sessão/abilities — ADITIVO central):** ao encerrar, altera o `state` atomicamente e **invalida o
  acesso** na Org afetada: `AbilityCache.invalidar(alvoAccountId, orgId)`; **limpa**
  `AuthSession.activeOrganizationId` das sessões do alvo que apontam para a Org afetada (na saída
  voluntária, o alvo é o próprio ator). O `OrgContextResolver` (1.3) **já relê Membership ACTIVE por
  requisição** — sem nenhuma ACTIVE, o alvo cai em **deny-by-default** na próxima requisição, sem coluna
  de "versão de autorização" nova. **NÃO** revoga a Account globalmente; outras Orgs intactas. `REMOVED`
  reversível só por novo Convite/aceite (8.3); reingressar **não restaura** papel/concessões/atribuições.
- **D-4 (minimização LGPD):** `MembershipEvent` só com metadados sanitizados — papel preservado
  (`fromRole=toRole`), `{ fromState, toState, saidaVoluntaria, revokedCardGrants, removedResponsavelDe }`
  no payload; NUNCA senha/hash/token/cookie/id de sessão/corpo HTTP/PII desnecessária.

## Autorização

- **Remoção administrativa:** guard grosso `@Requer('administrar','Organizacao')` (só Admin da Org na CASL
  1.6 — C3 congelado). Autoridade fina no serviço (espelha 8.4/8.5). Alvo cross-tenant/inexistente →
  **404 não-enumerante**; não-Admin → 403 (guard).
- **Saída voluntária:** guard `@Requer('ler','Organizacao')` (piso de TODA Membership ativa) — não é
  operação de Admin, é o usuário saindo de SI mesmo. O alvo é o próprio `membershipId` do requisitante,
  derivado do contexto (nenhum id do cliente). Step-up do próprio.
- **Sem bloqueio de auto-alvo** (diferente da autossuspensão 8.5, vedada): a saída própria é o objetivo;
  um Admin removendo a si mesmo também é permitido — o que ainda barra é o **último Admin** (409).
- Deny-by-default. DTO anti-mass-assignment (rotas sem corpo; id de rota validado como UUID → 400).

## Preflight e impacto sobre recursos (contrato cross-epic, 2.10 D-OA3)

Consome as funções PURAS de `pipes/cards/access/membership-contract.ts`, na MESMA transação:

- `preflightEncerramentoMembership` — hoje **vacuamente verdadeiro** (`bloqueios: []`; a regra "Card
  exige Responsável ativo" não existe na Fase 1 — DIV-3; **não inventar**). Se bloquear → **409
  `PREFLIGHT_BLOQUEADO`**, sem alteração parcial.
- `aoAlterarMembership('REMOVED', …)` — **revoga** `CardGrant` ativos (`state=REVOKED`) e **remove**
  `CardResponsavel` ativos (`state=REMOVED`) do alvo, e sinaliza reatribuição. `creator` é **preservado
  por construção** (é o `actorId` do `CREATED` da 2.7, não uma concessão — a autoria histórica nunca é
  reescrita).
- `PipeGrant`/`DatabaseGrant` **NÃO** são fisicamente revogados: o deny-by-default por releitura de
  Membership ACTIVE já os torna inalcançáveis (coerente com a 8.5; divergência prosa-do-épico × contrato
  rastreada em `DEB-8-5-PIPE-DB-GRANT-REVOKE`). **Não inventar** revogação além do contrato materializado.

## Evento canônico

Um **`MembershipEvent`** do tipo novo **`REMOVED`** por encerramento (append-only, MESMA tx, `eventId`
determinístico uuidv5). Remoção-por-Admin vs saída-voluntária distinguidas por `payload.saidaVoluntaria`
(= `actorId === alvo.accountId`) + o próprio `actorId`. Papel preservado (`fromRole = toRole`).

## Migration

Aditiva + fechamento de débito de segurança:
1. `ALTER TYPE "MembershipEventType" ADD VALUE IF NOT EXISTS 'REMOVED'` (não usa o valor na mesma tx →
   seguro sob o wrapper do Prisma; PG 16).
2. **`REVOKE DELETE ON "Membership" FROM giraffe_app`** — fecha **DEB-MEMBERSHIP-EVENT-CASCADE**: o
   `GRANT DELETE` pré-existente (de `init_tenancy_rls`) permitiria, via FK `ON DELETE CASCADE`, apagar em
   cascata os `MembershipEvent` append-only da Org (ações referenciais rodam com bypass de row security +
   como dono). O runtime **não precisa** de DELETE (remoção = `state`; reingresso = INSERT/UPDATE). Prova
   com fase vermelha (`membership-removal-rls`; red-phase.md). Rollback: `GRANT DELETE … TO giraffe_app`.

## Escopo negativo (fora desta Story)

- Implementação da **reatribuição** de Responsável em Cards/Tarefas/Solicitações (E2/E5) — a 8.6 apenas
  sinaliza (`reatribuir`).
- Revogação de `PipeGrant`/`DatabaseGrant` além do contrato (deny-by-default já basta na Fase 1).
- UI de direcionamento pós-saída ("outra Org/seletor") — server-side apenas limpa `activeOrganizationId`;
  o redirect é do roster/casca (8.7/web).
- Roster (8.7); read-side de Auditoria (8.8).

## Rastreabilidade

FR-33; D5.1; NFR-38; AD-9, AD-10, AD-13, AD-30; INV-ADMIN-01. AC: epics.md §695–698.
