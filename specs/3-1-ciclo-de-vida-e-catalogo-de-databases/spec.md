# Spec — Story 3.1 (Ciclo de vida e catálogo de Databases)

> Rastreabilidade: FR-18; RN-061/131; D3.4; NFR-3/4; AD-10/AD-11. epics.md §1063-1079 (Story 3.1) e §1049-1061
> (Épico 3). Dep.: 1.6, 1.7. **Fora:** papéis/acesso por Database (3.2); Formulário de Database/schema (3.3);
> Registros e Histórico (3.4); arquivos (3.7/3.8); vínculo Card↔Registro (3.9). **Twin estrutural da Story 2.1.**

## Objetivo

Permitir que o **Administrador da Organização** mantenha um catálogo de **Databases** — bases de dados
estruturadas, **distintas dos processos** (Database ≠ Pipe, RN-061) — com ciclo de vida **criar / renomear /
arquivar / restaurar**. Materializa a **primeira entidade do Épico 3** (`Database`) como dado org-owned, isolado
pelo banco (RLS+FORCE), **sem exclusão definitiva** (GRANT sem DELETE). Arquivar coloca o Database em **modo
somente leitura integral**; restaurar reabilita **sem alterar identidades nem referências**.

## Clarifications

### Session 2026-07-16

- Q: Renomear um Database **arquivado** — permitido ou bloqueado? → A: **Bloqueado (409) — CONFIRMADO pelo dono
  (2026-07-16).** "Somente leitura integral" abrange o próprio metadado do Database; a única escrita permitida
  sobre um Database `ARCHIVED` é `restaurar`. Para renomear um Database arquivado, o fluxo autorizado é
  **restaurar → renomear → arquivar novamente**. (Ver Decisões D1.)
- Q: `Database` tem atributos `locked`/`starred` como `Pipe`? → A: **Não.** A epics da 3.1 não os menciona para
  Database; não inventar (Constitution II). Diverge de `Pipe` deliberadamente.
- Q: O nome do Database é único por Organização? → A: **Não.** O identificador estável é o `id` (AD-11);
  unicidade de nome colidiria no restaurar. RN-131 é sobre "catálogo real", não unicidade.
- Q: A trava "somente leitura integral" sobre Registro/Formulário/Campo/arquivo/vínculo é implementada agora? →
  A: **Não — é contrato futuro.** Essas entidades não existem em 3.1; a regra é consumida por 3.3/3.4/3.7/3.8/
  3.9 checando `Database.state === ACTIVE` (mesmo padrão da 2.1 → 2.11). O consumidor concreto **na 3.1** é
  `renomear` (bloqueado em `ARCHIVED`).

## Requisitos funcionais

- **FR-3.1-1** — Admin da Org **cria** um Database (nome); ele passa a existir no **catálogo real da Org atual**
  (RN-131), **distinto de Pipe** (RN-061).
- **FR-3.1-2** — Admin da Org **renomeia** um Database `ACTIVE`; o novo nome reflete no catálogo. Renomear um
  Database `ARCHIVED` é **bloqueado (409)** (somente-leitura integral — ver Clarifications).
- **FR-3.1-3** — Admin da Org **arquiva** um Database: transição `ACTIVE → ARCHIVED`, **reversível**, **não
  bloqueada** por Registros (inexistentes em 3.1; contrato futuro). O Database sai do catálogo **ativo** e entra
  em **modo somente leitura integral**. Arquivar um já-arquivado é **no-op idempotente (200)**.
- **FR-3.1-4** — Admin da Org **restaura** um Database: transição `ARCHIVED → ACTIVE`, **preservando identidade
  e referências**, reabilitando a escrita. Restaurar um já-ativo é **no-op idempotente (200)**.
- **FR-3.1-5** — **Listar** (`catálogo`) e **obter** um Database retornam apenas recursos da Org atual; um
  Database de outra Org **não** é listado nem revelado (404 não-enumerante em `obter`).
- **FR-3.1-6** — **Sem** exclusão definitiva, duplicação ou transferência entre Organizações; **não-Admin**
  (MEMBER/GUEST) é **negado** em toda operação de Database (deny-by-default) até a 3.2.

## Cenários de aceite (BDD — epics §1069-1074)

- **CA1 (AC1):** Admin cria/renomeia → Database no catálogo real da Org, distinto de Pipe; nunca em outra Org.
- **CA2 (AC2):** Database (mesmo que, no futuro, tenha Registros vinculados a Cards) é arquivado → **não
  bloqueado**; entra em somente-leitura integral (renomear → 409; escritas futuras de 3.3+ negadas por contrato).
- **CA3 (AC2):** Database arquivado + tentativa de renomear (único write-side existente em 3.1) → **bloqueada
  (409)**; dados existentes seguem **consultáveis** conforme permissões atuais.
- **CA4 (AC3):** Database arquivado é restaurado → identidade/nome preservados; escrita reabilitada sem alterar
  identidades/referências.
- **CA5 (AC4):** não há exclusão/duplicação/transferência; MEMBER/GUEST negados; runtime sem GRANT de DELETE.
- **CA6 (AC5):** dois tenants → cada um vê só os próprios Databases; INSERT/SELECT/UPDATE fora do contexto (ou
  com `orgId` alheio) **negado pelo banco** (FORCE RLS + `WITH CHECK`).

## Decisões de design

