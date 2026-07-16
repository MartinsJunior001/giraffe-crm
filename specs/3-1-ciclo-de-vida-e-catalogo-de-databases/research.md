# Research — Story 3.1 (Ciclo de vida e catálogo de Databases)

> Fase 0. A epics marca a 3.1 com **Gates: —**. As decisões abaixo têm **default justificado** por epics/Spine/
> Constitution e pelo **precedente da Story 2.1** (twin estrutural). Apenas **D1** é confirmada com o dono no
> `clarify` (a epics não nomeou `renomear` na lista de bloqueios sob arquivamento). Nenhuma constitui um
> `NEEDS CLARIFICATION` bloqueante.

## D1 — Renomear um Database `ARCHIVED`

- **Decisão:** **bloqueado → 409**. A única escrita permitida sobre um Database arquivado é `restaurar`.
- **Racional:** o ajuste 1 da epics manda "integralmente em modo somente leitura". Renomear é escrita no metadado
  do próprio Database. Bloquear é a leitura conservadora de "integral" e dá à regra de somente-leitura um
  **consumidor concreto** já na 3.1, sem materializar nada do futuro.
- **A confirmar com o dono:** a lista de AC da epics enumerou bloqueios sobre **dados dependentes** (Registro/
  Formulário/Campo/arquivo/vínculo) e **não** nomeou `renomear`. Alternativa: permitir renomear metadado mesmo
  arquivado. Impacto restrito (não altera o resto do escopo).

## D2 — Somente-leitura integral sobre dados dependentes = contrato futuro

- **Decisão:** **não implementar agora**. Registro (3.4), Formulário de Database (3.3), Campo/arquivo (3.7/3.8) e
  vínculo Card↔Registro (3.9) **não existem** em 3.1. A regra "arquivado bloqueia escrita nesses dados" é
  **contrato** consumido por essas Stories, que checarão `Database.state === ACTIVE` antes de escrever.
- **Racional:** AD-11 ("nenhuma relação é materializada só para preparar o futuro") + Constitution II. Espelha a
  2.1, onde "não arquivar Pipe com Cards ativos" nasceu como contrato futuro enforced pela 2.11.
- **Alternativa rejeitada:** criar tabelas/stubs de Registro/Campo/vínculo para poder bloqueá-los — proibido
  (kernel/README.md, "sem abstração especulativa sem consumidor concreto").
- **Materialização mínima em 3.1:** `Database.state` (fonte de verdade única do eixo somente-leitura) + o
  predicado puro `assertDatabaseEditavel(state)` consumido por `renomear` (consumidor concreto).

## D3 — `Database` é distinto de `Pipe` (RN-061)

- **Decisão:** tabela, catálogo, subject CASL e módulo (`src/databases/`) **próprios**. **Mesma forma** de
  RLS/GRANT/CASL/guard da 2.1, **não** a mesma linha (nunca reutilizar `Pipe`).
- **Racional:** invariante `Pipe ≠ Database` (CLAUDE.md; RN-061; Spine "erosão de fronteiras"). Reuso é de
  **padrão**, não de entidade.

## D4 — Atributos e unicidade

- **Decisão:** campos = `id`, `orgId`, `name`, `state` (`ACTIVE`/`ARCHIVED`), `archivedAt`, `createdAt`,
  `updatedAt`. **Sem `locked`/`starred`. Sem unicidade de nome.**
- **Racional:** a epics da 3.1 não menciona `locked`/`starred` para Database (Constitution II — não inventar; a
  2.1 os tinha por RN/D2.1 próprios do Pipe). `id` é o ref estável (AD-11); nome único org-scoped colidiria no
  **restaurar** (arquiva "X", cria novo "X", restaura o antigo). RN-131 ("catálogo real") ≠ unicidade de nome.

## D5 — GRANT e transições

- **Decisão:** GRANT de tabela `SELECT/INSERT/UPDATE` a `giraffe_app`, **sem DELETE** (fronteira de "sem exclusão
  definitiva"). Transições `archive`/`restore` respondem **200** (`@HttpCode`), criação **201**, renomear **200**.
  Arquivar já-arquivado / restaurar já-ativo = **no-op idempotente 200** (sem emitir `updateMany`, para não gerar
  falso-positivo de auditoria — padrão de `tenant-context.ts`).
- **Racional:** consolidado da 2.1 (defeito real: `archive`/`restore` devolviam 201 por default do `@Post`).
- **Nota (column-scoped):** o GRANT column-scoped é um padrão de `Card` (E2) porque lá há colunas imutáveis em
  runtime. `Database` **não** tem colunas imutáveis pelo runtime (todas as suas colunas de estado/nome são
  escrevíveis via os fluxos); logo, GRANT de tabela inteira, **sem DELETE**. Não há coluna a proteger por escopo.

## D6 — `authz.guard.ts` não é tocado

- **Decisão:** adicionar o sujeito `Database` a `ability.ts`/`ability.factory.ts`; **não** tocar o guard.
- **Racional:** a 2.1 já generalizou o guard para sujeitos de domínio na forma `{ id, orgId }` (desvio D-1 da
  2.1, já integrado e verde). 3.1 herda o comportamento pronto — adicionar um subject é exatamente o caso de
  extensão que o `ability.ts` prevê (C3 consumido, não alterado). Se a implementação constatar necessidade de
  tocar o guard, declarar desvio no `analyze.md` e escalar antes de prosseguir.

## Concorrência e idempotência

- **Decisão:** transições são **updates únicos** idempotentes; caminhos idempotentes (já no estado-alvo) **não**
  emitem `updateMany` (evitam `count: 0` na auditoria). `withTenantContext` recusa `$transaction` — 3.1 **não**
  precisa de transação multi-statement (não há evento/segunda escrita na mesma transação; o Histórico do Registro
  é 3.4). Sem guarda otimista de coluna (não há read-modify-write de JSON aqui).
- **Racional:** operações de 3.1 são atômicas por serem escrita única; a concorrência de "arquivar/renomear ao
  mesmo tempo" resolve por last-write com estado consistente (o gate de `state` do renomear relê o estado sob
  contexto). Sem cenário de lost-update silencioso como o das colunas JSON (2.5).

## Contexto documental (context7-check — a executar antes de codificar)

Confirmar, contra as versões **instaladas** (`package.json`/lockfile):
- **Prisma 6.19.3** — DDL via migration SQL crua (enum + tabela + RLS + GRANT), `create`/`update`/`findMany`/
  `updateMany` (retorno `{ count }`), mapeamento de enum, `@db.Uuid`/`@db.Timestamptz` conforme schema atual.
- **NestJS 11** — `@HttpCode(HttpStatus.OK)`, `ConflictException`/`ForbiddenException`/`NotFoundException`,
  DTO/validação (class-validator) no padrão de `pipes/dto`.
Fonte preferencial: MCP Context7 (`resolve-library-id` → `query-docs`); registrar a fonte se recorrer à doc oficial.

## Saídas da Fase 0

Incógnitas resolvidas por default justificado; apenas **D1** aguarda confirmação do dono (não bloqueia o design).
Pronto para Fase 1 (data-model, contracts, quickstart).
