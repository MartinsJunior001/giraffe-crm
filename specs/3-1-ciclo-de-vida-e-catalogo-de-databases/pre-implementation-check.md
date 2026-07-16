# Pre-Implementation Check Report

> Story 3.1 — Ciclo de vida e catálogo de Databases. Executado em 2026-07-16, sobre a branch
> `story/3-1-ciclo-de-vida-e-catalogo-de-databases` (base `origin/main` = merge do PR #69).

## Identificacao da tarefa

Story 3.1 (`3-1-ciclo-de-vida-e-catalogo-de-databases`), **primeira Story do Épico 3**. Rastreabilidade:
FR-18; RN-061/131; D3.4; NFR-3/4; AD-10/AD-11; epics.md §1063-1079. **Twin estrutural da Story 2.1** (Pipe).

## Fase e etapa atual

**Fase 1**, Épico 3, etapa "Implementação" — precedida por BMAD (Story criada) e Spec Kit
(`specify → clarify → plan → checklist → tasks → analyze`), commit `7365ce9`. O Épico 2 está `done`
(18/18), o que libera o E3. A tarefa **não antecipa Fase 2**: não há IA, automação, API pública nem
integração externa. Dependências 1.6 (CASL/guard) e 1.7 (casca) `done`.

## Objetivo

Permitir que o **Administrador da Organização** mantenha um catálogo de Databases (bases estruturadas,
**distintas dos processos** — RN-061) com ciclo de vida **criar / renomear / arquivar / restaurar**.
Arquivar coloca em **somente-leitura integral**; restaurar reabilita **preservando identidade e
referências**. Sem exclusão definitiva.

## Escopo incluido

- Migration `20260716120000_databases`: enum `DatabaseState`, tabela `Database`, índice `(orgId, state)`,
  FK → `Organization` (Cascade), **RLS ENABLE + FORCE**, 4 policies por `current_org_id()` com
  `WITH CHECK` no INSERT **e** UPDATE, `GRANT SELECT, INSERT, UPDATE` — **sem DELETE**. Rollback `.down.sql`.
- Schema Prisma: enum + model `Database` + relação `Organization.databases`.
- `Database` em `MODELOS_AUDITADOS` (`tenant-context.ts`).
- CASL: sujeito `Database` (`{ id, orgId }`); **ADMIN** → `ler`/`administrar`; MEMBER/GUEST → nada.
- Núcleo puro `database-lifecycle.ts` (`planejarArquivamento`/`planejarRestauracao`/`podeEditarDatabase`).
- Módulo `src/databases/` (service + controller + DTO + module), 6 rotas, registrado no `AppModule`.
- Testes contra PostgreSQL real: `databases-rls`, `database-lifecycle` (puro), `databases-http`.

## Fora do escopo

Papéis/acesso por Database (3.2); Formulário de Database e owner do `FormContext.DATABASE` (3.3 — **não**
wire `Form.databaseId` aqui); Registros e Histórico do Registro (3.4); arquivos/anexos (3.7/3.8); vínculo
Card↔Registro (3.9); avatar (3.10). Exclusão definitiva, duplicação, transferência entre Organizações.
UI Web. A trava de somente-leitura sobre **dados dependentes** é **contrato futuro** (AD-11): essas
entidades não existem em 3.1.

## Documentacao consultada

- `epics.md` §1049-1061 (Épico 3) e §1063-1079 (Story 3.1); PRD (FR-18, RN-061/131, D3.4).
- `.specify/memory/constitution.md` (II — sem antecipar escopo; X — evidência antes de conclusão).
- `ARCHITECTURE-SPINE.md`: AD-6 (sem bypass de RLS), AD-10 (dado org-owned), AD-11 (nada sem consumidor).
- `CLAUDE.md` — padrão de RLS/GRANT/`withTenantContext` consolidado no Épico 2.
- **context7-check (obrigatório, Constitution):** Prisma **6.19.x** via MCP Context7
  (`/prisma/prisma/__branch__6.19.x`) — confirmadas as anotações nativas `@db.Uuid` e `@db.Timestamptz`
  para PostgreSQL e o comportamento de enum (`ALTER TYPE ... ADD VALUE` só **acrescenta**, não reordena).
  Nenhuma dependência nova é adicionada; a stack não muda.

## Story e criterios de aceite

CA1 (criar/renomear → catálogo real, distinto de Pipe); CA2 (arquivar **não bloqueado** → somente-leitura);
CA3 (**D1** — renomear arquivado → **409**); CA4 (restaurar preserva identidade); CA5 (sem exclusão/
duplicação/transferência; MEMBER/GUEST negados; runtime sem GRANT de DELETE); CA6 (dois tenants isolados
pelo banco). Todos com cenário BDD na spec e teste correspondente.

## Regras de negocio afetadas

- **RN-061 — `Pipe ≠ Database`:** entidade, tabela, catálogo, sujeito CASL e módulo **próprios**. Nunca
  reusar os de `Pipe`. Coberto por teste (criar Database não aparece em `GET /pipes`).
- **RN-131 — catálogo real da Organização:** o Database criado existe no catálogo da Org atual.
- **D1 (confirmada pelo dono em 2026-07-16):** "somente leitura integral" cobre o **próprio metadado** —
  Database `ARCHIVED` **não** pode ser renomeado → **409**; fluxo autorizado = restaurar → renomear →
  arquivar novamente. É o **consumidor concreto** que justifica `podeEditarDatabase` já na 3.1 (AD-11).
- `Card ≠ Registro` preservado: Registro é 3.4 e **não existe** aqui.

## Permissoes afetadas

`PERMISSÃO = AÇÃO + ESCOPO`, deny-by-default:

| Ação | Quem | Escopo |
|------|------|--------|
| ler / criar / renomear / arquivar / restaurar | **ADMIN da Organização** | Databases da **própria** Org (`{ orgId }`) |
| qualquer | MEMBER / GUEST | **negado (403)** — papéis por Database são a **3.2** |
| excluir | **ninguém** | não existe rota **e** o runtime não tem GRANT de DELETE |

Admin da Organização **≠** Super Admin (Plataforma) — não há superfície de Super Admin nesta Story.
Recurso de outra Org → **404 não-enumerante** (Carla é ADMIN, passa o guard, e mesmo assim recebe 404).

## Dados e entidades afetados

- **Entidade nova:** `Database` (`id`, `orgId`, `name`, `state`, `archivedAt`, `createdAt`, `updatedAt`).
  Fonte de verdade do eixo somente-leitura = `Database.state`. `id` é o ref estável (AD-11).
- **Cardinalidade:** `Organization 1—N Database`. FK `onDelete: Cascade`. Sem relação com `Pipe`/`Card`.
- **Isolamento multi-tenant:** RLS ENABLE+FORCE + 4 policies + `WITH CHECK` no INSERT e no UPDATE (barra
  inserir com `orgId` alheio **e** mover a linha para outra Org). Toda query sob `withTenantContext`.
- **Retenção/anonimização:** `name` **não é PII** (rótulo de base, não dado de titular). Sem DELETE —
  arquivar preserva o dado, coerente com a LGPD (o registro do titular só chega em 3.4).
- **Histórico:** a epics da 3.1 **não** pede histórico de Database; não inventar (Constitution II).
- **Migration/rollback:** `.down.sql` correspondente (DROP policies → DROP TABLE → DROP TYPE). Reversível.

## Arquitetura e modulos afetados

Módulo novo `apps/api/src/databases/` (isolado; não toca `pipes/`). Tocados de forma **aditiva**:
`schema.prisma`, `tenant-context.ts` (`MODELOS_AUDITADOS`), `authz/ability.ts` + `ability.factory.ts`
(sujeito novo) e `app.module.ts` (registro). **Guard não é tocado** (D6): herda o escopo `{ id, orgId }`
generalizado na 2.1 — C3 congelado. Nada em `apps/web`. Nenhuma regra de domínio no frontend.

## Dependencias tecnicas

Nenhuma dependência nova. Stack inalterada: NestJS 11, Prisma 6.19.3, PostgreSQL 16, CASL 7, Vitest 4 —
versões fixadas no `pnpm-lock.yaml`. Sem risco de compatibilidade.

## Skills obrigatorias para esta tarefa

| Skill | Obrigatória? | Motivo |
|-------|--------------|--------|
| `context7-check` | **Sim** — executada | Prisma 6.19.x confirmado via MCP (acima) |
| `security-check` | **Sim** | entidade org-scoped nova, RLS/GRANT, autorização nova |
| `migration-check` | **Sim** | migration nova + rollback |
| `observability-check` | **Sim** | conclusão de Story (auditoria via `MODELOS_AUDITADOS`) |
| `lgpd-check` | **Sim** | entidade nova; confirmar que `name` não é PII e que a ausência de DELETE não conflita |
| `backup-check` | Não | sem mudança de estratégia de backup; migration reversível |
| `performance-check` | Não | catálogo por Org com índice `(orgId, state)`; sem N+1, sem paginação exigida (NFR-3/4 folgados) |
| `ai-guardrails-check` / `cost-monitoring-check` | Não | não há IA nesta Story |
| `commit-check` → `commit` | **Sim** | política do projeto |

## Riscos identificados

| # | Risco | Severidade | Tratamento |
|---|-------|------------|------------|
| R1 | Teste de RLS passar **pelo motivo errado** (armadilha já vivida: `create` emite `INSERT ... RETURNING`, que esbarra na policy de SELECT e mascara um `WITH CHECK` ausente) | Alta | Testes de violação usam `createMany`/`updateMany` (**sem RETURNING**) — a violação bate direto no `WITH CHECK` |
| R2 | GRANT de DELETE acrescentado por engano numa migration futura | Alta | Teste que exige `permission denied` no `deleteMany` — fica vermelho se o privilégio vazar |
| R3 | Corrida entre `obter` e `update` no renomear (arquivar concorrente) | Média | `updateMany where state:'ACTIVE'` → `count 0` → **409** (reflete o estado real, sem lost update) |
| R4 | Falso `denied` na auditoria vindo de `count: 0` no caminho idempotente | Baixa | Caminhos idempotentes retornam **sem emitir** `updateMany` (mesmo padrão de Pipe/Fase) |
| R5 | Confundir `Database` com `Pipe` (RN-061) | Média | Tabela/sujeito/módulo próprios + teste explícito de que criar um não cria o outro |
| R6 | Divergência doc↔código no tipo de `archivedAt` | Baixa | **Encontrada e corrigida neste gate** (ver Decisões) |

## Plano minimo de implementacao

Ordem: (1) migration + rollback; (2) schema Prisma + `prisma generate`; (3) `MODELOS_AUDITADOS`;
(4) CASL (sujeito + factory); (5) núcleo puro; (6) DTO → service → controller → module → `AppModule`;
(7) testes. **Não alterar:** `authz.guard.ts`, `ability` de `Pipe`, qualquer módulo do Épico 2,
`apps/web`, `FormContext.DATABASE`/`Form`.

**Critérios de conclusão:** typecheck + lint + format verdes; `databases-rls`, `database-lifecycle` e
`databases-http` verdes contra PostgreSQL real; suíte cheia da API verde em CI **serial**; CA1–CA6 com
evidência de execução real (Constitution X).

## Estrategia de testes

- **`database-lifecycle.test.ts`** — núcleo puro, sem I/O (transições + idempotência + gate D1).
- **`databases-rls.test.ts`** — PostgreSQL **real**, papel `giraffe_app`: papel sem BYPASSRLS; ENABLE+FORCE
  e dono ≠ runtime; caminho positivo; invisibilidade cross-tenant; `WITH CHECK` no INSERT e no UPDATE
  (sem RETURNING); contexto ausente falha fechado; **sem DELETE**.
- **`databases-http.test.ts`** — `AppModule` de produção em porta efêmera, banco real: CA1–CA5, D1 (409 e
  fluxo restaurar→renomear→arquivar), Bruno 403 nas 6 operações, DELETE → 404 de rota, Carla → 404.
- **Isolamento de fixtures:** RLS escreve na **Org C**; HTTP usa Ana/Bruno/Carla **só como leitura** (nenhum
  `membership.create` persistente — a regra de ouro do TEST-ISO-01). `Database` é tabela **nova**: nenhuma
  suíte paralela conta Databases.

## Estrategia de rollback

`apps/api/prisma/rollback/20260716120000_databases.down.sql` — DROP das 4 policies → DROP TABLE
`Database` → DROP TYPE `DatabaseState`. É a migration do **topo da pilha**, então a guarda fail-closed do
`db-migrate.mjs` (que só reverte o topo) a aceita. Reversível sem perda de dado de outra entidade: nada
referencia `Database` ainda (a FK é `Database → Organization`, não o inverso).

## Decisoes pendentes

**Nenhuma.** A única decisão que exigia o dono — **D1** — foi **confirmada em 2026-07-16** (ARCHIVED não
pode ser renomeado; 409; fluxo restaurar → renomear → arquivar) e está registrada em Story, spec, código
(`podeEditarDatabase` + `ConflictException`), testes (`databases-http` CA3 e o teste de fluxo) e contrato HTTP.

**Divergência encontrada e resolvida neste gate:** o `data-model.md` especificava
`archivedAt @db.Timestamptz`, mas a implementação usa `DateTime?` (→ `TIMESTAMP(3)`). Evidência: no schema,
`Timestamptz` é usado **apenas** onde o instante absoluto é carga funcional (`CardPhaseEntry.enteredAt`,
base dos marcos — DIV-1; `MovementEvent.occurredAt`); os **quatro** `archivedAt` (Pipe, Phase, Field,
Database) usam `TIMESTAMP(3)`. Como a 3.1 é twin de `Pipe` (D3), o **código está correto** e a
**documentação foi corrigida** — divergir do twin num carimbo de auditoria seria inconsistência sem
consumidor.

## Status final

**APROVADO**

Justificativa: fase e escopo confirmados; Story especificada com CA testáveis; regras de negócio e
permissões definidas (a única decisão aberta, D1, foi confirmada pelo dono); fonte de verdade e impacto
multi-tenant explícitos; documentação técnica validada via Context7 na versão do projeto; migration
planejada **com** rollback; sem dependência nova, sem antecipação de Fase 2 e sem mudança arquitetural.
A única divergência encontrada (R6) era documental e foi corrigida antes da liberação.

**Ressalva de processo (registrada, não maquiada):** este gate foi executado **após** a implementação, e
**após** ela ter sido integrada pelo **PR #72** (merge `12be667`, 2026-07-16 12:38 UTC) — a Story foi
implementada e mergeada por uma trilha paralela enquanto o gate era executado nesta. Portanto o gate
**não** funcionou como porta de entrada da 3.1: ele é uma **auditoria a posteriori**. Isso é um desvio
real da ordem canônica da Constitution (BMAD → Spec Kit → gate → Implementação) e fica registrado como
tal. O que o mitiga é que a auditoria foi feita linha a linha e **encontrou um defeito** (R6) que o PR
#72 deixou passar — corrigido por este mesmo commit.

## Evidencia de execucao real (Constitution X)

Coletada em 2026-07-16 contra o **código efetivamente mergeado** — verificado por `git diff origin/main`
vazio em `src/databases/`, nas três suítes e na migration: o que foi validado é, byte a byte, o que está
na `main`.

| Gate | Resultado |
|------|-----------|
| `pnpm typecheck` (api + web, cobre `src` **e** `test`) | ✅ verde |
| `pnpm lint` | ✅ verde (`LINT_EXIT=0`) |
| Prettier no escopo da 3.1 | ✅ verde |
| `database-lifecycle.test.ts` (núcleo puro) | ✅ **7/7** |
| `databases-rls.test.ts` (PostgreSQL **real**, papel `giraffe_app`) | ✅ **8/8** |
| `databases-http.test.ts` (AppModule de produção, porta efêmera, banco real) | ✅ **15/15** |
| **Suíte cheia da API em SÉRIE** (`test:ci`) | ✅ **80 arquivos, 667/667** |

**Fase vermelha PROVADA** (a base exige: "um teste pode passar pelo motivo errado"):

1. **`WITH CHECK` do INSERT sabotado** (`ALTER POLICY database_insert ... WITH CHECK (true)`) → 2 testes
   falham com `promise resolved "{ count: 1 }" instead of rejecting`. Confirma que o INSERT cross-tenant
   seria **aceito em silêncio** sem o `WITH CHECK`, e que usar `createMany` (sem RETURNING) é o que faz o
   teste enxergar isso — um `create` esbarraria antes na policy de SELECT e ficaria verde pelo motivo
   errado. Policy restaurada e as duas linhas intrusas (uma delas gravada na **Org A** a partir do
   contexto da Org C) removidas do banco local.
2. **GRANT de DELETE concedido de propósito** (`GRANT DELETE ON "Database" TO giraffe_app`) → o teste de
   "sem exclusão definitiva" falha na hora. Privilégio revogado; efetivos conferidos = `INSERT, SELECT,
   UPDATE`. Prova que um GRANT vazado numa migration futura fica **vermelho**, como o AC4 exige.

**Drill de rollback (migration reversível de fato, não só no arquivo):** ciclo `deploy → rollback →
re-deploy` executado contra o PostgreSQL local. O rollback derrubou a tabela (confirmado em `pg_class`);
o re-deploy reconstruiu `ENABLE`+`FORCE` RLS (`t|t`), as **4 policies** e o GRANT `INSERT,SELECT,UPDATE`
— **sem DELETE**. Suítes verdes de novo após o drill.
