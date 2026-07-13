# Tasks — Story 1.3 (propagação segura do contexto de Organização)

Ordenadas por dependência. Cada task nomeia o artefato e a prova.

## Phase 1: Gates pré-código

- [x] T001 `context7-check`: API de `AsyncLocalStorage` no Node 24 e de Guards/`APP_GUARD` no NestJS 11 — na versão fixada, não de memória (Constitution III)
- [x] T002 `pre-implementation-check` — registrar GO / GO WITH CONDITIONS / NO-GO

## Phase 2: Contexto de requisição (FR-305, FR-306)

- [x] T003 `kernel/context/request-context.ts` — `AsyncLocalStorage`; `run(ctx, fn)` e `get()`
- [x] T004 `get()` **lança** fora de requisição (FR-306, SC-307) — devolver `undefined` é o que vira "qualquer contexto"
- [x] T005 Teste: contexto **não** sobrevive ao fim do `run()`
- [x] T006 Teste: contexto **não vaza** entre `run()`s sequenciais (SC-308)

## Phase 3: Principal (D1)

- [x] T007 Port `PrincipalProvider` + `SemSessaoPrincipalProvider` (devolve `null`) — a Story 1.4 substitui
- [x] T008 Teste: o provider registrado no `AppModule` **nega** — não existe backdoor de identidade antes da 1.4 (SC-309)

## Phase 4: Resolvedor (FR-301, FR-302, FR-304)

- [x] T009 `OrgContextResolver` — resolve a partir das Memberships **ACTIVE** da conta, via `withAccountContext` (a policy da 1.2 permite exatamente isso)
- [x] T010 `state != ACTIVE` **não** concede contexto (FR-302, SC-304) — paga a dívida que a 1.2 registrou
- [x] T011 Sem `orgId` pedido e **exatamente uma** Membership ACTIVE ⇒ é ela
- [x] T012 Sem `orgId` pedido e **várias** ⇒ **rejeita** (escolher seria decidir pelo usuário — Story 1.9)
- [x] T013 `orgId` pedido que **não** casa com Membership ACTIVE ⇒ **403** (FR-304, SC-303, SC-305). Nunca "corrige em silêncio"
- [x] T014 `orgId` não-UUID ⇒ rejeitado sem estourar erro de driver

## Phase 5: Guard (FR-303, D4)

- [x] T015 `TenantContextGuard` **global** (`APP_GUARD`): resolve, rejeita, abre o `run()` da ALS
- [x] T016 Allowlist **explícita** para `/health` e `/ready` — o default é **exigir** contexto (deny-by-default)
- [x] T017 Sem principal ⇒ **401** com corpo sanitizado (SC-302). Nunca 500, nunca lista vazia fingindo sucesso
- [x] T018 Teste: rota nova **sem** decorator de allowlist já nasce protegida

## Phase 6: Consumidor concreto (D5)

- [x] T019 `GET /organizations/current` — usa o contexto resolvido + a extensão da 1.2 (FR-307)
- [x] T020 Teste HTTP real: 401 sem principal; 200 com Membership ACTIVE; corpo sem PII nem campo extra

## Phase 7: Contrato de propagação (FR-308, AD-8)

- [x] T021 `TenantEnvelope` (`orgId`, `accountId`, `correlationId`) — **tipo apenas**
- [x] T022 Documento do contrato: nenhum trabalho assíncrono é enfileirado sem envelope; nenhum worker executa sem reidratá-lo
- [x] T023 Verificar que **nenhuma** fila/worker/cache foi criado (Constitution II — sem abstração especulativa)

## Phase 8: Testes cross-tenant e concorrência (AC6)

- [x] T024 Contexto resolvido ⇒ query enxerga **apenas** a Org resolvida (SC-301)
- [x] T025 Membership em Org A pedindo Org B ⇒ 403 e **nenhuma** linha de B lida (SC-303)
- [x] T026 **Concorrência real**: N requisições simultâneas de Orgs diferentes ⇒ nenhuma enxerga dado de outra (SC-306). Paralelo de verdade, não sequencial disfarçado
- [x] T027 A suíte de RLS da 1.2 (62 testes) continua verde — sem regressão do isolamento

