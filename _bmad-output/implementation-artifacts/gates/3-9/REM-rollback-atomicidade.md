# REM-3.9-ROLLBACK-ATOMICIDADE — remediação técnica pós-closure (Lane 0)

**Contexto.** A implementação funcional da 3.9 (PR #117) e o closure (PR #118, `3-9 → done`) foram
mergeados **antes** do gate de revisão da Lane 0. A revisão adversarial encontrou 1 HIGH e 1 MEDIUM que o
CI não pega (rollback versionado e teste de atomicidade). O dono transferiu à **Lane 0** o ownership
**exclusivo e delimitado** desta remediação (Opção B). Escopo restrito: **nenhuma alteração funcional** —
só o `.down.sql`, o teste de atomicidade, o drill SC-206 e esta evidência. Service/controllers/DTOs/
migration forward/autz/endpoints **intocados**.

## FINDING 1 (HIGH) — rollback `.down.sql` ausente → RESOLVIDO

Criado `apps/api/prisma/rollback/20260718120000_card_record_link.down.sql` como **inverso semântico exato**
da migration forward, no padrão do E3 (DROP POLICY explícito → DROP TABLE em cascata → DROP TYPE → DROP
INDEX/COLUMN das trilhas), com `IF EXISTS` (idempotente, permite `up→down→up`). Remove **somente** o que a
3.9 adicionou; não toca `Card`/`Record`/`CardHistory`/`RecordHistory` (exceto a coluna nova `correlationId`).

### Drill SC-206 (banco descartável isolado) — `SC206_DRILL_39_OK`

```
[1] UP    deploy de todas as migrations (inclui a 3.9)                         → ok
[2] valida presente: tabela CardRecordLink; CardHistory/RecordHistory.correlationId;
    índice único PARCIAL (WHERE state=ACTIVE); 3 FKs; RLS ENABLE+FORCE; 4 policies;
    GRANT SELECT/INSERT/UPDATE (sem DELETE)                                     → 8/8 ok
[3] DOWN  db:rollback aplica o .down.sql                                        → ok
[4] valida ausente: CardRecordLink removida; tipo removido; correlationId removida
    das trilhas; migration anterior INTACTA (Record existe); CardHistory intacta → 5/5 ok
[5] UP    re-deploy reaplica a 3.9                                              → ok
[6] valida presente de novo (mesmas 8 checagens)                               → 8/8 ok
=> SC206_DRILL_39_OK
```

O rollback é reversível, cirúrgico e não deixa resíduo; as migrations anteriores permanecem íntegras.

## FINDING 2 (MEDIUM) — teste de atomicidade #15 ausente → RESOLVIDO

Adicionado ao `apps/api/test/card-record-link-http.test.ts` (novo `describe` de atomicidade). Injeta falha
**determinística** na 2ª escrita de história (`recordHistory.create`) via `vi.spyOn` na instância do
`PrismaService` — **sem tocar o código de produção** (o `tx` real é preservado; só aquela escrita rejeita).
Prova o **rollback total** (contrato #20 / obrigatório #15):

- a requisição falha (5xx, não 201/409);
- **0** vínculos (`CardRecordLink`) do par;
- **0** eventos `LINKED` no `CardHistory` (o 1º evento foi desfeito junto);
- **0** eventos `LINKED` no `RecordHistory` (o 2º nunca persistiu) — sem evento órfão, sem estado divergente;
- **controle:** sem a falha, o mesmo par vincula (201) e os **dois** históricos ganham o `LINKED`.

## Validação

- typecheck limpo; lint (eslint) limpo; format (prettier) limpo.
- `card-record-link-http.test.ts`: **9/9** (8 originais + atomicidade).
- Suíte serial completa: verde (CI é o gate autoritativo).
- Drill SC-206: `SC206_DRILL_39_OK`.

**Gate:** 0 CRITICAL, 0 HIGH remanescentes. Findings HIGH e MEDIUM resolvidos. Sem alteração funcional.
Não é necessário novo closure (o BMAD já está `done`) — esta é a remediação pós-closure registrada.
`CLOSURE_REQUIRES_ALL_REQUIRED_PRS_MERGED` fica anotado como melhoria de processo.
