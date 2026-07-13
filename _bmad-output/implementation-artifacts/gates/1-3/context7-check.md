# context7-check — Story 1.3

2026-07-12 · Status: **APROVADO** · Fonte: MCP do Context7 (`/nestjs/docs.nestjs.com`) + documentação do Node.js

Baseline: as versões efetivamente instaladas — NestJS **11**, Node **24** (`.nvmrc`), conforme
`package.json` e lockfile. Nada aqui foi assumido de memória.

## O que foi verificado, e o que mudou por causa disso

### 1. Um Guard **não pode** abrir o escopo da `AsyncLocalStorage`

Esta consulta **mudou o desenho** e está registrada como a decisão **D4** do `plan.md`.

O plano original previa que o próprio guard abrisse o escopo (`als.run(...)`). A documentação do
ciclo de vida da requisição desmente isso: o guard **retorna** (`true`/`false`) antes de o handler
executar — ele não recebe a continuação e não tem como envolvê-la num `run()`. Um `als.run()`
chamado dentro do guard morreria no `return`, e o handler leria contexto vazio.

Ordem confirmada: **middleware → guards → interceptors → pipes → handler**. O middleware recebe
`next` e portanto **pode** embrulhar toda a continuação.

Desenho final, corrigido: **o middleware abre o escopo; o guard decide e o preenche.**
(`RequestContextMiddleware` → `TenantContextGuard.definir()`)

### 2. Guard global com injeção de dependência

Confirmado: `{ provide: APP_GUARD, useClass: TenantContextGuard }` num módulo é a forma canônica —
e é a única que permite ao guard **injetar** `Reflector`, `RequestContext`, `OrgContextResolver` e o
`PRINCIPAL_PROVIDER`. `app.useGlobalGuards(new TenantContextGuard(...))` não teria DI.

Também confirmado que guards globais rodam **antes** dos de controller/rota — que é o que sustenta o
deny-by-default: não há como uma rota "escapar" registrando o seu próprio guard primeiro.

### 3. Allowlist via metadata

`Reflector.getAllAndOverride(chave, [handler, class])` é a leitura correta para um decorator aplicado
**na classe** (`@SemContextoOrganizacional()` no `HealthController`) — `get()` sozinho olharia só um
dos dois alvos.

### 4. `AsyncLocalStorage` no Node 24

`als.run(store, fn)` propaga o store por toda a cadeia assíncrona iniciada dentro de `fn`, e o store
é isolado por cadeia — é a garantia de que duas requisições concorrentes não compartilham contexto.
`getStore()` devolve `undefined` fora de um `run()`, e é por isso que `RequestContext.obter()`
**lança** em vez de repassar esse `undefined` adiante.

Verificado empiricamente além da documentação: o teste de 30 requisições concorrentes de tenants
diferentes, e a mutação que troca a ALS por estado compartilhado — que deixa 4 testes vermelhos,
inclusive através de HTTP real.

## Divergência entre documentação e plano

Uma, e foi resolvida **antes** de escrever código: a D4, acima. O plano foi corrigido; o código nasceu
do plano corrigido. Nenhuma assinatura ou opção de configuração foi inventada.
