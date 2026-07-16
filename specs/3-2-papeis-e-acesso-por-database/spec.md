# Spec — Story 3.2 (Papéis e acesso por Database)

> Rastreabilidade: FR-18; D3.4 (PRD §966-977); AD-9; NFR-4. epics.md §1081-1097 (Story 3.2) e §1049-1061
> (Épico 3). Dep.: 3.1, 1.6. **Fora:** Formulário de Database/schema (3.3); Registros e Histórico (3.4);
> permissões por Campo (FORA da Fase 1). **Twin estrutural da Story 2.2** (`PipeGrant`), aplicado ao domínio
> distinto de Database (RN-061).

## Objetivo

Abrir o acesso a **Databases** de forma **controlada e explícita**, por **concessão de papel por Database**.
A Story 3.1 deu ao **Admin da Org** o ciclo de vida e o catálogo; MEMBER/GUEST não têm acesso nenhum a Database.
A 3.2 introduz **`DatabaseGrant`** — a concessão que liga uma pessoa (via `Membership`) a um Database com um
papel — e a **autoridade hierárquica** para conceder: o **Admin da Org** concede qualquer papel; o **Admin do
Database** concede só `Membro`/`Somente leitura`; **só o Admin da Org** concede/remove `Admin do Database`.
Cada pessoa passa a acessar **apenas os Databases** em que recebeu papel (deny-by-default; sem papel → 404
não-enumerante). Materializa a **autorização por recurso** sobre `Database`, consumindo o substrato C3 (1.6) e o
padrão de `PipeGrant`/`pipe-authz` (2.2), **sem alterar** o mecanismo C3 (guard/`ability.ts` congelados, salvo a
abertura do `ler Database` grosseiro).

## Clarifications

### Session 2026-07-16

- **Q1 — O Admin do Database pode conceder/alterar/revogar `Admin do Database` (inclusive auto-revogar)?** → A:
  **Não — CONFIRMADO pela fonte autoritativa (PRD D3.4 §969 + epics §1086).** "Admin do Database não concede
  poderes fora do Database" e "**somente Admin da Org concede/remove Admin do Database**" (remove ⊇ revoga). O
  Admin do Database só toca concessões `MEMBER`/`VIEWER`. Tentar conceder/alterar-para/revogar um `ADMIN` do
  Database → **403**. (Ver Decisões D3.)
- **Q2 — Código HTTP quando o teto da Org veda o papel (GUEST recebendo ADMIN/MEMBER do Database).** → A: **400.**
  PRD D3.4 §970: "papel de Database nunca supera o da Organização; Convidado só recebe Somente leitura." O código
  é detalhe de implementação (não fixado no PRD); adota-se **400** (corpo inválido para o alvo), coerente com
  `exigirMembershipAtivaDaOrg` da 2.2 (alvo inválido → 400). (Ver D4.)
- **Q3 — O Admin do Database renomeia/arquiva/restaura o Database?** → A: **Não — CONFIRMADO (PRD D3.4 §966/969).**
  "Ciclo de vida do Database (Admin da Org)"; "Admin do Database **não controla ciclo de vida**". O Admin do
  Database administra **CONFIG** (papéis/3.2; schema/3.3), não o ciclo de vida — espelha `PipeRole.ADMIN`
  (administra config do Pipe, não o ciclo de vida). O ciclo de vida da 3.1 fica **congelado** no Admin da Org.
- **Q4 — O Admin da Org precisa de `DatabaseGrant` para acessar?** → A: **Não — CONFIRMADO (PRD D3.4 §970).**
  "Admin da Org acessa todos." **Nenhuma** linha de grant é criada para o Admin da Org (seria dado redundante e
  enganoso); o acesso dele deriva do papel de Organização, como na 2.1/2.2. (Ver D5.)
