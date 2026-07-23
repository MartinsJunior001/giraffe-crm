# Spec — Story 5.1: Tarefas — ciclo de vida e acompanhamento

**Épico 5 (Tarefas, Solicitações e Notificações), 1ª Story.** Fonte: `epics.md` §1514–1538.
**Risco:** ALTO (migration + entidade nova + RLS + autz + mecanismo temporal + wiring em E8/membership).

## 1. Objetivo

Nova entidade **`Task`** (Tarefa) org-scoped, ligada a **exatamente 1 Pipe** e **0..1 Card**, com ciclo de
vida completo, Responsável = Membership ativa, estado `atrasada` **derivado**, Evento canônico "Tarefa
atrasada" idempotente, anexos via 3.7, e Histórico append-only (`TaskHistory`). Sem Notificações (5.3+),
sem registro no motor (5.7), sem Solicitações (5.2).

## 2. Modelo de dados

### `Task` (org-scoped; RLS ENABLE+FORCE + WITH CHECK INSERT/UPDATE; `MODELOS_AUDITADOS`)
- `id, orgId, pipeId` (FK composta tenant-safe `(orgId,pipeId)→Pipe`, Cascade), `cardId?` (FK composta
  tenant-safe `(orgId,cardId)→Card`, nullable, Cascade — MATCH SIMPLE não checa FK com NULL).
- `title` (obrigatório), `description?`, `dueAt? @db.Timestamptz`, `dueVersion Int @default(0)`.
- `responsavelMembershipId?` e `creatorMembershipId?`: **referência-por-id, SEM FK** (isoladas por
  RLS+orgId, como `actorId`/`resourceId`/`createdBy` da base). **Decisão (divergência documentada):** FK
  composta a `Membership` é inviável — `SetNull` impossível (a coluna `orgId` compartilhada é NOT NULL);
  `Cascade` apagaria Tarefas na exclusão de Conta (quebra LGPD); `Restrict` bloquearia a exclusão de
  Conta/Org. O próprio `CardResponsavel` da base usa FK simples, não composta. A tenant-safety da
  atribuição é garantida pela **revalidação sob RLS no assign-time** (uma Membership de outra Org é
  invisível → rejeitada), somada à derivação read-time e à reconciliação E8 — equivalente ao "evita bypass
  referencial", sem o tarpit de semântica de exclusão. Requer adicionar `@@unique([orgId,id])` a `Card`
  (destino da FK composta de `cardId`); `Pipe` já o tem (4.1).
- `lifecycleState TaskLifecycleState @default(ABERTA)` — `ABERTA`/`CONCLUIDA` (estado operacional).
- `archiveState TaskArchiveState @default(ATIVA)` — `ATIVA`/`ARQUIVADA` (eixo SEPARADO — §1526).
- `createdAt, updatedAt`, `creatorMembershipId?` (autoria preservada).
- **GRANT:** `SELECT/INSERT` + **UPDATE column-scoped** de `title,description,dueAt,dueVersion,`
  `responsavelMembershipId,lifecycleState,archiveState,cardId,updatedAt` — **NÃO** `orgId,pipeId,`
  `creatorMembershipId`. **Sem DELETE** (arquivar/concluir = state). `cardId` é UPDATE-able (vincular/
  desvincular é operação — §1533), mas restrito ao mesmo Pipe/Org (validado no serviço + FK composta).

### `TaskHistory` (append-only, imutável; GRANT só `SELECT/INSERT`; `MODELOS_AUDITADOS`)
- `id, orgId, taskId` (FK composta tenant-safe), `type String`, `summary String`, `actorId? @db.Uuid`,
  `createdAt`. Espelho de `CardHistory`. Eventos: `CREATED, EDITED, DUE_CHANGED, RESPONSAVEL_ASSIGNED,`
  `RESPONSAVEL_CHANGED, RESPONSAVEL_REMOVED, COMPLETED, REOPENED, ARCHIVED, RESTORED, CARD_LINKED,`
  `CARD_UNLINKED, FILE_ATTACHED, FILE_REMOVED`.

