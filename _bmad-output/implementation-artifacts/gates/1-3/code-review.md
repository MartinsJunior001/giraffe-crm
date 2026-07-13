# Code Review adversarial — Story 1.3

2026-07-12 · Resultado: **APROVADO após correções** · 10 findings, 8 corrigidos, 2 registrados

Método: dois revisores adversariais **cegos** em paralelo (um de segurança, um de correção/engenharia),
sem acesso às conclusões um do outro, mais auditoria de critérios de aceite. Os dois convergiram
independentemente em quatro dos findings — inclusive nos dois HIGH, que eu não tinha visto e que a
suíte verde de 95 testes não pegou.

---

## HIGH — corrigidos

### CR-01 · Corrida entre arquivos de teste paralelos derruba os testes da própria Story

O Vitest roda arquivos **em paralelo contra o mesmo PostgreSQL**. `rls.test.ts` cria uma Membership
temporária de **Carla** na Org C; `rls-observability.test.ts` cria uma de **Dani**. E os testes novos
da 1.3 afirmam justamente: *"Carla tem exatamente uma Organização ativa"* e *"Dani não tem nenhuma"*.

Dentro da janela create→delete, Carla passa a ter **duas** Orgs ativas, o resolvedor nega com
`múltiplas Organizações e nenhuma indicada` → **403** onde o teste espera 200. Até **15 das 30**
requisições do teste de concorrência caem. Nada disso é bug de produção: é flake — e flake em teste
de isolamento é o pior tipo, porque ensina a equipe a re-rodar até ficar verde.

O agravante: o cabeçalho do próprio `seed.sql` já avisava que Dani era a "conta livre para
escrita". Eu li esse comentário e mesmo assim a usei como fixture de leitura.

**Correção:** os papéis das contas passam a ser explícitos no seed. Leitura (ninguém modifica): Ana,
Bruno, Carla, Eva. Escrita, **uma por arquivo** (para não colidir na única `(accountId, orgId)`):
**Fabio** → `rls.test.ts`, **Gil** → `rls-observability.test.ts`. Dani volta a ser exclusivamente o
caso "conta sem Membership nenhuma".

**Evidência:** suíte executada **5 vezes seguidas**, 102/102 em todas.

### CR-02 · A defesa contra `x-org-id` duplicado era código morto; o teste passava pelo motivo errado

O guard fazia `if (Array.isArray(bruto)) return ''`. Mas o **Node só devolve array para
`set-cookie`** — qualquer outro header repetido chega como **uma única string juntada por vírgula**
(`"uuid-a, uuid-b"`). Verificado empiricamente no Node 24.

Consequências: o ramo nunca executava; o 403 acontecia **por acidente** (a vírgula quebra a regex de
UUID no resolvedor); o evento era auditado como `orgId malformado` em vez de pedido ambíguo; e o
teste que eu escrevi para provar a defesa **ficaria verde com a linha deletada**.

O risco não é teórico: a próxima pessoa que investigar um 403 espúrio vinda de um proxy encontra
`"uuid-a, uuid-b"` e aplica a correção "óbvia" — `split(',')[0]`. Nasce ali o request smuggling
clássico: o proxy valida um valor, a aplicação honra outro. E o teste de regressão que deveria pegar
isso já estaria verde de mentira.

**Correção:** rejeita array **ou** string com vírgula, no guard, com evento próprio
(`x-org-id repetido (pedido ambíguo)`) e `ForbiddenException` — em vez do sentinela `''`, que
acoplava dois arquivos de forma invisível (bastaria alguém tratar `''` como "não pediu nada" para o
header duplicado passar a ser **aceito**).

**Teste que discrimina:** sobre HTTP, o status é 403 **com ou sem** a defesa — status não prova nada
aqui. O novo `test/tenant-context-guard.test.ts` assere o que só é verdade **com** a defesa: o
resolvedor **nunca é chamado**. Mutação confirmada: removendo o `includes(',')`, o teste fica
vermelho.

---

## MEDIUM — corrigidos

### CR-03 · UUID em maiúsculas negava um membro legítimo — e fabricava alarme de segurança

A regex tinha flag `i` (aceita maiúsculas); a comparação com a Membership era `===`, byte a byte,
contra o que o PostgreSQL devolve — **sempre minúsculo**. Um cliente .NET/Java mandando
`Guid.ToString().ToUpper()` levava **403 sendo membro ativo**, e cada tentativa emitia um
`context.denied` — ou seja, um cliente bem-comportado poluía continuamente o **único sinal de
segurança que esta Story produz**. Fadiga de alerta fabricada.

**Correção:** normalização (`trim().toLowerCase()`) no ponto de entrada, no guard. Teste: Eva com
`x-org-id` em maiúsculas → **200**.

### CR-04 · Allowlist na classe: toda rota futura de `HealthController` nasceria dispensada

`@SemContextoOrganizacional()` estava na **classe**. `/metrics` ou `/info` é exatamente o que alguém
penduraria ali ("é infra também") — e a rota nasceria **fora do guard global** sem uma linha no diff
dizendo isso: o decorator estaria vinte linhas acima, fora do hunk.

O mecanismo de defesa "allowlist explícita e visível no code review" não funcionava no único lugar
onde foi usado.

