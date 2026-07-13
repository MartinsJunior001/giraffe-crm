---
story_key: 1-5-continuidade-de-sessao-logout-e-protecao-de-rotas
epic: 1
status: ready-for-dev
release: CORE (Lote 1)
risco: NORMAL
gate_arquitetura: PENDENTE — expiração por inatividade da sessão (updateAge/expiresIn) a decidir antes de implementar a parte de expiração
---

# Story 1.5 — Continuidade de sessão, logout e proteção de rotas

**As a** usuário autenticado,
**I want** sessão persistente vinculada ao meu contexto e logout imediato,
**So that** eu opere com continuidade e saia com segurança.

**Status: ready-for-dev.** Classificada **CORE** (Lote 1), risco **NORMAL**. Primeira Story após a
1.4; conecta a sessão do Better Auth (já emitida no login da 1.4) à continuidade, ao logout e à
proteção de rota — **sem reinventar** o caminho de identidade/autorização.

---

## Escopo (do épico, congelado)

- Persistência de sessão vinculada ao contexto permitido.
- **Sessão válida NÃO substitui revalidação de Membership**: Membership suspensa/encerrada bloqueia
  novo acesso à Organização.
- Logout invalida **somente a sessão corrente** (RN-012).
- Rota protegida sem sessão → Login.
- Sessão expirada → nova autenticação.

**Rastreabilidade:** FR-2; RN-012; NFR-1, NFR-3, NFR-4; AD-7, AD-9. **Dependências:** 1.4 (done).

### Fora do escopo (não antecipar)

- Revogações **globais** de sessão (revoke all / revoke others) — são das Stories 1.10 (recuperação),
  1.12 (troca de senha) e 1.13 (troca de e-mail). Aqui **só** o logout da sessão corrente.
- Troca explícita de Organização (1.9); autorização granular por Pipe/Card (WAVE 2).
- Casca completa / design system (1.7) — aqui só o mínimo de UI para a proteção de rota ser
  demonstrável (um Login mínimo e um controle de logout). A casca rica vem na 1.7.

---

## Gate de Arquitetura (resolver no pre-implementation)

**Expiração por inatividade** = decisão de Arquitetura (registrada no épico). O Better Auth expõe:

- `session.expiresIn` — expiração **absoluta** (tempo de vida máximo do cookie/registro).
- `session.updateAge` — janela de **deslize** (a sessão é renovada se usada dentro dela → expiração
  por **inatividade**).

Antes de implementar a parte de expiração, decidir e registrar os números (Arquitetura/Segurança).
**Recomendação de baseline para o Core** (a confirmar, não afrouxar): `expiresIn = 7 dias`,
`updateAge = 1 dia` (desliza a cada uso; expira após ~1 dia de inatividade, teto de 7 dias). Cookie
`httpOnly`, `secure` (em produção), `sameSite` compatível com a topologia Web(:3000)↔API(:3001) já
usada no CSRF/CORS da 1.4. A persistência é **em banco** (`AuthSession`, `storage: 'database'` já
configurado na 1.4) — não em memória, pelo mesmo motivo do G2: sobreviver a restart e ser compartilhada
entre réplicas.

---

## Descobertas de arquitetura (o que JÁ existe — não reimplementar)

> Lido do código real em `apps/api/src/kernel/`. Estado na Story 1.4 (done).

- **`sessao-principal.provider.ts`** — `SessaoPrincipalProvider.resolver(req)` chama
  `auth.api.getSession({ headers })`. O Better Auth **valida assinatura e expiração** do cookie;
  sessão inválida/expirada → `null` → o guard traduz em **401**. `user.id === Account.id` (D1, sem
  de-para). **É aqui que "sessão expirada → nova autenticação" já acontece** no backend.
- **`context/tenant-context.guard.ts`** — guard global deny-by-default: sem principal → 401; com
  principal, resolve a Organização via `OrgContextResolver`.
- **`context/org-context.resolver.ts`** — resolve a Organização **a partir das Memberships
  `state = 'ACTIVE'`**, por requisição. **Consequência-chave:** uma sessão válida de um membro
  **suspenso/removido** obtém identidade (getSession OK) mas **não** obtém contexto → **403**. O
  invariante "Membership suspensa/encerrada bloqueia novo acesso" **já é imposto estruturalmente**.
  A 1.5 **não muda** este caminho — ela o **prova** pela via da sessão (teste de integração real) e
  garante que nada passe a cachear autorização entre requisições.
- **`auth.factory.ts` / `auth.controller.ts`** — Better Auth montado sob `/api/auth/*`
  (`sign-in/email` já funciona). `trustedOrigins` = allowlist de CORS (CSRF). O **logout** usa o
  endpoint nativo `POST /api/auth/sign-out`, que invalida **a sessão corrente** e limpa o cookie —
  RN-012 por padrão. Confirmar no context7 a assinatura exata na versão fixada (1.6.23) e provar por
  teste HTTP que **apenas** a sessão corrente é invalidada.
- **Web (`apps/web/`)** — hoje só a casca de saúde (`app/page.tsx`, `/healthz`, `layout.tsx`).
  **Não há página de Login nem `middleware.ts`.** `lib/api.ts`/`lib/env.ts` já falam com a API interna
  (variável de **servidor** `API_BASE_URL`, sem `NEXT_PUBLIC_`). A proteção de rota e um Login mínimo
  entram nesta Story.

---

## Invariantes fixos (nunca erodir nesta Story)

1. **Sessão é identidade, não autorização.** A autoridade continua na Membership ativa
   (deny-by-default). A sessão nunca "carrega" o papel/Organização como verdade cacheada.
