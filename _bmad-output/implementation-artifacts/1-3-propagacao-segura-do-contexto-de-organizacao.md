# Story 1.3: Propagação segura do contexto de Organização

Status: done

## Story

**As a** plataforma,
**I want** resolver e propagar o contexto de Organização no servidor, dentro da transação,
**so that** nenhuma operação rode sem contexto válido nem confie no cliente.

## Rastreabilidade

- **Épico 1**, Story 1.3 (`epics.md`)
- **AD-6** — isolamento por Organização, deny-by-default, RLS
- **AD-7** — Account global + Membership por Organização (Forma B)
- **AD-8** — o contexto de Organização acompanha **todo** processamento, não só as queries
- **NFR-3** — escopo de Organização imposto centralmente
- **Dependência:** Story 1.2 (`done`)

## O que esta Story fecha (dívida explícita da 1.2)

A Story 1.2 entregou o isolamento **imposto pelo banco** e deixou uma fronteira aberta, escrita
em comentário e registrada no README:

> `withTenantContext` **não verifica** que `accountId` possui Membership em `orgId`. Ela CONFIA
> no contexto que recebe. A RLS impõe o isolamento **entre** Organizações; ela não decide **a
> qual** Organização o requisitante pertence.

É exatamente essa a lacuna desta Story. Hoje, um handler que fizesse
`withTenantContext(prisma, { orgId: req.headers['x-org-id'] })` teria acesso **integral** a um
tenant alheio — e a RLS funcionaria perfeitamente o tempo todo, porque ela faria o que lhe
pediram. O isolamento do banco é a última linha, não a primeira.

## Acceptance Criteria

- **AC1** — Requisição com principal autenticado e Membership **ACTIVE**: o contexto de
  Organização é resolvido **no servidor**, a partir da Membership, e definido **dentro da
  transação** da operação.
- **AC2** — Requisição **sem contexto organizacional válido** é **rejeitada** (fail-closed), com
  resposta sanitizada — nunca um 500, nunca uma lista vazia fingindo sucesso.
- **AC3** — `orgId` vindo do **cliente** (rota, query, corpo, header) **nunca é fonte de
  autoridade**: quando é necessário ao contrato e **diverge** do contexto permitido pela
  Membership, a operação é **rejeitada**; quando não é necessário, é **ignorado** e substituído
  pelo contexto resolvido no servidor.
- **AC4** — Membership **não-`ACTIVE`** (`SUSPENDED`/`REMOVED`) **não concede** contexto.
- **AC5** — Existe **contrato documentado e tipado** de propagação do contexto para jobs, filas,
  eventos e cache (AD-8). Só o **contrato** — a implementação vive nos Épicos que introduzirem
  esses canais.
- **AC6** — Testes **cross-tenant automatizados** contra PostgreSQL real cobrindo: contexto
  resolvido, contexto ausente, Membership de outra Org, Membership inativa, `orgId` forjado pelo
  cliente e vazamento entre requisições concorrentes.

## Fora do escopo (explícito)

- **Login, sessão e credenciais** — Story 1.4. Esta Story define o **port** do principal; quem o
  preenche é a 1.4.
- **Autorização por papel (CASL)** — Story 1.6. Aqui, papel **não** decide nada; o que decide é
  **existir Membership ACTIVE**.
- **Implementação** de filas, eventos, cache, WebSocket — só o contrato (gate dos épicos).
- **Troca de Organização pelo usuário** — Story 1.9.

## Dev Notes

### O problema de ordenação, e como resolvê-lo sem mentir

A Story 1.3 vem **antes** do login (1.4). Logo, não há como uma requisição real carregar
identidade ainda. A saída honesta **não** é inventar uma autenticação provisória, nem abrir um
header de conveniência tipo `x-account-id` — isso seria um backdoor de produção com nome de
andaime, e ele sobreviveria à Story que deveria removê-lo.

A saída é inverter a dependência:

- define-se um **port** (`PrincipalProvider`) que responde "quem é o requisitante?";
- a **única** implementação registrada nesta Story responde **"ninguém"** (não há sessão);
- portanto, em produção, **toda** requisição a uma rota que exija contexto é **rejeitada** —
  que é precisamente o AC2, e é a demonstração vertical que os épicos pedem;
