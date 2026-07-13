# Spec — Story 2.2: Papéis e acesso por Pipe

> Risco **CRÍTICO** (autorização por RECURSO sobre a entidade `Pipe`; nova tabela de concessão + RLS +
> migration; invariante-mãe de isolamento). Spec completo.
> Fonte: `_bmad-output/implementation-artifacts/2-2-papeis-e-acesso-por-pipe.md`; PRD §D1.4 (OQ-2), §D1.3
> (OQ-1); `epics.md` Story 2.2.

## Contexto
A Story 2.1 deu ao **Admin da Organização** o ciclo de vida e o catálogo de Pipes; MEMBER/GUEST não têm
acesso nenhum a Pipe. A 2.2 abre esse acesso de forma **controlada e explícita**: o Admin da Org **concede
papéis por Pipe**, e cada pessoa passa a acessar **apenas os Pipes** em que recebeu papel. Introduz a
**autorização por recurso** (não só por tipo), consumindo o substrato C3 (1.6) e as decisões de Produto já
aprovadas (D1.4/D1.3). Sem alterar o mecanismo C3.

## Modelo de dados
- **`PipeGrant`** (concessão de papel por Pipe): `id` (uuid, PK), `orgId` (uuid, FK `Organization`), `pipeId`
  (uuid, FK `Pipe`, `onDelete: Cascade`), `membershipId` (uuid, FK `Membership`, `onDelete: Cascade`),
  `role` (`PipeRole` = `ADMIN`|`MEMBER`|`VIEWER`), `state` (`PipeGrantState` = `ACTIVE`|`REVOKED`),
  timestamps, `revokedAt` (nullable).
- **Unicidade parcial** `(pipeId, membershipId)` **entre concessões `ACTIVE`** — garante **no máximo um
  papel efetivo por Pipe por pessoa** (AC2) sem colidir com uma concessão revogada e re-concedida.
- **Índice** `(orgId, pipeId)` e `(orgId, membershipId)` — acesso começa por Org; consultas por Pipe (quem
  tem acesso) e por pessoa (quais Pipes acesso).
- **Enum** `PipeRole` (Admin do Pipe / Membro do Pipe / Somente leitura) e `PipeGrantState`.
- **A concessão liga-se a `Membership`**, não a `Account`: o papel por Pipe vive **dentro** de uma Org, e a
  Membership é o vínculo Account×Org que já carrega `orgId` e estado (AD-7/AD-10). Ligar a `Account` global
  reabriria a porta de uma concessão "sem Org".
- **Revogação é soft-delete** (`state = REVOKED`, `revokedAt`), não DELETE: preserva a trilha (simétrico a
  `MembershipState`) e é auditável. A tabela é `MODELOS_AUDITADOS`.

## Papéis (D1.4) — poder de cada um
- **Admin do Pipe** — administra a **configuração** do Pipe conforme aprovado; **não** controla o ciclo de
  vida do Pipe (criar/arquivar/restaurar é do Admin da Org, Story 2.1). Admin do Pipe **≠** Admin da Org.
- **Membro do Pipe** — edita os recursos acessíveis do Pipe (o "Editar" da matriz D1.3); não administra a
  config.
- **Somente leitura** — consulta sem editar nem mover.
- **Admin da Organização** — acessa **todos** os Pipes **sem** concessão explícita (AC3; preserva a 2.1).
- **Ausência de papel = ausência de acesso** (deny-by-default; MEMBER/GUEST sem concessão não veem o Pipe).

## Autorização (CASL, C3) — por recurso, no serviço
- A guarda **grossa** (o `AuthzGuard`, org-scoped) continua barrando quem não pode o **tipo** Pipe na Org.
  MEMBER/GUEST passam a **poder o tipo** (para poderem ter acesso a *algum* Pipe); **qual** Pipe é decidido
  **no serviço**, com o Pipe **e** a concessão carregados: `ability.can(acao, subject('Pipe', pipeComPapelEfetivo))`.
- **A checagem fina NÃO é condition do guard** (o guard não carrega o recurso — débito **DBT-AUTHZ-01**).
- O **papel efetivo** de um principal sobre um Pipe = função do papel de Organização (Admin da Org → tudo)
  **e** da concessão `ACTIVE` (se houver). Sem os dois, nega.
- Não altera o mecanismo C3; estende o catálogo de regras (como a 2.1 fez com o sujeito `Pipe`).

## Isolamento / RLS (AD-6)
- `PipeGrant` com **ENABLE + FORCE ROW LEVEL SECURITY**; policies `select/insert/update/delete` por
  `orgId = current_org_id()`. Queries por `withTenantContext`.
- **GRANT runtime:** `SELECT, INSERT, UPDATE` — revogação é `UPDATE` de `state` (soft-delete), **sem
  DELETE** (simétrico à decisão da 2.1; a cascata de FK não é acionável pelo runtime).
