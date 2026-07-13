# observability-check — Story 1.3

2026-07-12 · Status: **APROVADO**

## Eventos introduzidos

| Evento            | Nível  | Campos                                  | Por quê |
| ----------------- | ------ | --------------------------------------- | ------- |
| `context.resolved` | `info` | `accountId`, `orgId`                     | Toda requisição de domínio passa a ter uma Organização atribuída **no servidor**. Sem este evento, não há como auditar, depois do fato, sob qual contexto uma operação rodou. |
| `context.denied`   | `warn` | `accountId`, `orgIdPedido`, `motivo`     | Negação é evento de **segurança**. Um 403 mudo é um 403 que ninguém investiga — e uma tentativa de acesso cross-tenant é exatamente o que se quer conseguir contar. |

`orgIdPedido` é registrado como `null` quando o cliente não pediu nada — a ausência é um fato, e
omitir o campo tornaria o evento ambíguo na consulta.

## Verificações

| # | Verificação | Resultado |
| - | ----------- | --------- |
| 1 | A negação é observável | ✅ Teste captura o evento `context.denied`, confirma nível `warn` e o motivo. |
| 2 | O motivo fica no log e **não** na resposta | ✅ Teste verifica que o corpo do 403 não contém o motivo. O log é para o operador; a resposta é para o cliente, e eles merecem informações diferentes. |
| 3 | Sem PII no log | ✅ Só identificadores opacos (`accountId`, `orgId` — UUIDs). Nenhum e-mail, nome ou header. `Account.email` **não** é registrado. |
| 4 | Sem segredo no log | ✅ Herda a redaction do Pino (`authorization`, `cookie`, `set-cookie`, com `remove: true`) configurada na Story 1.1. Nada novo foi adicionado ao caminho de log. |
| 5 | Log estruturado, não string | ✅ `PinoLogger` com objeto de evento — consultável por `event`, `orgId`, `accountId`. |
| 6 | Probes continuam fora do log | ✅ `autoLogging.ignore` da Story 1.1 segue valendo para `/health` e `/ready`. O guard os dispensa, e eles não geram evento de contexto. |

## O que ainda não existe, e está registrado

`correlationId` está **declarado** no `TenantEnvelope` (o contrato do AD-8), mas ainda não é
propagado — não há fila, worker nem cache nesta Story, e criar um propagador sem consumidor seria
abstração especulativa (Constitution II). O contrato existe para que o primeiro trabalho assíncrono
já nasça obrigado a carregá-lo; o dia em que ele existir, a regra já estará escrita.
