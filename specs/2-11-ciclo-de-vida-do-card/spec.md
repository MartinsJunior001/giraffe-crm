# Spec — Story 2.11 (Ciclo de vida do Card)

## Objetivo
Permitir a um usuário autorizado **concluir, arquivar, reabrir e restaurar** Cards, refletindo o andamento sem
perder dados. (FR-10; D2.3; AD-13. Dep.: 2.7, 2.9, 2.10.)

## Estados e transições (derivados dos ACs — não inventados)
Três estados **canônicos e persistentes**: `ATIVO` / `FINALIZADO` / `ARQUIVADO`. `reaberto`/`restaurado` **não são
estados** — são transições que devolvem o Card a `ATIVO` ou ao estado anterior preservado.

| Ação | De | Para | Evento | Observação |
|---|---|---|---|---|
| finalizar | ATIVO | FINALIZADO | `FINALIZED` | FINALIZADO→idempotente; ARQUIVADO→409 |
| reabrir | FINALIZADO | ATIVO | `REOPENED` | ATIVO→idempotente; ARQUIVADO→409 |
| arquivar | ATIVO/FINALIZADO | ARQUIVADO | `ARCHIVED` | guarda `previousLifecycleState`; ARQUIVADO→idempotente |
| restaurar | ARQUIVADO | estado anterior preservado | `RESTORED` | zera o `previous`; não-arquivado→409 |

O **estado anterior ao arquivamento** é guardado de forma confiável em `Card.previousLifecycleState` e devolvido na
restauração (ex.: FINALIZADO→arquivar→restaurar volta a **FINALIZADO**, não a ATIVO). Cada transição escreve um
evento próprio no `CardHistory`; o estado final é sempre um dos três canônicos.

## Reconciliação com o Card append-only e a movimentação (2.14) — decisão central
O ciclo de vida É uma mudança de estado do Card ⇒ o **1º UPDATE de `Card`** em runtime. Para **não conceder UPDATE
amplo nem permitir alteração de `phaseId`**, o GRANT é **column-scoped**: `GRANT UPDATE ("lifecycleState",
"previousLifecycleState", "updatedAt") ON "Card"`. `phaseId` (movimentação, 2.14), `valores`, `orgId` seguem **sem**
UPDATE — tentativa bate em `permission denied` (garantido pelo banco). É exatamente o que a migration da 2.7 já
antecipou ("evoluir estado (2.11) são UPDATE... acrescenta GRANT UPDATE junto do consumidor e do teste").

## Autorização
OPERAR o Card (`exigirOperarCard`, 2.10): transição é operação. Sem acesso → **404** não-enumerante; ler-sem-operar
→ **403**. Guard grosso `@Requer('ler','Pipe')`; guarda fina no serviço (C3/CASL congelado — DBT-AUTHZ-01).

## Atomicidade, idempotência, concorrência
Mudança de estado + evento `CardHistory` na MESMA transação interativa (client raiz, `definirContextoOrg` — 2.6/2.7).
**Guarda otimista**: `updateMany where { lifecycleState: <lido> }`; `count = 0` ⇒ reconsulta → idempotente (mesmo
alvo) ou **409** (divergiu). P2002/P2028 → 409, nunca 500. Transição inválida a partir do estado atual → **409**.

## Fora de escopo
Saúde temporal e sua precedência de apresentação (2.13); movimentação entre Fases (2.14); leitura do timeline
completo do Histórico (2.17). A 2.11 apenas expõe o `lifecycleState` no **detalhe** do Card (a 2.13 consumirá).

## Invariantes preservados
`Fase ≠ Status do Card` (eixo de ciclo de vida independente da Fase); `Card` sem GRANT de UPDATE de `phaseId`
(movimentação segue reservada à 2.14); sem exclusão (nenhum DELETE); isolamento por RLS (o UPDATE de estado de
outra Org casa 0 linhas).
