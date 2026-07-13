# observability-check — Story 2.1 (ciclo de vida e catálogo de Pipes)

## Logs estruturados
Pino (via `nestjs-pino`), configuração global do `AppModule` — sem log ad-hoc, sem `console.log`. Redaction
de `authorization`/`cookie`/`set-cookie` já vale para as rotas novas; os probes seguem silenciados.

## Trilha de auditoria (FR-214)
`Pipe` foi adicionado a `MODELOS_AUDITADOS` (`kernel/db/tenant-context.ts`). Consequência: **toda mutação**
de Pipe emite evento estruturado com os seis campos do contrato — **ator** (`accountId`), **Organização**
(`orgId`), **ação** (operação), **recurso** (modelo + id), **resultado** e **timestamp** explícito.

Cobre criar, renomear, alternar `locked`/`starred`, arquivar e restaurar. **Leitura não é auditada** — por
decisão: auditar `SELECT` afogaria a trilha em ruído e esconderia justamente o que importa.

## Sucesso e falha das transições — ambos observáveis
- Mutação bem-sucedida → `result: 'allowed'`.
- Mutação **filtrada pela RLS** → `result: 'denied'`. Este é o ponto não óbvio: o `USING` de uma policy
  **não lança erro, ele filtra** — um `updateMany` mirando outra Organização volta `{ count: 0 }` com
  sucesso aparente. Sem essa checagem, a tentativa mais óbvia de vandalismo cross-tenant seria registrada
  como `allowed`. O mecanismo já existia; a 2.1 apenas passou a se beneficiar dele ao entrar na lista de
  auditados.
- Negação de autorização (403) → evento `authz.denied` do guard (Story 1.6), com ação/sujeito/orgId/papel.

## Ausência de falha silenciosa
- 404 e 403 são **explícitos**, nunca resultado vazio disfarçado de sucesso.
- `PATCH` sem nenhum campo conhecido é **400**, não um no-op silencioso que responderia 200 sem ter feito
  nada — o cliente saberia que "deu certo" sem ter mudado coisa alguma.
- `requestContext.obter()` **lança** sem contexto: não há caminho que rode "sem Org" e devolva vazio.
- Erro de banco propaga (não é engolido); a resposta ao cliente permanece sanitizada.

## Erros de banco observáveis
Violação de policy (INSERT/UPDATE fora de contexto) levanta exceção do PostgreSQL, que sobe pelo Prisma e é
logada pelo tratamento existente. Erro de conexão continua refletido em `/ready` (503) — a sonda lê uma
tabela do schema, provando conexão + migrations + GRANT.

## Sem dado sensível nos logs
A trilha carrega **identificadores internos** (`accountId`, `orgId`, id do Pipe) e **não** conteúdo: sem
e-mail, sem nome de pessoa, sem corpo de requisição, sem segredo, sem token. O `name` do Pipe **não** é
emitido na trilha.

## Ressalva registrada (R-1) — falso positivo de auditoria
Arquivar um Pipe **já arquivado** (ou restaurar um já ativo) é operação **legítima e idempotente**, mas o
`updateMany` casa zero linhas e a trilha classifica isso como `result: 'denied'`.

É ruído de auditoria, **não** falha funcional nem de segurança: o mecanismo prefere o falso positivo (custa
uma linha de log) ao falso negativo (custa uma tentativa de acesso cruzado invisível) — o troco está
documentado no próprio `tenant-context.ts`. Fica registrado **aqui** para que ninguém, investigando um
incidente, leia essa linha como ataque. Endereçá-lo exigiria distinguir "no-op idempotente" de "filtrado
pela RLS" no motor de auditoria — mudança no kernel, fora do escopo congelado da 2.1.

## Métricas / tracing
Sem novidade: a 2.1 não introduz instrumentação nova, e nenhuma foi pedida. O que existe (logs
estruturados + `/health`/`/ready`) segue valendo para as rotas novas.

## Veredito

**APROVADO COM RESSALVA.** Observabilidade adequada e estendida corretamente à nova entidade. Ressalva
**R-1** registrada e rastreada em `specs/2-1-.../analyze.md` — não bloqueante.
