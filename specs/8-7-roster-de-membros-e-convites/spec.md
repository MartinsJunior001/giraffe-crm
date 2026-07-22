# Story 8.7 — Roster de membros e Convites (read-side)

> **Épico 8 — Administração da Organização.** Depende de 8.2–8.6 (todas integradas em `origin/main`).
> **Rastreabilidade oficial (`epics.md` §700–715):** FR-33 · D5.1 · NFR-37/40 · INV-ADMIN-01.
> **Base:** `origin/main` = `7690f7f` (inclui 8.4/8.5/8.6).
> **Classificação de risco:** MÉDIO — endpoint de leitura com autorização por papel e projeção de PII
> (e-mail). Toca área sensível (autz/multi-tenant) mas **sem** migration, GRANT ou mudança de RLS/guard.

## 1. Objetivo

> Como Administrador, quero um roster que mostre membros e Convites por estado e ofereça as ações
> permitidas, para gerenciar a composição da Organização num só lugar.

Superfície de **LEITURA** do painel administrativo, espelhando o rigor dos read-sides existentes —
**Kanban read (2.9)** e **Records read (3.5)**: projeção controlada, paginação com teto, autorização
revalidada no servidor e `orgId` fora da fronteira.

## 2. Escopo

- `GET /organizations/members` — roster de Memberships.
- `GET /organizations/invites` — roster de Convites.
- Filtros mínimos (estado, papel, busca), paginação offset com teto, ordem determinística.
- Capacidades de ação **calculadas no servidor** por linha (visão do Admin), refletindo a proteção do
  último Administrador — a UI **não** infere autorização pelo papel exibido.

## 3. Fora de escopo

- Qualquer **mutação** (convite/reenvio/cancelamento 8.2; papel 8.4; suspensão/reativação 8.5;
  remoção/saída 8.6) — o roster **reflete** as capacidades; a execução é da Story proprietária.
- **Auditoria administrativa** (8.8, read-side próprio).
- **Exportação de membros** (fora da Fase 1).
- **Avatar cross-membro** — a policy de `AccountAvatar` (3.10) é *self-only* por design; ver §5 D-4.
- Web/UI (esta entrega é o **contrato de API**; a casca consome estado honesto server-side, como 8.1).
- Atualização push após Evento canônico (a leitura é sob demanda; realtime = Épico do Socket.IO).

## 4. Clarify — perguntas materiais e decisões

| # | Ambiguidade | Decisão | Fonte |
|---|---|---|---|
| C-1 | O Membro comum acessa o roster? | **Sim, visão REDUZIDA** (só ATIVAS: nome/papel; sem e-mail, sem Convites, sem estados não-ativos, sem ações). **Convidado não acessa (403).** | epics §706, AC-3 |
| C-2 | Qual guard para cada rota? | `members` → `ler Organizacao` (piso; a autoridade fina separa Admin/Membro/Convidado no serviço). `invites` → `administrar Organizacao` (só Admin). | ability.factory 1.6 |
| C-3 | Busca por e-mail para todos? | **Não** — e-mail é "só Admin" (§706). O Membro busca só por nome. | epics §706 |
| C-4 | Como representar "expirado" se não há agendador? | **Derivado na leitura**: `expirado = PENDING && expiresAt < now` (campo booleano). O `state` armazenado é preservado. | 8.2/8.3 (sem scheduler) |
| C-5 | O roster mostra avatar dos outros membros? | **Não nesta entrega** — RLS *self-only* em `AccountAvatar`; ampliar é migration HIGH fora do escopo declarado. Fallback por iniciais (nome). Débito registrado. | migration 3.10 §74 |

## 5. Decisões de arquitetura

### D-1 — Guarda grossa + autoridade fina no serviço (DBT-AUTHZ-01, C3 congelado)
`members` usa o piso `ler Organizacao`; o serviço decide a projeção (Admin plena / Membro reduzida /
Convidado 403). `invites` usa `administrar Organizacao` (só Admin) e o serviço reforça por defesa em
profundidade. **Nada em `ability.ts`/`ability.factory.ts`** — mesmo padrão de `pipe-authz`/`database-authz`.

### D-2 — `orgId` nunca vem do cliente; leitura sempre sob `withTenantContext`
Nenhuma rota aceita identificador de Organização. Toda query de `Membership`/`Invite` passa por
`withTenantContext` (RLS é a fronteira; sem `where orgId` manual). Cross-tenant não vaza **por
construção** (a policy escopa as linhas).

### D-3 — `Account` é GLOBAL; nome/e-mail por join filtrado
Nome/e-mail vivem em `Account` (global, SELECT-only). O roster lê `Account` por `id in [...]`, mas a
lista de ids vem **das Memberships já escopadas por RLS** — uma conta de outra Org que case uma busca
não tem Membership nesta Org e some no join. E-mail de não-membro nunca é projetado.

