# Spec — Story 2.9 (Kanban e espaço operacional do Card)

> Rastreabilidade: FR-9 (superfície); PRD §4.4 (Pipes/Kanban) e §4.5 (Cards); UX-DR10 (Card de três painéis
> Contexto|Execução|Ações); NFR-3/4 (Org atual + permissões efetivas); INV-REPORT-01. epics.md Story 2.9.
> Depende da 2.2 (papéis/acesso por Pipe) e 2.7 (existe `Card`/`CardHistory`).

## ⚠️ Divergência de escopo registrada (decisão do dono antes de implementar)

O **brief desta tarefa** e os **comentários da migration da 2.7** (`20260714140000_cards/migration.sql`, linhas 68 e
98: "Mover o Card entre Fases (2.9) … são UPDATE") assumem que a **2.9 introduz a movimentação de Card** (GRANT
UPDATE + evento `MOVED` + chave de posição). O **artefato autoritativo `epics.md`** (Story 2.9), porém, escopa a
2.9 como **superfície de LEITURA** e coloca a **movimentação na Story 2.14** ("Movimentação e regras de transição"),
listando-a explicitamente em **Fora: movimentação (2.14)**. A referência "(2.9)" na migration é anterior a uma
renumeração do `epics.md`.

Esta Spec segue o **artefato autoritativo** (2.9 = leitura; sem migration, sem GRANT UPDATE, sem taxonomia nova de
`CardHistory`). O **design completo da movimentação** — que o brief pediu para considerar — está no
**Apêndice A** deste documento, marcado como **pertencente à 2.14 / pendente de decisão do dono**, para que a
decisão possa ser tomada com todo o material em mãos. **Nada do Apêndice A entra no escopo comprometido da 2.9 sem
o `epics.md` ser reescopado pelo seu workflow oficial.** (Constituição: artefatos autoritativos só mudam por seus
workflows; divergência entre plano e documentação → registrar e escalar.)

## Objetivo

Expor a **superfície de leitura** que permite (a) **visualizar os Cards agrupados por Fase** de um Pipe (Kanban),
no escopo da Organização atual, e (b) **abrir um Card** — o espaço operacional de três painéis
(Contexto | Execução | Ações) — exibindo seus dados, a Fase atual e **apenas as ações permitidas** pela
autorização efetiva do principal. Estabelece o contrato sobre o qual movimentação (2.14), Histórico read-side
(2.17), Formulário de Fase (2.15) e acesso/Responsável (2.10) se integram depois.

## Escopo (comprometido — conforme epics.md)

- **Leitura do Kanban por Pipe:** listar os Cards do Pipe **agrupados por Fase** (Fases ativas ordenadas por
  `position`; escopo da Org atual por RLS). Consome o índice `@@index([orgId, pipeId, phaseId])` já criado na 2.7.
- **Abrir o Card:** detalhe de um Card — `valores`, Fase atual (nome + visível), referência à versão do
  Formulário, `createdAt`/`updatedAt`.
- **Contrato de "ações permitidas":** o detalhe do Card devolve as **capacidades efetivas** do principal (derivadas
  de `resolverPoderNoPipe` — `gerenciar`/`operar`/`ler`) para que a UI **mostre só o permitido**; ações não
  permitidas ficam ocultas/desabilitadas; **ações administrativas nunca são reveladas** a quem não as possui.
- **Autorização de leitura:** exige **acesso ao Pipe** (`ler` ou superior). Admin da Org lê qualquer Pipe; não-Admin
  precisa de `PipeGrant` ACTIVE (qualquer papel, inclusive VIEWER). Sem acesso → **404 não-enumerante**. Reusa
  `pipe-authz.ts` (`resolverPoderNoPipe`); **sem** tocar o guard/`ability.ts` (C3 congelado).
- **Estados honestos:** loading/vazio/erro/acesso negado (o backend devolve 404 não-enumerante para "sem acesso";
  200 com listas vazias para Fase sem Card).

## Fora de escopo (conforme epics.md)

- **Movimentação de Card entre Fases (2.14)** — inclui GRANT UPDATE, evento `MOVED`, chave de posição.
  Ver Apêndice A (contingente/2.14).
- **Ciclo de vida do Card** (finalizar/arquivar/reabrir/restaurar) e coluna de estado — **2.11**.
- **Formulário de Fase e bloqueio de transição** — **2.15**.
- **Histórico read-side** (ler `CardHistory` no painel) — **2.17**. A 2.9 só estrutura o painel; não lê a trilha.
- **Acesso/Responsável/concessões de Card** — **2.10**.
- **Saúde temporal / marcos** — **2.12/2.13**.
- **Frontend definitivo** dos três painéis (React/Next em `apps/web`): ver Q3 — as fatias 2.x anteriores foram
  entregues como **API interna**; a decisão de entregar a UI nesta fatia é do dono.

## Decisão de modelo (comprometido)