2. **Revalidação por requisição.** Nada de cachear a decisão de autorização entre requisições
   (um suspenso não pode continuar entrando com a sessão antiga).
3. **Logout ≠ revogação global.** Só a sessão corrente; as demais permanecem (revogação global é 1.10/1.12/1.13).
4. **Proteção de rota do frontend é UX, não autorização.** O middleware do Next.js melhora a
   experiência (redireciona ao Login), mas a **negação real** é sempre do backend (401/403). O
   middleware **não** decide autorização de dados nem revela recursos (G5/INV-REPORT-01).
5. Segredos/PII: nada de token de sessão em log/erro/resposta; sanitização mantida (redaction já
   cobre `cookie`/`set-cookie`).

---

## Critérios de aceite (BDD)

1. **Given** um usuário autenticado **When** navega entre requisições/páginas **Then** a sessão
   persiste sem novo login (cookie de sessão em banco, validado a cada requisição).
2. **Given** uma sessão válida **When** a Membership do usuário foi suspensa/encerrada **Then** o
   acesso à Organização é **bloqueado** (403), pois a sessão não dispensa a revalidação de Membership.
3. **Given** um usuário autenticado **When** faz logout **Then** **apenas a sessão corrente** é
   invalidada imediatamente (RN-012) e ele volta ao Login; outras sessões da mesma Account permanecem.
4. **Given** uma rota protegida **When** acessada **sem** sessão **Then** o usuário é redirecionado ao
   Login (frontend), e a API responde 401 à chamada correspondente.
5. **Given** uma sessão **expirada** **When** o usuário tenta operar **Then** é exigida nova
   autenticação (getSession → null → 401 → redireciona ao Login).

---

## Tasks / Subtasks

- [ ] **T1 — context7-check do Better Auth (obrigatório antes de codar):** confirmar na versão 1.6.23
  a assinatura de `signOut` (server `auth.api.signOut` e rota `/api/auth/sign-out`), o comportamento
  de invalidação **só da sessão corrente**, e as opções `session.expiresIn`/`updateAge`/cookie.
  Registrar em `gates/1-5/context7-check.md`.
- [ ] **T2 — Config de sessão (após o gate de Arquitetura):** definir `session` no `auth.factory.ts`
  (`expiresIn`, `updateAge`, cookie `httpOnly`/`secure`/`sameSite`) conforme decisão registrada.
  Sem defaults silenciosos que contrariem a decisão.
- [ ] **T3 — Logout (backend):** garantir `POST /api/auth/sign-out` exposto e que invalida **só** a
  sessão corrente. Teste HTTP real: com 2 sessões da mesma Account, logout numa **não** derruba a outra.
- [ ] **T4 — Revalidação de Membership pela via da sessão (teste, sem novo código):** teste de
  integração real provando AC2 — sessão válida de membro **suspenso** (e outro **REMOVED**) → 403 em
  `/organizations/current`, enquanto membro ACTIVE → 200. Usar a Org C / conta de escrita para não
  colidir com fixtures de leitura (ver `org-context.test.ts`).
- [ ] **T5 — Persistência de sessão (teste):** provar AC1/AC5 — a mesma sessão vale em requisições
  subsequentes (persistência em banco); sessão expirada/adulterada → 401 (envelhecer a sessão no
  banco para simular expiração, como se faz com os contadores do G1).
- [ ] **T6 — Login mínimo (Web):** página `/login` que posta credenciais à API interna
  (`/api/auth/sign-in/email`) com `credentials: 'include'`, recebe o cookie de sessão, e trata os
  estados honestos (credencial inválida → mensagem neutra; 429 → aviso de limite). UI mínima — a
  casca rica é 1.7.
- [ ] **T7 — Proteção de rota (Web):** `middleware.ts` do Next.js que, para rotas protegidas, checa a
  presença de sessão e redireciona ao `/login` quando ausente; a página protegida também confirma no
  **servidor** (via API) e degrada honestamente (o middleware é UX, a negação real é do backend).
- [ ] **T8 — Logout (Web):** controle de logout que chama `POST /api/auth/sign-out` e redireciona ao
  `/login`. Sem revogação global.
- [ ] **T9 — Bateria de validação proporcional (risco NORMAL):** testes direcionados + integração
  real (PostgreSQL), typecheck (src+test), lint, format, build, e o ciclo Docker/smoke no fechamento
  do Lote. Um revisor independente (não três — risco NORMAL). CI completo no fechamento do Lote 1.

---

## Notas de teste (armadilhas conhecidas desta base)

- **Banco real, não mock:** AC2 (revalidação de Membership) e AC1/AC5 (persistência/expiração) só
  provam contra PostgreSQL de verdade — quem nega é o resolver + o banco. Testes rodam em paralelo:
  escreva na **Org C** com conta de escrita própria; envelheça a sessão no banco em vez de esperar o
  relógio (padrão do G1).
- **Prove a fase vermelha** dos testes de segurança (AC2, AC3): quebre a revalidação/o escopo do
  logout de propósito e confirme que o teste fica vermelho, antes de declarar verde.
- **Cross-origin:** o cookie de sessão precisa atravessar Web(:3000)→API(:3001). Reusar a config de
  CORS/CSRF da 1.4 (`trustedOrigins`), `credentials: 'include'` no fetch, e `sameSite` compatível.
  Provar no container de produção (a checagem de origem é relaxada em teste).

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (create-story) a partir do épico (Story 1.5), do código real da 1.4 (sessão/guard/resolver) e do context7 do Better Auth. Classificada CORE/Lote 1, risco NORMAL. Registrado o gate de Arquitetura (expiração por inatividade) e a descoberta de que a revalidação de Membership já é estrutural (a 1.5 a prova pela via da sessão). Status → ready-for-dev. |