- A RLS de `Pipe` continua **org-scoped**, não pipe-scoped: o filtro "quais Pipes este MEMBER vê" é da
  **query do serviço** (junção com `PipeGrant` ativo), com não-enumeração (404 para Pipe não concedido, não
  403 que revelaria existência).

## Contrato de API (interna)
- `POST /pipes/:pipeId/grants` — concede papel (Requer `administrar Pipe` — só Admin da Org, ou Admin do
  Pipe se aprovado; ver Clarifications). Body: `{ membershipId, role }`. → 201.
- `GET /pipes/:pipeId/grants` — lista concessões ativas do Pipe (Requer acesso ao Pipe). → `Grant[]`.
- `PATCH /pipes/:pipeId/grants/:grantId` — altera o papel. → 200.
- `DELETE /pipes/:pipeId/grants/:grantId` — **revoga** (soft-delete, `state = REVOKED`). → 200/204.
- Ajuste em `GET /pipes` (2.1): MEMBER/GUEST passam a ver **os Pipes concedidos** (Admin da Org vê todos).
- **Sem** concessão de Card (2.10), sem modos condicionais.

## Estados e transições
`ACTIVE → REVOKED` (`revokedAt = now`). Re-concessão cria **nova** linha `ACTIVE` (a unicidade parcial só
vale entre ativas). Não há transição `REVOKED → ACTIVE` (revogar é definitivo para aquela concessão;
re-conceder é ato novo, auditável). Alterar papel de uma concessão ativa é `UPDATE` de `role`.

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-221** — MEMBER sem concessão recebe **404** ao acessar um Pipe (não-enumeração); com concessão
  `Membro do Pipe`, acessa e edita **apenas aquele** Pipe. (AC1/AC2)
- **SC-222** — cada papel dá exatamente seu poder: `VIEWER` lê e **não** edita/move; `MEMBER` edita; `ADMIN
  do Pipe` administra config e **não** controla ciclo de vida do Pipe. (AC2)
- **SC-223** — **no máximo um** papel efetivo por Pipe por pessoa (segunda concessão ativa é recusada ou
  substitui — ver Clarifications); a unicidade parcial é imposta pelo **banco**. (AC2)
- **SC-224** — Admin da Org acessa qualquer Pipe **sem** concessão; a suíte da 2.1 continua verde. (AC3)
- **SC-225** — revogar corta o acesso: após `REVOKED`, o MEMBER volta a **404** no Pipe. (AC4)
- **SC-226** — isolamento: outra Organização **não** vê a concessão nem o Pipe; INSERT/SELECT de
  `PipeGrant` sem contexto (ou de outra Org) é **negado** pelo banco (FORCE RLS). (AC4)
- **SC-227** — MEMBER com papel no Pipe X **não** enxerga o Pipe Y (nem por lista, nem por id). (AC1)
- **SC-228** — migration `deploy` cria a tabela+RLS; `rollback` a remove sem tocar `Pipe`/`Membership`;
  reaplicação ok. (migration-check)

## Não-objetivos
Acesso/concessão de **Card** (2.10); Responsável/Observador/Comentador (D1.5, 2.10+); **modos condicionais**
"visão restrita" e "apenas formulário inicial" (D1.4 — não são papéis); Fases (2.3); Formulários; publicar/
despublicar; gestão de membros da Org (Épico 8).

## Segurança / observabilidade / LGPD
Sem bypass de RLS (AD-6). A concessão liga uma **pessoa** (via Membership) a um Pipe — o payload usa
identificadores internos, **não** vaza e-mail/PII. Conceder e revogar entram na trilha de auditoria
(mudança de papel — AD-31/D1.6). Logs sanitizados. Nenhum segredo.

## Dependências e ordem
Empilha sobre a **Story 2.1** (sujeito `Pipe` + tabela `Pipe`, PR #17 em review) e **1.6** (authz). **Não**
abrir PR contra `main` antes do merge da 2.1; após o merge, rebasear e revalidar. Correções da 2.1 têm
prioridade.

## Clarifications (resolvidas por decisão fundamentada — ver plan.md)
1. **Segunda concessão ativa ao mesmo par (pipe, pessoa):** recusar com erro claro (não substituir
   silenciosamente) — alterar papel é o `PATCH` explícito. *Default adotado; confirmável no Plan.*
2. **Quem concede:** o Admin da Org sempre; se o **Admin do Pipe** pode conceder é decisão da matriz D1.3
   — adota-se **só Admin da Org concede em 2.2** (mais restrito, deny-by-default); ampliar é evolução.
3. **`membershipId` vs `accountId`:** `membershipId` (fundamentado acima).