> A epics marca a 3.1 com **Gates: —**. Os defaults abaixo derivam de epics/Spine/Constitution e do **precedente
> da 2.1** (twin). Apenas **D1** merece confirmação do dono (a epics não nomeou `renomear` na lista de bloqueios).

- **D1 — Renomear em `ARCHIVED` é bloqueado (409). CONFIRMADO pelo dono (2026-07-16).** "Integralmente somente
  leitura" cobre o próprio metadado: um Database `ARCHIVED` não pode ser renomeado. Para renomear, o fluxo é
  **restaurar → renomear → arquivar novamente**. Dá à regra de somente-leitura um consumidor concreto já na 3.1.
  Registrado em Story, spec, testes (`databases-http` CA3) e documentação.
- **D2 — Somente-leitura sobre dados dependentes = contrato futuro (3.3/3.4/3.7/3.8/3.9).** Não é escolha livre:
  AD-11/Constitution II proíbem materializar Registro/Formulário-owner/Campo/arquivo/vínculo só para bloqueá-los.
  Enforced por owner via `Database.state === ACTIVE`. Espelha a 2.1 ("Pipe com Cards ativos" → 2.11).
- **D3 — `Database` distinto de `Pipe` (RN-061).** Tabela, catálogo, subject CASL e módulo **próprios**; nunca
  reutilizar os de `Pipe`. Mesma **forma** de RLS/GRANT/CASL/guard (não a mesma linha).
- **D4 — Sem `locked`/`starred`; sem unicidade de nome.** Não estão na epics da 3.1; `id` é o ref estável
  (AD-11); nome único colidiria no restaurar.
- **D5 — GRANT column-... não se aplica.** `Database` é tabela nova: GRANT de tabela inteira `SELECT/INSERT/
  UPDATE`, **sem DELETE**. (O column-scoped é uma restrição de `Card`/E2; aqui todas as colunas de `Database`
  são escrevíveis pelo runtime, exceto que **não há DELETE**.)
- **D6 — `authz.guard.ts` não é tocado.** Herda o escopo `{ id, orgId }` para sujeitos de domínio, generalizado
  na 2.1. Se a implementação constatar necessidade, declarar desvio e escalar.

## Escopo

- **Migration `_databases`:** enum `DatabaseState` (`ACTIVE`/`ARCHIVED`), tabela `Database` (`id`, `orgId`,
  `name`, `state`, `archivedAt`, `createdAt`, `updatedAt`), índice `(orgId, state)`, FK → `Organization`
  (`onDelete: Cascade`), **RLS ENABLE + FORCE**, 4 policies por `current_org_id()` com `WITH CHECK` no
  INSERT+UPDATE, GRANT `SELECT/INSERT/UPDATE` **sem DELETE**. Rollback correspondente.
- **Schema Prisma:** enum + model `Database` + relação `Organization.databases`.
- **Auditoria:** `Database` em `MODELOS_AUDITADOS` (`tenant-context.ts`).
- **CASL:** sujeito `Database` (`{ id, orgId }`); ADMIN da Org → `ler`/`administrar`; MEMBER/GUEST nada.
- **Núcleo puro `database-lifecycle.ts`:** `planejarArquivamento`/`planejarRestauracao` (idempotência) e
  `assertDatabaseEditavel(state)` (gate de renomear; ponto de extensão para 3.4+). Sem I/O.
- **Módulo `src/databases/`:** service + controller + DTO + módulo, registrado no `AppModule`. **6 rotas** (ver
  `contracts/databases.http.md`), todas com `@Requer`, todas sob `withTenantContext`, **sem exclusão**.
- **Testes (PostgreSQL real):** `databases-rls`, `databases-authz`, `databases-http` (Org C + contas
  descartáveis). SC-206 para a migration.

## Fora de escopo

Papéis/acesso por Database (3.2); Formulário de Database e owner do `FormContext.DATABASE` (3.3 — **não** wire
`Form.databaseId` aqui); Registros e Histórico do Registro (3.4); arquivos/anexos (3.7/3.8); vínculo Card↔Registro
(3.9); avatar (3.10). Exclusão definitiva, duplicação, transferência entre Organizações. UI Web (o consumo visual
do catálogo é do E3/telas específicas; 3.1 entrega a API).

## Invariantes preservados

`Pipe ≠ Database` (entidades/catálogos/subjects separados — RN-061); `Card ≠ Registro` (Registro é 3.4, não
existe aqui); isolamento por Organização pelo banco (RLS+FORCE+WITH CHECK — o `WITH CHECK` do UPDATE barra mover
a linha para outra Org); **sem exclusão definitiva** (GRANT sem DELETE — fronteira de banco, não ausência de
rota); deny-by-default (MEMBER/GUEST negados até 3.2); nenhuma rota aceita `orgId` do cliente; **C3/guard/
`ability.ts` congelados** exceto pela adição do sujeito `Database` (padrão de catálogo, previsto pelo próprio
`ability.ts`); AD-11 (nada materializado só para o futuro — a somente-leitura sobre dados dependentes é contrato).

## Assunções

- Contexto organizacional resolvido no servidor ⇒ Membership ACTIVE (contexto por transação). `orgId` **fora** do
  payload de toda rota.
- Endpoints sob `/databases` (API interna). Consumo visual (Web) é de telas do E3, fora desta Story.
- Dependências 1.6 (autorização/CASL/guard) e 1.7 (casca) `done`; Épico 2 `done` fornece o padrão a replicar.
