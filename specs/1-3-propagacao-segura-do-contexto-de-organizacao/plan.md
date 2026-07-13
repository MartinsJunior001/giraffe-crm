# Plan — Story 1.3

## Decisões

### D1 — Inversão de dependência do principal (resolve a ordenação 1.3 antes de 1.4)

`PrincipalProvider` é um **port** em `kernel/context/`. Nesta Story, a única implementação
registrada (`SemSessaoPrincipalProvider`) devolve **`null`**: não há sessão, logo não há
principal, logo **toda** rota que exija contexto rejeita com 401.

Isso **é** o AC2, e é a demonstração vertical pedida pelos épicos. A alternativa — um header de
conveniência tipo `x-account-id` — seria um backdoor de produção com nome de andaime, e andaime
tem o hábito de sobreviver à obra.

Os testes registram um provider falso. É **costura de teste**, não backdoor: há teste que
verifica que o provider **registrado no `AppModule`** nega.

A Story 1.4 substitui a implementação. O resolvedor não muda uma linha.

### D2 — `AsyncLocalStorage` para o contexto de requisição

Node nativo, sem dependência nova. Um `RequestContextService` expõe `run(ctx, fn)` e `get()`.

`get()` **lança** quando chamado fora de um `run()` (FR-306). Devolver `undefined` seria a porta
de entrada do bug clássico: `const org = ctx?.orgId` → `undefined` → alguém "trata" com um
default → vaza.

**Não** substitui o `set_config` transaction-local da 1.2. São camadas distintas: a ALS carrega o
contexto **na aplicação**; a extensão do Prisma o aplica **na transação**. Trocar uma pela outra
reintroduziria o vazamento por pool que a 1.2 fechou.

### D3 — O resolvedor é a única fonte de autoridade

`OrgContextResolver.resolver(accountId, orgIdPedido?)`:

1. sem `accountId` → `Nenhum principal` (401);
2. busca Memberships **ACTIVE** da conta via `withAccountContext` (a policy da 1.2 permite
   exatamente isso: leitura das próprias Memberships **quando não há Org no contexto**);
3. `orgIdPedido` ausente e **exatamente uma** Membership ACTIVE → é ela;
4. `orgIdPedido` ausente e **várias** → rejeita (escolher por conta própria é decidir pelo
   usuário; a escolha explícita é da Story 1.9);
5. `orgIdPedido` presente → **tem de casar** com uma Membership ACTIVE da conta; senão, rejeita
   (403). Nunca "corrige em silêncio".

Filtrar `state = ACTIVE` **aqui** é o que paga a dívida que a 1.2 registrou: `MembershipState`
deixa de ser decorativo no exato ponto em que Membership vira autoridade.

### D4 — Middleware abre o escopo; Guard decide (corrigido no `context7-check`)

**Divergência registrada.** O plano original dizia "o guard abre o `run()` da ALS". Não é
implementável, e o `context7-check` pegou isso antes de virar código: um guard **retorna** antes
do handler executar, então ele não tem como envolver a continuação da requisição num
`AsyncLocalStorage.run()`. Ele decide, mas não embrulha.

A divisão correta são duas peças, e cada uma faz o que o Nest permite que ela faça:

1. **`RequestContextMiddleware`** — roda primeiro e envolve **toda** a requisição em
   `als.run(escopoVazio, next)`. Ele **não** resolve nada e **não** autoriza nada: só garante que
   existe um escopo, e que ele morre com a requisição.
2. **`TenantContextGuard`** (global, via `APP_GUARD`) — resolve o contexto, **rejeita** (401/403)
   e **preenche** o escopo aberto pelo middleware.

`RequestContext.obter()` **lança** em dois casos distintos, e a distinção importa: fora de
requisição (não há escopo) e dentro de requisição **antes** do guard ter resolvido (escopo vazio).
Nenhum dos dois devolve `undefined`.

Rotas que **não** exigem contexto (`/health`, `/ready`) ficam fora por **allowlist explícita**
(`@SemContextoOrganizacional()`), nunca por "esqueci de proteger". O default é **exigir** —
deny-by-default também aqui.

### D5 — Demonstração vertical

`GET /organizations/current` — devolve `{ id, name, slug }` da Organização do contexto. Consome o
contexto resolvido e a extensão da 1.2. Sem principal ⇒ 401. É o consumidor concreto que
justifica a existência do kernel de contexto (Constitution II: nada de abstração especulativa).

### D6 — `TenantEnvelope`: contrato, não implementação

Tipo em `kernel/context/tenant-envelope.ts` + documento. **Zero** fila, worker ou cache. O gate
dos épicos pede o contrato antes do primeiro canal assíncrono; a Constitution proíbe construir o
canal sem consumidor. As duas coisas convivem: entrega-se o **tipo** e a **regra escrita**.

## Estrutura

```
apps/api/src/kernel/context/
  request-context.ts        # AsyncLocalStorage; get() lança fora de requisição
  principal.provider.ts     # port + impl "sem sessão" (nega) — 1.4 substitui
  org-context.resolver.ts   # Membership ACTIVE -> contexto. Única autoridade.
  tenant-context.guard.ts   # guard: resolve, rejeita, abre o run()
  tenant-envelope.ts        # contrato AD-8 (tipo apenas)
  context.module.ts
apps/api/src/organizations/  # consumidor concreto (D5)
```

## Riscos

| Risco | Mitigação |
| --- | --- |
| ALS vazando contexto entre requisições | teste de **concorrência real** (SC-306) e teste de vazamento sequencial (SC-308) |
| Guard esquecido numa rota futura | guard **global** + allowlist explícita; o default é exigir |
| Provider falso escapar para produção | teste que verifica que o provider do `AppModule` **nega** (SC-309) |
| Regressão do isolamento da 1.2 | a suíte de RLS (62 testes) continua no CI, contra Postgres real |
