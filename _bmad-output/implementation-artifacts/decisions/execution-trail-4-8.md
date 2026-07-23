# Decisão de Arquitetura — Trilha de Execuções (Story 4.8)

> Contrato funcional: `epics.md` §1439–1453 (Story 4.8 — aba "Execuções" completa e sanitizada). Rastreabilidade:
> FR-23; NFR-1/6/8/16; UX-DR6/DR13; AD-15/AD-30. **Consome** o motor (4.6) e a prevenção de ciclos (4.7); é
> **read-side PURO** — sem migration, sem GRANT novo, sem mutação, sem reexecução, sem agendador. Espelha o rigor
> do Histórico do Registro (3.6) e do Kanban read (2.9): autz por acesso ATUAL, projeção allowlist, `orgId` fora
> da fronteira, 404 não-enumerante. Fonte durável da decisão (CLAUDE.md — decisão material no PR **e** na doc).

## 0. Veredito de escopo: read-side puro, sem escalar

A 4.8 **lê** o que 4.6/4.7 já materializaram (`AutomationExecution`, `AutomationActionResult`, e os metadados de
cadeia/evento em `DomainEvent`/`AutomationChainVisit`). O runtime já tem `SELECT` nessas tabelas. **Nenhuma decisão
de Produto material** e **nenhuma operação irreversível** — não é `EXTERNAL_BLOCKER`. As decisões abaixo são
internas (autz, projeção, paginação, sanitização), resolvidas pela Ordem de autoridade do Protocolo.

## 1. Autorização e escopo multi-tenant (Decisão D1)

**Grão = por Pipe.** A Automação pertence a exatamente um Pipe (RN-100) e a Execução carrega `pipeId`. A aba
"Execuções" é, portanto, a trilha das Automações de UM Pipe. Rota aninhada: `pipes/:pipeId/automations/executions`.

**Piso de acesso = OPERAR o Pipe.** O epics §1447 enumera quem vê: **Admin da Org, Admin do Pipe, Membro**;
**Convidado não acessa**. Fail-closed, o piso é `exigirOperarPipe` (reuso de `pipe-authz.ts`):

| Principal | Poder (`resolverPoderNoPipe`) | Resultado |
|---|---|---|
| Admin da Org (`papel=ADMIN`) | `gerenciar` | vê **TODAS** as Execuções do Pipe |
| Admin do Pipe (`PipeGrant ADMIN`) | `gerenciar` | vê **TODAS** |
| Membro do Pipe (`PipeGrant MEMBER`), **não** restrito | `operar` | vê **TODAS** (acessa todos os Cards do Pipe) |
| Membro do Pipe, `restritoAoProprio` | `operar` | vê **só** Execuções cujo recurso principal ele acessa |
| Somente-leitura (`PipeGrant VIEWER`) | `ler` | **403** |
| Convidado (`Membership GUEST`, teto AD-9) | `ler` (teto) | **403** ("Convidado não acessa") |
| Sem acesso ao Pipe | — | **404 não-enumerante** |

**Por que operar e não ler:** o epics não lista Somente-leitura entre quem vê a trilha, e a trilha é diagnóstico
operacional (UX-DR13 "logs" ≠ esta aba, mas o público é operacional). `exigirOperarPipe` já dá 404 sem acesso
(não-enumerante) e 403 para quem só lê — exatamente a semântica pedida. `Viewer`/`GUEST` recebem **403** (já
sabem que o Pipe existe: têm concessão/vínculo), não 404.

**Filtro do Membro restrito (SEM N+1, sem vazar existência).** Um Membro `operar` **não** restrito acessa TODOS
os Cards do Pipe (provado por `computeAcessoNaoAdmin` em `pipe-authz.ts`) ⇒ "recursos que já acessa" = todos ⇒
vê todas as Execuções do Pipe (sem filtro por-recurso). Só o Membro **`restritoAoProprio`** vê um subconjunto:
os Cards onde é **Responsável ativo** (`CardResponsavel`) OU tem **concessão direta** (`CardGrant` ativo). A
resolução do escopo:

1. `resolverPoderNoPipe` → 404 sem acesso; `ler` → 403.
2. `papel=ADMIN` ⇒ escopo `TODAS`.
3. senão, lê o `PipeGrant` (role, `restritoAoProprio`): `ADMIN`/`MEMBER`-não-restrito ⇒ `TODAS`;
   `MEMBER`-restrito ⇒ escopo `RESTRITO(cardIdsAcessiveis)`, resolvido em **2 queries** (Responsável ativo +
   `CardGrant` ativo, ambos filtrados por `card: { pipeId }`).

