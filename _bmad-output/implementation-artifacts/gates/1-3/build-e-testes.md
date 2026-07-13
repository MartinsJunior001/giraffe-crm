# Gates de build e teste — Story 1.3

2026-07-12 · Status: **VERDE**

Todos os comandos abaixo foram executados de verdade, e o código de saída foi lido **sem pipe** —
um `| tail` mascara o exit code do comando anterior, e foi assim que, na Story 1.2, um commit saiu
com o gate de formatação vermelho.

## Resultado

| Gate                            | Comando                          | Exit | Observação |
| ------------------------------- | -------------------------------- | ---- | ---------- |
| Formatação                      | `pnpm format:check`              | 0    | após a correção de EOL — ver [eol-gitattributes.md](./eol-gitattributes.md) |
| Lint                            | `pnpm lint`                      | 0    | 0 erros, 0 avisos |
| Typecheck                       | `pnpm typecheck`                 | 0    | cobre `src` **e** `test` |
| Testes                          | `pnpm test`                      | 0    | **API 95/95**, Web 8/8 |
| Build                           | `pnpm build`                     | 0    | api + web |
| Ciclo Docker (volume novo)      | `docker compose up -d --build`   | 0    | db, api, web → 3× healthy |
| Smoke                           | `pnpm smoke`                     | 0    | 4/4 |

## Testes: 62 → 95

A Story 1.2 entregou 62 testes. A 1.3 acrescenta 33, em três arquivos:

| Arquivo                        | Testes | O que prova |
| ------------------------------ | -----: | ----------- |
| `test/request-context.test.ts` |      8 | o escopo lança fora de requisição, é imutável, não sobrevive e **não vaza entre requisições concorrentes** |
| `test/org-context.test.ts`     |     11 | a Membership ATIVA é a autoridade; `SUSPENDED` não concede; múltiplas Orgs sem escolha ⇒ nega; UUID malformado ⇒ 403, não 500 |
| `test/tenant-context-http.test.ts` | 14 | HTTP real sobre o `AppModule` real: 401 sem principal, probes dispensados, 403 cross-tenant, **30 requisições concorrentes de tenants diferentes** |

Os 62 testes de RLS da Story 1.2 continuam verdes (T027): o isolamento do banco não regrediu.

## Teste de mutação — a suíte foi verificada contra código QUEBRADO

Uma suíte de segurança que passa de primeira ainda não provou nada: falta saber se ela **falha**
quando deveria. Duas mutações foram plantadas no código de produção e revertidas em seguida.

### Mutação 1 — trocar a `AsyncLocalStorage` por estado compartilhado

O vazamento cross-tenant que esta Story existe para impedir.

```
× request-context › não sobrevive ao fim do escopo
× request-context › NÃO vaza entre escopos CONCORRENTES
× request-context › aguenta muitas requisições concorrentes sem trocar nenhum contexto
× tenant-context-http › 30 requisições simultâneas de tenants diferentes
```

4 testes vermelhos — **inclusive através de HTTP real**. O teste de concorrência não é decorativo:
sequencialmente, um contexto vazado quase nunca aparece (cada requisição sobrescreve o resíduo da
anterior antes de lê-lo). Ele aparece sob concorrência — que é o estado normal de um servidor em
produção e o estado raro de uma suíte de testes.

### Mutação 2 — remover o filtro `state: 'ACTIVE'` do resolvedor

```
× org-context › Membership SUSPENDED não concede contexto
× org-context › e a Membership suspensa também não conta como "única Organização"
```

2 testes vermelhos. A dívida da Story 1.2 está de fato paga, e há teste que impede que ela volte.

Após reverter as duas mutações: **95/95 verdes**, código restaurado byte a byte.

## Verificação na imagem de produção

Não bastam os testes: o grafo de DI que vai para a imagem é o que importa. Contra o container:

```
$ curl -o /dev/null -w '%{http_code}' http://localhost:3001/organizations/current
401

$ curl -o /dev/null -w '%{http_code}' -H 'x-org-id: aaaaaaaa-...-aaaa' \
    http://localhost:3001/organizations/current
401

$ curl http://localhost:3001/organizations/current
{"message":"Unauthorized","statusCode":401}
```

Forjar o header `x-org-id` não leva a lugar nenhum, e o corpo não vaza nada sobre o que existe do
outro lado. A costura de teste (`PrincipalDeTeste`) vive em `test/` e **não existe** no bundle de
produção — há teste dedicado que sobe o `AppModule` sem override e verifica que ele nega.
