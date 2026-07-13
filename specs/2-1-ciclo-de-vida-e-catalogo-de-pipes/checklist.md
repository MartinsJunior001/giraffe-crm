# Checklist — Story 2.1: Ciclo de vida e catálogo de Pipes

> Cada item marcado tem **evidência de execução real** (Constitution X): arquivo de código, migration,
> teste executado ou gate. Item sem evidência fica desmarcado — "parece implementado" não é evidência.
>
> Execuções que sustentam este checklist (2026-07-13):
> - `pnpm --filter @giraffe/api test` → **253/253** (22 arquivos)
> - `pnpm --filter @giraffe/web test` → **68/68** (14 arquivos)
> - `pnpm typecheck` · `pnpm lint` · `pnpm format:check` → limpos
> - **SC-206** em PostgreSQL descartável (13 passos) → `gates/2-1/migration-check.md`

## Critérios de aceite

- [x] **AC1** — ADMIN cria/renomeia Pipe; aparece no catálogo da Org; nunca em outra Organização.
      `pipes-http.test.ts` ("ADMIN cria e lista Pipe", "renomeia e alterna marcadores");
      `pipes-rls.test.ts` ("cria um Pipe na própria Organização e o enxerga").
- [x] **AC2** — arquivamento reversível preservando dados. `pipes-http.test.ts` ("arquivar tira do
      catálogo ativo e restaurar devolve — sem perder dados"): o nome renomeado sobrevive ao ciclo
      completo `ACTIVE → ARCHIVED → ACTIVE`, e `archivedAt` volta a `null`.
- [x] **AC3** — sem exclusão/duplicação/reordenação; ciclo de vida é do Admin da Org. Não há rota de
      DELETE (`pipes.controller.ts`); o runtime **não tem GRANT DELETE** (`pipes-rls.test.ts` +
      SC-206); MEMBER/GUEST recebem 403 (`pipes-authz.test.ts`, `pipes-http.test.ts`).
- [x] **AC4** — isolamento provado **pelo banco**, não pela aplicação. `pipes-rls.test.ts`: outro tenant
      não enxerga; INSERT com `orgId` alheio barrado pelo `WITH CHECK` (sem RETURNING); UPDATE que
      tentaria mover o Pipe para outra Org barrado; sem contexto, nada é visível e a escrita é negada.

## Limites de escopo (2.2 e 2.3 não antecipadas)

- [x] **Papéis por Pipe (2.2) não antecipados** — em 2.1 só o papel de Organização decide: ADMIN lê e
      administra; MEMBER/GUEST não têm **nenhum** acesso a Pipe (`ability.factory.ts`). Não existe
      tabela, coluna ou rota de papel por Pipe.
- [x] **Fases (2.3) não antecipadas** — nenhuma entidade Fase, nenhuma coluna preparatória.
- [x] **Cards (2.7+/2.11) não materializados** — a trava "bloqueado enquanto houver Cards ativos" é
      contrato futuro; **não** se criou tabela/relação de Card para "preparar" (AD-11, Constitution II).
      Em 2.1 `arquivar` é incondicional — vacuamente correto (não há Cards).
- [x] **Sem exclusão definitiva, duplicação ou reordenação global** — nem rota, nem serviço, nem GRANT.
- [x] **Sem semântica inventada para `locked`** — persistido e alternável; não bloqueia nada em 2.1.

## Modelo de dados

- [x] `Pipe` com `id` (uuid, PK), `orgId` (FK → `Organization`, `onDelete: Cascade`), `name`, `state`,
      `locked`, `starred`, `createdAt`, `updatedAt`, `archivedAt` (nullable). `schema.prisma`.
- [x] Enum `PipeState` (`ACTIVE` | `ARCHIVED`), default `ACTIVE`.
- [x] Índice `(orgId, state)` — todo acesso começa por Organização; o catálogo filtra por estado.
      Confirmado no banco pelo SC-206 (`Pipe_orgId_state_idx`).
- [x] **Sem unique de `name`** (AD-11) — o id é o ref estável; nome único colidiria no restaurar.
- [x] `Organization.pipes` (relação inversa) declarada.

## Ciclo de vida

- [x] `ACTIVE ⇄ ARCHIVED`; **nenhuma** transição para "deletado".
- [x] `arquivar`: `state = ARCHIVED`, `archivedAt = now`. `restaurar`: `state = ACTIVE`,
      `archivedAt = null` (`pipes.service.ts`).
- [x] Ambas **idempotentes**: repetir a operação não é erro e não reescreve `archivedAt`
      (`where` exige o estado de origem). Provado em `pipes-http.test.ts` (arquivar duas vezes → 200).
- [x] Dados preservados em todo o ciclo (o `name` renomeado sobrevive — teste acima).

## Catálogo / listagem

- [x] `GET /pipes` devolve só os `ACTIVE` por padrão; `?arquivados=true` inclui os `ARCHIVED`.
- [x] Ordenação estável (`createdAt asc`) — catálogo consistente (RN-024).
- [x] Listagem é org-scoped **pela RLS**, não por `where orgId` manual no serviço (que poderia ser
      esquecido em uma query futura).

## Autorização (CASL, C3)

- [x] Novo sujeito `Pipe` com forma `{ orgId }` (`ability.ts`) — extensão do **catálogo**, sem alterar
      o mecanismo congelado C3.
- [x] ADMIN → `ler` + `administrar` Pipe, com condition amarrada ao `orgId` **resolvido no servidor**.
- [x] MEMBER/GUEST → nenhuma regra ⇒ negado por ausência (deny-by-default), não por regra de negação.
- [x] Toda rota carrega `@Requer` (`pipes.controller.ts`); nenhuma rota de Pipe sem requisito.
- [x] ADMIN de uma Org **não** alcança Pipe de outra (`pipes-authz.test.ts`) — sem herança cross-tenant.

## Isolamento por Organização / RLS

- [x] `ENABLE ROW LEVEL SECURITY` na tabela `Pipe` — confirmado no banco (SC-206).
- [x] `FORCE ROW LEVEL SECURITY` — confirmado no banco (SC-206). Sem ele, o **dono** da tabela
      escaparia das policies.
- [x] As **4 policies** (`pipe_select`, `pipe_insert`, `pipe_update`, `pipe_delete`) por
      `orgId = current_org_id()`, com `WITH CHECK` no insert **e** no update.
- [x] A tabela **não** pertence ao runtime (dono = `giraffe_migrator`) — verificado em
      `pipes-rls.test.ts` (olhando `relowner`, não só a flag) e no SC-206.
- [x] Nenhum caminho de bypass de RLS alcançável em runtime (AD-6): não há `bypass_rls_policy`, e o
      papel `giraffe_app` é `NOBYPASSRLS`.
- [x] Toda query do serviço passa por `withTenantContext` (contexto por transação, `set_config(..., true)`).

## Ausência de acesso cross-tenant

- [x] Leitura cruzada: outro tenant lista e **não vê** o Pipe (`pipes-rls.test.ts`, SC-206).
- [x] Escrita cruzada: INSERT com `orgId` de outra Org é **negado** pelo `WITH CHECK` — o teste usa
      `createMany` (**sem RETURNING**), porque com RETURNING o erro viria da policy de SELECT e o teste
      passaria pelo motivo errado.
- [x] "Movimentação" cruzada: UPDATE que trocaria o `orgId` da linha é negado (`WITH CHECK` do update).
- [x] Sem contexto: nada é visível e a escrita é negada (fase vermelha, `pipes-rls.test.ts` + SC-206).
- [x] Não-enumeração: buscar por id um Pipe de outra Org devolve **404 sanitizado**, indistinguível de
      "não existe" (`pipes-http.test.ts`).

## Inexistência de exclusão definitiva

- [x] Nenhuma rota de DELETE no controller.
- [x] Nenhum método de exclusão no serviço.
- [x] **GRANT do runtime = `SELECT, INSERT, UPDATE`** — sem DELETE. É a fronteira real: mesmo que uma
      rota fosse adicionada por engano, o banco recusa. Provado em `pipes-rls.test.ts` e no SC-206
      (`permission denied for table "Pipe"`).

## Migration e rollback

- [x] Migration versionada `20260713120000_pipes/migration.sql` (enum, tabela, índice, FK, RLS, GRANT).
- [x] Rollback `prisma/rollback/20260713120000_pipes.down.sql` (DROP policies → DROP table → DROP type).
- [x] **SC-206 executado em PostgreSQL descartável** (13 passos, todos verdes): deploy → verificação de
      RLS/policies/GRANT → smoke de isolamento → rollback → verificação de remoção **cirúrgica**
      (`Organization`/`Membership`/`Account` intactas) → reaplicação → smoke. Evidência completa em
      `gates/2-1/migration-check.md`.
- [x] O rollback remove também a linha de `_prisma_migrations` (o `db-migrate.mjs` cuida disso) — sem
      isso, o `deploy` seguinte diria "nada pendente" com o banco sem a tabela.
- [x] Migration **não destrutiva** para dados existentes (AD-17): só cria objetos novos.
- [x] Migration aplicada como etapa controlada (`db:migrate`), nunca no boot do container.

## Observabilidade

- [x] `Pipe` adicionado a `MODELOS_AUDITADOS` (`tenant-context.ts`) — toda **mutação** de Pipe entra na
      trilha de auditoria (FR-214: ator, Organização, ação, recurso, resultado, timestamp).
- [x] Tentativa **negada**/filtrada pela RLS também é auditada (`result: 'denied'`) — auditar só o
      sucesso deixaria de fora exatamente o acesso cruzado que se quer detectar.
- [x] Logs estruturados (Pino), sanitizados; sem segredo, token ou header de auth.
- [x] Sem falha silenciosa: 404 e 403 são explícitos; erro de banco propaga.
- [ ] **Ressalva registrada (não bloqueante):** arquivar/restaurar um Pipe que já está no estado-alvo é
      idempotente e produz `count: 0`, que a trilha classifica como `denied`. É falso positivo de
      auditoria, não falha funcional — ver `analyze.md` (risco residual R-1).

## LGPD

- [x] Nome de Pipe é **rótulo de processo**, não dado pessoal — nenhuma PII nova é introduzida.
- [x] `Pipe` não tem coluna de dado pessoal (sem e-mail, nome de pessoa, documento).
- [x] Logs não carregam conteúdo sensível; `orgId`/`accountId` são identificadores internos, já usados
      pela trilha administrativa existente.
- [x] Isolamento por Organização é a própria fronteira de proteção do dado do cliente.
- [x] Retenção proporcional: arquivar **preserva** (é o requisito); não há coleta nova a reter.

## Testes

- [x] **HTTP** (`pipes-http.test.ts`, integração real): 401 sem principal; 403 para MEMBER; 201 ao
      criar; 200 ao listar/renomear/arquivar/restaurar; 404 cross-tenant; 400 sanitizado para entrada
      inválida (sem `name`, id malformado, PATCH vazio).
- [x] **Autorização negativa** (`pipes-authz.test.ts`): MEMBER e GUEST negados em `ler` **e**
      `administrar`; ADMIN concedido; ADMIN não alcança outra Org.
- [x] **RLS** (`pipes-rls.test.ts`, PostgreSQL real): papel sem BYPASSRLS; ENABLE+FORCE; dono ≠ runtime;
      isolamento; `WITH CHECK` no insert e no update; contexto ausente falha fechado; sem DELETE.
- [x] Escrita nos testes é feita na **Org C** (área de escrita), preservando as fixtures de leitura
      A/B — os arquivos rodam em paralelo.
- [x] Nenhum teste foi enfraquecido para passar. Um defeito real foi **encontrado** pela suíte e
      corrigido (ver `analyze.md`, seção "Defeito corrigido").

## Compatibilidade com os contratos congelados C1–C8

- [x] **C3 (authz)** — consumido, não alterado: adicionar sujeito é a extensão prevista pelo próprio
      substrato. O `AuthzGuard` passou a popular `{ id, orgId }` no escopo, mantendo o caminho de
      `Organizacao` idêntico (`{ id }`) — ver `analyze.md` (D-1) para a justificativa dessa mudança.
- [x] **C4 (RLS)** — consumido: `Pipe` replica exatamente o padrão de `Membership`.
- [x] **C6 (casca)** — intocado: 2.1 não tem superfície de frontend.
- [x] C1/C2/C5/C7/C8 — não tocados. Suíte completa da API e da Web verde ⇒ sem regressão.

## Documentação

- [x] `CLAUDE.md` atualizado: o bloco de estado deixou de afirmar que "não existem Pipes" e passou a
      descrever o estado real após a 2.1 (sem antecipar Fases/Cards).
- [x] Arquivo BMAD da Story: tasks marcadas com referência a código/teste/gate; defeito registrado.
- [x] `sprint-status.yaml` atualizado pelo fluxo da Story.
- [x] Spec Kit completo: `spec.md`, `plan.md`, `tasks.md`, `checklist.md`, `analyze.md`.
- [x] Gates registrados em `gates/2-1/`.

## Prontidão para code-review

- [x] Suíte completa verde (API 253/253, Web 68/68), typecheck, lint e format limpos.
- [x] `git diff --check` limpo.
- [x] Tooling local fora do escopo **não** entra no commit (`.git/info/exclude`) — ver `analyze.md`.
- [x] Gates executados e registrados: `context7-check`, `pre-implementation-check`, `security-check`,
      `lgpd-check`, `migration-check` (SC-206), `backup-check`, `observability-check`,
      `performance-check`, `safe-implementation`, `code-review`.
- [ ] `commit-check` — executado no momento do commit (último gate, por definição).
- [ ] Revisão adversarial **independente** (humana/segundo revisor) — é o propósito da entrega ao
      revisor; não pode ser auto-atestada por quem implementou.