### `TaskOverdueOccurrence` (append-only, imutável; GRANT só `SELECT/INSERT`; `MODELOS_AUDITADOS`)
- `id, orgId, taskId` (FK composta tenant-safe), `dueVersion Int`, `dueAt @db.Timestamptz`,
  `detectedAt @db.Timestamptz`, `createdAt`. **`@@unique([orgId, taskId, dueVersion])`** (idempotência).
- Ver `decisions/task-overdue-mechanism-5-1.md`.

## 3. Ciclo de vida (núcleo puro `task-lifecycle.transitions.ts`)

Dois eixos INDEPENDENTES (§1526), espelhando Card (2.11) mas com a semântica de Tarefa:
- **Operacional:** `concluir` (ABERTA→CONCLUIDA), `reabrir` (CONCLUIDA→ABERTA). Idempotentes.
- **Arquivamento:** `arquivar` (ATIVA→ARQUIVADA), `restaurar` (ARQUIVADA→ATIVA). Idempotentes.
- **Arquivada bloqueia escrita** (§1526): editar/concluir/reabrir/trocar-Responsável/novos-anexos/vincular
  → **409** `TAREFA_ARQUIVADA` (leitura autorizada preservada). Restaurar preserva
  identidade/Pipe/Card/Responsável/prazo/anexos/Histórico.
- Aplicação com **guarda otimista** (`updateMany where <coluna>=<lido>` → 409; P2002/P2028 → 409, nunca
  500); caminho no-op idempotente NÃO emite `updateMany` (sem falso `denied`). Cada transição escreve o
  evento no `TaskHistory` na **mesma transação interativa** no client raiz (`definirContextoOrg`).

## 4. Estado `atrasada` — derivado (núcleo puro `task-overdue.core.ts`)

`derivarAtrasada(lifecycle, archive, dueAt, agora) = ABERTA && ATIVA && dueAt!=null && agora>=dueAt`.
Nunca persistido, nunca evento, sem agendador (espelha `derivarSaude` 2.13). Exposto na leitura da Tarefa.
CONCLUIDA/ARQUIVADA nunca atrasada. Alterar `dueAt` recalcula na leitura (puro) e bumpa `dueVersion`.

## 5. Responsável — Membership ativa (§1525)

- `responsavelMembershipId` referencia **0..1 Membership ACTIVE** da MESMA Org. Atribuir/trocar valida
  Membership `state=ACTIVE` na Org (senão 400/404). Nunca referência à `Account` global.
- **Nunca referência inválida silenciosa** — defesa em profundidade em DOIS pontos:
  1. **Assign-time:** só aceita Membership ACTIVE.
  2. **Reatribuição E8 (contrato de Administração):** suspensão/remoção de Membership **limpa**
     `responsavelMembershipId` das Tarefas onde a pessoa é Responsável, na MESMA transação da alteração —
     estende `membership-contract.ts` (`aoAlterarMembership`) e o consome em `membership-state.service`
     (8.5) e `membership-removal.service` (8.6). Registrado no payload do `MembershipEvent` (sem tocar
     `TaskHistory` a partir do E8 — mesma decisão de decoupling de `CardResponsavel`).
  3. **Read-time:** a leitura da Tarefa expõe `responsavelValido` (Membership ainda ACTIVE) — nunca confia
     silenciosamente. Autoria histórica (`creatorMembershipId`) preservada.

## 6. Autorização (matriz canônica 1.6 — SEM nova matriz; C3 congelado)

Deriva de **Org + papel efetivo no Pipe** (reusa `pipe-authz.ts`):
- **Criar/editar/concluir/reabrir/arquivar/restaurar/atribuir-Responsável/vincular:** `exigirOperarPipe`
  (Admin da Org / Admin do Pipe / Membro do Pipe operam; Viewer concedido → 403; sem acesso → **404
  não-enumerante**). Tarefa é trabalho operacional do Pipe.