- os testes fornecem um principal falso para exercitar o caminho positivo. Isso é **costura de
  teste**, não backdoor: o provider de teste não existe no bundle de produção, e há teste que
  garante que o provider real nega.

A Story 1.4 troca a implementação do port. Nenhuma linha do resolvedor muda.

### Armadilhas conhecidas — leia antes de escrever qualquer linha

1. **Não confie no cliente, nem "só para o roteamento".** Um `orgId` na rota é conveniente e é
   veneno: no minuto em que ele vira parâmetro de query, alguém troca o valor. O contexto é
   resolvido do servidor, sempre. Se a rota precisa do `orgId` por contrato de API, ele é
   **conferido** contra o resolvido e a divergência **rejeita** — não "corrige silenciosamente".

2. **`AsyncLocalStorage` é a ferramenta certa e o vazamento mais fácil.** Ela propaga contexto
   sem passar parâmetro por dez camadas, mas: contexto que sobrevive ao fim da requisição, ou que
   é lido de um `store` herdado por engano, vaza tenant. Regra: o `run()` envolve **a
   requisição inteira** e nada fora dela; ler o contexto **fora** de um `run()` deve **lançar**,
   nunca devolver `undefined` (undefined vira "sem contexto", e "sem contexto" tem o hábito de
   virar "todos os contextos" no primeiro `if` mal escrito).

3. **O contexto do banco continua sendo transaction-local.** `AsyncLocalStorage` carrega o
   contexto **na aplicação**; `set_config(..., true)` o aplica **na transação**. São duas coisas,
   e a segunda não pode ser trocada pela primeira. A extensão da 1.2 permanece a única porta.

4. **Membership `SUSPENDED`/`REMOVED` não concede contexto.** A 1.2 deixou `state` sem efeito
   sobre acesso, e registrou isso como dívida. É **aqui** que ela é paga — é o resolvedor que
   transforma Membership em autoridade, então é ele que exige `ACTIVE`.

5. **Rejeição precisa ser fail-closed e honesta.** Sem contexto ⇒ **erro**, não lista vazia. Uma
   consulta que devolve `[]` porque não havia contexto é indistinguível, para quem chamou, de
   "não há dados" — e o bug some. A 1.2 já provou que o banco nega; o que falta é a aplicação
   **dizer** que negou.

6. **Concorrência é o teste que importa.** Duas requisições simultâneas, de Organizações
   diferentes, no mesmo processo. Se o contexto vazar entre elas, todo o resto é decoração. Este
   teste é obrigatório e não pode ser sequencial disfarçado de paralelo.

### Contrato de propagação (AD-8) — só o contrato

Um tipo `TenantEnvelope` que carrega `{ orgId, accountId, correlationId }` e uma regra escrita:
**nenhum trabalho assíncrono é enfileirado sem envelope, e nenhum worker executa sem
reidratá-lo**. Nada de fila, worker ou cache nesta Story — não há consumidor, e a Constitution
proíbe abstração especulativa. O que existe aqui é o **tipo** e o **documento**, porque o gate
dos épicos os exige antes de o primeiro canal assíncrono nascer.

### Referências

- `apps/api/src/kernel/db/tenant-context.ts` — a fronteira da 1.2 (e o comentário que descreve
  esta dívida)
- `apps/api/prisma/migrations/.../migration.sql` — policy de `Membership` (a leitura por conta só
  vale quando **não** há Org no contexto: é assim que o resolvedor descobre as Orgs da conta)
- `_bmad-output/implementation-artifacts/gates/1-2/` — o que já foi provado, para não reprovar

## Change Log

| Data | Mudança |
| --- | --- |
| 2026-07-12 | Story criada a partir de `epics.md` (Story 1.3), AD-6/AD-7/AD-8, NFR-3 e da dívida explícita registrada na Story 1.2 (`withTenantContext` confia no `orgId` recebido). Registrada a inversão de dependência do principal, que evita inventar autenticação antes da Story 1.4. Status → ready-for-dev. |
