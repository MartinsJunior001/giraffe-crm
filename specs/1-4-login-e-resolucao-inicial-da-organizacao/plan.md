# Plan — Story 1.4

## D1 — O `user` do Better Auth **é** o nosso `Account`. Não uma segunda tabela de pessoas.

Esta é a decisão que governa todas as outras, e ela nasce de uma colisão real: o schema Prisma que o
Better Auth gera declara um model chamado **`Account`** (tabela `account`), e nós já temos um model
`Account` — a identidade global do AD-10, à qual `Membership` se liga. Nome de model em Prisma é
único; a colisão é concreta, não estética.

A saída preguiçosa seria renomear o nosso e deixar o Better Auth criar o `user` dele. O resultado
seria **duas tabelas de identidade**: `user` (dona da sessão) e `Account` (dona da Membership), que
precisariam ser mantidas em sincronia para sempre. Toda divergência entre elas — um `user` sem
`Account`, um e-mail atualizado num lado só — vira um bug de identidade, que é a classe de bug que
termina em "o usuário X viu os dados do usuário Y". Sincronizar duas fontes de verdade sobre *quem é
a pessoa* não é uma tarefa: é uma dívida perpétua.

**Decisão:** mapear o model `user` do Better Auth **para a nossa tabela `Account`**, via
`user: { modelName: 'Account' }`. Uma identidade, uma tabela.

Consequência: `Account` ganha as colunas que o Better Auth exige (`emailVerified`, `image`) — em
migration versionada. E `session.userId` passa a ser, literalmente, o `Account.id` que a `Membership`
já referencia. O `PrincipalProvider` fica trivial: `accountId = session.userId`.

Os demais models do Better Auth são renomeados para não colidirem e para **dizerem a verdade sobre o
que guardam**:

| Better Auth | Aqui | Por quê |
| ----------- | ---- | ------- |
| `user` | **`Account`** (existente) | D1. Uma identidade. |
| `session` | `AuthSession` | — |
| `account` | **`AuthCredential`** | Ela não guarda "contas": guarda hash de senha e vínculos de provedor. O nome original é ativamente enganoso num sistema onde `Account` significa outra coisa. |
| `verification` | `AuthVerification` | — |
| `rateLimit` | `RateLimit` | — |

## D2 — Tabelas de auth são **globais**, como `Account`. Sem RLS, com GRANT apertado.

`AuthSession`, `AuthCredential`, `AuthVerification` e `RateLimit` **não pertencem a uma Organização**
— pela mesma razão que `Account` não pertence (AD-10). Não levam `orgId` e não levam policy.

Mas "sem RLS" **não** significa "sem fronteira": na 1.2 aprendemos, com um vazamento reproduzido, que
**onde a RLS não alcança, quem nega é o GRANT**. Então:

- `AuthCredential` guarda **hash de senha**. O runtime precisa de `SELECT` (verificar) e
  `INSERT`/`UPDATE` (criar/trocar). **Nunca** `DELETE` sem necessidade demonstrada.
- `Account` **continua** com `SELECT` apenas — mais `UPDATE` restrito aos campos que o Better Auth
  precisa escrever. **`DELETE` continua proibido**: a cascata da FK apagaria Memberships de *todas* as
  Organizações, e ações referenciais rodam com bypass de row security (a lição da 1.2).
- Ao conceder cada privilégio novo, **escrever o teste que prova o escopo dele**.

## D3 — G2 é do Better Auth. G1 é nosso. E eles não se fundem.

O `context7-check` foi à fonte: `createRateLimitKey(ip, path)` → a chave nativa é **IP + rota**, e o
contador mede **solicitações**.

- **G2** (20 solicitações/IP/15 min) ⇒ `rateLimit.customRules` na rota de login. `storage: 'database'`
  — o padrão `memory` não sobrevive a restart e não é compartilhado entre réplicas (com 3 instâncias o
  limite efetivo triplica).
- **G1** (5 **falhas** por **identificador**) ⇒ **contador próprio**. O nativo não faz e não tem como
  fazer.