**Correção:** decorator **por método**. O custo do esquecimento passa a ser 401 — fail-closed.

### CR-05 · `tenant-envelope.ts` era abstração especulativa (Constitution II)

`grep` retornava **um único hit: a própria declaração**. Nenhum produtor, nenhum consumidor, nenhum
teste — uma `interface` pura, apagada na compilação, verificada por nada. As "quatro regras" do AD-8
que ela enunciava eram prosa em bloco de comentário: o primeiro produtor de mensagem não teria
incentivo mecânico algum para importá-la.

Isso colide de frente com a Constitution II e com o `kernel/README.md` ("Nenhuma abstração
especulativa sem consumidor concreto") — que o próprio arquivo citava.

**Correção:** arquivo **removido**. Ver a divergência D3 registrada em `specs/1-3/tasks.md`: a task
T021 pedia esse arquivo, e a Constitution tem precedência sobre a task. Não foi alteração
silenciosa de requisito — está declarada. Quando existir a primeira fila, o tipo nasce **junto com**
a função que o torna obrigatório; aí é fronteira, não decoração.

### CR-06 · Teste de SQL injection tautológico

O teste mandava `'; DROP TABLE "Membership"; --` e depois verificava, via `to_regclass`, que a
tabela continuava existindo. Teatro: a string era barrada pela regex **antes** de chegar ao banco —
e o `orgIdPedido` **nunca entra em query nenhuma** (ele só é comparado em memória). Provava que uma
string que nunca foi executada não executou.

**Correção:** substituído por uma asserção que **discrimina** — o motivo logado
(`orgId malformado`), que só existe se a regex estiver lá. E o comentário do resolvedor, que dizia
"rejeitado ANTES do banco", foi corrigido: ele não protege o banco (quem protege são as queries
parametrizadas do Prisma); ele garante que um erro de formatação do cliente não seja auditado como
tentativa de acesso cruzado.

### CR-07 · O teste de concorrência não cobria o cenário mais perigoso

O teste alternava **contas** (Ana/Carla). Um vazamento chaveado por `accountId` — um cache, um `Map`
no resolvedor, um `set_config` que escapasse do escopo transacional — passaria intocado, porque cada
conta só tem uma Org.

**Correção:** acrescentado o caso da **mesma conta** pedindo Organizações **diferentes**
simultaneamente (Eva, ACTIVE em A e B, 30 requisições alternando `x-org-id`). Cada resposta tem de
corresponder ao que *aquela* requisição pediu.

---

## LOW — registrados, não corrigidos

### CR-08 · `ContextoIndisponivelError` sem filtro dedicado

Vira 500 genérico (corpo sanitizado, sem stack). É o sintoma exato de "o middleware não cobriu esta
rota" — o modo de falha nº 1 da arquitetura — e hoje se dissolve entre outros 500s. Um
`ExceptionFilter` que o registre como `context.missing` custa ~10 linhas e torna a falha estrutural
mais perigosa **contável**. Registrado como dívida; não é regressão desta Story.

### CR-09 · `/ready` é dispensado do guard **e** toca o banco

Superfície de pressão não autenticada (consome conexão do pool sem identidade). É o trade-off aceito
de um readiness honesto, herdado da 1.2, e a resposta correta é rate limiting — não remover a
dispensa, que quebraria o deploy. Registrado para quando houver rate limiting.

---

## Frentes atacadas e que resistiram

- **Contexto sem Membership ACTIVE:** nenhum caminho. `OrgContextResolver` é o único produtor de
  `ContextoOrganizacional`, `definir()` é o único setter, e só o guard o chama.
- **Vazamento entre requisições concorrentes:** ALS corretamente usada — zero estado mutável em
  campo de classe. Confirmado por mutação (trocar a ALS por campo compartilhado ⇒ 4 testes
  vermelhos, inclusive via HTTP real).
- **Rota fora do guard:** `APP_GUARD` cobre o router inteiro; a única fuga real era o CR-04.
- **Oráculo de existência:** o resolvedor **nunca consulta `Organization`** — Org C (existe, sem
  vínculo) e um UUID inventado dão respostas indistinguíveis.
- **Principal forjado:** `PrincipalDeTeste` vive em `test/`; há teste com o `AppModule` **sem**
  override provando 401 mesmo com o header da costura.
- **Prisma sem contexto:** um handler que injetasse `PrismaService` e consultasse direto **não
  vaza** — sem `set_config`, `current_org_id()` é NULL, nenhuma policy casa, a leitura volta vazia.
  O deny-by-default do banco continua sendo a última palavra.
- **`.gitattributes`:** os 3 binários rastreados (`.jpg`, `.png`) são detectados como binários pelo
  `text=auto` (`git ls-files --eol` ⇒ `i/-text w/-text`); `eol=lf` não se aplica a eles. Nenhum
  arquivo rastreado exige CRLF.

---

## Gates após as correções

| Gate | Resultado |
| ---- | --------- |
| `format:check` / `lint` / `typecheck` / `build` | exit 0 |
| `test` | **API 102/102** (eram 95), Web 8/8 |
| Estabilidade | suíte executada **5×** seguidas, 102/102 em todas |
| Ciclo Docker | db/api/web 3× healthy |
| `smoke` | 4/4 |
| Guard no container | 401 sem identidade · 401 com `x-org-id` duplicado |
