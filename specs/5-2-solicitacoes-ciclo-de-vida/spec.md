# Spec — Story 5.2: Solicitações — ciclo de vida e Responsável

**Épico 5 (Tarefas, Solicitações e Notificações), 2ª Story.** Fonte: `epics.md` §1539–1560.
**Risco:** ALTO (migration + entidade nova + RLS + autz + wiring em E8/membership + anexos 3.7/3.8).

A 5.2 é o **twin da 5.1** (Tarefas) **sem o mecanismo temporal**: não há prazo, estado `atrasada`,
scheduler, `dueAt`/`dueVersion` nem ocorrência canônica de vencimento. Isso remove o gate de Arquitetura
mais pesado da 5.1; o resto do padrão é idêntico.

## 1. Objetivo

Nova entidade **`Solicitacao`** (Request) org-scoped, ligada a **exatamente 1 Pipe** e **0..1 Card**, com
ciclo de vida completo (`ABERTA`/`RESOLVIDA` + arquivamento separado), Responsável = **0..1 Membership
ativa** (opcional), reatribuição explícita via contrato E8, anexos via 3.7/3.8, e Histórico append-only
(`SolicitacaoHistory`). Sem Notificações (5.3+), sem registro no motor (5.7).

## 2. Decisão material — Responsável é 0..1 (opcional), não obrigatório

**Ambiguidade (§1551 vs §1544/§1546):** o AC1 (§1551) diz "tem Responsável (Membership ativa)", mas o
**Escopo** (§1544 e §1546) diz explicitamente "referencia **zero ou uma** Membership ativa". Resolvido por
consistência com a 5.1 e com o Escopo, que é a fonte mais específica: **Responsável é 0..1 (opcional)**. A
frase do AC1 lê-se como "quando atribuído, é uma Membership ativa" — não como obrigatoriedade de criação.
Criar Solicitação **sem** Responsável é válido; atribuir depois exige Membership ACTIVE. Ver
`decisions/responsavel-0-1-5-2.md`. Não se inventa obrigatoriedade que o Escopo nega (Constitution).

## 3. Modelo de dados

### `Solicitacao` (org-scoped; RLS ENABLE+FORCE + WITH CHECK INSERT/UPDATE; `MODELOS_AUDITADOS`)
- `id, orgId, pipeId` (FK composta tenant-safe `(orgId,pipeId)→Pipe`, Cascade), `cardId?` (FK composta
  tenant-safe `(orgId,cardId)→Card`, nullable, Cascade — MATCH SIMPLE não checa FK com NULL).
- `title` (obrigatório), `description?`.
- `responsavelMembershipId?` e `creatorMembershipId?`: **referência-por-id, SEM FK** (isoladas por
  RLS+orgId, como `actorId`/`createdBy` da base e `CardResponsavel`). **Mesma decisão validada da 5.1:** FK
  composta a `Membership` é inviável (`SetNull` impossível — `orgId` compartilhado é NOT NULL; `Cascade`
  quebraria LGPD na exclusão de Conta; `Restrict` bloquearia). A tenant-safety da atribuição vem da
  **revalidação sob RLS no assign-time** + derivação read-time (`responsavelValido`) + reconciliação E8.
- `lifecycleState SolicitacaoLifecycleState @default(ABERTA)` — `ABERTA`/`RESOLVIDA` (RN-091; operacional).
- `archiveState SolicitacaoArchiveState @default(ATIVA)` — `ATIVA`/`ARQUIVADA` (eixo SEPARADO — §1546).
- `createdAt, updatedAt`.
- **GRANT:** `SELECT/INSERT` + **UPDATE column-scoped** de
  `title,description,responsavelMembershipId,lifecycleState,archiveState,cardId,updatedAt` — **NÃO**
  `orgId,pipeId,creatorMembershipId`. **Sem DELETE** (arquivar/resolver = state). `cardId` é UPDATE-able
  (vincular/desvincular é operação), restrito ao mesmo Pipe/Org (validado no serviço + FK composta).