Fundir os dois reintroduziria exatamente o furo que a separação fecha: um atacante com uma lista de
e-mails, testando uma senha comum em cada, **nunca estoura o limite por conta** — só o de IP o pega.
E o G4 (sucesso não limpa o contador de IP) existe porque, se limpasse, bastaria intercalar um login
válido próprio a cada N tentativas para zerar o antiabuso.

## D4 — O contador do G1: chave HMAC, incremento atômico, sem `SELECT`-depois-`UPDATE`.

Tabela `LoginFailure`:

| coluna | |
| ------ | - |
| `key` | `PRIMARY KEY` — HMAC-SHA256 do identificador **normalizado** (`trim` + `toLowerCase`), com prefixo de finalidade (`login:`), em segredo de ambiente. |
| `keyVersion` | qual versão do segredo gerou a chave (ver D6). |
| `count` | falhas na janela. |
| `windowStart` | início da janela. |

**Nenhum e-mail bruto.** O e-mail é PII: em claro numa tabela de contadores ele vira um **segundo
cadastro de e-mails**, fora do controle de `Account` — e um dump dessa tabela vira uma lista de
usuários. O prefixo de finalidade impede que a mesma chave sirva a dois contadores diferentes.

**Atomicidade:** `INSERT ... ON CONFLICT (key) DO UPDATE SET count = CASE WHEN janela expirou THEN 1
ELSE LoginFailure.count + 1 END, ...` **RETURNING** o count. Uma única instrução: sem leitura seguida
de escrita, sem *lost update*, sem lock explícito. Um `SELECT` e depois um `UPDATE` perderia
contagens sob concorrência — que é justamente o regime em que um ataque de força bruta acontece.

## D5 — IP: só do proxy confiável, configurado por ambiente.

Confiar em `X-Forwarded-For` cru é o mesmo que não ter G2: o atacante forja o header e **cada
requisição vem de um IP novo**.

- A confiança é **explícita e configurável** (`TRUSTED_PROXY_IPS`), vazia por padrão.
- Sem proxy confiável configurado, usa-se o **IP do socket** — nunca o header.
- **Não inventamos faixas do Coolify agora.** A validação contra o proxy real fica registrada como
  **gate de staging**.
- Nada de "faixa privada ampla" como confiança genérica: `10.0.0.0/8` confiável significa que qualquer
  coisa dentro da rede pode forjar IP.

## D6 — Rotação do segredo do HMAC não pode zerar os contadores em silêncio.

Trocar o segredo muda **todas** as chaves — e um atacante em curso teria o contador zerado
exatamente no momento da rotação. Pior: ninguém perceberia.

**Decisão:** `LOGIN_HMAC_SECRET` é versionado (`LOGIN_HMAC_KEY_VERSION`). A chave gravada carrega a
versão. Na verificação, consulta-se a versão corrente; se a rotação acabou de acontecer, os contadores
antigos **expiram naturalmente** com a janela de 15 min — não são apagados nem reaproveitados. A
rotação é registrada em log (`auth.hmac.rotated`) para que a queda de contadores tenha **explicação**,
em vez de parecer um ataque que sumiu.

Janela de 15 min ⇒ o custo máximo da rotação é 15 min de contadores frios. Aceito e **declarado**, em
vez de descoberto num incidente.

## D7 — Enumeração: o caminho da conta inexistente precisa custar o mesmo.

Responder a mesma mensagem não basta se o caminho "conta não existe" for mensuravelmente mais rápido
(porque não há hash de senha para verificar). O Better Auth trata isso; **vamos confirmar na versão
fixada e cobrir com teste** — resposta, status, formato **e** ordem de grandeza do tempo.

## D8 — CR-09 permanece aberto e **não** é resolvido aqui.

`/ready` precisa de rate limiting **na borda**, e isso **não** se mistura com login: são camadas
diferentes (proxy vs. aplicação) e propósitos diferentes. Proteger `/ready` com autenticação está
**proibido** — faria o healthcheck do orquestrador receber 401 e mataria o deploy. Fica registrado
como task técnica que **bloqueia o `STAGING APPROVED`**.
