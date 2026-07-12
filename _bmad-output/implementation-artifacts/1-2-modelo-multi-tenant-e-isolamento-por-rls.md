# Story 1.2: Modelo multi-tenant e isolamento por RLS

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

**As a** plataforma multi-inquilino,
**I want** Account/Membership e RLS deny-by-default no banco,
**so that** nenhum dado organizacional cruze Organizações.

## Rastreabilidade

- **ID:** 1.2 · **Épico:** 1 — Fundação e Conta (proprietário) · **Story key:** `1-2-modelo-multi-tenant-e-isolamento-por-rls`
- **Objetivo:** materializar o invariante-mãe do produto (isolamento por Organização) na camada de dados, com RLS do PostgreSQL como reforço obrigatório e não contornável.
- **Valor entregue:** a partir daqui, **nenhuma** Story seguinte pode acidentalmente vazar dado entre Organizações — o banco nega por padrão, mesmo que a aplicação erre.
- **FRs:** nenhum FR de Produto (Story de fundação). **NFRs:** NFR-3 (isolamento entre Organizações).
- **ADs (invariantes que a Story materializa):** AD-6 (isolamento multi-tenant — o invariante-mãe), AD-7 (Account global + Membership por Organização, Forma B), AD-10 (propriedade de dados), AD-11 (referência por ID estável + integridade dupla de tenant). Correlatos: AD-17 (migrations), AD-33 (backup/recuperação), AD-32 (deploy/migration como etapa controlada). [Source: ARCHITECTURE-SPINE.md#AD-6, #AD-7, #AD-10, #AD-11, #AD-17, #AD-33]
- **Invariantes:** **INV-ADMIN-01** — Super Admin (Plataforma) ≠ Admin da Organização; aplica-se simetricamente: a Plataforma **não** concede acesso implícito a dados de Organização.
- **Dependências:** Story 1.1 (`done`) — monorepo, containers, config fail-fast, observabilidade.
- **Gates aplicáveis:** `context7-check`, `pre-implementation-check`, `security-check`, `lgpd-check`, **`migration-check`** (primeira migration do projeto), **`backup-check`** (primeira persistência), `observability-check`. `migration-check` e `backup-check` deixam de ser N/A **nesta Story**.
- **Contratos produzidos:** esquema de identidade e tenancy; contrato de contexto de Organização no banco (`app.current_org_id`, `app.current_account_id`); papéis de banco; procedimento de migration/rollback. Consumido por 1.3 (propagação), 1.4–1.6 (login, sessão, autorização) e por todos os Épicos seguintes.
- **Contratos consumidos:** kernel de configuração (`apps/api/src/kernel/config/env.ts`) da Story 1.1.

## Fora do escopo desta Story

- **Login, sessão e resolução da Organização ativa** → Story 1.4/1.5.
- **Propagação do contexto** para jobs, filas, eventos, cache, WebSocket → Story 1.3 (AD-8).
- **CASL / autorização efetiva** → Story 1.6 (AD-9).
- **Gestão de membros** (convite, troca de papel, suspensão, remoção) → Épico 8.
- Qualquer entidade de domínio (Pipe, Card, Database, Registro, Formulário). **Criar apenas as entidades necessárias ao isolamento** — entidade de domínio especulativa é proibida (Constitution II).

## Acceptance Criteria

1. **Given** dados de duas Organizações **When** opero no contexto da Org A em leitura **Then** recursos da Org B **nunca** aparecem.
2. **Given** o contexto da Org A **When** executo criação, atualização e arquivamento/remoção lógica **Then** cada operação afeta **somente** dados da Org A (reforçado por RLS).
3. **Given** um `orgId` forjado **When** usado numa operação **Then** não permite alcançar dados de outra Organização.
4. **Given** o papel de banco da aplicação **Then** ele **não** possui `BYPASSRLS`, **não** é proprietário das tabelas, e **sem contexto de Organização o acesso é negado**.

## Tasks / Subtasks

- [x] **T1 — Baseline técnica e gates pré-código (AC: 1,2,3,4)**
  - [x] `context7-check`: fixar versões de PostgreSQL, Prisma e driver, e confirmar a API atual de Client Extensions (a documentação do Prisma muda entre majors — **não** decidir de memória).
  - [x] `pre-implementation-check`: produzir relatório com status GO / GO WITH CONDITIONS / NO-GO.
  - [x] Registrar decisão sobre `packages/` (ver **Risco CR2-09** abaixo).

- [x] **T2 — Infraestrutura de banco no Compose (AC: 4)**
  - [x] Serviço `db` (PostgreSQL) no `docker-compose.yml`, com healthcheck e volume nomeado.
  - [x] Variáveis de ambiente validadas no kernel de config (fail-fast, sanitizado — padrão da Story 1.1): URL do papel de aplicação e URL do papel de migration, **separadas**.
  - [x] `.env.example` atualizado, sem valor sensível real.

- [x] **T3 — Papéis de banco e privilégios (AC: 4)**
  - [x] Papel **`giraffe_migrator`**: dono do schema, executa migrations. **Nunca** usado em requisição.
  - [x] Papel **`giraffe_app`**: usado pela aplicação em runtime. **SEM** `BYPASSRLS`, **SEM** `SUPERUSER`, **não proprietário** das tabelas (proprietário faz bypass implícito de RLS — por isso `FORCE ROW LEVEL SECURITY` é obrigatório, mas não basta).
  - [x] `GRANT` mínimo a `giraffe_app` (SELECT/INSERT/UPDATE/DELETE nas tabelas do domínio; sem DDL).
  - [x] Teste automatizado que **prova** que `giraffe_app` não tem `BYPASSRLS` nem `SUPERUSER` (consulta a `pg_roles`).

- [x] **T4 — Modelo de dados (AC: 1,2,3)**
  - [x] `Account` — identidade **global** da Plataforma (AD-7/AD-10). **Sem `orgId`.** E-mail único global.
  - [x] `Organization` — a raiz do tenant.
  - [x] `Membership` — vínculo `Account × Organization`, com **papel único** (enum) e **estado** (enum). Unicidade `(accountId, orgId)`.
  - [x] `orgId` **NOT NULL** em toda tabela organizacional; FK para `Organization`.
  - [x] Índices: todo acesso organizacional começa por `orgId` — índice composto com `orgId` como **primeira** coluna.
  - [x] IDs estáveis (UUID), nunca sequenciais expostos (AD-11).

- [x] **T5 — Contexto de tenant no banco (AC: 1,2,3,4)**
  - [x] Contrato: `app.current_org_id` e `app.current_account_id`, definidos com `set_config(..., true)` — **transaction-local**, nunca global no pool (AD-6).
  - [x] Extensão do Prisma Client que injeta o contexto **dentro da mesma transação** da query.
  - [x] Sem contexto → `current_setting('app.current_org_id', true)` retorna `NULL` → toda policy avalia falso → **acesso negado** (deny-by-default).
  - [x] **Proibido:** qualquer policy, flag ou caminho de bypass (`app.bypass_rls` ou equivalente). Ver **Armadilha 1**.

- [x] **T6 — Políticas RLS por operação (AC: 1,2,3,4)**
  - [x] `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela organizacional.
  - [x] Policy com **`USING`** (SELECT/UPDATE/DELETE) **e `WITH CHECK`** (INSERT/UPDATE). Ver **Armadilha 2** — `USING` sozinho **não** protege INSERT.
  - [x] Policies explícitas por operação: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
  - [x] `Account`: **sem RLS** (identidade global, propriedade da Plataforma — AD-10). Justificar no código.
  - [x] `Membership`: ver **Armadilha 3** (leitura das próprias Memberships antes de haver contexto de Org).

- [x] **T7 — Migrations e seed (AC: 2,4)**
  - [x] Migration versionada, executada pelo papel `giraffe_migrator` como **etapa controlada** — **nunca** por cada container no boot (AD-17/AD-32).
  - [x] SQL de RLS (policies, `FORCE`, `GRANT`, papéis) versionado **na migration**, não aplicado à mão.
  - [x] Plano de **rollback** da migration, verificável.
  - [x] Seed de desenvolvimento com **duas Organizações** distintas e Accounts/Memberships em cada — é a fixture dos testes de isolamento. Sem dado real de produção (LGPD).
  - [x] `migration-check` e `backup-check` executados e registrados (deixam de ser N/A).

- [x] **T8 — Testes de isolamento, positivos e negativos (AC: 1,2,3,4)**
  - [x] **Positivo:** no contexto da Org A, leitura/criação/atualização/arquivamento de dados da Org A funcionam.
  - [x] **Negativo — leitura cruzada:** no contexto da Org A, `SELECT` não retorna **nenhuma** linha da Org B.
  - [x] **Negativo — escrita cruzada:** no contexto da Org A, `INSERT` com `orgId` da Org B é **rejeitado** (prova o `WITH CHECK`).
  - [x] **Negativo — `UPDATE` cruzado:** no contexto da Org A, `UPDATE` em linha da Org B afeta **0 linhas**.
  - [x] **Negativo — `DELETE`/arquivamento cruzado:** idem, **0 linhas**.
  - [x] **Negativo — `orgId` forjado:** contexto Org A + payload com `orgId` da Org B → não alcança dado da Org B (AC3).
  - [x] **Negativo — sem contexto:** nenhuma transação sem `app.current_org_id` lê ou escreve qualquer linha organizacional (AC4).
  - [x] **Negativo — privilégio:** `giraffe_app` sem `BYPASSRLS`/`SUPERUSER`; não é dono das tabelas.
  - [x] Testes rodam contra **PostgreSQL real** (RLS não existe em mock nem em SQLite) e entram em `pnpm test`.

- [x] **T9 — Observabilidade e auditoria mínima (AC: 4)**
  - [x] Log estruturado inclui a Organização do contexto (AD-29), **sem** dado pessoal desnecessário.
  - [x] Negação por ausência/invalidez de contexto é **visível** no log (não falha silenciosa).
  - [x] Auditoria mínima: criação de Organization/Membership e mudança de papel/estado registram ator, Organização, ação, recurso, resultado e timestamp.
  - [x] `observability-check`, `security-check`, `lgpd-check` executados e registrados.

- [x] **T10 — Container e boot real de produção (AC: 4) — trata CR2-09**
  - [x] `prisma generate` no build da imagem da API; client gerado + binários de engine presentes na imagem final.
  - [x] **Teste real de boot** do container de produção (não só build): a API sobe, conecta ao banco com o papel `giraffe_app` e `/ready` reflete a dependência do banco.
  - [x] `/ready` deixa de ser equivalente a `/health`: passa a checar o banco (é a **primeira dependência externa**; contrato preservado, sem breaking change — previsto na Story 1.1). **Dois caminhos testados:** apto → `200 {status:"ok"}`; banco indisponível → **`503`**. `/health` (liveness) **não** checa o banco. Nenhum detalhe do erro do banco no payload. Ver **Armadilha 5**.
  - [x] Compose: `api` `depends_on` o `db` com `condition: service_healthy`.
  - [x] Migration como **etapa controlada e separada** — não roda no entrypoint de cada container (AD-32).
  - [x] Se — e somente se — a solução introduzir dependência interna de workspace (`packages/`), **resolver o CR2-09 nesta Story**, não adiar de novo.

## Dev Notes

### Armadilhas conhecidas — leia antes de escrever qualquer linha

Estas três já custaram vazamento de tenant em projetos reais. Duas delas **estão no exemplo oficial da documentação do Prisma** — copiar o exemplo sem pensar produz um sistema inseguro.

**Armadilha 1 — a policy de bypass do exemplo oficial.**
A documentação do Prisma sobre RLS ([Client Extensions](https://www.prisma.io/blog/client-extensions-preview-8t3w27xkrxxn)) mostra uma `bypass_rls_policy` e uma função `bypassRLS()`. **Não adote.** O AD-6 é explícito: o papel da aplicação **não tem `BYPASSRLS` nem depende de proprietário**. Uma flag de bypass alcançável em runtime é exatamente a porta dos fundos que esta Story existe para fechar — e, uma vez que exista, alguém vai usá-la "só nesse caso".

**Armadilha 2 — `USING` não protege `INSERT`.**
O exemplo oficial cria as policies só com `USING`. Em PostgreSQL, `USING` filtra linhas **existentes** (SELECT/UPDATE/DELETE); é o **`WITH CHECK`** que valida linhas **novas ou modificadas** (INSERT/UPDATE). Sem `WITH CHECK`, um `INSERT` com `orgId` de outra Organização **é aceito** — a linha entra no banco, ainda que depois fique invisível. Isso quebra o AC2 e o AC3 silenciosamente. **Toda policy de escrita precisa de `WITH CHECK`.**

**Armadilha 3 — a Membership antes de haver contexto (crítica, afeta a Story 1.4).**
Se `Membership` for protegida apenas por `orgId = current_setting('app.current_org_id')`, então o login — que precisa responder *"a quais Organizações esta conta pertence?"* **antes** de existir qualquer contexto de Organização — retorna **zero linhas**. O isolamento quebraria o próprio login.
**Resolução adotada:** a policy de `SELECT` de `Membership` é
`orgId = current_org OR accountId = current_account`.
Uma conta sempre enxerga as **próprias** Memberships (não vaza nada: são dela), e o deny-by-default continua íntegro — **sem nenhum** dos dois contextos, ambos os lados são `NULL` e o acesso é negado. As policies de **escrita** (`INSERT`/`UPDATE`/`DELETE`) permanecem restritas a `orgId = current_org`: ninguém cria nem altera Membership fora do contexto da Organização.

**Armadilha 4 — proprietário da tabela ignora RLS.**
No PostgreSQL, o **dono** da tabela contorna RLS por padrão. Por isso são obrigatórios, juntos: (a) `FORCE ROW LEVEL SECURITY`, e (b) papel de aplicação **que não seja o dono**. Fazer só (a) ou só (b) deixa o furo aberto.

**Armadilha 5 — regressão nos testes e no smoke da Story 1.1.**
`/ready` hoje devolve **sempre** `200 {status:"ok"}`, e existem três coisas que dependem disso: o teste de integração HTTP (`apps/api/test/health.test.ts`, que afirma `status===200` **e** `Object.keys(body)===['status']`), o `HEALTHCHECK` do container da API, e o `scripts/smoke.mjs` (que exige `status === "ok"`). Ao fazer `/ready` refletir o banco, **os três quebram quando o banco não estiver no ar** — e é para quebrarem mesmo, essa é a intenção. O que **não** pode acontecer é o dev "consertar" isso afrouxando a asserção. Regras: o contrato de payload continua `{status:"ok"}` **sem campos extras** (AC2 da Story 1.1 — nada de expor host, versão ou erro do banco); o caminho de indisponibilidade responde **503**, não 200 com corpo diferente; os testes passam a cobrir **os dois** caminhos (apto → 200; banco indisponível → 503). `/health` (liveness) **não** checa o banco — continua respondendo enquanto o processo viver.

**Armadilha 6 — contexto vazando entre requisições no pool.**
`set_config('app.current_org_id', X, false)` (global) persiste na **conexão**, e a conexão volta ao pool — a próxima requisição, de outra Organização, herda o contexto. **Sempre `true`** (transaction-local), e o contexto é definido **dentro da mesma transação** da query.

### Modelo de dados (proposta a validar no Spec Kit Plan)

- **`Account`** (global, Plataforma — AD-10): `id` (uuid), `email` (único **global**), `name`, timestamps. **Sem `orgId`. Sem RLS.**
- **`Organization`** (raiz do tenant): `id` (uuid), `name`, `slug`, timestamps. RLS: `id = current_org`.
- **`Membership`** (organizacional): `id` (uuid), `accountId` → Account, `orgId` → Organization, `role` (enum, **papel único** — AD-7), `state` (enum), timestamps. Único `(accountId, orgId)`. RLS conforme Armadilha 3.

**Papéis (`role`) — vêm do NFR-4 canônico, não são inventados:** `ADMIN` (Admin da Organização) · `MEMBER` (Membro) · `GUEST` (Convidado). Papel **único** por Membership (AD-7; epics.md §Épico 8). Super Admin **não** é papel de Membership — é papel de Plataforma, e **não** concede acesso a dados de Organização (INV-ADMIN-01, FR-34).

**Estados (`state`) — vêm do Épico 8 (suspensão/remoção/reativação):** `ACTIVE` · `SUSPENDED` · `REMOVED`. O `REMOVED` **é** a remoção lógica exigida pelo AC2 — não criar `deletedAt` paralelo, que duplicaria a fonte de verdade do estado (AD-14).

`Membership` é a tabela organizacional que os testes de isolamento exercitam — **não** é necessário inventar entidade de domínio para provar o RLS, e inventá-la violaria a Constitution II.

### Bootstrap: quem cria a primeira Organização?

Tensão real: toda escrita organizacional exige contexto de Organização, mas criar a **primeira** Organização acontece **antes** de existir contexto.

**Resolução para esta Story:** o papel `giraffe_app` **não pode** criar `Organization`. Nesta Story, Organizações e Memberships nascem pelo **seed/migration** (papel `giraffe_migrator`), que é o que alimenta as fixtures de isolamento. O **fluxo real de provisionamento** (signup → cria Org → cria a Membership de `ADMIN` do fundador) é um **contrato explícito entregue à Story 1.4**, que é a dona de login/identidade.

Isto é uma fronteira, não uma omissão: resolver o provisionamento aqui exigiria decidir signup, que é escopo declarado da 1.4. **Registrar em `Dev Agent Record` ao concluir**, para a 1.4 consumir.

### Contrato de contexto

| Chave | Origem | Escopo | Ausente ⇒ |
|---|---|---|---|
| `app.current_org_id` | servidor (Membership ativa), **nunca** do cliente (AD-7) | transação | acesso negado |
| `app.current_account_id` | sessão autenticada no servidor | transação | acesso negado |

### Testing standards

- Testes de RLS **exigem PostgreSQL real**. Mock, SQLite ou repositório fake **não** exercitam policy — um teste verde contra mock é uma mentira sobre isolamento (Constitution X).
- Todo teste negativo deve afirmar **negação**, não ausência de erro: `0 linhas`, exceção, ou `INSERT` rejeitado.
- Mínimo **duas Organizações** em toda fixture de isolamento.
- Padrão da Story 1.1: testes em `apps/api/test/`, cobertos por `pnpm typecheck` (`tsconfig.json` inclui `src` **e** `test`) e por `pnpm test`.

### Aprendizados da Story 1.1 (aplicar)

- **Fail-fast de configuração** já existe (`kernel/config/env.ts`, Zod, mensagem sanitizada sem valores). As novas variáveis de banco entram nesse mesmo mecanismo — não criar um segundo caminho de config.
- **Typecheck cobre testes** (`tsconfig.json` inclui `test/`; `tsconfig.build.json` exclui de `dist`). Manter.
- **Logs sanitizados** com `redact` e probes silenciados (`autoLogging.ignore`). String de conexão de banco **nunca** pode aparecer em log ou erro — ela contém senha.
- **`/ready` foi desenhado para isto:** hoje é equivalente a `/health` por não haver dependência externa; esta Story traz a primeira. Refletir o banco em `/ready` **sem** quebrar o contrato `{status:"ok"}`.
- **Gate de commit:** `skills/commit-check.md` existe e é obrigatório antes de qualquer commit.

### Risco técnico herdado — CR2-09 (obrigatório tratar)

Registrado no Code Review da Story 1.1 como **gate da Story que introduzir o primeiro pacote compartilhado**:

> O runtime do `apps/api/Dockerfile` copia `/repo/node_modules` e `/repo/apps/api/node_modules` assumindo que `@giraffe/api` **não tem dependência interna de workspace**. Se surgir um `packages/`, o pacote interno vira symlink para `/repo/packages/<nome>`, que o estágio de runtime **nunca copia** → a imagem builda sem erro e **crasha no boot com `MODULE_NOT_FOUND`**.

**Decisão para esta Story:** manter o Prisma **dentro de `apps/api`** (schema, client e migrations), **sem** criar `packages/`. Com isso o CR2-09 permanece dormente — mas a Story **não** pode encerrar sem:

1. o `prisma generate` rodando no build da imagem;
2. o client gerado **e os binários de engine** presentes na imagem final;
3. **teste real de boot do container de produção** conectando ao banco — build verde não prova boot (foi exatamente a lição do F2/F8 da Story 1.1).

Se, durante a implementação, a solução exigir um pacote compartilhado, o CR2-09 **deve ser resolvido nesta Story** — não adiado de novo.

### References

- [Source: ARCHITECTURE-SPINE.md#AD-6] — isolamento; `FORCE ROW LEVEL SECURITY`; sem `BYPASSRLS`; contexto **dentro da transação** via `set_config(...,true)`; papéis de banco separados.
- [Source: ARCHITECTURE-SPINE.md#AD-7] — Account global; Membership (papel + estado); `activeOrganizationId` é contexto, **nunca autorização suficiente**; nunca confiar no `orgId` do frontend.
- [Source: ARCHITECTURE-SPINE.md#AD-10] — Organização é dona do dado operacional; Plataforma é dona de Conta/Identidade/Sessão.
- [Source: ARCHITECTURE-SPINE.md#AD-11] — referência por ID estável; integridade referencial **+ de tenant**; unicidade org-scoped.
- [Source: ARCHITECTURE-SPINE.md#AD-17] — migration com estratégia de rollback/recuperação e **validação de isolamento por Organização**; etapa controlada.
- [Source: ARCHITECTURE-SPINE.md#AD-33] — backup/restore isolados, sem mistura entre Organizações; backup concluído **não** comprova recuperabilidade.
- [Source: epics.md#Story-1.2] — escopo, rastreabilidade, demonstração vertical.
- [Source: .specify/memory/constitution.md] — Princípios II (sem antecipar escopo), IV (deny-by-default), V (distinções invariantes), X (testes com evidência real).
- [Source: Prisma — Client Extensions & RLS] — padrão de `set_config` em transação; **atenção às Armadilhas 1 e 2**: o exemplo oficial traz policy de bypass e policies sem `WITH CHECK`.

## Questões da análise — resolvidas pelos artefatos

Nenhuma exigiu decisão nova de Produto. Todas foram fechadas pelos artefatos aprovados:

1. **Papéis de Membership** → `ADMIN`/`MEMBER`/`GUEST`, do **NFR-4 canônico** ("papel efetivo: Admin da Org / Membro / Convidado"). O `OQ-1..4`, que segue **aberto**, é a matriz de permissões de **Pipe/Card** — não os papéis de Membership, e **não** bloqueia esta Story.
2. **Estados de Membership** → `ACTIVE`/`SUSPENDED`/`REMOVED`, do Épico 8 ("suspensão/remoção/reativação"). `REMOVED` **é** a remoção lógica do AC2; sem `deletedAt` paralelo.
3. **`Account` sem RLS e e-mail único global** → AD-7 + AD-10: Account é identidade **global** da Plataforma; `orgId` fica em Membership, **nunca** na conta global. Logo o e-mail é único **globalmente**.
4. **Bootstrap da primeira Organização** → resolvido como fronteira (ver "Bootstrap" nas Dev Notes): nesta Story, seed via `giraffe_migrator`; o fluxo real de provisionamento é contrato entregue à **Story 1.4**.

## Decisão de Produto ainda aberta (NÃO bloqueia esta Story)

- **`OQ-1..4` — matriz de permissões e papéis de Pipe/Card:** aberta, é insumo da **Story 1.6** (CASL / autorização efetiva). Esta Story entrega apenas o **papel de Membership** (NFR-4), que é pré-requisito daquela matriz, não consequência dela. Não presumir, não antecipar (Constitution II).

## A fixar no `context7-check` (versão-dependente, não decidir de memória)

- Versão do **PostgreSQL** (RLS, `FORCE ROW LEVEL SECURITY`, `set_config`).
- Versão do **Prisma** — há major recente, e a API de **Client Extensions** (usada para injetar o contexto na transação) muda entre majors. A documentação consultada mostra o padrão `$transaction([$executeRaw set_config, query])`; confirmar que continua sendo a forma corrente na versão fixada.
- Estratégia de **PostgreSQL real nos testes** (container do Compose vs. Testcontainers). Testcontainers seria **dependência nova** → exige aprovação explícita no `pre-implementation-check`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

**Achados de teste de mutação (as policies foram atacadas de propósito, para verificar se a
suíte reagia):**

1. **`WITH CHECK` protegido apenas por acidente.** Com a policy de INSERT enfraquecida para
   `WITH CHECK (true)`, o teste de inserção cruzada **continuou verde**. Motivo: o `create`
   do Prisma emite `INSERT ... RETURNING`, e o `RETURNING` esbarra na policy de **SELECT** —
   não no `WITH CHECK`. Um `INSERT` sem `RETURNING` teria gravado a linha na outra
   Organização. Confirmado materialmente: a mutação deixou a conta Ana com Membership dentro
   da Org B. Corrigido com testes via `createMany` (INSERT puro), que hoje reprovam a
   mutação. Sem isso, a Story teria entregue uma prova de isolamento falsa.
2. **Vazamento de contexto pelo pool.** Trocar `set_config(..., true)` por `false` faz o
   contexto grudar na conexão devolvida ao pool. Dois testes reprovam a mutação — inclusive
   o de "sem contexto", que passa a **enxergar dados alheios**.

**Outros:**

- `pnpm prune --prod` é no-op num workspace pnpm: o store `.pnpm` continua guardando as
  devDependencies (medido: 465 MB). Resolvido com `output` explícito do Prisma Client e um
  stage `prod-deps` novo — imagem final em 222 MB, com o engine nativo Linux.
- `scripts/db-migrate.mjs` falhava silenciosamente: o Node se recusa a executar `.cmd` sem
  shell (correção do CVE-2024-27980). Passou a invocar o entrypoint JS do Prisma com o
  próprio Node.
- Testes rodam em paralelo por arquivo: dois arquivos criando o mesmo `(accountId, orgId)`
  colidiam na constraint única — falha sem relação com RLS, que mascarava o teste. Cada
  arquivo ganhou fixture própria (conta `Dani`).
- `pnpm typecheck` reprovou `import.meta` em `test/setup-env.ts` (o alvo da API é CommonJS) —
  exatamente o valor do CR2-01, que trouxe os testes para dentro do typecheck.

### Completion Notes List

- **Isolamento imposto pelo banco, não pela aplicação.** `Organization` e `Membership` com
  `ENABLE` + `FORCE ROW LEVEL SECURITY`; 8 policies com `USING`/`WITH CHECK` separados por
  operação. `Account` global e sem RLS (AD-10).
- **Nenhum caminho de bypass.** O exemplo oficial do Prisma sugere uma `bypass_rls_policy` —
  proibida pelo AD-6 e **não** implementada. `giraffe_app`: `NOSUPERUSER`, `NOBYPASSRLS`, não
  proprietário. Verificado por teste contra `pg_roles`.
- **Contexto transaction-local** (`set_config(..., true)`), o que fecha o vazamento clássico
  de RLS com pool de conexões.
- **Falha fechada.** Contexto ausente ⇒ nenhuma linha; contexto inválido (não-UUID) ⇒
  negação, e **não** erro 500 — `current_org_id()` captura a exceção de cast e devolve NULL.
- **Descoberta segura das próprias Organizações** (pré-requisito da Story 1.4): o SELECT de
  `Membership` também libera `accountId = current_account_id()`, sem expor memberships
  alheias.
- **Rollback exercitado**, não descrito: aplicar → reverter (0 tabelas, 0 funções) →
  reaplicar → re-seed, com estado final idêntico.
- **Backup com restore verificado** (AD-33): dump restaurado num banco novo preservou dados,
  as 8 policies e o `FORCE RLS`; o isolamento continua valendo no banco restaurado e a
  escrita cruzada segue negada.
- **`/ready` passa a checar o banco** (200/503). `/health` não checa — com o banco fora o
  processo segue vivo, e reiniciá-lo não resolveria. O `HEALTHCHECK` do container usa
  `/ready`; verificado em container real que ele **vira `unhealthy`** com o banco parado.
- **Auditoria (FR-214)** como evento estruturado com os seis campos, incluindo tentativas
  **negadas**. Não foi criada tabela de auditoria: nem Spec nem Plan a pedem, e ela exigiria
  policies próprias — escopo não especificado.
- **CR2-09 permanece não aplicável**: nenhum `packages/` e nenhuma dependência `workspace:`
  foi introduzida.
- **Fora de escopo, deliberadamente**: a matriz de permissões de `ADMIN`/`MEMBER`/`GUEST` não
  é aplicada — é da Story 1.6. Os papéis existem no schema; o isolamento entregue é **entre
  Organizações**, não entre papéis.

### File List

**Novos**

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260712000000_init_tenancy_rls/migration.sql`
- `apps/api/prisma/rollback/20260712000000_init_tenancy_rls.down.sql`
- `apps/api/prisma/seed.sql`
- `apps/api/src/kernel/db/prisma.service.ts`
- `apps/api/src/kernel/db/db.module.ts`
- `apps/api/src/kernel/db/tenant-context.ts`
- `apps/api/src/kernel/db/rls-denial.ts`
- `apps/api/test/rls.test.ts`
- `apps/api/test/rls-observability.test.ts`
- `apps/api/test/setup-env.ts`
- `docker/db/init/01-roles.sh`
- `scripts/db-migrate.mjs`

**Modificados**

- `apps/api/src/kernel/config/env.ts` (`DATABASE_URL` obrigatória e validada)
- `apps/api/src/app.module.ts` (importa `DbModule`)
- `apps/api/src/health/health.controller.ts` (`/ready` → 503 com banco fora)
- `apps/api/src/health/health.payload.ts`
- `apps/api/test/health.test.ts` (200 e 503, payload sem vazamento)
- `apps/api/test/env.test.ts`
- `apps/api/Dockerfile` (`prisma generate` + `prod-deps`; `HEALTHCHECK` → `/ready`)
- `apps/api/package.json`, `apps/api/vitest.config.ts`
- `docker-compose.yml` (serviço `db`; porta em `127.0.0.1`; senhas via env)
- `scripts/smoke.mjs` (diagnóstico do 503; payload exato)
- `.env.example`, `.gitignore`, `.dockerignore`, `.prettierignore`, `eslint.config.mjs`
- `README.md`

### Change Log

| Data | Mudança |
|---|---|
| 2026-07-12 | Story criada a partir de `epics.md` (Story 1.2), Architecture Spine (AD-6/7/10/11), Constitution e aprendizados da Story 1.1. Registradas 5 armadilhas conhecidas (2 delas presentes no exemplo oficial do Prisma) e o risco herdado CR2-09. Status → ready-for-dev. |
| 2026-07-12 | Implementação das 55 tasks. Isolamento provado contra PostgreSQL real (47 testes na API, 8 na Web, smoke 4/4). Dois bugs de segurança encontrados por teste de mutação e corrigidos (ver Debug Log). Ciclo Docker completo verde com boot real do container de produção. Status → review. |
