# Plan — Story 2.3: Gerenciamento de Fases

> Resolve as 5 Clarifications do `spec.md` com **decisões fechadas** (não só recomendações) e fixa a
> abordagem de implementação. Baseline verificado no código: `apps/api/src/kernel/db/tenant-context.ts`
> (mecanismo de contexto), `apps/api/src/pipes/**` (padrão de serviço/controller/RLS da 2.1/2.2),
> Prisma 6.19.3. Risco CRÍTICO.

## Restrição-mãe do mecanismo (lida no código, não presumida)
`withTenantContext` define o contexto **por operação**, via `prisma.$transaction([set_config, set_config,
query])` — um batch atômico de **uma** query de modelo. Logo:
- **Não há transação multi-statement** com contexto (é recusada por construção). Uma reordenação de N Fases
  seria N operações independentes, **não atômicas em conjunto**.
- **Raw client-level (`$executeRaw`/`$queryRaw`) NÃO passa pela extensão** (o hook é `$allModels`), então
  rodaria **sem** `set_config` → RLS nega (deny-by-default). Portanto **não** se usa `UPDATE ... CASE` em lote
  para reordenar.
- **Consequência de design:** cada movimento de reordenação deve ser um **UPDATE de UMA linha**.

## Decisões (Clarifications resolvidas)

### D1 — Chave de ordenação: **indexação fracionária** (`position` numérico), mover = 1 UPDATE
- Coluna `position` do tipo **`Decimal`** (Postgres `numeric`, precisão alta) — ordem por `ORDER BY position
  ASC, id ASC` (o `id` é desempate determinístico, à prova de empate raro).
- **Criar / restaurar** = anexa ao **final**: `position = (maior position ACTIVE do Pipe) + 1` (ou `1` se não
  houver Fase ativa). Um SELECT do máximo + um INSERT/UPDATE — cada um sua própria transação com contexto.
- **Mover** (reordenar) = **um único UPDATE** de uma linha: novo `position = (posição do vizinho anterior +
  posição do vizinho seguinte) / 2` no destino. Entre o topo e a 1ª → `primeira/2`; após a última →
  `ultima + 1`. Indexação fracionária **nunca precisa reescrever as outras linhas** → respeita a restrição
  single-row.
- **API de reordenação = mover-um** (não "ordem completa", que exigiria N updates não-atômicos): a rota
  `reorder` recebe **qual Fase** mover e **para onde** (após qual Fase irmã, ou índice-alvo). O servidor lê os
  vizinhos e emite **um** UPDATE. Semântica idempotente e determinística.
- *Exaustão de precisão:* inserções fracionárias repetidas no **mesmo** intervalo poderiam, em teoria,
  esgotar a escala do `Decimal`. Para **Fases** (poucas por Pipe, reordenação rara) é praticamente
  inatingível; a **renormalização** (reescrever posições) fica como débito **DBT-2.3-POSITION-RENORM** (só
  vira necessária sob uso patológico; renormalizar exigiria multi-row, então seria uma operação
  administrativa fora do caminho quente). Registrado, não implementado (Constitution II).

### D2 — Invariante "≥1 Fase ativa": **enforcement no serviço**, sem semear
- `arquivar` bloqueia (**409**) quando a Fase-alvo é a **última ACTIVE** do Pipe (conta ACTIVE == 1 e a alvo é
  ACTIVE). É "não pode arquivar a última Fase ativa" = **SC-233** literal.
- *TOCTOU concorrente:* dois `arquivar` simultâneos poderiam ambos ver count==2 e zerar. Sem `$transaction`,
  essa janela existe (mesma classe do DBT-2.2-MEMBERSHIP-ADVISORY). É **recuperável** (restaurar) e rara →
  débito **DBT-2.3-ULTIMA-FASE-TOCTOU** (responsável: Escritor 2.3; lote: hardening/1.3-transações; critério:
  reconferência atômica quando houver transação com contexto; gate: revisão de código).

### D3 — Semeadura da 1ª Fase ao criar Pipe: **NÃO semear**
- Não altera o `criar` da 2.1 (evita acoplamento e escopo antecipado). Um Pipe recém-criado tem **zero**
  Fases até o Admin criar a primeira; a invariante "≥1 ativa" só morde a partir de quando existe Fase (SC-233
  = "arquivar a última ativa é bloqueado"). Estado transitório "Pipe sem Fases" é válido e documentado.

### D4 — Nomes (inglês, simétrico a `Pipe`/`PipeGrant`)
- Model **`Phase`**; enum **`PhaseState`** (`ACTIVE`|`ARCHIVED`); coluna **`position`** (`Decimal`); módulo
  **`apps/api/src/pipes/phases/`** (Fase é subordinada ao Pipe, como `grants/`). Migration
  `<ts>_phases` (ts > o de `pipe_grants`).

### D5 — Mecanismo do diferencial: **filtro no serviço** (DBT-AUTHZ-01), guard/ability congelados
- Guarda **grossa** de TODAS as rotas de Fase = `@Requer('ler','Pipe')` (qualquer Membership ativa passa o
  tipo). **Não** usar `@Requer('administrar','Pipe')` em gerenciar Fases — essa ability só existe para o Admin
  da Org e barraria o **Admin do Pipe** na porta grossa.
