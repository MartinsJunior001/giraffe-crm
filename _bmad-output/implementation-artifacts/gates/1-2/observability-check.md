# observability-check — Story 1.2

**Status: APROVADO** (após correção de 3 achados)

## Achados encontrados e corrigidos

### O1 — A trilha de auditoria podia sumir em silêncio (HIGH)

`withTenantContext(prisma, ctx, logger?)` tinha `logger` **opcional**, com default no-op
(`{ debug: () => {}, info: () => {}, warn: () => {} }`). O primeiro chamador que esquecesse o
terceiro argumento perderia toda a trilha de auditoria (FR-214) **sem nenhum sinal**.

Um requisito de compliance não pode depender de alguém lembrar de um parâmetro. O `logger`
passou a ser **obrigatório** — quem esquecer não compila.

### O2 — A negação mais comum era registrada como "permitida" (HIGH)

A RLS nega de **três** formas, e só uma era detectada:

| Forma de negação                                | Como se manifesta | Antes | Agora |
| ----------------------------------------------- | ----------------- | ----- | ----- |
| `WITH CHECK` violado (INSERT/UPDATE)            | exceção `42501`   | `rls.denied` ✅ | `rls.denied` |
| `USING` filtrou mutação de **um** registro      | exceção `P2025`   | **nenhum evento** ❌ | `rls.denied` |
| `USING` filtrou mutação **em lote**             | `{ count: 0 }`, sucesso | `audit: allowed` ❌❌ | `rls.filtered` + `audit: denied` |

O caso do meio sumia da trilha. O de baixo era **pior**: um `deleteMany({ where: { orgId:
<outra org> } })` — a tentativa mais óbvia de vandalismo cross-tenant — era auditada como
`result: 'allowed'`, porque o `USING` filtra em vez de lançar.

Corrigido em `tenant-context.ts` (`foiFiltrada`) e `rls-denial.ts` (`isRegistroNaoEncontrado`),
com três testes de regressão.

**Troca assumida explicitamente:** um `updateMany` legítimo que não casa com nada também vira
uma linha `denied` na trilha. O falso positivo custa uma linha de log; o falso negativo custa
uma tentativa de acesso cruzado invisível.

### O3 — O 503 do `/ready` era mudo (MEDIUM)

`isReachable()` fazia `catch { return false }` — descartava o erro inteiro. O `/ready` devolvia
503 e a aplicação não tinha nada a dizer sobre a causa; o README mandava o operador ir ler o
log do **banco**, porque a API não sabia.

Não vazar ≠ não saber. Agora o erro é **registrado, sanitizado** (a string de conexão é
removida com regex antes de ir ao log), como WARN, com `event: 'db.unreachable'`.

Verificado em container real, com o banco parado:

```json
{"level":40,"service":"giraffe-api","env":"production","event":"db.unreachable",
 "reason":"Can't reach database server at `db:5432`","context":"banco não está apto — /ready responderá 503"}
```

E `grep -ciE "giraffe_app_pw|postgresql://|password"` nos logs da API → **0**.

## Eventos estruturados (contrato)

| Evento            | Nível | Quando                                                       |
| ----------------- | ----- | ------------------------------------------------------------ |
| `db.query`        | debug | operação de modelo concluída                                 |
| `rls.denied`      | warn  | negação por `WITH CHECK` (42501) ou registro invisível (P2025)|
| `rls.filtered`    | warn  | mutação em lote que não atingiu nenhuma linha                |
| `audit`           | info  | mutação em `Organization`/`Membership` (FR-214)              |
| `db.unreachable`  | warn  | sonda de readiness falhou                                    |

Auditoria (FR-214) carrega os seis campos exigidos: `actor`, `orgId`, `action`, `resource`,
`result`, `at`. Testado campo a campo.

## Health / readiness

- `/health` (liveness) — não toca o banco. Testado com o banco fora: **200**.
- `/ready` (readiness) — lê uma tabela do schema (`LIMIT 0`): prova conexão, migrations
  aplicadas **e** GRANT. Antes fazia `SELECT 1`, que provava só o socket — um container com o
  schema ausente responderia `200 ok` e entraria em rotação para falhar em toda requisição.
- Com o banco fora: `/ready` **503**, container **vivo**, `RestartCount = 0`, recuperação
  automática quando o banco volta (verificado em container).

## Ressalva registrada

A trilha `audit` é emitida em nível `info`. Um operador que suba com `LOG_LEVEL=warn` reduz a
trilha aos eventos de negação (que são `warn`) e perde os `allowed`. Os eventos de **segurança**
(`rls.denied`, `rls.filtered`) sobrevivem a qualquer `LOG_LEVEL` até `warn`. Persistir a
auditoria em tabela é escopo não especificado (exigiria policies próprias de RLS) e não foi
antecipado.