A Execução referencia `eventId` (não `resourceId`). Para o escopo `RESTRITO`, resolvemos os `eventId`
**acessíveis** = `DomainEvent` do Pipe cujo `resourceId ∈ cardIdsAcessiveis` (índice
`[orgId, resourceType, resourceId, occurredAt]`), e filtramos as Execuções por `eventId IN (…)`. Conjunto
**bounded** (um restrito tem poucos Cards), **sem N+1** (queries de conjunto, não por-linha), e a filtragem é
no `where` **antes** da paginação (nunca "esconde depois de contar" — não vaza contagem/existência). Conjunto
vazio ⇒ página vazia (o restrito sem Card atribuído não vê nada).

## 2. Paginação, filtros e ordenação (Decisão D2)

**Cursor determinístico `[createdAt, id]`, teto 100** — padrão do Histórico do Registro (3.6) e do Card (2.17):
ordena `[createdAt asc, id asc]` (o `id` desempata → ordem estável), cursor = `id` do último item, `take+1` para
saber se há próxima página. Sem `total` (como 3.6 — evita 2ª query de contagem filtrada; a trilha é navegação,
não relatório agregado).

**Filtros mínimos (epics §1448): período, estado, Evento.** Todos **validados por allowlist fail-closed** no DTO
manual (`executions.dto.ts`, sem `class-validator` — Constitution II):

- **período** — `de`/`ate` ISO-8601 → `createdAt` range. Data malformada → **400**.
- **estado** — `AutomationExecutionState` allowlist (os 8 estados). Valor fora da allowlist → **400**.
- **Evento** — `eventType` (vocabulário do `event-catalog.ts`). O `eventType` vive no `DomainEvent`, não na
  Execução; o filtro pré-resolve os `eventId` do Pipe com aquele `eventType` (índice `[orgId, pipeId, eventType]`)
  e filtra as Execuções por `eventId IN (…)`. `eventType` malformado (fora de `^[A-Z_]+$`) → **400**; sem match →
  página vazia. (Quando há **também** escopo `RESTRITO`, os dois conjuntos de `eventId` são **interseccionados**.)

**Sem raw SQL.** Diferente da 3.5 (que precisou de `$queryRaw` por `orderBy` em path JSON), a 4.8 ordena/filtra
por **colunas escalares** (`createdAt`, `id`, `state`, `eventId`) — Prisma nativo. Menos superfície, sem risco de
injeção por construção.

## 3. Resultados das Ações e sanitização (Decisões D3, D7)

O **detalhe** da Execução lista os `AutomationActionResult` por `actionIndex` (ordem configurada). Projeção
**allowlist** (AD-30): `actionIndex`, `actionType`, `state`, `errorCode` (+ `motivoLegivel` derivado),
`targetResourceId` (sanitizado). **Nunca** payload, parâmetros, `valores`, segredo, token, URL assinada, chave de
storage, prompt/resposta de IA, stack trace. `orgId`/`executionId` internos ficam **fora da fronteira**.