- **Q5 (reconciliação) — "Convidado não acessa Database" (PRD §297) vs "Convidado só recebe Somente leitura"
  (§970).** → A: prevalece **§970** (decisão **resolvida** D3.4). §297 cita `permissoes-fase-1.md`, que o próprio
  PRD (§412) marca `PENDENTE DE DECISÃO`; a matriz pendente **não** derruba a decisão resolvida. O **default**
  (sem concessão) é "Convidado não acessa"; **com** concessão, só `VIEWER`. Registrado no `analyze.md`.

## Requisitos funcionais

- **FR-3.2-1 — conceder papel.** O **Admin da Org** concede a uma `Membership` ATIVA da própria Org um papel
  (`ADMIN`/`MEMBER`/`VIEWER`) num Database; o **Admin do Database** concede só `MEMBER`/`VIEWER`. Cria uma
  `DatabaseGrant` ACTIVE. → **201**.
- **FR-3.2-2 — teto da Org (AD-9).** Uma `Membership` `role = GUEST` só pode receber `VIEWER`; conceder/alterar
  para `ADMIN`/`MEMBER` do Database a um GUEST é **bloqueado (400)**.
- **FR-3.2-3 — no máximo um papel efetivo.** Há **no máximo um papel ACTIVE por (Database, pessoa)** (índice
  único parcial `WHERE state='ACTIVE'`); segunda concessão ativa ao mesmo par → **409** (alterar é o PATCH).
- **FR-3.2-4 — alterar papel.** O poder de conceder governa alterar: Admin da Org altera qualquer concessão;
  Admin do Database altera só entre `MEMBER`/`VIEWER` e **não** pode elevar para `ADMIN` nem alterar uma
  concessão `ADMIN` existente (403). → **200**.
- **FR-3.2-5 — revogar corta o acesso.** Revogar é `state = REVOKED` (+ `revokedAt`), **não** DELETE; o acesso
  **cessa imediatamente** (a resolução lê só concessões ACTIVE). Admin do Database só revoga `MEMBER`/`VIEWER`.
  Autoria/Histórico anteriores **preservados**. → **200**.
- **FR-3.2-6 — acesso por concessão (não-enumerante).** Um não-Admin **sem** concessão ACTIVE num Database
  **não** o vê (`listar` não o inclui; `obter`/gerir → **404**). Com concessão, acessa **apenas** aquele
  Database. O Admin da Org acessa **todos** sem concessão.
- **FR-3.2-7 — listar concessões (roster do Database).** Quem gerencia o Database (Admin da Org ou Admin do
  Database) lista as concessões ACTIVE daquele Database. → `Grant[]`.
- **FR-3.2-8 — isolamento.** Toda concessão é org-scoped; nenhuma rota aceita `orgId` do cliente; outra Org não
  vê a concessão (RLS+FORCE+WITH CHECK).

## Cenários de aceite (BDD — epics §1088-1092)

- **CA1 (AC1):** usuário sem papel num Database tenta acessá-lo → **negado sem revelar** (404 não-enumerante,
  nunca 403 que confirmaria a existência).
- **CA2 (AC2):** Admin do Database tenta conceder `Admin do Database` **ou** mexer em Membership da Org →
  **bloqueado (403)**; concede/revoga só `Membro`/`Somente leitura` a Memberships ATIVAS da mesma Org.
- **CA3 (AC3):** Convidado recebe acesso a um Database → **só pode ser Somente leitura** (ADMIN/MEMBER → 400).
- **CA4 (AC4):** papel revogado → acesso **cessa imediatamente**; autoria/Histórico anteriores preservados
  (soft-delete; a linha e a trilha permanecem; runtime sem GRANT de DELETE).
- **CA5 (AC5):** no máximo um papel efetivo por (Database, pessoa) — segunda concessão ativa → 409; papel de
  Database não supera o da Org; permissões por Campo fora da Fase 1.
- **CA6 (AC6):** dois tenants → cada um vê só as próprias concessões; INSERT/SELECT/UPDATE de `DatabaseGrant`
  fora do contexto (ou com `orgId` alheio) **negado pelo banco** (FORCE RLS + `WITH CHECK`).

## Decisões de design

