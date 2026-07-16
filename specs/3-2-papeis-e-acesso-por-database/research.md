# Research — Story 3.2 (Papéis e acesso por Database)

> Fase 0. A epics marca a 3.2 com **Gates: —**. As decisões abaixo têm **default justificado** por PRD D3.4
> (§966-977), AD-9, Constitution e pelo **precedente da Story 2.2** (`PipeGrant`, twin estrutural). **Q1–Q4 foram
> resolvidas por fonte autoritativa** (PRD/epics) — nenhuma constitui `NEEDS CLARIFICATION` bloqueante. Q2 tem um
> detalhe de implementação (código HTTP) decidido por default coerente com a 2.2.

## D1 — `DatabaseGrant` distinto de `PipeGrant` (RN-061)

- **Decisão:** tabela, enums (`DatabaseRole`/`DatabaseGrantState`), subject/subdomínio (`src/databases/grants/`)
  **próprios**. **Mesma forma** de RLS/GRANT/índice-parcial/resolução-fina da 2.2, **não** a mesma linha.
- **Racional:** invariante `Pipe ≠ Database` (CLAUDE.md; RN-061). Reuso é de **padrão**, não de entidade. A 3.1 já
  fixou esse princípio para `Database` vs `Pipe`; a 3.2 o estende ao substrato de concessão.
- **Alternativa rejeitada:** um `Grant` polimórfico (pipe|database) — funde fronteiras que os invariantes exigem
  separadas; complica RLS e autoridade. Rejeitada.

## D2 — Autoridade hierárquica de concessão (o coração da 3.2)

- **Decisão:** a concessão é aberta ao **Admin do Database** com **teto de papel**, resolvido no serviço por
  `exigirConcederPapel(db, principal, databaseId, roleAlvo)`: Admin da Org → qualquer papel; Admin do Database →
  só `MEMBER`/`VIEWER`; demais → 403; sem acesso ao Database → 404.
