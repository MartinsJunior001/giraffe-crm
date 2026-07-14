# Plan — Story 2.10 (acesso, Responsável e concessões de Card)

> **Este plano NÃO decide as 3 questões de modelo.** Ele apresenta o desenho **condicional** a cada decisão em
> aberto e o que é comum a todas. A implementação só começa depois de D-OA1/D-OA2/D-OA3 resolvidas.

## Decisões EM ABERTO (bloqueantes) — opções e trade-offs

### D-OA1 — Mecanismo da concessão de Card (Observador + operacional direta)
| Opção | Descrição | Trade-off |
|---|---|---|
| **A — `CardGrant` (nova tabela org-scoped)** ✅ recomendada | `(id, orgId, cardId, membershipId, capacidades…, state, revokedAt)`; RLS ENABLE+FORCE + WITH CHECK; GRANT SELECT/INSERT/UPDATE (revogar = state) **sem DELETE**. Observador = concessão com `read`; operacional direta = `operar` (+ `moverCard` opt-in). | + "Normalizado" (epics §908), consultável, casa com "capacidades explícitas". − Nova tabela/migração/testes RLS. Índice parcial "1 concessão ativa por (card, pessoa)" na migration. |
| B — Reuso de `PipeGrant` com escopo de Card | Forçar `cardId` no `PipeGrant`. | **Rejeitada:** `PipeGrant` é por Pipe; quebra a semântica e o índice "1 papel ativo por (pipe, pessoa)". |
| C — JSON/coluna de acesso em `Card` | Lista de concedidos embutida. | **Rejeitada:** viola "normalizado" e AD-11 (acesso não é atributo do recurso). |

**Aberto para o dono/Arquitetura:** confirmar (A) e o **conjunto de capacidades** concedíveis (só `read`, `operar`,
`moverCard` — nada além do que os ACs exigem; matriz completa é OQ-1).

### D-OA2 — Responsável e o GRANT de `Card`
| Opção | Descrição | Trade-off |
|---|---|---|
| A — Coluna `responsavelMembershipId?` em `Card` + **UPDATE escopado** | Responsável corrente na linha do Card; histórico nos eventos `CardHistory`. | + Mínimo/consultável. − **Primeiro GRANT de UPDATE em `Card`** (a CLAUDE.md diz "UPDATE de Card fica para 2.14"). Exige GRANT restrito a **uma coluna** e **teste provando** que não abre `phaseId`/outros. Ver divergência em `analyze.md`. |
| B — Tabela `CardResponsavel` (atribuição corrente + trilha) | Mantém `Card` append-only (SELECT/INSERT). | + Preserva a fronteira "Card não sofre UPDATE até 2.14"; alinha "normalizado". − Mais uma tabela; leitura do Responsável faz join. |

**Comum a A/B:** a chave do Responsável é **`membershipId`** (elegibilidade é por Membership — PRD §1065), **não**
accountId. `creator` **não** ganha coluna: é o `actorId` do `CREATED` (2.7). **Aberto para o dono/Arquitetura.**

### D-OA3 — Contrato de Membership (E8) + "Card exige Responsável ativo"
- **E8 inexistente:** (A ✅) 2.10 materializa só a **função-contrato** pura (preflight + handler pós-alteração),
  testável, **sem chamador** — coerente com AD-11 e com a 2.7 (travas como "contrato futuro"); E8 a consumirá.
  (B) adiar 2.10 até E8 — reordena o sprint.
- **Regra "exige Responsável ativo":** não há regra definida para **Card** na Fase 1 (existe para Tarefa/Solicitação
  — D5.2). Se não existir, o preflight é **vacuamente verdadeiro** hoje (nunca bloqueia), pronto para ativar quando
  a regra existir. **Não inventar a regra.** **Aberto para o dono.**
- **Autorização adjacente (design, registrar):** conceder/revogar acesso direto → `exigirGerenciarPipe`; atribuir
  Responsável → `exigirOperarPipe`. Confirmar contra OQ-1.

## Modelo de dados (condicional às decisões)
- **`CardGrant`** (D-OA1=A): org-scoped, RLS+FORCE, WITH CHECK, GRANT sem DELETE; `MODELOS_AUDITADOS`.
- **Responsável** (D-OA2=A: coluna em `Card`; ou D-OA2=B: `CardResponsavel`), chave `membershipId`.
- **`PipeGrant.restritoAoProprio Boolean @default(false)`** — modificador do Membro (novo dado de autorização,
  análogo a `reviewPublicSubmissions` da 2.8; **não** é papel novo). Migration adiciona a coluna.
- **`CardHistory`** — reuso (2.7); só entram **novos `type`** (RESPONSAVEL_*, ACCESS_*). Sem mudança de tabela/GRANT.