> A epics marca a 3.2 com **Gates: —**. Os defaults abaixo derivam de PRD D3.4/AD-9/Constitution e do
> **precedente da 2.2** (twin). Q1–Q4 foram **resolvidas por fonte autoritativa** (ver Clarifications); nenhuma
> exige nova decisão do dono.

- **D1 — `DatabaseGrant` distinto de `PipeGrant` (RN-061).** Tabela, enums (`DatabaseRole`/`DatabaseGrantState`),
  subject e subdomínio **próprios** (`src/databases/grants/`); nunca reutilizar `PipeGrant`/`PipeRole`. Mesma
  **forma** de RLS/GRANT/índice-parcial/resolução-fina (não a mesma linha).
- **D2 — Autoridade hierárquica de concessão (o coração da 3.2, sem precedente na 2.2).** A 2.2 era
  Admin-da-Org-only em todo grant. A 3.2 abre a concessão ao **Admin do Database** com **teto de papel**,
  resolvido no serviço por `exigirConcederPapel(db, principal, databaseId, roleAlvo)`: Admin da Org → qualquer;
  Admin do Database → só `MEMBER`/`VIEWER` (ADMIN → 403); demais → 403/404.
- **D3 — Só o Admin da Org toca `ADMIN` do Database (Q1).** Conceder, alterar-para/de e revogar um `ADMIN` do
  Database exige `principal.papel === 'ADMIN'` (Org). Admin do Database que tente → 403.
- **D4 — Teto da Org por 400 (Q2/AD-9).** O serviço carrega `Membership.role` do **alvo**; se `GUEST`, só
  `VIEWER`. Papel incompatível com o teto → **400** (corpo inválido para o alvo).
- **D5 — Admin da Org acessa todos sem grant (Q4).** Nenhuma linha de grant para o Admin da Org; o acesso dele é
  do papel de Org (como 2.1/2.2). `resolverPoderNoDatabase` devolve `gerenciar` ao Admin da Org direto.
- **D6 — Abrir `ler Database` grosseiro no CASL; guarda fina no serviço (DBT-AUTHZ-01).** Move-se
  `can('ler','Database',{orgId})` para **qualquer Membership ativa** (como `ler Pipe`), pois MEMBER/GUEST agora
  podem ter acesso a *algum* Database. `administrar Database` **permanece** Admin-da-Org-only (ciclo de vida
  3.1 + conceder `ADMIN` do Database). A checagem fina NÃO é condition do guard (o guard não carrega o recurso);
  `authz.guard.ts` **não** é tocado (C3 congelado). Se a implementação constatar necessidade de tocar o guard,
  declarar desvio no `analyze.md` e escalar.
- **D7 — Revogar é soft-delete, não DELETE.** `state = REVOKED` + `revokedAt`; runtime sem GRANT de DELETE.
  Re-conceder é linha **nova** ACTIVE (a unicidade parcial só vale entre ativas). Sem transição `REVOKED →
  ACTIVE`.
- **D8 — Role dormente: poder diferencial `MEMBER` vs `VIEWER` sobre Registros/schema = contrato futuro
  (3.3/3.4).** Registro/schema não existem em 3.2 (AD-11/Constitution II). Os papéis são **armazenados e
  resolvidos**, mas o poder que separa "edita Registros" (MEMBER) de "só consulta" (VIEWER) fica **inerte** até o
  consumidor concreto. Consumidores concretos **na 3.2**: (a) acesso de leitura ao **catálogo** (`listar`/`obter`
  do Database), (b) **autoridade de concessão** (Admin do Database concede MEMBER/VIEWER). Espelha o "role
  dormente" da 2.2 (SC-222=B → ativado na 2.3/2.7).

## Escopo