## Phase 9: Observabilidade e gates (FR-309)

- [x] T028 Log estruturado: resolução bem-sucedida e **rejeição**, sanitizados, com `orgId` e sem PII
- [x] T029 `security-check`, `observability-check` executados **e registrados** em `gates/1-3/`
- [x] T030 Ciclo completo: `install --frozen-lockfile`, `format`, `lint`, `typecheck`, `test`, `build`, Docker, `smoke`
- [x] T031 `code-review` executado (10 findings; 8 corrigidos, 2 em dívida) e `commit-check` antes do commit — CI verde no PR ainda PENDENTE

## Divergências registradas

**D1 — Fixture nova no seed (conta Eva).** Nenhuma conta do seed tinha **duas** Memberships ativas,
e esse é o caso que obriga a escolha explícita de contexto (T012). Bruno não serve: o vínculo dele na
Org B é `SUSPENDED` — e é justamente essa a fixture que prova que vínculo suspenso não concede
contexto (T010). Eva é fixture de **leitura**, não introduz corrida entre arquivos de teste
paralelos, e as contagens afirmadas pela suíte da 1.2 seguem verdadeiras (62 testes continuam
verdes). Registrado em `gates/1-3/migration-check.md`.

**D2 — `.gitattributes` (fora do escopo da Story).** O gate `format:check` estava vermelho em 47
arquivos por quebras de linha (CRLF vindo do checkout, `core.autocrlf=true`, repositório sem
`.gitattributes`). A investigação revelou um defeito bem mais grave, **reproduzido**:
`docker/db/init/01-roles.sh` em CRLF mata o container do banco no boot
(`/bin/bash^M: bad interpreter`), e o CI — que roda em Linux — nunca o reproduziria. Corrigido na
raiz, com `* text=auto eol=lf`. Nenhuma mudança de conteúdo: `git diff HEAD` não registra nenhum dos
127 arquivos normalizados. Registrado em `gates/1-3/eol-gitattributes.md`.

**D3 — `tenant-envelope.ts` removido (a task T021 pedia esse arquivo).** Dois revisores adversariais
independentes apontaram a mesma coisa: o tipo não tinha **nenhum** produtor, consumidor ou teste — um
`grep` retornava só a própria declaração. Uma `interface` TypeScript pura, apagada na compilação,
imposta por nada. As quatro regras do AD-8 que ela enunciava eram prosa em bloco de comentário, e o
primeiro produtor de mensagem não teria incentivo mecânico algum para importá-la.

A Constitution II ("nada de abstração especulativa sem consumidor concreto") e o
`apps/api/src/kernel/README.md` proíbem isso explicitamente — e o próprio arquivo os citava. Aqui a
Constitution tem precedência sobre a task. Quando existir a primeira fila, o tipo nasce **junto com**
a função `enfileirarComContexto()` que o torna obrigatório: aí ele é fronteira, não decoração.

Registro isto como divergência declarada, e não como correção silenciosa, porque alterar requisito em
silêncio é proibido — a T021 foi cumprida e depois desfeita por decisão registrada, não esquecida.

## Correções do Code Review (2026-07-12)

10 findings; 8 corrigidos, 2 registrados como dívida. Detalhe em `gates/1-3/code-review.md`.

- [x] CR-01 (HIGH) Corrida entre arquivos de teste paralelos — contas de escrita dedicadas no seed
- [x] CR-02 (HIGH) Defesa contra `x-org-id` duplicado era código morto (Node junta por vírgula, não faz array)
- [x] CR-03 UUID em maiúsculas negava membro legítimo e fabricava alarme falso
- [x] CR-04 Allowlist na classe dispensaria toda rota futura de `HealthController`
- [x] CR-05 `tenant-envelope.ts` era abstração especulativa (ver D3)
- [x] CR-06 Teste de SQL injection tautológico — substituído por asserção que discrimina
- [x] CR-07 Concorrência não cobria a MESMA conta pedindo Orgs diferentes
- [ ] CR-08 (dívida) `ContextoIndisponivelError` sem `ExceptionFilter` dedicado
- [ ] CR-09 (dívida) `/ready` dispensado do guard e tocando o banco — resolver com rate limiting
