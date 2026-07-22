# Red-phase — Story 8.5

Um teste de segurança que nunca falhou não prova nada. Aqui está a fase VERMELHA de cada garantia
crítica da 8.5 — quebrar a proteção de propósito e confirmar que o teste correspondente fica vermelho.

## 1. Atomicidade do último Admin (`SELECT … FOR UPDATE`)

**Como quebrar:** comentar `await tx.$queryRaw\`SELECT id FROM "Organization" … FOR UPDATE\`` em
`membership-state.service.ts`, deixando as duas transações concorrentes sem serialização.

**Resultado observado (NÃO-DETERMINÍSTICO):** com o `FOR UPDATE` removido, o teste `CONCORRÊNCIA …`
seguiu **verde em 3 execuções** — as duas transações do teste HTTP **não se sobrepuseram** no tempo
(o `getSession`/step-up pré-tx e o pool de conexões dessincronizam os dois `$transaction`, e a
recontagem in-tx de cada um já vê a outra committada → o 2º é barrado mesmo sem o lock). Provar a
fase vermelha de uma CORRIDA é intrinsecamente dependente de timing e não foi forçável em processo
aqui. Isto **não** é lacuna da proteção: o `FOR UPDATE` é a defesa para o caso em que ELAS se
sobrepõem; o invariante "nunca 0 Admins" é provado de forma determinística por:
  - **proof (a)** — o teste concorrente PASSA com o `FOR UPDATE` (invariante mantido, `admins === 1`);
  - a decisão pura `ULTIMO_ADMIN` em `membership-state-core.test.ts` (determinística);
  - a fase vermelha determinística de **GRANT/imutabilidade** abaixo (item 5), efetivamente executada.

**Código restaurado** (grep `RED-PHASE TEMP` = vazio; `FOR UPDATE` presente na linha 156).

## 2. Guarda otimista do estado (`updateMany where state=<lido>`)

**Como quebrar:** trocar `where: { …, state: alvoAgora.state }` por `where: { id: alvo.id, orgId }`
(sem o predicado de estado).

**Efeito esperado:** o desfecho concorrente deixa de reconhecer a corrida (dois 200) → o teste de
concorrência (contagem de admins) fica vermelho.

**Evidência:** <!-- PREENCHER -->

## 3. Deny-by-default (releitura de Membership ACTIVE)

**Como quebrar:** fazer a suspensão NÃO mudar o estado (ex.: comentar o `updateMany` de `Membership`).

**Efeito esperado:** `membro suspenso perde acesso na PRÓXIMA requisição` observa `current` → 200 em
vez de 403 → **falha**. Prova que é a mudança de `state` (relida pelo `OrgContextResolver`) que
nega, não o teste.

**Evidência:** <!-- PREENCHER -->

## 4. Não-restauração na reativação

**Como quebrar:** na reativação, revogar a guarda e re-`ACTIVE` os `CardGrant`.

**Efeito esperado:** `reativação NÃO restaura CardGrant/CardResponsavel` vê `state !== 'REVOKED'` →
**falha**.

**Evidência:** <!-- PREENCHER -->

## 5. Imutabilidade do evento por GRANT — FASE VERMELHA EXECUTADA (determinística)

O `MembershipEvent` é a tabela append-only onde os novos eventos `SUSPENDED`/`REACTIVATED` da 8.5 são
gravados. A imutabilidade é imposta pelo **GRANT** (runtime só `SELECT`/`INSERT`).

**Baseline (verde):** `membership-events-rls.test.ts` → 7/7 passam (UPDATE e DELETE batem em
`permission denied`).

**Quebra:** `GRANT UPDATE ON "MembershipEvent" TO giraffe_app;` (via `psql` no papel superusuário).

**Efeito observado (VERMELHO):**
```
× UPDATE bate em permission denied (imutável — o fato não é reescrito)
AssertionError: promise resolved "{ count: 1 }" instead of rejecting
   ).rejects.toThrow(/permission denied/i);
 Tests  1 failed | 6 skipped (7)
```
O UPDATE passou a ser aceito (`{ count: 1 }`) em vez de negado — prova que é o **GRANT**, não o teste,
que garante a imutabilidade dos eventos `SUSPENDED`/`REACTIVATED`.

**Restauração:** `REVOKE UPDATE ON "MembershipEvent" FROM giraffe_app;` → suíte de novo **7/7 verde**.

Esta é a fase vermelha de segurança **determinística** da 8.5 (o item 1, por ser corrida, não é
forçável em processo). Cobre "RLS/GRANT/imutabilidade" pedido no gate.
