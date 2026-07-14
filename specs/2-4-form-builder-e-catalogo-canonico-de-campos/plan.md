# Plan — Story 2.4: Form Builder e catálogo canônico de Campos

> Resolve as **8 Clarifications** do `spec.md` com **decisões fechadas** (não recomendações) e fixa a
> abordagem de implementação. Baseline verificado no código: `apps/api/src/pipes/phases/*` (serviço/
> controller/RLS/chave fracionária da 2.3), `apps/api/src/kernel/db/tenant-context.ts` (mecanismo de
> contexto), Prisma 6.19.3. API de `Json` do Prisma confirmada no Context7 (`/prisma/web`): tipo `Json`,
> `@default("[]")`, `Prisma.DbNull` para `Json?` nulo, `array_contains` para consulta. Risco CRÍTICO.

## Restrição-mãe do mecanismo (lida no código, não presumida)
`withTenantContext` define o contexto **por operação**, via `prisma.$transaction([set_config, set_config,
query])` — um batch atômico de **uma** operação de modelo. Logo:
- **Não há transação multi-statement** com contexto (é recusada por construção).
- **Raw client-level (`$executeRaw`/`$queryRaw`) NÃO passa pela extensão** → roda **sem** `set_config` → RLS
  nega. Não se usa raw para DML organizacional.
- **Consequência de design:** cada mutação é **de UMA linha** (ou uma única chamada `create`/`update` cujo SQL
  o Prisma emite atomicamente). Isto dirige duas decisões abaixo: **reordenar = 1 UPDATE fracionário** (D3) e
  **opções de Seleção embutidas no Campo** (D4), para que criar um Campo de Seleção seja **um único `create`**
  atômico — e não um `Field` + N `FieldOption` em transações separadas, sujeito a falha parcial.

## Decisões (Clarifications resolvidas)

### D1 — Catálogo de tipos: **enum de código `FieldType`** (global), não tabela por Organização
Conjunto **fechado** de 12 tipos (D3.1), igual para toda Organização — modela-se como enum de código, como
`PipeRole`/`PhaseState`. Identificadores canônicos em inglês:
`TEXT_SHORT | TEXT_LONG | NUMBER | SELECT_SINGLE | SELECT_MULTI | BOOLEAN | DATE | DATETIME | EMAIL | PHONE |
URL | FILE`. O que é dado org-scoped são as **instâncias de Campo**, não o catálogo.

### D2 — `Form`: **tabela única** com `FormContext` + FKs de owner nuláveis; semeadura **lazy**
- Tabela `Form` única. Enum `FormContext = PIPE_INITIAL | PHASE | DATABASE`. Owner por FK nulável: `pipeId`
  (inicial), `phaseId` (Fase). **`databaseId` NÃO é criado nesta Story** — o valor `DATABASE` existe no enum
  como **contrato**, mas a coluna/owner chega no E3 com o seu dono (AD-11: nada materializado só para o
  futuro; não há linha `context=DATABASE` porque não há rota que a crie).
- **CHECK constraint** (raw SQL) casa contexto ↔ owner: `PIPE_INITIAL ⟺ pipeId NOT NULL AND phaseId NULL`;
  `PHASE ⟺ phaseId NOT NULL AND pipeId NULL`. Fecha "linha coerente" no banco, não só na app.
- **Unicidade "um Form por owner+contexto"**: índices únicos **parciais** (raw SQL, o Prisma 6.19.3 não
  expressa unique parcial): `UNIQUE (orgId, pipeId) WHERE context='PIPE_INITIAL'` e `UNIQUE (orgId, phaseId)
  WHERE context='PHASE'`.
- **Semeadura lazy (`getOrCreate` no obter):** o `GET` do Formulário de um contexto cria a linha `Form` na
  primeira leitura se não existir, e retorna. **Não** altera o `criar` de Pipe (2.1) nem de Fase (2.3) — sem
  acoplamento retroativo. O `getOrCreate` é **uma** operação `upsert` (single-statement, compatível com o
  mecanismo); a corrida de duplo-create é barrada pelo índice único parcial (2º perde, relê).
- INV-FORM-01 (não-contaminação entre contextos) cai como **consequência de linhas distintas** + RLS.

### D3 — `Field`: colunas fixas + `typeConfig Json` + `defaultValue Json?`; posição **fracionária**
- `Field`: `id` (uuid, **identidade estável** — AD-12), `orgId`, `formId` (FK `Form`, cascade), `label`,
  `type` (`FieldType`), `help` (nullable), `typeConfig` (`Json @default("{}")` — config específica do tipo),
  `defaultValue` (`Json?`; SQL NULL via `Prisma.DbNull`), `position` (`Decimal @db.Decimal(38,18)`), `state`
  (`FieldState = ACTIVE | ARCHIVED`, default `ACTIVE`), timestamps, `archivedAt` (nullable, usado só na 2.5).
