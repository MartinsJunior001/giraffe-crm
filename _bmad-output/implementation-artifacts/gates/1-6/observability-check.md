# observability-check — Story 1.6 (substrato de autorização)

## O que esta Story emite
Um único evento novo: **`authz.denied`** (nível `warn`), quando o `AuthzGuard` nega uma ação.

## Verificações

- **Negação é observável, não muda.** Todo 403 de autorização registra `authz.denied` com
  `acao`, `sujeito`, `orgId`, `accountId`, `papel` — um 403 que ninguém consegue contar é um ataque que
  ninguém percebe. Coerente com o padrão já estabelecido no `context.denied` da Story 1.3.
- **Sanitização (NFR-1 / AD-29 / INV-REPORT-01).** O evento **não** carrega PII (e-mail), token, cookie,
  senha, nem id de recurso concreto além do `orgId` (que o principal já conhece). Provado por asserção
  em `authz.test.ts` (o e-mail da conta e termos sensíveis não aparecem no log serializado). O corpo da
  resposta HTTP é o 403 padrão do Nest, sem motivo — não confirma existência de recurso alheio.
- **Sem ruído novo no caminho feliz.** A concessão não loga (só a negação). Nenhuma rota de probe é
  afetada; a supressão de `/health` e `/ready` (Story 1.1) permanece intacta.
- **Redação global preservada.** O `redact` do Pino (`authorization`/`cookie`/`set-cookie`) continua
  ativo; nada nesta Story o contorna.
- **Concessão rastreável quando necessário.** A decisão de autorização ocorre dentro do contexto de
  requisição já correlacionado (req.id do pino-http). Não foi adicionada telemetria de contagem
  agregada (fora de escopo; sem consumidor concreto — Constitution II).

## Veredito
**APROVADO** — negação observável e sanitizada, sem PII/segredo, sem ruído no caminho feliz, redação
global preservada.
