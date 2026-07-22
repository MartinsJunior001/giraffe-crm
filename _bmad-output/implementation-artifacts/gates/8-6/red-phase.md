# red-phase — Story 8.6

Provas de que os testes de segurança **falham** quando o mecanismo que deveriam provar é desligado (um
teste que passa pelo motivo errado não prova nada — Constitution / convenção da base).

## (c) REVOKE DELETE em Membership — `membership-removal-rls.test.ts`

**Invariante:** o runtime (`giraffe_app`) NÃO consegue mais `DELETE`/`deleteMany` em `Membership`.

**Fase vermelha (procedimento):** com o REVOKE ainda aplicado, reintroduzir temporariamente o grant e
confirmar que os testes de "permission denied" **falham** (o DELETE passa a rodar):

```sql
-- No banco de teste, como migrator/owner:
GRANT DELETE ON "Membership" TO giraffe_app;
```
→ `membership-removal-rls`:
- "DELETE de um registro pelo runtime bate em permission denied" → **FALHA** (o delete sucede);
- "deleteMany pelo runtime … permission denied" → **FALHA** (retorna `{count}` em vez de lançar);
- `rls.test.ts` "o runtime NÃO tem DELETE em Membership" → **FALHA**.

Reverter (volta ao estado da migration):
```sql
REVOKE DELETE ON "Membership" FROM giraffe_app;
```
→ todos voltam a **VERDE**. Isso prova que é o REVOKE — não outra coisa — que fecha o buraco.

## (d) Imutabilidade do evento REMOVED — `membership-removal-rls.test.ts`

**Invariante:** `MembershipEvent(type=REMOVED)` é append-only (GRANT SELECT+INSERT herdado da 8.4).

**Fase vermelha:** conceder UPDATE/DELETE ao runtime e confirmar que os testes de imutabilidade falham:
```sql
GRANT UPDATE, DELETE ON "MembershipEvent" TO giraffe_app;
```
→ "UPDATE do evento REMOVED … permission denied" e "DELETE do evento REMOVED … permission denied"
**FALHAM** (as mutações passam). Reverter:
```sql
REVOKE UPDATE, DELETE ON "MembershipEvent" FROM giraffe_app;
```
→ VERDE. (A imutabilidade da tabela já era provada por `membership-events-rls` na 8.4; aqui prova-se
especificamente o tipo novo.)

## (a) Concorrência do último Admin — `membership-removal-http.test.ts`

A guarda otimista por-alvo (`updateMany where state=<lido>`) **não** pega a corrida de dois Admins
removendo um ao outro (alvos distintos → dois updates de linhas diferentes, ambos casam). Só o
`SELECT … FOR UPDATE` na `Organization` + recount in-tx serializa e barra o segundo. **Fase vermelha:**
remover o `FOR UPDATE`/recount faria o teste concorrente às vezes terminar com **0 Admins** — exatamente
o que o teste (`count` final = 1) rejeita.

## (b) Deny-by-default do removido — `membership-removal-http.test.ts`

Prova via rota real (`GET /organizations/current`): antes = 200, depois do encerramento = 403 (o contexto
1.3 relê Membership ACTIVE e não acha nenhuma). Sem o encerramento efetivo, o 403 não apareceria.

## Resultado da EXECUÇÃO real (banco descartável, porta 5442, projeto `giraffe86`)

Fases vermelhas EXECUTADAS, não só descritas:

**(c) REVOKE DELETE em Membership** — `GRANT DELETE ON "Membership" TO giraffe_app;` → rodar os testes de
"permission denied":
```
× DELETE de um registro pelo runtime bate em permission denied ...
× deleteMany pelo runtime (própria Org) bate em permission denied ...
Tests  2 failed | 2 passed | 2 skipped (6)
```
→ `REVOKE DELETE ON "Membership" FROM giraffe_app;` → `Test Files 1 passed / Tests 6 passed`. **VERMELHO→VERDE.**

**(d) Imutabilidade do evento REMOVED** — `GRANT UPDATE, DELETE ON "MembershipEvent" TO giraffe_app;` →
```
× UPDATE do evento REMOVED bate em permission denied ...
× DELETE do evento REMOVED bate em permission denied ...
Tests  2 failed | 1 passed | 3 skipped (6)
```
→ `REVOKE UPDATE, DELETE ON "MembershipEvent" FROM giraffe_app;` → 6 passed. **VERMELHO→VERDE.**

**Estado final dos GRANTs (confirmado por `information_schema.role_table_grants`):**
`Membership = INSERT,SELECT,UPDATE` (sem DELETE) · `MembershipEvent = INSERT,SELECT` (append-only).

**(a) Concorrência do último Admin** e **(b) deny-by-default** — VERDES na suíte
(`membership-removal-http`): "CONCORRÊNCIA: dois Admins removendo um ao outro → um 200, um barrado; NUNCA
0 Admins" e "remove um membro → deny-by-default na próxima requisição".

**Suíte completa da API (serial, PostgreSQL real): 136 arquivos, 1247 testes, 100% verdes.**
