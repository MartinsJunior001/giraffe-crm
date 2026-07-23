# pre-implementation-check — Story 5.4 (Notificações: superfícies, leitura e preferências)

**Status: APROVADO**

## 1. Fase e escopo
- Fase 1, Épico 5 (Tarefas/Solicitações/Notificações), 4ª Story. Depende só da 5.3 (**merged**, `main` 9b5603d).
- Não antecipa Fase 2. Recorte explícito vs. 5.5 (tempo-real/push), 5.6 (catálogo de tipos), E7 (Dashboard).
- Liberada: branch `story/5-4-superficies-leitura` atribuído pela Lane 0.

## 2. Story / AC
- Objetivo/ACs de `epics.md` §1582–1601 (AC1 superfícies+contagem; AC2 marcar lida/todas; AC3 preferências;
  + a revalidação de acesso herdada da 5.3 §1571/§1574). Mapeados 1:1 a testes em `spec.md §9`.

## 3. Produto / invariantes
- `Card ≠ Registro`, `Database ≠ Pipe`, `Fase ≠ Status` preservados (a revalidação roteia por `resourceType`
  para o domínio dono, sem fundir entidades). Notificação **nunca concede acesso** (invariante-mãe da 5.3).
- Deny-by-default: sem acesso ao recurso de origem → oculta + fora da contagem; `recipientMembershipId` nunca
  do cliente.

## 4. Técnica
- Stack instalada (Prisma 6.19.3, Nest 11, Vitest 4). **Nenhuma dependência nova.** Nenhuma assinatura nova de
  terceiros (context7-check material N/A — reuso de padrões 5.3/3.5/4.8). Índice parcial e `orderBy` JSON (as
  limitações do Prisma 6.19.3) **não** são necessários aqui.
- Módulos afetados: `notifications/` (aditivo — `read/` novo + 1 método na fonte única), `kernel/db/tenant-
  context.ts` (+1 modelo auditado). Reuso puro de `pipe-authz`/`database-authz` (sem ciclo de módulo). Guard/
  `ability.ts` (C3) **congelado** — guarda GROSSA reusa `@Requer('ler','Organizacao')` (piso), sem sujeito novo.

## 5. Dados / migration
- 1 entidade nova org-scoped: `NotificationPreference` (usuário+Org+tipo). Fonte de verdade = ela mesma.
- RLS ENABLE+FORCE + WITH CHECK (INSERT+UPDATE); `MODELOS_AUDITADOS`; GRANT `SELECT/INSERT` + `UPDATE(enabled,
  updatedAt)`, **sem DELETE**; `orgId`/`membershipId`/`type` imutáveis por GRANT.
- Migration nova (slot desta Story) + rollback (`DROP TABLE`, reversível — tabela nova, sem backfill).
- `Notification`/`NotificationRecipient` **intocados** (sem migration/GRANT novo neles — read reusa SELECT, mark
  reusa UPDATE(readAt) da 5.3).
- LGPD: sem DELETE (preferência é UPDATE/upsert); histórico de Notificações não é apagado por preferência.

## 6. Permissões
- Ver/contar/marcar as **próprias** Notificações: qualquer Membership ativa (piso), fina no serviço
  (`recipientMembershipId` do principal). Preferências: só do próprio usuário. Super Admin/Convidado seguem o
  mesmo piso; a revalidação do recurso de origem herda a autz do domínio dono (Card/Pipe/Database).
- Sem exclusão (nenhuma rota de DELETE; runtime sem GRANT de DELETE).

## 7. Riscos e mitigação
- **Revalidação N+1** → batch-load do dono por `resourceType` + memoização por dono DISTINTO (D1).
- **Contagem = DoS** → janela ≤ `CAP=100` + `mais` (D1). Read-side **puro** (sem write-on-read, sem agendador).
- **Marcar alheio** → 404 não-enumerante (serviço 5.3, mira `(notificationId, recipientMembershipId)`).
- **Fase vermelha de RLS/GRANT** obrigatória antes de fechar (migration-check).

## 8. Observabilidade / segurança
- Auditoria manual (FR-214) nas mutações (marcar-todas, setar preferência). Logs sanitizados — `params` já
  vem escapado da 5.3; nunca logar `valores`/PII do recurso (a Notificação nem os tem). `orgId` fora da fronteira.

**Conclusão:** risco ALTO controlado pelos gates de migration/RLS/revalidação/read-side. Sem bloqueio.
Implementar na sequência de `tasks.md`.