**Mascaramento de `targetResourceId` (D3 — "referências inacessíveis aparecem restritas, sem revelar
existência/conteúdo"):**

- Escopo `gerenciar` (Admin da Org / Admin do Pipe): `targetResourceId` **cru** (donos da config do Pipe; é a
  saída da própria Automação; sempre same-Org por RLS; é só um UUID, sem conteúdo).
- Escopo Membro (`TODAS` ou `RESTRITO`): `targetResourceId` é exposto **só** quando é um Card **deste Pipe** que
  o Membro acessa; senão **mascarado** (`targetResourceId: null`, `referenciaRestrita: true`). Para o Membro não
  restrito, todo Card do Pipe é acessível (alvos in-Pipe aparecem); alvos cross-domínio (Registro) mascaram.

`errorCode`/`lastErrorCode` são **enums estruturais** (`^[A-Z_]+$`); só entram na resposta se casarem esse padrão
(defesa — nunca ecoar texto livre). O código cru **mais** um `motivoLegivel` (mapa estático pt-BR, §5) são
expostos; nada de mensagem de erro livre do runtime.

**Débito `DEB-4-8-TARGET-CROSS-DOMAIN` (AD-11):** uma checagem fina de acessibilidade cross-domínio (Registro)
para relaxar o mascaramento quando o Membro também tem acesso ao Database do alvo fica para um consumidor
concreto futuro. Hoje: fail-closed (mascara).

## 4. Encadeamento (Decisão D4)

O detalhe expõe a **identidade** da cadeia e a causa de interrupção, **não a árvore**:

- `executionChainId` (raiz da cadeia) + `chainDepth` (profundidade desta Execução).
- Causa de interrupção: `state=HALTED_BY_LIMIT` + `lastErrorCode` (`DEPTH_EXCEEDED`/`CYCLE_DETECTED`/
  `CHAIN_TIMEOUT`) + `motivoLegivel`.

**Não** montamos a árvore completa da cadeia (as outras Execuções sob o mesmo `executionChainId`): expô-la
exigiria checagem de acesso por-nó (um Membro restrito não pode ver Execuções de Cards que não acessa) e
vazaria irmãs inacessíveis. **`DEB-4-8-CHAIN-TREE` (AD-11):** uma "visão de cadeia" com autz por-nó fica para um
consumidor concreto futuro. A causa de interrupção por-Execução (o que o epics §1443/§1451 pede — "interrompida
por limite") está coberta.

## 5. `correlationId`/`causationId` e motivo legível (Decisões D5, D7)

- **`correlationId`** — exposto (epics §1444 lista explicitamente). UUID opaco de correlação, sem conteúdo.
- **`executionChainId`/`chainDepth`** — expostos (§1444/§1451).
- **`causationId`** — **NÃO** exposto: vive no `DomainEvent` (não na Execução), é detalhe interno de
  encadeamento do motor (4.7) e **não** consta do conjunto mínimo do §1444. Evita ampliar a superfície sem
  requisito.
- **`initiator*`** — `initiatorType` (`HUMANO`/`AUTOMACAO`/`SISTEMA`), `initiatorAccountId`,
  `initiatorAutomationId` (o **iniciador preservado**, §1384 — quem começou a mudança original, nunca fundido com
  o **ator** = a Automação principal). São referências de auditoria (o schema marca `actorId` como "não PII
  sensível"), expostas como referência — consistente com `RecordHistory.actorId` (3.6).
- **origem (`origin`)** — do `DomainEvent` (`SUBMISSION`/`PUBLIC`/`MOVE`/`AUTOMATION`), exposta.
- **ator / principal Automação** — `automationId` + `name` (carregado de `Automation`) + versão
  (`automationVersionId` + `configSnapshotRevision`).

**Motivo legível** = função pura `motivoLegivel(codigo)` sobre um **mapa estático** pt-BR
(`execution-view.ts`): `CONDITION_NOT_MET`→"Condições não satisfeitas", `DEPTH_EXCEEDED`→"Limite de profundidade
de encadeamento atingido", `CYCLE_DETECTED`→"Ciclo de automação detectado", `CHAIN_TIMEOUT`→"Tempo máximo da
cadeia excedido", `PRIOR_ACTION_BLOCKED`→"Ação anterior falhou ou foi bloqueada", etc. Código não mapeado (mas
válido `^[A-Z_]+$`) → rótulo genérico que **preserva o código sanitizado**; código malformado → sem eco.

## 6. Resultado de cada Condição (Decisão D6) — LIMITE REAL, não fabricado

A avaliação de Condições (4.4) é **pura** e **não é persistida por-Condição**: o motor (4.6,
`automation-engine.service.ts` §478–483) chama `avaliarCondicoes(...)` e, se não aprovado, finaliza a Execução
como `SKIPPED_CONDITIONS` com `lastErrorCode='CONDITION_NOT_MET'`. **Não existe tabela de resultado por
Condição.** Fiel ao mandato ("não fabrique dado inexistente"), a 4.8 expõe o **agregado** derivado do estado:

| `state` da Execução | `avaliacaoCondicoes` exposto |
|---|---|
| `SKIPPED_CONDITIONS` | `NAO_SATISFEITA` (condições não satisfeitas — nenhuma Ação) |
| `SUCCEEDED`/`PARTIAL`/`FAILED`/`BLOCKED_CONFIRMATION` | `SATISFEITA` (condições passaram; Ações rodaram/tentaram) |
| `PENDING`/`RUNNING` | `PENDENTE` (ainda não avaliada / em progresso) |
| `HALTED_BY_LIMIT` | `NAO_AVALIADA` (barrada por limite de cadeia antes de avaliar) |

**Débito `DEB-4-8-CONDICOES-POR-CONDICAO` (AD-11):** o detalhamento por-Condição exige que 4.4/4.6 **persistam**
o resultado de cada Condição (não existe hoje). Quando um consumidor concreto o exigir, o motor grava o
por-Condição e a trilha o lê. Até lá, o agregado é honesto e distinto (UX-DR6).

## 7. Comportamento para Execução inexistente/inacessível (Decisão D8)

**404 não-enumerante** uniforme: Execução inexistente, de outro Pipe, de outra Org (RLS), ou — no escopo
`RESTRITO` — cujo recurso principal o Membro não acessa → **404 idêntico**. Sem 403 que confirmasse existência
para quem não tem acesso ao recurso. (Piso do Pipe já resolveu 403 para Viewer/Guest antes de chegar aqui.)

## 8. Índices e performance (Decisão D9)

Índices existentes: `[orgId, state, nextAttemptAt]` (fila do drain), `[orgId, executionChainId]` (cadeia),
`@@unique([orgId, eventId, automationId, automationVersionId]]`. A listagem ordena por `[createdAt, id]` dentro
de um `pipeId`. **Não há** índice `[orgId, pipeId, createdAt]` dedicado.

**Decisão: NÃO adicionar índice agora** — a invariante da Story é "read-side PURO, sem migration", e os volumes
de Fase 1 são modestos; adicionar índice é migration sem necessidade medida. **`DEB-4-8-INDEX-LISTAGEM`
(AD-11):** se o volume de Execuções por Pipe crescer, adicionar `@@index([orgId, pipeId, createdAt, id])` (e
avaliar `[orgId, pipeId, state, createdAt]`). Deferido, com consumidor futuro (medição de latência).

## 9. Observabilidade (Decisão D10)

**Sem evento de auditoria de leitura** (`*_VIEWED`): reads não entram em `MODELOS_AUDITADOS` (só mutações), e o
Histórico do Registro (3.6)/Card (2.17) — os precedentes read-side — não emitem evento de leitura. A **própria
trilha** é a superfície de auditoria funcional (AD-15, distinta de Pino/Sentry — epics §1449/§1452). Logs Pino do
serviço **não** carregam `valores`/PII/segredo/`targetResourceId` mascarado. Separação epics §1449 preservada:
`Execuções` = trilha funcional; Pino/Sentry = observabilidade técnica interna.

## 10. Mapa dos AC (§1445–1448) → testes de integração PG real

| AC | Prova |
|---|---|
| §1445 — registra o conjunto mínimo, versão, `executionChainId`, estados distintos (inclui cadeias/interrupções 4.7) | `execution-trail-e2e`: cria Execuções em cada estado (SUCCEEDED/PARTIAL/FAILED/SKIPPED_CONDITIONS/BLOCKED_CONFIRMATION/HALTED_BY_LIMIT/PENDING/RUNNING) e afirma os campos + `avaliacaoCondicoes` + `executionChainId`/`chainDepth` distintos |
| §1446 — sanitizada (nunca payload/segredo/token/URL/stack/prompt/PII) | `execution-trail-e2e` **asserção negativa**: o JSON serializado da resposta **não** contém chaves/valores proibidos; `execution-view.core` (unit) prova a projeção allowlist e o mascaramento |
| §1447 — Membro só vê recursos que acessa; referências inacessíveis restritas; Convidado não acessa | `execution-trail-http`: Admin Org/Admin Pipe/Membro-não-restrito → todas; Membro restrito → subconjunto; Viewer/Convidado → 403; sem acesso → 404; cross-tenant (RLS) invisível; `targetResourceId` mascarado para restrito |
| §1448 — filtros período/estado/Evento + paginação; separada da observabilidade técnica | `execution-trail-http`: cada filtro (inclui allowlist fail-closed → 400) + cursor determinístico; sem evento de auditoria de leitura |

**Fase vermelha (Convenções de teste):** quebrar a projeção (expor um campo proibido) e a autz (rebaixar o piso
para `ler`) e confirmar que os testes de sanitização/autz falham.

## 11. Invariantes preservados

- **Read-side puro:** sem migration, sem GRANT novo, sem mutação/reexecução/agendador. `AutomationExecution`/
  `AutomationActionResult`/`DomainEvent`/`AutomationChainVisit` seguem com o GRANT que 4.6/4.7 definiram.
- **Isolamento:** toda query por `withTenantContext`; nenhum `where orgId` manual; `orgId` fora da resposta e
  nunca aceito do cliente.
- **4.6/4.7 intocados:** nenhuma linha de `engine/`/`chain-guard.core.ts` alterada; regressão verde.
- **Guard C3 congelado:** autz fina no serviço (`pipe-authz.ts`), sem tocar `ability.ts`.

## 12. Débitos registrados (AD-11 — todos com consumidor futuro, nenhum bloqueia a Story)

- `DEB-4-8-CONDICOES-POR-CONDICAO` — resultado por-Condição depende de 4.4/4.6 persistirem o por-Condição.
- `DEB-4-8-CHAIN-TREE` — visão da árvore da cadeia com autz por-nó.
- `DEB-4-8-TARGET-CROSS-DOMAIN` — relaxar mascaramento de alvo Registro quando o Membro tem acesso ao Database.
- `DEB-4-8-INDEX-LISTAGEM` — índice de listagem por Pipe/createdAt se o volume crescer.