- **Posição** reusa a **chave fracionária da `Phase`**: adicionar = `max(position ativo do Form) + 1` (ou `1`);
  reordenar = **um único UPDATE** com `position` = ponto médio dos vizinhos. Ordem por `position, id`.
- Validação por tipo (formato de `typeConfig`) vive **no serviço** (Zod/DTO manual, como 2.1/2.2/2.3). As
  validações numéricas/limites por tipo são **gate da 2.5** — em 2.4, `typeConfig` carrega o mínimo para
  **montar** e **identificar** o Campo.
- `@@index([orgId, formId, state, position])`.

### D4 — Opções de Seleção: **JSON com UUIDs estáveis** no `typeConfig` (não tabela `FieldOption`)
**Diverge da recomendação do planejador (tabela), com justificativa registrada.** As opções de um Campo
`SELECT_SINGLE`/`SELECT_MULTI` são um array em `typeConfig.options`, cada uma `{ id: uuid, label, position }`
— **identidade estável** por `id` (satisfaz SC-242) que **não** depende do rótulo.
- **Por quê JSON e não tabela:** (a) **atomicidade** — criar um Campo de Seleção com suas opções é **um único
  `field.create`** (as opções viajam no `typeConfig`), enquanto uma tabela `FieldOption` exigiria `Field` + N
  inserts em **transações separadas** (o mecanismo recusa `$transaction`), com risco de Campo meio-criado; (b)
  **Constitution II / AD-11** — o **ciclo de vida** de opções (adicionar/remover/reordenar/arquivar com "só
  remove se nunca usada") é **da 2.5**; criar uma 3ª tabela org-scoped (RLS+FORCE+GRANT, superfície de
  segurança a provar) agora materializaria estrutura cujo consumidor de comportamento ainda não existe.
- **Débito registrado:** **DBT-2.4-OPCOES-JSON** — se a 2.5 exigir integridade referencial da opção a partir
  de valores submetidos (que só existem em 2.7+), avalia-se **normalizar** as opções para tabela **então**,
  com o consumidor concreto em mãos. Registrado, não implementado.
- 2.4 aceita as **opções iniciais** no ato de adicionar um Campo de Seleção; **editar/adicionar/remover/
  reordenar opção individualmente é 2.5**.

### D5 — Fronteira 2.4 × 2.5 (afiada)
- **2.4 entrega:** `getOrCreate`/obter Formulário do contexto; **listar** Campos na ordem; **adicionar** Campo
  (tipo do catálogo, opções iniciais se Seleção, ao final da ordem); **reordenar** Campo (1 UPDATE); o
  **atributo** `state ACTIVE/ARCHIVED` na estrutura.
- **2.5 entrega:** **editar** (rótulo/ajuda/config/valor padrão); **arquivar/restaurar** Campo **com as travas**
  (obrigatório em publicado/requisito de Fase/marco); **mudança de tipo bloqueada**; **ciclo de opções**. As
  **travas de segurança permanecem na 2.5** mesmo que algum arquivar "básico" fosse antecipado — **não é**.
- 2.4 **não** cria rota de editar, arquivar, restaurar nem de opções.

### D6 — Reuso da resolução de poder: **extrair helper compartilhado** em `src/pipes/`
- A resolução "Admin da Org **ou** Admin do Pipe" hoje vive em `PhasesService.resolverPoder`/`exigirGerenciar`.
  **Extrair** para um util/serviço compartilhado em `src/pipes/` (regra de domínio de Pipe — **não** vai para
  `kernel`), consumido por Fases **e** Formulários, evitando duas cópias divergentes da guarda fina
  (DBT-AUTHZ-01). **Sem tocar C3** (`ability.ts`/`authz.guard.ts` intocados).
- **Refatoração de `PhasesService`** para consumir o helper extraído é parte desta Story (a suíte da 2.3
  permanece verde — regressão proibida). A extração é **comportamento idêntico**, só realocado.
- **Formulário de Fase** resolve o poder pelo **Pipe dono da Fase** (`phase.pipeId`): carrega a `Phase`
  (não-enumerante 404 se sem acesso), deriva o `pipeId`, resolve o poder no Pipe.