- **Ler:** `resolverPoderNoPipe` (qualquer poder — ler ≠ operar; sem acesso → 404 não-enumerante).
- **Vínculo com Card NÃO amplia** (§1523): acesso à Tarefa ≠ acesso ao Card. Vincular exige operar o Pipe
  da Tarefa **e** que o Card pertença ao MESMO Pipe/Org (revalidado no servidor sob RLS). A leitura da
  Tarefa **não** revela `valores`/conteúdo do Card (só o `cardId`); ver o Card exige a autz do Card (2.9).
- Convidado (GUEST) sem acesso implícito (teto AD-9 já aplicado em `resolverPoderNoPipe`).
- Guard grosso: `@Requer('ler','Pipe')` (o Pipe é o subject; a autoridade fina decide no serviço —
  DBT-AUTHZ-01). O `pipeId` vem da rota; nunca `orgId` do cliente.

## 7. Evento canônico "Tarefa atrasada" (gate §1535 — ver decision doc)

Mecanismo Postgres-based idempotente (padrão do motor 4.6, zero-dependência). `TaskOverdueService`
`.escanearOrg(orgId)` insere `TaskOverdueOccurrence` por Tarefa elegível vencida, idempotente por
`@@unique([orgId,taskId,dueVersion])`. Driver contínuo deferido (`DEB-5-1-OVERDUE-DRIVER`, como
`DEB-4-6-DRIVER-CONTINUO`). **Não** registra no motor E4 (5.7) nem cria Notificação (5.3+).

## 8. Anexos (3.7 — gate AD-28)

Anexos de Tarefa integram DIRETAMENTE a capacidade compartilhada 3.7 (`FileObject`,
`resourceType='TASK'`), herdando a autz da Tarefa via o dispatcher de `file-authz/`. Read-only sob
arquivamento. **Escopo 5.1:** registrar `TASK` como `resourceType` roteável no dispatcher de autz (herda
`exigirOperar/LerPipe` da Tarefa) e no event sink (eventos `FILE_ATTACHED/REMOVED` no `TaskHistory`). O gate
`FILE_UPLOAD_ENABLED` (AD-28) já barra a capacidade quando desligada.

## 9. Isolamento multi-tenant (invariante-mãe)

`Task`/`TaskHistory`/`TaskOverdueOccurrence`: RLS ENABLE+FORCE, policies `select/insert/update/delete` por
`orgId=current_org_id()` com WITH CHECK no INSERT e UPDATE. Toda query por `withTenantContext` (nenhum
`where orgId` manual). `orgId` fora do payload/resposta, nunca do cliente. FK compostas tenant-safe em toda
referência a Pipe/Card/Membership. **Fase vermelha provada** (quebrar WITH CHECK/GRANT → teste falha).

## 10. Critérios de aceite (§1528–1532) → testes

- **AC1 (criar):** nasce `ABERTA`/`ATIVA`, 1 Pipe/Org, 0..1 Card do mesmo Pipe/Org, sem fundir/ampliar →
  `tasks-http`, `tasks-authz`.
- **AC2 (atrasada derivada):** aberta+vencida = atrasada; concluída/arquivada não; alterar prazo recalcula →
  `task-overdue.core` (unidade) + `tasks-http`.
- **AC3 (Evento idempotente):** ≤1 ocorrência por (taskId,dueVersion); sem duplicar por retry/atraso; concluir
  antes impede → `task-overdue-rls`/`task-overdue-scan`.
- **AC4 (Responsável):** só Membership ACTIVE; suspensão/remoção reatribui/esvazia via contrato E8, sem
  referência inválida silenciosa; autoria preservada → `tasks-responsavel` + regressão E8
  (`membership-state`/`membership-removal`).
- **AC5 (arquivar/restaurar):** arquivar bloqueia escrita, mantém leitura; restaurar preserva tudo; anexos
  3.7 (AD-28); Histórico append-only → `task-lifecycle` (unidade) + `tasks-http` + `tasks-rls`.
- **Isolamento:** cross-tenant negado pelo banco (fase vermelha) → `tasks-rls`.
- **GRANT:** sem DELETE; UPDATE column-scoped (orgId/pipeId imutáveis) → `tasks-rls`.