- Guarda **fina** no `PhasesService`, resolvida por concessão:
  - **Ler Fases** (GET): Admin da Org **ou** qualquer `PipeGrant` ACTIVE do principal para o Pipe → 200;
    senão → **404 não-enumerante** (idêntico à 2.2 `obter`).
  - **Gerenciar Fases** (POST/PATCH/reorder/archive/restore): **Admin da Org** (sem concessão) **ou** **Admin
    do Pipe** = `PipeGrant.role == ADMIN` **e** `PipeGrant.state == ACTIVE` **e** `Membership.state ==
    ACTIVE`. MEMBER/VIEWER concedidos → **403** (leem, não gerenciam). Sem acesso nenhum → **404**.
  - Isto **lê `role`** e **reconfere `Membership.state`** → **fecha DBT-2.2-ROLE-DORMENTE** (metade "Admin do
    Pipe administra config") e DBT-2.2-MEMBERSHIP-ADVISORY para esta superfície.
- Um helper de autorização no serviço (`resolverPoderNoPipe(pipeId) → 'gerenciar' | 'ler' | negar(404)`)
  centraliza a decisão; cada rota de gestão exige `'gerenciar'` (senão 403), cada leitura exige ao menos
  `'ler'` (senão 404).

## Modelo de dados (Prisma)
```
enum PhaseState { ACTIVE ARCHIVED }

model Phase {
  id         String     @id @default(uuid()) @db.Uuid
  orgId      String     @db.Uuid
  pipeId     String     @db.Uuid
  name       String
  state      PhaseState @default(ACTIVE)
  position   Decimal    @db.Decimal(38, 18)   // chave fracionária; ORDER BY position, id
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  archivedAt DateTime?
  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  pipe       Pipe         @relation(fields: [pipeId], references: [id], onDelete: Cascade)
  @@index([orgId, pipeId, state, position])
}
```
- FKs referenciam `Organization(id)`/`Pipe(id)` (mesmo padrão da 2.2; a coerência de Org é app+RLS — a FK
  composta é o mesmo débito DBT-2.2-FK-COMPOSTA, herdado, não reintroduzido).
- Relações inversas em `Organization` e `Pipe` (`phases Phase[]`).

## Migration (raw SQL onde o schema não expressa)
- Enum `PhaseState` + tabela `Phase` + índice `(orgId, pipeId, state, position)`.
- **RLS**: `ALTER TABLE "Phase" ENABLE ROW LEVEL SECURITY; ... FORCE ROW LEVEL SECURITY;` + **4 policies**
  `select/insert/update/delete` por `orgId = current_org_id()`, **WITH CHECK no INSERT e no UPDATE**.
- **GRANT** ao runtime `giraffe_app`: `SELECT, INSERT, UPDATE` — **sem DELETE** (arquivar/restaurar/reordenar
  são UPDATE). A policy de DELETE existe por simetria/defesa; o privilégio, não.
- Rollback `<ts>_phases.down.sql`: DROP policies/tabela/enum, **sem tocar** `Pipe`/`PipeGrant`/`Membership`.
- `Phase` entra em `MODELOS_AUDITADOS` (`tenant-context.ts`).

## Serviço / Controller
- `PhasesService` (todas as queries por `withTenantContext`): `listar(pipeId, incluirArquivadas)`,
  `criar(pipeId, name)`, `renomear(pipeId, phaseId, name)`, `mover(pipeId, phaseId, alvo)`,
  `arquivar(pipeId, phaseId)`, `restaurar(pipeId, phaseId)`. Idempotência de arquivar/restaurar como na 2.1
  (caminho idempotente sem `updateMany` de `count:0`, para não sujar a auditoria com falso `denied`).
- `PhasesController` sob `/pipes/:pipeId/phases`, todas com `@Requer('ler','Pipe')`; nenhuma aceita `orgId`;
  DTOs validam `name`/`phaseId`/alvo. Registrado no `PipesModule`.
- Reusa o padrão de resolução de Membership/concessão da 2.2 (`membershipIdAtual`) — extrair o comum se
  couber, sem abstração especulativa.

## Testes (PostgreSQL real, Orgs A/B leitura, escrever com cuidado paralelo — `toContain`)
- `phases-rls.test.ts`: isolamento (outra Org não vê; INSERT/SELECT/UPDATE sem contexto negado — **fase
  vermelha**), dono ≠ runtime, **sem DELETE** (`permission denied`). [SC-238]
- `phases-http.test.ts`: criar/renomear na ordem; mover intra-Pipe não afeta outro Pipe; arquivar/restaurar
  reversível (restaura ao final); **bloquear arquivar a última ativa (409)**; RN-030 (sem rota que troca
  `pipeId`); não-enumeração 404. [SC-231/232/233/234/235/237]
- `phases-authz.test.ts` (poder diferencial — **fecha DBT-2.2-ROLE-DORMENTE**): Admin da Org gerencia
  qualquer Pipe; **Admin do Pipe** (grant ADMIN + Membership ACTIVE) gerencia o seu; **MEMBER/VIEWER**
  concedidos leem mas **403** ao gerenciar; **Membership SUSPENDED com grant ADMIN → negado**; sem grant →
  404. Provar a **fase vermelha** do diferencial (papel errado deve falhar). [SC-236]
- `migration-check` (deploy/rollback/reaplicação). [SC-239]

## Gates antes de concluir
`context7-check` (Prisma `Decimal`/numeric; NestJS validation) → `pre-implementation-check` → implementação →
`safe-implementation` → `security-check` + `observability-check` + `lgpd-check` (nome de Fase = rótulo, não
PII) + `migration-check` → revisão independente read-only (Security/Edge Case/Acceptance) → `commit-check`.

## Débitos abertos por este plan
- **DBT-2.3-POSITION-RENORM** (D1) — renormalização de `position` sob exaustão de precisão fracionária.
- **DBT-2.3-ULTIMA-FASE-TOCTOU** (D2) — janela concorrente no enforcement de "≥1 Fase ativa".
- Herda **DBT-2.2-FK-COMPOSTA** (FK não-composta, defesa-em-profundidade).