### D-4 — Sem migration, sem GRANT, sem tocar RLS (read-side puro)
O runtime já tem `SELECT` em `Membership` e `Invite`. **Não** se abre GRANT nem se altera policy. A
policy *self-only* de `AccountAvatar` **não** é ampliada aqui (seria HIGH e fora do escopo declarado):
`DEB-8-7-AVATAR-ROSTER-CROSS-MEMBER` fica aberto para quando houver a UI consumidora + teste próprio.

### D-5 — Capacidades são REFLEXO, núcleo puro reusa a regra de 8.4/8.5/8.6
`roster.core.capacidadesDoMembro` decide o que a UI **oferece**, espelhando as recusas dos núcleos de
transição — em especial a **proteção do último Admin** (INV-ADMIN-01): o último Admin ativo não recebe
ação de rebaixamento/suspensão/remoção executável. A autoridade real é revalidada **no disparo**, sob
`FOR UPDATE`, pela Story proprietária. Reflexo ≠ execução.

## 6. Contrato

### `GET /organizations/members` — `@Requer('ler','Organizacao')`
Query (allowlist fail-closed): `state?`, `role?`, `busca?`, `skip?`, `take?` (default 50, teto 100).

| Papel | Resposta |
|---|---|
| ADMIN | `200` `{ visao:'admin', membros:[{ membershipId, accountId, name, email, role, state, createdAt, capacidades }], total, skip, take }` |
| MEMBER | `200` `{ visao:'membro', membros:[{ membershipId, name, role }], total, skip, take }` — só ATIVAS |
| GUEST | `403` `{ erro:'ROSTER_INDISPONIVEL' }` |
| sem sessão | `401` |

`capacidades = { podeAlterarPapel, podeSuspender, podeReativar, podeRemover }`.

### `GET /organizations/invites` — `@Requer('administrar','Organizacao')`
Query: `state?` (`PENDING|ACCEPTED|EXPIRED|CANCELLED`), `role?`, `busca?` (e-mail do Convite), `skip?`, `take?`.

| Papel | Resposta |
|---|---|
| ADMIN | `200` `{ convites:[{ id, email, role, state, expirado, expiresAt, createdAt }], total, skip, take }` |
| MEMBER / GUEST | `403` (guard) |
| sem sessão | `401` |

**Nunca** projeta `tokenHash`/token/`normalizedEmail`/`orgId`.

## 7. Critérios de aceite

| # | Critério | Origem |
|---|---|---|
| AC-1 | Admin vê Convites e Memberships por estado, com filtros e paginação; ações só quando permitidas | epics AC1 |
| AC-2 | Ação proibida pela proteção do último Admin **não** é apresentada como executável | epics AC2 |
| AC-3 | Membro comum vê só nome/papel das ATIVAS (sem Convites/suspensas/encerradas/e-mail); Convidado não acessa | epics AC3 |
| AC-4 | Sem contagem/dado de outra Organização; sem exportação; projeção sem token/segredo | epics AC4 · INV-ADMIN-01 |
| AC-5 | Deny-by-default revalidado no servidor (guard + autoridade fina); `orgId` nunca do cliente | NFR-37 |

## 8. Testes (integração real + unidade pura)

- **Unidade** (`roster-core.test.ts`): proteção do último Admin, clamp de paginação, `expirado`, DTO
  allowlist fail-closed.
- **HTTP** (`roster-http.test.ts`, PostgreSQL real, Better Auth real): (a) isolamento cross-tenant
  (membros e Convites); (b) autz (GUEST→403 em membros; MEMBER→403 em Convites; sem sessão→401; visão
  reduzida do Membro); (c) projeção sem token/segredo; (d) paginação/ordem determinística + allowlist.
- Contas descartáveis (`ros87-…`, `randomUUID`) na Org descartável — **nunca** Ana/Bruno/Carla/Eva
  persistentes (TEST-ISO-01).

## 9. Segurança, observabilidade, LGPD

- **Segurança:** deny-by-default; nenhuma superfície aceita `orgId`; token de Convite jamais projetado.
- **LGPD:** e-mail/nome do membro é a **finalidade legítima** do roster administrativo — minimização:
  Membro comum não recebe e-mail; nada de token; `valores`/PII de domínio não pertencem a esta Story.
- **Observabilidade:** sem log de PII no caminho de leitura (segue o padrão sanitizado do projeto).
- **Migration:** **não há.** Read-side puro sobre entidades existentes; sem GRANT novo; RLS intocada.

## 10. Definition of Done

- [ ] Rotas `members`/`invites` com guardas corretas e 401/403/200 provados
- [ ] Visão reduzida do Membro; Convidado 403; Convites Admin-only
- [ ] Projeção sem token/segredo; `orgId` fora da fronteira
- [ ] Proteção do último Admin reflete nas capacidades
- [ ] Isolamento cross-tenant provado (membros + Convites)
- [ ] Paginação/ordem determinística; allowlist fail-closed
- [ ] typecheck · lint · format:check · build · testes API verdes · CI