- Reusa o `Card_orgId_id_key` já criado pela migration da 5.1 (destino da FK composta de `cardId`); `Pipe`
  já tem `@@unique([orgId,id])` (4.1). **Nenhum índice novo em `Card`/`Pipe`.**

### `SolicitacaoHistory` (append-only, imutável; GRANT só `SELECT/INSERT`; `MODELOS_AUDITADOS`)
- `id, orgId, solicitacaoId` (FK composta tenant-safe), `type String`, `summary String`, `actorId? @db.Uuid`,
  `createdAt`. Espelho de `TaskHistory`/`CardHistory`. Eventos: `CREATED, EDITED, RESPONSAVEL_ASSIGNED,`
  `RESPONSAVEL_CHANGED, RESPONSAVEL_REMOVED, RESOLVED, REOPENED, ARCHIVED, RESTORED, CARD_LINKED,`
  `CARD_UNLINKED, FILE_ATTACHED, FILE_REMOVED`.

**Sem `SolicitacaoOverdueOccurrence`** — não há eixo temporal (diferença central frente à 5.1).

## 4. Ciclo de vida (núcleo puro `solicitacao-lifecycle.transitions.ts`)

Dois eixos INDEPENDENTES (§1546), espelhando a 5.1 com a semântica de Solicitação:
- **Operacional:** `resolver` (ABERTA→RESOLVIDA, evento `RESOLVED`), `reabrir` (RESOLVIDA→ABERTA, evento
  `REOPENED`). Idempotentes.
- **Arquivamento:** `arquivar` (ATIVA→ARQUIVADA), `restaurar` (ARQUIVADA→ATIVA). Idempotentes.
- **Arquivada bloqueia escrita** (§1546): editar/resolver/reabrir/trocar-Responsável/novos-anexos/vincular
  → **409** `SOLICITACAO_ARQUIVADA` (leitura autorizada preservada). Restaurar preserva
  identidade/Pipe/Card/Responsável/anexos/Histórico.
- Aplicação com **guarda otimista** (`updateMany where <coluna>=<lido>` → 409; P2002/P2028 → 409, nunca
  500); caminho no-op idempotente NÃO emite `updateMany` (sem falso `denied`). Cada transição escreve o
  evento no `SolicitacaoHistory` na **mesma transação interativa** no client raiz (`definirContextoOrg`).

## 5. Responsável — 0..1 Membership ativa (§1546)

Idêntico à 5.1, defesa em profundidade em três pontos:
1. **Assign-time:** só aceita Membership `state=ACTIVE` da mesma Org (senão 400); nunca `Account` global.
2. **Reatribuição E8:** suspensão/remoção de Membership **esvazia** `responsavelMembershipId` das
   Solicitações onde a pessoa é Responsável, na MESMA transação da alteração — estende
   `membership-contract.ts` (`aoAlterarMembership`: novo `requestResponsavelDe`/`removerRequestResponsavelDe`)
   e o consome em `membership-state.service` (8.5) e `membership-removal.service` (8.6). Registrado no
   payload do `MembershipEvent` (sem tocar `SolicitacaoHistory` a partir do E8 — mesmo decoupling da 5.1).
3. **Read-time:** a leitura expõe `responsavelValido` (Membership ainda ACTIVE). Autoria
   (`creatorMembershipId`) preservada.

## 6. Autorização (matriz canônica 1.6 — SEM nova matriz; C3 congelado)

Reusa `pipe-authz.ts`, idêntico à 5.1:
- **Criar/editar/resolver/reabrir/arquivar/restaurar/atribuir-Responsável/vincular:** `exigirOperarPipe`
  (Admin da Org / Admin do Pipe / Membro operam; Viewer → 403; sem acesso → **404 não-enumerante**).
