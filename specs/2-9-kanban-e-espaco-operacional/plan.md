# Plan — Story 2.9 (Kanban e espaço operacional do Card)

> Escopo comprometido = **leitura** (conforme epics.md). Sem schema/migration/GRANT. Movimentação = Apêndice A da
> spec (2.14/pendente). Este plano descreve a fatia **API interna**; a decisão de entregar frontend é Q3.

## Modelo de dados

**Nenhuma mudança.** Reusa o que a 2.7 já materializou:
- `Card`: `@@index([orgId, pipeId, phaseId])` — **este índice existe justamente para a leitura do Kanban da 2.9**.
- `Phase`: `@@index([orgId, pipeId, state, position])` — Fases ativas por Pipe, ordenadas.
- GRANTs atuais bastam: runtime tem `SELECT` em `Card` e `Phase`. **Sem `GRANT UPDATE`** (isso é 2.14 — Apêndice A).

## Migration

**Nenhuma.** (Se o dono decidir Q1=movimentação ou Q2=ordem manual, aí sim entram migrations — Apêndice A/coluna
`position`. Fora do escopo comprometido.)

## Autorização (reuso, sem novo mecanismo)

- Guarda **grossa**: `@Requer('ler','Pipe')` no controller (como os demais controllers do domínio Pipe).
- Guarda **fina** no serviço: `resolverPoderNoPipe(db, contexto, pipeId)` — já existe em `pipe-authz.ts`. Basta ter
  **qualquer** poder (`gerenciar`/`operar`/`ler`); sem acesso ele lança **404 não-enumerante**. Não é preciso GRANT
  novo nem `exigirLerPipe` (chamar `resolverPoderNoPipe` já é o gate; o retorno alimenta o contrato de capacidades).
- **Sem** tocar `ability.ts`/`authz.guard.ts` (C3 congelado) — DBT-AUTHZ-01.

## Núcleo / serviço (`KanbanReadService`, em `pipes/cards/`)

Serviço de **leitura** (sem transação — leitura simples org-scoped via `withTenantContext`):

- `verKanban(pipeId)`:
  1. `resolverPoderNoPipe` (404 se sem acesso) → guarda o `poder`.
  2. Lê **Fases ativas** do Pipe (`state = ACTIVE`, `orderBy [{ position }, { id }]`).
  3. Lê **Cards** do Pipe (`where { pipeId }`, projeção enxuta; `orderBy createdAt` — Q2).
  4. **Agrupa na aplicação** por `phaseId`; monta colunas na ordem das Fases; Fase sem Card → coluna vazia.
  5. Devolve `{ poder, fases: [{ id, name, cards: [...] }] }`. `orgId` **nunca** cruza a fronteira.
- `verCard(pipeId, cardId)`:
  1. `resolverPoderNoPipe` (404).
  2. Lê o Card (`findFirst { pipeId, id }`; 404 se não existe **no Pipe/Org** — não-enumerante).
  3. Lê a Fase (nome) do Card.
  4. Devolve `{ card: { id, phaseId, faseNome, valores, formId, formVersionId, createdAt, updatedAt }, poder,
     capacidades }`, onde `capacidades` deriva do `poder` (ver Q5). **Não** lê `CardHistory` (2.17).

Projeção fixa (`SELECT_CARD_KANBAN`) — igual em espírito ao `SELECT_CARD` da 2.7, sem `valores` na **lista** do
Kanban (payload enxuto; `valores` só no detalhe) para respeitar NFR-3/4.

## Contrato de "ações permitidas" (Q5 — proposta)

Derivar de `poder`, sem revelar administrativas:
- `poder = 'gerenciar'` → capacidades de config do Pipe **não** aparecem no espaço do Card (config é outra
  superfície); no Card, `gerenciar` implica `operar`.
- `poder ∈ {gerenciar, operar}` → capacidades **operacionais** habilitadas na medida em que os executores existirem
  (hoje nenhum executor mutável está pronto — mover é 2.14, ciclo de vida 2.11). Enquanto isso, o contrato expõe as
  flags (ex.: `podeOperar: true`) para a UI **preparar** os painéis; a ação em si fica **desabilitada** até sua
  Story.
- `poder = 'ler'` (Viewer) → só leitura; nenhuma ação mutável; administrativas **ocultas**.

## Rotas (`KanbanController` / estender `CardsController`)

Sob `pipes/:pipeId`, `@Requer('ler','Pipe')` (grossa) + fina no serviço:
- `GET pipes/:pipeId/cards` → **200** com o Kanban agrupado por Fase (ou `.../kanban`; nome é detalhe de contrato).
- `GET pipes/:pipeId/cards/:cardId` → **200** com o espaço do Card; **404** não-enumerante se sem acesso/Card.
- DTO manual de validação de `:pipeId`/`:cardId` (reusar `validarIdRota` de `cards.dto.ts`).

## Sequência (red-green; leitura não tem "mutação a provar", mas tem **isolamento** a provar)

1. **HTTP real** (`kanban-http`): Kanban devolve Cards agrupados por Fase na ordem das Fases; Fase sem Card → coluna
   vazia; Card fora do Pipe → 404; detalhe devolve `valores`+Fase+capacidades; **nenhuma** rota move nada.
2. **RLS** (`kanban-rls`): leitura de Pipe/Card de **outra Org** não retorna linha (RLS); sem contexto → negado;
   confirmar que **não** há caminho de UPDATE alcançável (o runtime segue sem `GRANT UPDATE` em `Card` — a fatia é
   read-only; provar que UPDATE ainda bate em `permission denied`, guardando o invariante da 2.7 contra regressão).
3. **Authz** (`kanban-authz`): Admin da Org lê; MEMBER concedido lê; VIEWER concedido **lê** (diferente da 2.7, em
   que Viewer era 403 na submissão — aqui leitura é permitida a Viewer); sem concessão → 404; capacidades no payload
   refletem o `poder` (Viewer não recebe flags operacionais).

## Divergências registradas

- **D-R1 (crítica) — escopo movimentação vs leitura:** brief/migration-2.7 dizem 2.9=mover; `epics.md`=leitura,
  mover é 2.14. Plano segue o autoritativo. Ver spec.md §Divergência + Apêndice A. **Escalar (Q1).**
- **D-R2 — sem coluna de estado:** "estado atual" = Fase (não há ciclo de vida antes de 2.11). Sem inventar coluna.
- **D-R3 — ordem do Card:** `createdAt` (sem migration). Ordem manual = 2.14+ (Q2).
- **D-R4 — VIEWER lê:** a leitura do Kanban é permitida a Viewer (leitura ≠ operar); o `pipe-authz` já modela isso
  (`ler`). Nenhuma ação mutável exposta.
- **D-R5 — frontend:** fatia planejada como API interna (padrão 2.x); UI é Q3.