## Migration (`..._card_access`)
- `CREATE TABLE "CardGrant"` (se D-OA1=A): RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH CHECK em
  INSERT/UPDATE), FKs org/card/membership CASCADE, índice parcial de unicidade ativa. **GRANT SELECT/INSERT/UPDATE —
  sem DELETE** (revogar = `state`/`revokedAt`).
- Responsável: `ALTER TABLE "Card" ADD COLUMN "responsavelMembershipId"` **+ GRANT UPDATE escopado** (D-OA2=A) — ou
  `CREATE TABLE "CardResponsavel"` (D-OA2=B) com o mesmo padrão RLS/GRANT.
- `ALTER TABLE "PipeGrant" ADD COLUMN "restritoAoProprio" boolean NOT NULL DEFAULT false`.
- Novas tabelas em `MODELOS_AUDITADOS` (`tenant-context.ts`).

## Autorização fina — `pipe-authz` estendido (C3 congelado)
- `resolverAcessoNoCard(db, principal, cardId)`: carrega o Card (RLS), resolve `resolverPoderNoPipe(pipeId)` e
  **compõe**: Admin da Org → total; Admin do Pipe → total no Pipe; Membro do Pipe → operar, **exceto** se
  `restritoAoProprio` e (não é Responsável atual **e** sem concessão direta) → sem acesso; Viewer → ler; **concessão
  direta** (`CardGrant`) adiciona acesso ao Card mesmo sem papel no Pipe (read para Observador; operar/`moverCard`
  conforme capacidades). Deny-by-default; sem acesso → **404 não-enumerante** (herdado do padrão).
- Helpers finos: `exigirLerCard`, `exigirOperarCard` — irmãos de `exigirOperarPipe`. **Não** tocam o guard/CASL.
- **`creator` e histórico anterior nunca entram** na resolução (SC-2105).

## Serviços de domínio (novo subdomínio `pipes/cards/access/`)
- **Responsável:** `atribuir(cardId, membershipId)` — valida acesso operacional prévio do **alvo** (SC-2101, reusa a
  resolução de acesso ao Card sobre o alvo); grava (D-OA2) + evento `CardHistory` (RESPONSAVEL_ASSIGNED/CHANGED);
  `remover` → RESPONSAVEL_REMOVED. Atribuição não amplia acesso (SC-2102).
- **Concessão de Card:** `conceder(cardId, membershipId, capacidades)` (Observador = `read`; direta = `operar`
  [+`moverCard`]); `revogar` (state). Eventos ACCESS_GRANTED/ACCESS_REVOKED. Escopo limitado ao Card (SC-2103/2104).
- **Contrato de Membership (função pura, D-OA3):** `preflightEncerramentoMembership(membershipId)` → lista de Cards
  que bloqueiam (vazia hoje se não há regra); `aoAlterarMembership(membershipId, novoEstado)` → revoga `CardGrant`
  ativos, remove Responsável e sinaliza reatribuição, preserva `creator`, sem restauração. Consumo por E8.

## Sequência de teste (red-green-mutação; PostgreSQL real)
1. Unidade: resolução de acesso ao Card (composição papel+concessão+restrito+Responsável); função-contrato de
   Membership (preflight/handler).
2. Authz de Card (`card-access-authz`): Observador só lê; direta opera só aquele Card, sem lista/config; `moverCard`
   ausente por padrão; "restrito ao próprio" (Responsável/direta acessam; creator/histórico não).
3. Responsável HTTP: atribuir a quem **não** tem acesso → bloqueado (SC-2101); atribuir não dá acesso a outro Card.
4. Contrato de Membership: preflight bloqueia quando (e só quando) a regra exigir; pós-alteração revoga/remove/
   sinaliza/preserva `creator`; reativação não restaura (SC-2106/2107/2108).
5. RLS: isolamento das tabelas novas, WITH CHECK (createMany), **sem DELETE**; e — se D-OA2=A — **escopo do GRANT
   UPDATE de `Card`** (provar que só `responsavelMembershipId` é gravável; `phaseId` continua negado).
- **Mutações (fase vermelha):** atribuir Responsável a sem-acesso passa (deve falhar); concessão direta abre a lista
  do Pipe (deve falhar); "restrito ao próprio" aceita creator (deve falhar); GRANT de UPDATE de Card permite mudar
  `phaseId` (deve falhar).

## Não-implementado de propósito (AD-11)
`Mover Card` como operação (2.14); estado do Card (2.11); Comentador; Notificação ao Observador (E5); ciclo de
Membership (E8). Nenhuma trava/relação materializada sem consumidor concreto.
