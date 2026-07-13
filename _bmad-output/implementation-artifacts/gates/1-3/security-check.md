# security-check — Story 1.3

2026-07-12 · Status: **APROVADO**

## O risco central desta Story

Ela introduz a peça que **decide a qual Organização o requisitante pertence**. Um erro aqui não
produz um bug: produz acesso cross-tenant com a RLS funcionando perfeitamente — porque a RLS
obedeceria ao contexto que lhe fosse entregue. A superfície de ataque é o caminho entre o header do
cliente e o `set_config('app.current_org_id', ...)`.

## Verificações

| # | Verificação | Resultado |
| - | ----------- | --------- |
| 1 | Deny-by-default: rota nova nasce protegida | ✅ `TenantContextGuard` é `APP_GUARD` (global). A dispensa é uma **allowlist explícita** (`@SemContextoOrganizacional`), hoje só em `HealthController`. Teste cobre que uma rota de domínio sem o decorator é negada. |
| 2 | O `orgId` do cliente **não** é autoridade | ✅ `OrgContextResolver` confere contra as Memberships **ACTIVE**. Divergência ⇒ `ForbiddenException`. Nunca "corrige em silêncio" — corrigir em silêncio ensina o cliente a mandar qualquer coisa e esconde a tentativa. |
| 3 | `MembershipState != ACTIVE` não concede acesso | ✅ Filtro `state: 'ACTIVE'` na consulta. Coberto por teste **e por mutação** (remover o filtro deixa 2 testes vermelhos). Paga a dívida registrada na Story 1.2. |
| 4 | Sem identidade ⇒ **401**, não 403 nem 500 | ✅ 401 diz "não sei quem você é"; 403 diria "sei quem você é e você não pode" — o que seria mentira e ainda confirmaria que a rota existe para alguém autenticado. |
| 5 | Entrada malformada não chega ao banco | ✅ `orgId` é validado contra regex de UUID **antes** da query. `'; DROP TABLE "Membership"; --` ⇒ 403; teste confirma que a tabela continua existindo. Sem isso, `'x'::uuid` estouraria erro de driver ⇒ 500 num caminho de autorização. |
| 6 | Header repetido não é resolvido por escolha | ✅ `x-org-id` duplicado chega como array e é tratado como pedido **inválido**. Escolher "o primeiro" é a assimetria de que vive o request smuggling: o proxy lê um, a aplicação lê outro. |
| 7 | Nenhum backdoor de identidade | ✅ `SemSessaoPrincipalProvider` devolve `null` — **toda** rota de domínio responde 401 até a Story 1.4. Nenhum header de conveniência (`x-account-id`) foi criado: seria um backdoor de produção com nome de andaime, e andaime tem o hábito de sobreviver à obra. |
| 8 | A costura de teste não existe em produção | ✅ `PrincipalDeTeste` vive em `test/`. Teste dedicado sobe o `AppModule` **sem override** e verifica 401 mesmo com o header da costura. Se alguém registrar o provider de teste no `AppModule`, esse teste fica vermelho. |
| 9 | O corpo do 403 não é um oráculo | ✅ O motivo vai para o log; para o cliente vai só a negação. Dizer "você não é membro DESTA Organização" confirmaria, para quem chutou o id, que ela existe. Teste verifica que o corpo não contém `Membership`/`ativa`/`motivo`. |
| 10 | Contexto imutável dentro da requisição | ✅ `definir()` duas vezes lança. Um contexto trocável no meio da requisição é um contexto que um atacante pode trocar no meio da requisição. |
| 11 | Ausência de contexto não é um valor | ✅ `obter()` **lança**; não devolve `undefined`. `undefined` é a porta do bug clássico: alguém "trata" com `??` ou um default, e "sem contexto" vira "qualquer contexto". |
| 12 | Nenhum segredo em log, erro ou payload | ✅ `GET /organizations/current` devolve `{id, name, slug}` — sem PII, sem contagem, sem campo de brinde. Logs seguem a redaction do Pino da Story 1.1. |

## Verificação contra o container de produção

```
sem identidade            → 401
com x-org-id forjado      → 401
corpo                     → {"message":"Unauthorized","statusCode":401}
```

## O que NÃO foi feito, deliberadamente

- **Escolha de Organização quando há várias ativas**: rejeitado com 403, não adivinhado. Escolher
  uma por conta própria seria a plataforma decidindo pelo usuário — e decidindo errado metade das
  vezes, em silêncio, com dados de outro tenant na tela. A troca explícita é da Story 1.9.
- **Autorização por papel** (`role`): é a Story 1.6. Esta Story entrega *identidade + escopo*, não
  permissão. `PERMISSÃO = AÇÃO + ESCOPO`; aqui só o escopo foi resolvido.