- **Racional:** PRD D3.4 §969 ("Admin do Database configura/publica/administra estrutura; não concede poderes fora
  do Database") + epics §1086 ("Admin do Database concede/revoga apenas Membro do Database e Somente leitura...
  somente Admin da Org concede/remove Admin do Database"). Esta é a **diferença real frente à 2.2**, que era
  Admin-da-Org-only em todo grant (a 2.2 deixou "ampliar ao Admin do Pipe" como evolução; a 3.2 a faz para
  Database).
- **Alternativa rejeitada:** manter Admin-da-Org-only (como 2.2) — contradiz o PRD/epics explícitos da 3.2.

## D3 — Só o Admin da Org toca `ADMIN` do Database (Q1); ciclo de vida fica na 3.1 (Q3)

- **Decisão:** conceder/alterar-para/alterar-de/revogar um `ADMIN` do Database exige `principal.papel === 'ADMIN'`
  (Org). Admin do Database → **403**. O ciclo de vida do Database (renomear/arquivar/restaurar) **permanece** do
  Admin da Org (3.1), **não** é ampliado ao Admin do Database.
- **Racional:** PRD D3.4 §969 ("Admin do Database **não controla ciclo de vida** nem Memberships") + §966 ("ciclo
  de vida do Database: Admin da Org") + epics §1086. Espelha `PipeRole.ADMIN` ("administra config do Pipe, não o
  ciclo de vida — isso é do Admin da Org").
- **A confirmar com o dono:** **não** — a fonte é explícita; sem ambiguidade.

## D4 — Teto da Org por 400 (Q2 / AD-9)

- **Decisão:** o serviço carrega `Membership.role` do **alvo**; se `GUEST`, só `VIEWER`; papel incompatível com o
  teto → **400** (corpo inválido para o alvo).
- **Racional:** PRD D3.4 §970 ("papel de Database nunca supera o da Organização; Convidado só recebe Somente
  leitura") + AD-9 ("papel da Org é o teto", já materializado na `ability.factory`). O **código** não está fixado
  na fonte; **400** é o default coerente com `exigirMembershipAtivaDaOrg` da 2.2 (alvo inválido → 400), pois é o
  **corpo** que está errado para aquele alvo, não a autoridade do ator (que seria 403) nem o recurso (que existe).
- **Alternativa considerada:** 409 (conflito de regra) — rejeitada; não há colisão de estado, é validação de entrada.

## D5 — Admin da Org acessa todos sem grant (Q4)

- **Decisão:** **nenhuma** linha de `DatabaseGrant` para o Admin da Org; `resolverPoderNoDatabase` devolve
  `gerenciar` ao Admin da Org direto (papel de Org).
- **Racional:** PRD D3.4 §970 ("Admin da Org acessa todos") + precedente 2.2/SC-224 (Admin da Org acessa qualquer
  Pipe sem concessão). Criar linha de grant para o Admin seria dado redundante e enganoso (sugeriria que revogá-la
  cortaria o acesso, o que é falso).

## D6 — Abrir `ler Database` grosseiro; guarda fina no serviço; guard não tocado (DBT-AUTHZ-01)

- **Decisão:** mover `can('ler','Database',{orgId})` de dentro do ramo `if (papel === 'ADMIN')` (3.1) para
  **qualquer Membership ativa** (grossa), como `ler Pipe` (2.2). `administrar Database` **permanece**
  Admin-da-Org-only. A checagem fina ("qual Database, qual autoridade") vive no **serviço** (`database-authz.ts`),
  com o recurso carregado; **`authz.guard.ts` não é tocado**.
- **Racional:** em 3.1 só o Admin via Database, então `ler Database` era Admin-only. Na 3.2 MEMBER/GUEST podem ter
  acesso a *algum* Database (por concessão), logo precisam **passar** o guard grosso — exatamente o que a 2.2 fez
  com `ler Pipe`. É extensão prevista pelo catálogo CASL (C3 consumido, não alterado). DBT-AUTHZ-01 é o débito que
  esta Story consome (guarda fina no serviço).
- **Nota:** manter `administrar Database` Admin-only é o que preserva o ciclo de vida 3.1 no Admin da Org e faz o
  Admin do Database **não** poder arquivar/renomear (D3): ele passa só pelo `ler` grosso + fina de config.
- **Se a implementação constatar necessidade de tocar o guard:** declarar desvio no `analyze.md` e escalar antes.

## D7 — Revogar é soft-delete; unicidade por índice parcial

- **Decisão:** revogar é `state = REVOKED` + `revokedAt` (UPDATE), **sem DELETE** (GRANT sem DELETE). Re-conceder
  é linha **nova** ACTIVE. **No máximo um papel ACTIVE por (Database, pessoa)** por índice único **parcial**
  `WHERE state='ACTIVE'` (raw SQL — Prisma 6.19.3 não expressa parcial). Segunda concessão ativa → P2002 → 409.
- **Racional:** simétrico à 2.2 (`PipeGrant`); a unicidade é do **banco** (evita corrida read-modify-write); a
  trilha é preservada (auditável, LGPD — não apaga o dado da relação).

## D8 — Role dormente: poder diferencial MEMBER vs VIEWER = contrato futuro (3.3/3.4)

- **Decisão:** **não implementar agora** o poder que separa `MEMBER` (edita Registros) de `VIEWER` (só consulta).
  Registro (3.4) e schema (3.3) **não existem** em 3.2. Os papéis são **armazenados e resolvidos**; o diferencial
  fica **inerte**.
- **Racional:** AD-11 + Constitution II (não materializar Registro/schema só para exercer o diferencial). É a
  situação idêntica da 2.2 (SC-222=B, "role dormente" — `PipeRole` armazenado, poder diferencial ativado em
  2.3/2.7). Consumidores concretos **na 3.2**: (a) acesso de leitura ao catálogo, (b) autoridade de concessão.
- **Contrato futuro:** 3.3 (publicar/alterar schema — exige `gerenciar`) e 3.4 (criar/editar Registro — exige
  `operar`) consumirão `resolverPoderNoDatabase`, respeitando também o `Database.state === ACTIVE` da 3.1.

## Concorrência e idempotência

- **Decisão:** conceder é `create` (P2002 do índice parcial → 409, sem leitura-antes-de-escrever). Alterar/revogar
  fazem `findUnique` (leitura não auditada) **antes** do `updateMany` filtrado por `state='ACTIVE'` — casos
  inexistente/outro Database/cross-tenant/já-revogada respondem 404 **sem** emitir `updateMany` (evita `count: 0`
  como falso `denied`, padrão de 2.1/2.2). Corrida na janela entre a leitura e o `updateMany` → `count: 0` → 404
  honesto. `withTenantContext` recusa `$transaction`; 3.2 **não** precisa de transação multi-statement (não há
  evento na mesma transação — Histórico do Registro é 3.4).
- **Racional:** consolidado de `PipeGrantsService` (2.2). Sem guarda otimista de coluna JSON (não há
  read-modify-write de JSON aqui).

## Contexto documental (context7-check — a executar antes de codificar)

Confirmar, contra as versões **instaladas** (`package.json`/lockfile):
- **Prisma 6.19.3** — DDL via migration SQL crua (2 enums + tabela + RLS + índice único parcial + GRANT),
  `create` (P2002 em índice único parcial → `PrismaClientKnownRequestError` code `P2002`), `findUnique`/
  `updateMany`→`{ count }`, `@db.Uuid`/`@db.Timestamptz`, FKs `onDelete: Cascade`.
- **NestJS 11** — `@HttpCode(HttpStatus.OK)` no `DELETE` de revogação, `ConflictException`/`ForbiddenException`/
  `NotFoundException`/`BadRequestException`, DTO/validação (class-validator) no padrão de `pipes/grants/dto`.
Fonte preferencial: MCP Context7 (`resolve-library-id` → `query-docs`); registrar a fonte se recorrer à doc oficial.

## Saídas da Fase 0

Q1–Q4 resolvidas por fonte autoritativa (PRD D3.4/epics); Q2 com código HTTP por default coerente com 2.2; Q5
(reconciliação §297 × §970) resolvida a favor da decisão resolvida. Nenhuma incógnita bloqueante. Pronto para
Fase 1 (data-model, contracts, quickstart).
