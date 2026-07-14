# Revisão adversarial (4 lentes) — Story 2.12 (Marcos por Fase e override por Card)

> Revisão inline pelo implementador (contexto completo). Risco: **MÉDIO-ALTO** — nova tabela org-scoped, snapshot
> que decide a não-retroatividade, e alteração das DUAS transações de criação de Card (2.7/2.8).

## Lente Architecture
- **Snapshot congela a não-retroatividade (D-OA1=A):** `configSnapshot` na `CardPhaseEntry` guarda a config vigente
  no instante da entrada; mudar a config da Fase depois não toca linhas existentes — "sem recálculo retroativo
  silencioso" cai por construção (padrão `FormVersion` da 2.6). ✅
- **Append-only sem tocar `Card`:** a referência é tabela à parte; a 2.12 **não** abre GRANT de UPDATE em `Card`
  (o 1º UPDATE column-scoped segue sendo o de ciclo de vida da 2.11; `phaseId`/movimentação sem UPDATE até 2.14). ✅
- **AD-11 respeitado:** o helper `registrarEntradaNaFase` nasce com **consumidor concreto** (a entrada inicial, nas
  criações 2.7/2.8) e é o mesmo contrato que a 2.14 consumirá (`origin=MOVE`) — nada materializado só para o futuro. ✅
- **Cálculo sob demanda, puro:** `calcularMarcos` é função pura (sem agendador — decisão de Arquitetura); 2.13
  deriva o veredito de saúde a partir desta base. Separação decisão/aplicação como no `option-config`/`transitions`. ✅
- **Config = colunas em `Phase`** (`Phase` já tem SELECT/INSERT/UPDATE — configurar é UPDATE). Sem tabela de config
  nova. Override por `Field.id` (AD-12), nunca rótulo. ✅

## Lente Security
- **GRANT append-only provado nos dois sentidos** (RLS test): runtime SELECT+INSERT ok; UPDATE e DELETE →
  `permission denied`. "Sem alteração retroativa do histórico" é do banco, não da ausência de rota. ✅
- **Isolamento RLS:** entrada de outra Org some na leitura (0 linhas); INSERT com `orgId` alheio barrado pelo WITH
  CHECK (via `createMany`, sem RETURNING mascarante). ✅
- **Autz fina no serviço (C3 congelado):** configurar = `exigirGerenciarPipe` (Membro→403, sem acesso→404); ler
  config = `resolverPoderNoPipe` (qualquer poder≥ler; sem acesso→404); ler base do Card = `exigirLerCard` (2.10). ✅
- **Backfill sob FORCE RLS:** roda ANTES de ENABLE/FORCE — sem contexto de Org na migração, o próprio dono seria
  barrado por `current_org_id()` NULL. Ordem verificada; idempotente (`WHERE NOT EXISTS`). ✅
- **Sem vazamento:** `orgId` fora de todos os payloads (asserção no teste); `valores` (PII) lidos só para o cálculo
  do override, nunca devolvidos nem logados. ✅
- **Auditoria (FR-214):** `CardPhaseEntry` em `MODELOS_AUDITADOS`; a criação (tx raiz) registra o evento manual. ✅

## Lente Edge
- **Precedência override › duração › ausência** — os três ramos testados (unidade + HTTP): valor válido prevalece;
  ausência do valor **ignorada** (cai para a duração, epics §949); valor **malformado** fail-closed (cai para a
  duração, não zera o marco). ✅
- **Ordenação** `esperado ≤ vencimento ≤ expiração` — validada no núcleo puro **e** por CHECK na migration; par
  cruzado esperado≤expiração cobre vencimento nulo. ✅ (unidade + HTTP 400)
- **Config vazia** (todos nulos) aceita; marco não configurado → não se aplica (null), não erro. ✅
- **Override sem duração:** só o valor absoluto define; sem valor → null. ✅ testado.
- **CardPhaseEntry sem chamador de movimentação** (reentrada) — o helper aceita `origin=MOVE`, exercitado pelo INSERT
  do teste RLS; a operação de mover é 2.14 (boundary, não bug).

## Lente Acceptance (AC 2.12)
- **AC1** (entrada cria referência própria instante/origem): ✅ criação grava `CardPhaseEntry` SUBMISSION; provado por
  `GET /cards/:id/phase-entry` (origin/phaseId/enteredAt) e pelo backfill.
- **AC2** (override absoluto por Campo Data prevalece; ausência ignorada): ✅ HTTP + unidade.
- **AC3** (reentrada cria nova referência preservando histórico; ordenação; Membro não configura): reentrada = novo
  INSERT (helper/`origin=MOVE`, testado no RLS); ordenação 400; Membro→403. ✅ (a OPERAÇÃO de reentrada por
  movimentação é 2.14).
- **AC4** (mudança de config não altera histórico nem recalcula em silêncio): ✅ teste de não-retroatividade — Card
  antigo mantém base vazia após configurar; Card novo reflete a config.

## Boundary registrado (fora de escopo, não é bug)
- **Movimentação/reentrada operacional** é 2.14 (o helper existe; sem chamador de "mover").
- **Veredito de saúde** (ok/atrasado/vencido/expirado) é 2.13 — a 2.12 entrega só a **base** (instantes).
- **Timezone:** `enteredAt` é `Timestamptz` (instante absoluto); o restante do schema segue `TIMESTAMP(3)` (DIV-1,
  decisão de Arquitetura aceita). O backfill interpreta `Card.createdAt` como UTC (container em UTC).

## Veredito
Sem defeito de correção aberto. Autorização, isolamento e append-only provados por teste real; ACs cobertos.
**Pronto para commit** (condicionado à suíte cheia verde).
