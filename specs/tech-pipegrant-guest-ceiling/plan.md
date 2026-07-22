# Plano — tech/pipegrant-guest-ceiling (DEB-PIPEGRANT-GUEST-CEILING)

Fecha o débito: impor o **teto do CONVIDADO** sobre `PipeGrant`, espelhando o teto de `DatabaseGrant`
(AD-9 / Story 3.2). Contrato autoritativo:
`_bmad-output/implementation-artifacts/decisions/pipegrant-guest-ceiling.md` (APROVADA 22/07/2026).
Risco: **ALTO** (autorização multi-tenant). C3 congelado (guard/`ability.ts` intocados; guarda fina no
serviço — DBT-AUTHZ-01).

## Sem migration
É regra de write-side + resolução de poder sobre o schema existente. Nenhum schema/coluna/enum/índice/policy/
GRANT novo; nenhum DELETE novo.

## Desenho (menor mudança correta)
1. **Núcleo puro** `src/pipes/grants/pipe-grant-ceiling.ts` — fonte única do teto: `violacaoTetoConvidado`
   (write-side), `tetoPoderPorPapelOrg` + `convidadoPodeRevisarSubmissoes` (read-side fail-closed) e
   `pipeGrantsIncompativeisConvidado` (reconciliação Membership→GUEST).
2. **Write-side** `PipeGrantsService.conceder`/`alterarPapel` — lê o papel de Org do alvo sob RLS e aplica
   `aplicarTetoDaOrg` antes de persistir → 400 sanitizado. Espelha `DatabaseGrantsService.aplicarTetoDaOrg`.
3. **Read-side** `pipe-authz.ts` — `resolverPoderNoPipe` rebaixa o Convidado a `ler`;
   `exigirRevisarSubmissoesPublicas` nega a capacidade a GUEST; `computeAcessoNaoAdmin` (acesso por-Card)
   rebaixa a contribuição do `PipeGrant` do Convidado. Fail-closed sobre dado legado/concorrente.
4. **Reconciliação** `MembershipRoleService.alterarPapel` — ao rebaixar para GUEST, **RECUSA** (409
   `PIPE_GRANT_INCOMPATIVEL`) enquanto houver `PipeGrant` ativo acima do teto; não rebaixa em silêncio;
   anti-TOCTOU (relê os grants dentro da tx). Difere do auto-revogar de `DatabaseGrant` (8.4) por decisão de
   Produto distinta e explícita (item 7 do decision doc).

## Fronteira do escopo (o que NÃO foi feito, e por quê)
- **CardGrant não recebe teto.** A decisão escopa o teto ao `PipeGrant`. `CardGrant` (2.10) é concessão DIRETA
  por-Card e explícita; a Story 8.4 já registrou que PipeGrant/CardGrant não têm teto de Org na Fase 1. Só o
  `PipeGrant` é fechado aqui; o `CardGrant` fica intocado (AD-11 — não inventar regra sem consumidor).

## APENAS_FORMULÁRIO_INICIAL — modo futuro NÃO MATERIALIZADO (AD-11)
A decisão (item 3) admite os modos restritivos **já previstos** para o Convidado: VISÃO_RESTRITA
(`restritoAoProprio`, existente) e APENAS_FORMULÁRIO_INICIAL. Busca no schema/serviço
(`APENAS_FORMULARIO`/`somenteFormulario`/`formularioInicial`/`initialFormOnly`) **não** encontra nenhum campo/
modificador/coluna que materialize APENAS_FORMULÁRIO_INICIAL. Portanto, **não** foi inventado (AD-11): o teto do
Convidado permanece `VIEWER` (+ `restritoAoProprio`). A PROVA 5 (permitir esse modo) **não se aplica** por
ausência do campo — sem teste de campo inexistente. Quando o modo for materializado por sua Story, permiti-lo ao
Convidado é uma extensão aditiva de `violacaoTetoConvidado`.