- **Migration `_database_grants`:** enums `DatabaseRole` (`ADMIN`/`MEMBER`/`VIEWER`), `DatabaseGrantState`
  (`ACTIVE`/`REVOKED`); tabela `DatabaseGrant` (`id`, `orgId`, `databaseId`, `membershipId`, `role`, `state`,
  `createdAt`, `updatedAt`, `revokedAt`), índices `(orgId, databaseId)` e `(orgId, membershipId)`, FKs →
  `Organization`/`Database`/`Membership` (`onDelete: Cascade`), **RLS ENABLE + FORCE**, 4 policies por
  `current_org_id()` com `WITH CHECK` no INSERT+UPDATE, **índice único parcial** `(databaseId, membershipId)
  WHERE state='ACTIVE'` (raw SQL), GRANT `SELECT/INSERT/UPDATE` **sem DELETE**. Rollback correspondente.
- **Schema Prisma:** 2 enums + model `DatabaseGrant` + back-relations em `Organization`/`Database`/`Membership`.
- **Auditoria:** `DatabaseGrant` em `MODELOS_AUDITADOS` (`tenant-context.ts`).
- **CASL:** abrir `ler Database` grosseiro (qualquer Membership ativa); manter `administrar Database` Admin-only.
- **Resolução fina `src/databases/database-authz.ts`:** `resolverPoderNoDatabase`, `exigirLerDatabase`,
  `exigirGerenciarDatabase`, `exigirConcederPapel`. Twin de `pipe-authz.ts`. Sem tocar guard/`ability.ts`.
- **Subdomínio `src/databases/grants/`:** `database-grants.module` + `.service` + `.controller` + `dto`.
  **4 rotas** (ver `contracts/database-grants.http.md`), sob `@Requer('ler','Database')`, todas sob
  `withTenantContext`, **sem exclusão**.
- **Modificar `src/databases/databases.service.ts` (3.1):** `listar`/`obter` finos para não-Admin (por
  `DatabaseGrant` ACTIVE); Admin da Org inalterado (vê todos); ciclo de vida inalterado (Admin da Org).
- **Testes (PostgreSQL real):** `database-grants-rls`, `databases-authz` (ampliado), `database-grants-http`
  (Org C + contas descartáveis). SC-206 para a migration.

## Fora de escopo

Formulário de Database e owner do `FormContext.DATABASE` (3.3); Registros e Histórico do Registro (3.4); **poder
diferencial MEMBER vs VIEWER sobre Registros/schema** (contrato futuro 3.3/3.4 — role dormente); **permissões por
Campo** (FORA da Fase 1); ciclo de vida do Database (3.1, Admin da Org); gestão de Memberships da Org (Épico 8);
arquivos (3.7/3.8); vínculo Card↔Registro (3.9). Exclusão de concessão (revogar é `state`). UI Web (3.2 entrega
a API interna).

## Invariantes preservados

`Pipe ≠ Database` (entidades/enums/subjects/subdomínios separados — RN-061); `Database ≠ Pipe` no substrato de
concessão (`DatabaseGrant` não reusa `PipeGrant`); **papel da Org é o teto** (AD-9 — GUEST só VIEWER);
deny-by-default (sem concessão → 404 não-enumerante, nunca 403 que revelaria existência); isolamento por
Organização pelo banco (RLS+FORCE+WITH CHECK — o `WITH CHECK` do UPDATE barra mover a concessão para outra Org);
**sem exclusão definitiva** (GRANT sem DELETE — fronteira de banco, não ausência de rota); nenhuma rota aceita
`orgId` do cliente; **C3/guard/`ability.ts` congelados** exceto pela abertura do `ler Database` grosseiro (padrão
de catálogo previsto pelo próprio `ability.ts`, idêntico a `ler Pipe`); AD-11 (nada materializado só para o
futuro — o poder diferencial MEMBER/VIEWER é contrato).

## Assunções

- Contexto organizacional resolvido no servidor ⇒ Membership ACTIVE (contexto por transação). `orgId` **fora**
  do payload de toda rota.
- Endpoints sob `/databases/:databaseId/grants` (API interna). Consumo visual (Web) fora desta Story.
- Dependências 3.1 (`Database`, RLS/GRANT/CASL de Database, `database-lifecycle.ts`) e 1.6 (authz/CASL/guard)
  `done`; Épico 2 `done` fornece o padrão a replicar — em especial `PipeGrant` (2.2) e `pipe-authz.ts`.