### D7 — Local do módulo: **`src/pipes/forms/`**
Simétrico a `grants/` e `phases/`: o Formulário inicial pertence a um Pipe; o de Fase, a uma Fase do Pipe; a
resolução de poder é **por Pipe**. Um módulo `forms` desacoplado "reutilizável pelo E3" seria **abstração
especulativa** (AD-11) — o **contrato** reutilizado pelo E3 é o **catálogo/estrutura** (enum `FieldType`,
forma do `Field`), independente do local do módulo. Quando o E3 materializar o contexto Database, ele reusa o
catálogo/estrutura e, se preciso, o helper de builder — decisão do E3, com consumidor concreto.

### D8 — Gate do Campo Arquivo (AD-27/AD-28, fail-closed): função + flag, sem rota de publicar
- **Flag de capacidade** `FILE_UPLOAD_ENABLED` no env (Zod, `kernel/config/env.ts`), **default `false`**
  (fail-closed). Enquanto `false`, o tipo `FILE` é aceito no catálogo mas marcado **indisponível** no builder.
- **Função de verificação** pura e **unit-testável** (ex.: `podePublicarComArquivo(fields, { fileUpload })`)
  que **recusa** publicar um Formulário com **Campo `FILE` ativo** enquanto `FILE_UPLOAD_ENABLED=false`. É
  **contrato/seam**: a 2.4 a expõe e testa; a **2.6 a consome** no ato de publicar. **Nenhuma** rota de
  publicar, **nenhum** storage/upload aqui (sem stub).

## Modelo de dados (Prisma)
```
enum FieldType { TEXT_SHORT TEXT_LONG NUMBER SELECT_SINGLE SELECT_MULTI BOOLEAN DATE DATETIME EMAIL PHONE URL FILE }
enum FormContext { PIPE_INITIAL PHASE DATABASE }   // DATABASE é contrato; sem owner/rota em 2.4
enum FieldState { ACTIVE ARCHIVED }

model Form {
  id        String      @id @default(uuid()) @db.Uuid
  orgId     String      @db.Uuid
  context   FormContext
  pipeId    String?     @db.Uuid        // owner do contexto PIPE_INITIAL
  phaseId   String?     @db.Uuid        // owner do contexto PHASE
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  pipe      Pipe?        @relation(fields: [pipeId], references: [id], onDelete: Cascade)
  phase     Phase?       @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  fields    Field[]
  // CHECK contexto↔owner + UNIQUE parciais por owner+contexto = migration raw SQL
}

model Field {
  id           String     @id @default(uuid()) @db.Uuid
  orgId        String     @db.Uuid
  formId       String     @db.Uuid
  label        String
  type         FieldType
  help         String?
  typeConfig   Json       @default("{}")            // inclui options:[{id,label,position}] p/ Seleção
  defaultValue Json?                                 // SQL NULL via Prisma.DbNull
  position     Decimal    @db.Decimal(38, 18)
  state        FieldState @default(ACTIVE)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  archivedAt   DateTime?                             // usado só a partir da 2.5
  org          Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  form         Form         @relation(fields: [formId], references: [id], onDelete: Cascade)
  @@index([orgId, formId, state, position])
}
```
- Relações inversas `forms Form[]` em `Organization`/`Pipe`/`Phase`.
- FKs não-compostas; coerência de Org por app+RLS (herda **DBT-2.2-FK-COMPOSTA**, não reintroduz).

## Migration (raw SQL onde o schema não expressa)
- Enums `FieldType`/`FormContext`/`FieldState`; tabelas `Form` e `Field`; índice `(orgId, formId, state,
  position)`.
- **CHECK** de coerência contexto↔owner em `Form`; **UNIQUE parciais** `(orgId,pipeId) WHERE
  context='PIPE_INITIAL'` e `(orgId,phaseId) WHERE context='PHASE'`.
- **RLS** em `Form` **e** `Field`: `ENABLE` + `FORCE ROW LEVEL SECURITY`; **4 policies** `select/insert/update/
  delete` por `orgId = current_org_id()`, **WITH CHECK no INSERT e no UPDATE**.
- **GRANT** ao `giraffe_app`: `SELECT, INSERT, UPDATE` em `Form` e `Field` — **sem DELETE** (a policy de DELETE
  existe por simetria; o privilégio, não). Teste prova o escopo do GRANT.
- Rollback `<ts>_forms.down.sql`: DROP policies/índices/CHECK/tabelas/enums, **sem tocar** `Pipe`/`Phase`/
  `PipeGrant`/`Membership`.
- `Form` e `Field` entram em `MODELOS_AUDITADOS` (`tenant-context.ts`). **Sem `FieldOption`** (D4).