**Nenhuma mudança de schema, migration ou GRANT.** A 2.9 é **read-only** sobre `Card`/`Phase` já existentes; o
runtime já tem `SELECT` em `Card` (2.7) e `Phase` (2.3). A leitura passa **exclusivamente** por
`withTenantContext()` — nenhum `where orgId` manual, nenhuma rota aceita `orgId` do cliente. O agrupamento por Fase
é montado na aplicação a partir de uma leitura org-scoped (Fases ativas + Cards do Pipe).

## Questões abertas para o dono — RESOLVIDAS (dono, 2026-07-14)

> Q1 = **leitura** (sem migration/GRANT UPDATE; movimentação é 2.14). Q2 = ordem determinística `createdAt`+`id`.
> Q3 = **API interna** (UI depois). Q4 = "estado" = Fase. Q5 = capacidades no payload (administrativas ocultas).
> Q6 = **paginado** por cursor determinístico (colunas por Fase; `groupBy` para contagem, sem N+1). Q7 = histórico
> só estruturado (2.17). As descrições originais abaixo ficam como registro do raciocínio.

- **Q1 (crítica) — escopo:** manter a 2.9 como leitura (recomendado; alinhado ao `epics.md`; sem migration) **ou**
  reescopar para incluir movimentação (exige reescrever `epics.md` pelo workflow oficial e puxar o Apêndice A).
- **Q2 — ordenação do Card na Fase:** o `epics.md` pede "agrupados por Fase", **sem** ordem manual. Ordenar por
  `createdAt` (estável) atende a leitura. Ordem manual/drag exige coluna `position` (chave fracionária como
  Phase/Field) **+ migration** e só faz sentido com reordenação — que é movimentação (2.14+). **Decisão:**
  `createdAt` na 2.9?
- **Q3 — frontend nesta fatia:** os ACs são fortemente de UI (três painéis, ocultar/desabilitar, estados honestos).
  Entregar `apps/web` agora ou manter a fatia como **API interna** (padrão das 2.x) e a UI depois?
- **Q4 — "estado atual":** a 2.9 precede a 2.11 (ciclo de vida) e a 2.13 (saúde); **não há coluna de estado** em
  `Card` ainda. "Estado atual" = a **Fase** (não há eixo de ciclo de vida/saúde antes de 2.11/2.13). Confirmar.
- **Q5 — contrato de "ações permitidas":** devolver as **capacidades** (`poder`/flags) no payload do Card para a UI
  decidir (recomendado), versus a UI resolver por conta própria. Definir o shape.
- **Q6 — volume/paginação do Kanban (gate NFR-3/4):** quantos Cards por Fase o read devolve? Paginação/limite por
  Fase? É gate de performance — decidir antes de implementar.
- **Q7 — painel de Histórico:** o read-side do `CardHistory` é **2.17**. Confirmar que a 2.9 só **estrutura** o
  painel (sem ler a trilha).

---

## Apêndice A — Design de movimentação (CONTINGENTE — pertence à 2.14 por epics.md; pendente de decisão do dono)

Registrado porque o brief pediu para considerá-lo. **Não** faz parte do escopo comprometido da 2.9.

- **GRANT:** a migration da Story de movimentação acrescenta `GRANT UPDATE ON "Card" TO giraffe_app` — **junto do
  consumidor concreto e do teste que prova o escopo** (regra da casa). A policy `card_update` **já existe** desde a
  2.7 com `USING`/`WITH CHECK ("orgId" = current_org_id())`: o `WITH CHECK` impede **mover a linha para outra
  Organização**. O que falta hoje é o **GRANT** (o runtime tem só SELECT/INSERT).
- **Teste de escopo do GRANT (fase vermelha provada):** antes de conceder, `cards-rls` prova que UPDATE em `Card`
  bate em `permission denied`; após o GRANT, prova que UPDATE **de `phaseId`** funciona dentro do contexto e é
  **negado cross-tenant** (WITH CHECK). Sem DELETE (arquivar é `state`, 2.11).
- **Evento `MOVED`:** nova entrada na taxonomia de `CardHistory` além de `CREATED` — escrita na **mesma transação
  interativa com contexto no client raiz** (primitivo `definirContextoOrg`, como 2.6/2.7): UPDATE `Card.phaseId` +
  INSERT `CardHistory{ type: 'MOVED' }`, atômico. `CardHistory` segue append-only (SELECT+INSERT).
- **Autorização:** reusa `pipe-authz` — mover é **operar** o Pipe (`exigirOperarPipe`); Viewer/Observador não movem.
  Regras de transição finas (Fase ativa, par origem→destino, nunca entre Pipes, só ciclo aberto) são o **preflight
  de 2.14**.
- **Posição (Q2):** se a movimentação incluir reordenação dentro da Fase, entra a chave fracionária `position` em
  `Card` (como Phase/Field) — **migration própria**. Caso contrário, ordem por `createdAt`.