- **Ler:** `resolverPoderNoPipe` (qualquer poder — ler ≠ operar; sem acesso → 404 não-enumerante).
- **Vínculo com Card NÃO amplia** (§1544): acesso à Solicitação ≠ acesso ao Card. Vincular exige operar o
  Pipe da Solicitação **e** que o Card pertença ao MESMO Pipe/Org (revalidado sob RLS). A leitura **não**
  revela `valores` do Card (só o `cardId`).
- Guard grosso: `@Requer('ler','Pipe')`; a autoridade fina decide no serviço (DBT-AUTHZ-01). `pipeId` da
  rota; nunca `orgId` do cliente.

## 7. Anexos (3.7/3.8 — gate AD-28) — ENTREGUE DESDE O INÍCIO (lição da 5.1)

Anexos de Solicitação integram DIRETAMENTE a capacidade 3.7, pelo MESMO padrão do anexo de Tarefa/Card,
**sem migration nem GRANT novo** (`resourceType` é coluna String; `'SOLICITACAO'` aceito como-is):
- **Autz** (`file-authz/file-authz.dispatcher.ts`): branch `SOLICITACAO` → herda a autz do Pipe dono
  (ver/baixar/listar = `resolverPoderNoPipe`; anexar/remover = `exigirOperarPipe`). Read-only sob
  arquivamento (→ 409 `SOLICITACAO_ARQUIVADA`, espelha Tarefa/Card/Registro). O `FilesService` traduz
  `podeEditar=false` em **404 não-enumerante** no upload (padrão 3.8).
- **Trilha** (`file-authz/file-event.dispatcher.ts`): branch `SOLICITACAO` → `FILE_ATTACHED`/`FILE_REMOVED`
  no `SolicitacaoHistory` (mesma tx, só o `fileId`).
- **Rotas** (`solicitacoes/files/solicitacao-files.controller.ts`): `solicitacoes/:solicitacaoId/files`
  (anexar 201 / listar / baixar por stream / remover lógico), espelho de `tasks/:taskId/files`.
- **Gate AD-28**: `FILE_UPLOAD_ENABLED=false` → 503, pela `exigirCapacidade` compartilhada.

## 8. Isolamento multi-tenant (invariante-mãe)

`Solicitacao`/`SolicitacaoHistory`: RLS ENABLE+FORCE, policies `select/insert/update/delete` por
`orgId=current_org_id()` com WITH CHECK no INSERT e UPDATE. Toda query por `withTenantContext` (nenhum
`where orgId` manual). `orgId` fora do payload/resposta, nunca do cliente. FK compostas tenant-safe em toda
referência a Pipe/Card. **Fase vermelha provada** (quebrar WITH CHECK/GRANT → teste falha).

## 9. Critérios de aceite (§1551–1554) → testes

- **AC1 (abrir):** nasce `ABERTA`/`ATIVA`, 1 Pipe/Org, 0..1 Card do mesmo Pipe/Org, sem fundir/ampliar;
  Responsável **opcional** (0..1, Membership ativa quando presente) → `solicitacoes-http`.
- **AC2 (ciclo de vida):** resolver/reabrir/arquivar/restaurar preservam identidade/Pipe/Card/Responsável/
  anexos/Histórico; sem exclusão definitiva → `solicitacao-lifecycle-transitions` (unidade) +
  `solicitacoes-http` + `solicitacoes-rls`.
- **AC3 (Responsável na suspensão/remoção):** contrato E8 reatribui/esvazia, sem referência inválida
  silenciosa → `solicitacoes-http` (assign) + regressão E8 (`membership-state`/`membership-removal`).
- **AC4 (anexos + autz + Histórico):** anexos 3.7 (AD-28); deny-by-default reusa a matriz; Histórico
  append-only → `solicitacoes-files-http` + `solicitacoes-rls`.
- **Isolamento/GRANT:** cross-tenant negado pelo banco (fase vermelha); sem DELETE; UPDATE column-scoped
  (orgId/pipeId/creator imutáveis) → `solicitacoes-rls`.

## 10. Fora do escopo

Notificações (5.3+); registro no motor de Automação (5.7); qualquer mecanismo temporal (não existe na 5.2).