## Serviço / Controller
- **Helper compartilhado** (D6) em `src/pipes/` (ex.: `pipe-authz.ts` ou serviço `PipeAccessService`):
  `resolverPoder(pipeId) → 'gerenciar' | 'ler' | 404` e `exigirGerenciar`. `PhasesService` passa a consumi-lo
  (refactor comportamentalmente neutro).
- `FormsService` (todas as queries por `withTenantContext`): `obterInicial(pipeId)` e `obterDeFase(pipeId,
  phaseId)` (getOrCreate lazy + `Field[]` na ordem); `adicionarCampo(alvo, dto)` (poder=gerenciar; opções
  iniciais no `typeConfig` se Seleção; `position = max+1`); `reordenarCampo(alvo, phaseId?, fieldId, âncora)`
  (1 UPDATE fracionário). Gate `FILE` exposto como função pura verificável.
- `FormsController` sob `src/pipes/forms/`, rotas: `GET /pipes/:pipeId/forms/initial`;
  `GET /pipes/:pipeId/phases/:phaseId/form`; `POST .../fields` (201); `POST .../fields/reorder` (200). Todas
  `@Requer('ler','Pipe')` (guarda grossa); o serviço aplica a fina. Nenhuma aceita `orgId`; nenhuma de
  exclusão/publicar/editar-Campo. Registrado no `PipesModule`.

## Testes (PostgreSQL real, Orgs A/B leitura, escrever na Org C — `toContain`)
- `forms-rls.test.ts`: isolamento (outra Org não vê `Form`/`Field`); INSERT/SELECT/UPDATE sem contexto negado
  (**fase vermelha**: quebrar policy e confirmar falha); WITH CHECK via `createMany` (sem RETURNING);
  **sem DELETE** (`permission denied`); `relowner` ≠ runtime. [SC-248]
- `forms-http.test.ts`: catálogo (só os 12 tipos; tipo fora → rejeitado) [SC-241]; **identidade estável** do
  Campo e das opções de Seleção (id não depende do rótulo) [SC-242]; **INV-FORM-01** — alterar Campos do
  contexto inicial **não** altera os da Fase e vice-versa (teste comportamental dedicado, RN-054) [SC-243];
  ordenação (adicionar ao final; reordenar intra-Form; determinística); getOrCreate idempotente; contexto
  sempre identificado; não-enumeração 404. [SC-243]
- `forms-authz.test.ts` (reusa/prova a resolução da 2.3): Admin da Org monta qualquer Pipe; **Admin do Pipe**
  (grant ADMIN + Membership ACTIVE) monta o seu, inclusive o Formulário de **Fase** (poder via `phase.pipeId`);
  **MEMBER/VIEWER** concedidos → **403** ao montar, mas leem; **Membership SUSPENDED** com grant ADMIN →
  negado; sem grant → **404**. Fase vermelha do diferencial. [SC-246, SC-247]
- `forms-file-gate.test.ts`: `podePublicarComArquivo` recusa Formulário com `FILE` ativo quando
  `FILE_UPLOAD_ENABLED=false`; aceita sem `FILE`; unit puro, fail-closed. [SC-244]
- **Regressão 2.3**: `phases-authz.test.ts` verde após a extração do helper.
- `migration-check`: deploy cria tabelas+RLS+enums+índices+CHECK+unique parciais; rollback remove sem tocar
  `Pipe`/`Phase`; reaplicação ok. [SC-249]

## Gates antes de concluir
`context7-check` (Prisma `Json`/enum/`Decimal`; NestJS validation) — **Json já verificado acima** →
`pre-implementation-check` (risco CRÍTICO) → implementação → `safe-implementation` → `security-check` +
`observability-check` + `lgpd-check` (definição de Campo = metadado, não PII) + `migration-check` → revisão
adversarial **independente** (não subagente do implementador — lição #17/#20/#22) → `commit-check`.

## Débitos abertos por este plan
- **DBT-2.4-OPCOES-JSON** (D4) — normalizar opções de Seleção para tabela **se/quando** a 2.5/2.7 exigir
  integridade referencial a partir de valores submetidos (consumidor concreto). Hoje: JSON com UUID estável.
- **DBT-2.4-FILE-GATE-CONSUMO** (D8) — a função fail-closed do Campo Arquivo é entregue e testada aqui;
  **aplicada** no ato de publicar pela 2.6.
- Herda **DBT-2.2-FK-COMPOSTA** (FK não-composta, defesa-em-profundidade).
```
