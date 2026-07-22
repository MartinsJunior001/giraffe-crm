# Gates — tech/pipegrant-guest-ceiling (DEB-PIPEGRANT-GUEST-CEILING)

Unidade técnica de **RISCO ALTO** (autorização multi-tenant). Fecha o débito conforme a decisão de
Produto autoritativa `_bmad-output/implementation-artifacts/decisions/pipegrant-guest-ceiling.md`
(APROVADA 22/07/2026). Espelha o teto de `DatabaseGrant` (AD-9 / Story 3.2). `ability.ts`/`ability.factory.ts`
**intocados** (C3 congelado) — a guarda fina vive no serviço (`pipe-authz`/`grants`), padrão DBT-AUTHZ-01.

## pre-implementation-check — APROVADO
- **Fonte autoritativa lida integralmente:** decision doc (contrato desta unidade). Não duplicada, não contrariada.
- **Padrão reutilizado:** `DatabaseGrantsService.aplicarTetoDaOrg` (3.2) e a reconciliação de `DatabaseGrant`
  em `MembershipRoleService` (8.4). Menor mudança correta; sem abstração especulativa.
- **Sem migration:** é regra de write-side + resolução de poder. Nenhum schema/coluna/enum novo. Nenhum GRANT
  novo. Nenhum DELETE novo. (Ver `migration-check`.)
- **C3 congelado:** guard/`ability.ts` não tocados.

## context7-check — REGISTRADO
- **Prisma 6.19.3** (`apps/api/package.json`), **NestJS 11**. Consultado o MCP Context7 (`/prisma/web`) sobre
  **interactive transaction** (`$transaction(async (tx) => { read → lógica → write })`, read-modify-write,
  rollback ao lançar). A alteração em `MembershipRoleService` **reutiliza** o padrão de transação interativa já
  presente no arquivo (adiciona uma leitura `tx.pipeGrant.findMany` e um retorno de recusa antes das escritas);
  nenhuma API nova de Prisma/Nest foi introduzida. Assinaturas conferidas contra a doc atual — nada inventado.

## Classificação de risco — ALTO (elevada automaticamente: autorização + multi-tenancy)
Gates aplicados: testes da área crítica; **integração real** (PostgreSQL de verdade, nunca mock); regressão de
segurança relacionada (pipe-grants/pipe-authz/membership-role verdes); typecheck + lint + build; QA cruzada; CI
no SHA exato. Sem migration → `migration-check` N/A (registrado abaixo).

## security-check — OK
- **Teto no write-side, dentro do contexto (RLS) do alvo** (`conceder`/`alterarPapel`): o papel de Org do alvo é
  lido sob `withTenantContext` imediatamente antes de persistir; CONVIDADO → só `VIEWER` (+ `restritoAoProprio`).
  ADMIN/MEMBER/capacidade expansiva (`reviewPublicSubmissions`) a GUEST → **400** sanitizado (deny-by-default).
- **Read-side fail-closed** (`pipe-authz`): `resolverPoderNoPipe` rebaixa o Convidado ao teto (`ler`) mesmo com
  `PipeGrant` legado/inconsistente (GUEST com ADMIN/MEMBER); `exigirOperarPipe`/`exigirGerenciarPipe` herdam;
  `exigirRevisarSubmissoesPublicas` nega a capacidade a GUEST; o acesso por-Card (`computeAcessoNaoAdmin`)
  também rebaixa a contribuição do `PipeGrant` do Convidado (a concessão DIRETA `CardGrant` fica fora do escopo
  desta decisão — não inventamos teto para ela, AD-11).
- **Reconciliação Membership→GUEST:** **RECUSA** (409 `PIPE_GRANT_INCOMPATIVEL`, sanitizado) enquanto houver
  `PipeGrant` ativo acima do teto — não rebaixa em silêncio (decisão item 7). Anti-TOCTOU: relê os grants DENTRO
  da tx. GUEST→MEMBER **não** promove grants (comportamento preservado; testado).
- **Sanitização/LGPD:** erros não ecoam valores do cliente nem `orgId`/PII (só ids internos de grant, como o
  `membershipId` já exposto). Sem segredo/token/PII em log. `.env`/temporários fora do commit.
- **Isolamento:** toda query por `withTenantContext`/tx com contexto; nenhum `where orgId` como única defesa;
  nenhuma rota aceita `orgId` do cliente; cross-org provado (Ana/Org A não alcança Pipe da Org C → 404).

## observability-check — OK
- A recusa/concessão passa pela auditoria existente (`MODELOS_AUDITADOS` cobre `PipeGrant`/`Membership`; a
  auditoria manual FR-214 de `MembershipRoleService` segue registrando `update Membership`/`create
  MembershipEvent`/`update DatabaseGrant`). A recusa por teto **não** aplica `updateMany` (não gera falso
  `denied` na trilha). Nenhuma PII nova em log.

## migration-check — N/A (sem migration)
Nenhum DDL, coluna, enum, índice, policy ou GRANT novo. A regra é write-side + resolução de poder sobre o schema
existente. Portanto sem drill de rollback. Confirmado: `apps/api/prisma/migrations/` inalterado.

## Modo condicional APENAS_FORMULÁRIO_INICIAL — NÃO MATERIALIZADO (AD-11)
A decisão (item 3) admite, para o Convidado, os modos restritivos **já previstos**: VISÃO_RESTRITA
(`restritoAoProprio`, existente) e APENAS_FORMULÁRIO_INICIAL. Uma busca no schema/serviço
(`APENAS_FORMULARIO`/`somenteFormulario`/`formularioInicial`/`initialFormOnly`) **não** encontra campo,
modificador ou coluna que materialize APENAS_FORMULÁRIO_INICIAL — é um modo futuro não materializado. Conforme
AD-11 (nada de abstração especulativa sem consumidor), **não** foi inventado: o teto do Convidado permanece
`VIEWER` (+ `restritoAoProprio` quando aplicável). A PROVA 5 (permitir APENAS_FORMULÁRIO_INICIAL) **não se
aplica** por ausência do campo — documentada aqui, sem teste de campo inexistente. Quando o modo for
materializado por sua Story, permiti-lo ao Convidado é aditivo em `violacaoTetoConvidado`.
