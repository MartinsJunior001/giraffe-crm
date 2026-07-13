---
story_key: 1-5-continuidade-de-sessao-logout-e-protecao-de-rotas
epic: 1
status: done
release: CORE (Lote 1)
risco: CRITICAL-FOCUSED
gate_arquitetura: RESOLVIDO em 2026-07-13 — expiração por INATIVIDADE (não absoluta): expiresIn=7d, updateAge=1d (deslize por atividade), cookieCache DESABILITADO. Baseline confirmada pela documentação oficial do Better Auth (context7) e ratificada pelo gate arquitetural.
---

# Story 1.5 — Continuidade de sessão, logout e proteção de rotas

**As a** usuário autenticado,
**I want** sessão persistente vinculada ao meu contexto e logout imediato,
**So that** eu opere com continuidade e saia com segurança.

**Status: done** (encerrada em 2026-07-13; integrada ao `main` pelo PR #5, merge `c329cfa`, CI verde
nos 4 jobs). Classificada **CORE** (Lote 1), risco **CRITICAL-FOCUSED** — altera o ciclo
de vida da sessão e os cookies de autenticação, superfície de segurança direta. Primeira Story após a
1.4; conecta a sessão do Better Auth (já emitida no login da 1.4) à continuidade, ao logout e à
proteção de rota — **sem reinventar** o caminho de identidade/autorização. Os débitos que seguem para o
gate de staging estão catalogados em `gates/1-5/summary.md` (D-06 e o refinamento LOW do painel).

> **Por que CRITICAL-FOCUSED (e não NORMAL):** mexer em `expiresIn`/`updateAge`/`cookieCache` e nas
> flags de cookie é decidir, na prática, por quanto tempo uma credencial vale e se uma sessão revogada
> ainda é aceita. Um erro aqui não é bug de UX — é sessão que não expira, cookie sem `Secure`/`HttpOnly`
> em produção, ou logout que não revoga de fato. Por isso esta Story recebe o **processo crítico**:
> revisão adversarial em três agentes (Blind Security, Edge Case Hunter, Acceptance Auditor) e
> **mutação** dos invariantes de segurança (ver seção de mutação).

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

## Gate de Arquitetura — RESOLVIDO (2026-07-13)

**Expiração por INATIVIDADE, não absoluta.** O épico exige expiração por inatividade; **não** existe
requisito de expiração absoluta (teto rígido de vida da sessão independente de uso). Portanto **não se
inventa teto absoluto**: registra-se explicitamente que **uma sessão ativa continua sendo renovada**
enquanto for usada dentro da janela de deslize.

**Como o Better Auth modela isso** (confirmado no context7, versão fixada 1.6.23):

- `session.expiresIn` — duração da sessão. Como ela é **estendida a cada uso** (ver `updateAge`),
  na prática funciona como a **janela de inatividade**: sem uso por mais que `expiresIn`, a sessão
  expira; com uso, ela é empurrada para frente.
- `session.updateAge` — limiar de **deslize**: a expiração só é reescrita quando a sessão é usada
  **após** `updateAge` desde a última renovação (evita um UPDATE por requisição).
- **Não há teto absoluto no modelo default.** Uma sessão usada regularmente renova indefinidamente —
  que é exatamente o requisito de "expiração somente por inatividade".
- `session.disableSessionRefresh: true` **desligaria** a renovação (a sessão deixaria de deslizar).
  **Proibido aqui** — é justamente um dos alvos de mutação (impedir renovação → teste deve ficar
  vermelho).

**Baseline ratificada (confirmada pela doc oficial + gate; não afrouxar):**

| Parâmetro | Valor | Motivo |
|---|---|---|
| `session.expiresIn` | **7 dias** (`60*60*24*7`) | Janela de inatividade. Exemplo canônico da doc do Better Auth. |
| `session.updateAge` | **1 dia** (`60*60*24`) | Desliza a cada uso após ~1 dia; sessão ativa nunca expira por inatividade. |
| renovação | **deslizante por atividade**, indefinida | Sessão ativa continua renovando (sem teto absoluto). |
| cookie `httpOnly` | **sempre** | Better Auth: cookies são `httpOnly` por padrão. JS não lê o token. |
| cookie `secure` | **obrigatório em produção** | Better Auth aplica `Secure` automaticamente em modo produção; **não** em dev (http), para o cookie continuar usável localmente. |
| cookie `sameSite` | `lax` (default) | Compatível com a topologia same-site Web(:3000)↔API(:3001)/produção same-origin via proxy. Ver Nota de topologia. |
| domínio/path | **mínimos** | Sem `crossSubDomainCookies` e sem domínio explícito por padrão; path na raiz do basePath. Só ampliar se a topologia real de produção exigir (débito de staging D-01). |
| `session.cookieCache` | **DESABILITADO** (`enabled: false`, explícito) | Ver gate de `cookieCache` abaixo — revogação imediata é requisito. |
| persistência | **banco** (`AuthSession`, `storage: 'database'` já configurado na 1.4) | Sobrevive a restart, compartilhada entre réplicas (mesmo motivo do G2). |

### Gate de `cookieCache` (item de segurança obrigatório)

O `cookieCache` é uma otimização: quando **habilitado**, o Better Auth serve os dados da sessão a partir
de um cookie assinado por até `maxAge` segundos, **sem** reconsultar o banco. Consequência (confirmada
na fonte): **uma sessão revogada pode continuar sendo aceita até o cache expirar** — a doc oficial
recomenda desabilitar `cookieCache`, ou usar `maxAge` curto, ou `disableCookieCache: true` em operações
sensíveis, exatamente quando **revogação imediata** é requisito.

**Decisão:** aqui **revogação imediata É requisito** (logout RN-012, e a revalidação de Membership por
requisição). Portanto:

- `cookieCache` fica **DESABILITADO explicitamente** (`session: { cookieCache: { enabled: false } }`).
  Hoje ele já está no default (`false`), mas torná-lo explícito converte um default silencioso num
  invariante visível e revisável.
- **Coberto por teste:** logo após `POST /api/auth/sign-out`, `getSession` na mesma sessão devolve
  **null** imediatamente (nenhuma janela de cache aceitando a sessão revogada).
- **Nota:** a revalidação de **Membership** (AC2) já é independente do cache de sessão — quem bloqueia
  um membro suspenso é o `OrgContextResolver`, que consulta o banco a cada requisição. O `cookieCache`
  afeta a imediaticidade do **logout/expiração de sessão**, não a de Membership; ambos ficam provados.

---

## Descobertas de arquitetura (o que JÁ existe — não reimplementar)

> Lido do código real em `apps/api/src/kernel/`. Estado na Story 1.4 (done).

- **`auth.factory.ts`** — hoje o bloco `session` define apenas `modelName` e `additionalFields`.
  **Não** define `expiresIn`, `updateAge` nem `cookieCache` → tudo roda nos **defaults** do Better Auth
  (7d/1d, cache off). A T2 torna esses valores **explícitos** (nada de default silencioso — a decisão
  de segurança precisa estar escrita no código).
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
- **`auth.controller.ts`** — Better Auth montado sob `/api/auth/*` (`sign-in/email` já funciona).
  `trustedOrigins` = allowlist de CORS (CSRF). O **logout** usa o endpoint nativo
  `POST /api/auth/sign-out`, que invalida **a sessão corrente** e limpa o cookie — RN-012 por padrão.
  `signOut` (server) / `revokeSession(token)` encerram sessão específica; `revokeSessions` (todas) e
  `revokeOtherSessions` são **fora de escopo** (1.10/1.12/1.13).
- **Web (`apps/web/`)** — hoje só a casca de saúde (`app/page.tsx`, `/healthz`, `layout.tsx`).
  **Não há página de Login nem `middleware.ts`.** `lib/api.ts`/`lib/env.ts` já falam com a API interna
  (variável de **servidor** `API_BASE_URL`, sem `NEXT_PUBLIC_`). A proteção de rota e um Login mínimo
  entram nesta Story.

### Nota de topologia (cookie cross-origin) — débito de staging vinculado

O cookie de sessão precisa atravessar Web→API. Em **dev**, `localhost:3000` e `localhost:3001` são
**same-site** (mesmo domínio registrável `localhost`), então `sameSite=lax` + `credentials: 'include'`
bastam e o cookie **não** é `Secure` (http local). Em **produção**, a topologia real (mesma origem via
reverse proxy do Coolify, ou subdomínios `app.`/`api.`) decide `sameSite`/domínio — este é o débito de
staging **D-01/CR-09**, que o Integration Agent verifica em paralelo. Baseline: **não** usar
`sameSite=none` (afrouxaria CSRF e exigiria Secure sempre) a menos que a topologia comprovadamente
precise; preferir same-origin via proxy. A checagem de origem do Better Auth é **relaxada em teste** e
**real no container de produção** — provar lá.

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
5. **Segredos/PII:** nada de token de sessão em log/erro/resposta; sanitização mantida (redaction já
   cobre `cookie`/`set-cookie`/`authorization`).
6. **Expiração por inatividade, sem teto absoluto.** Sessão ativa renova indefinidamente; `expiresIn`
   é a janela de inatividade, não um limite de vida. `disableSessionRefresh` proibido.
7. **`cookieCache` desabilitado.** Revogação (logout/expiração) tem efeito imediato — nenhuma janela
   de cache assinado aceitando sessão revogada.

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
5. **Given** uma sessão **expirada** por inatividade **When** o usuário tenta operar **Then** é exigida
   nova autenticação (getSession → null → 401 → redireciona ao Login). **Given** uma sessão **ativa**
   **Then** ela continua sendo renovada e não expira.

---

## Bateria de testes obrigatória (11 testes — todos exigidos, nenhum opcional)

> Integração real contra PostgreSQL. Envelhecer/adulterar a sessão **no banco** em vez de esperar o
> relógio (padrão do G1). Escrever na **Org C** com conta de escrita própria (fixtures A/B são leitura).

- **TS-01 — sessão vale antes de `expiresIn`:** requisições subsequentes com a mesma sessão → 200/válida
  (persistência em banco). (AC1)
- **TS-02 — atividade antes de `updateAge` NÃO renova desnecessariamente:** usar a sessão dentro da
  janela de `updateAge` **não** reescreve `expiresAt` (evita UPDATE por requisição). Provar lendo
  `expiresAt` antes/depois: inalterado.
- **TS-03 — atividade depois de `updateAge` renova por `expiresIn`:** envelhecer a última renovação
  além de `updateAge`; ao usar, `expiresAt` é empurrado para ~agora+`expiresIn`. Sessão ativa renova.
  (AC5, parte positiva)
- **TS-04 — inatividade > 7 dias invalida:** envelhecer `expiresAt` no banco para o passado → getSession
  devolve null → 401. (AC5)
- **TS-05 — sessão expirada falha fechada:** sessão expirada/adulterada → 401 (nunca "quase válida",
  nunca 200 degradado).
- **TS-06 — logout revoga a sessão corrente:** após `POST /api/auth/sign-out`, getSession na mesma
  sessão → null **imediatamente** (prova o `cookieCache` desabilitado: sem janela de aceitação). (AC3)
- **TS-07 — cookie de produção tem `Secure`/`HttpOnly`/`SameSite` esperado:** no container de produção,
  o `Set-Cookie` do login carrega `HttpOnly`, `Secure` e o `SameSite` da baseline.
- **TS-08 — cookie de dev permanece usável sem afrouxar produção:** em dev (http), o cookie funciona
  **sem** `Secure`; a mesma config em produção aplica `Secure`. Provar que dev não força o afrouxamento
  de produção (nada de `useSecureCookies:false` global).
- **TS-09 — sessão de uma Organização não permite acesso a outra:** sessão válida da Org C não obtém
  contexto/dados da Org A/B (isolamento-mãe pela via da sessão). (AC2, reforço cross-tenant)
- **TS-10 — concorrência na renovação não cria sessões inconsistentes:** duas requisições concorrentes
  que disparam o deslize não duplicam nem corrompem o registro de sessão (uma sessão, um `expiresAt`
  coerente).
- **TS-11 — nenhum token/cookie aparece em log:** exercitar login/uso/logout e confirmar que
  `authorization`/`cookie`/`set-cookie`/token de sessão **não** aparecem nos logs (redaction efetiva).

**Cobertura dos ACs pelos testes:** AC1→TS-01; AC2→TS-09 (+ T-membership abaixo); AC3→TS-06;
AC4→testes HTTP de 401 sem sessão + middleware; AC5→TS-03/TS-04/TS-05.

**Teste de Membership (AC2, sem novo código):** sessão válida de membro **suspenso** e de **REMOVED**
→ 403 em `/organizations/current`; membro **ACTIVE** → 200. Prova que a sessão não dispensa a
revalidação (o resolver + o banco negam).

---

## Mutação obrigatória (apenas os invariantes críticos)

Aplicar cada mutação, rodar a bateria, confirmar que o(s) teste(s) correspondente(s) fica(m)
**VERMELHO(S)**, depois reverter. Prova que os testes realmente guardam o invariante (não passam por
acaso):

| # | Mutação | Teste que deve ficar vermelho |
|---|---|---|
| M1 | **Remover a expiração** (ex.: `expiresIn` gigantesco/ausente de forma que sessão expirada seja aceita) | TS-04, TS-05 |
| M2 | **Impedir a renovação** (`disableSessionRefresh: true`) | TS-03 |
| M3 | **Remover `Secure`/`HttpOnly` em produção** (ex.: `useSecureCookies:false` ou atributo removido) | TS-07 |
| M4 | **Aceitar sessão expirada** (habilitar `cookieCache` com `maxAge` longo, ou bypass que sirva sessão revogada) | TS-06, TS-05 |

---

## Tasks / Subtasks

- [x] **T1 — context7-check do Better Auth (feito):** confirmado na versão 1.6.23 — `session.expiresIn`
  (7d) / `updateAge` (1d) como janela deslizante de inatividade; `cookieCache` default `false` e
  recomendação oficial de desabilitá-lo para revogação imediata; `disableSessionRefresh` desliga o
  deslize; cookies `httpOnly`+`secure` automáticos em produção; `sign-out` invalida a sessão corrente.
  Registrar o resumo em `gates/1-5/context7-check.md`.
- [x] **T2 — Config de sessão explícita (`auth.factory.ts`):** definir `session.expiresIn = 60*60*24*7`,
  `session.updateAge = 60*60*24`, `session.cookieCache = { enabled: false }`. Garantir `httpOnly`
  (default) e `secure` automático em produção; `sameSite` compatível (default `lax`). **Sem defaults
  silenciosos**; **sem** `disableSessionRefresh`; **sem** teto absoluto inventado.
- [x] **T3 — Logout (backend):** garantir `POST /api/auth/sign-out` exposto e que invalida **só** a
  sessão corrente e revoga **imediatamente** (cookieCache off). Testes: TS-06 (revogação imediata) +
  duas sessões da mesma Account, logout numa **não** derruba a outra.
- [x] **T4 — Revalidação de Membership pela via da sessão (teste, sem novo código):** teste de
  integração real provando AC2 — sessão válida de membro **suspenso** (e outro **REMOVED**) → 403 em
  `/organizations/current`; membro ACTIVE → 200. Org C / conta de escrita.
- [x] **T5 — Ciclo de vida da sessão (testes TS-01..TS-05, TS-09, TS-10):** persistência, deslize por
  `updateAge`, renovação por atividade, expiração por inatividade, falha fechada, isolamento
  cross-tenant e concorrência de renovação. Envelhecer a sessão no banco para simular tempo.
- [x] **T6 — Login mínimo (Web):** página `/login` que posta credenciais à API interna
  (`/api/auth/sign-in/email`) com `credentials: 'include'`, recebe o cookie de sessão, e trata os
  estados honestos (credencial inválida → mensagem neutra; 429 → aviso de limite). UI mínima — a
  casca rica é 1.7.
- [x] **T7 — Proteção de rota (Web):** `middleware.ts` do Next.js que, para rotas protegidas, checa a
  presença de sessão e redireciona ao `/login` quando ausente; a página protegida também confirma no
  **servidor** (via API) e degrada honestamente (o middleware é UX, a negação real é do backend).
- [x] **T8 — Logout (Web):** controle de logout que chama `POST /api/auth/sign-out` e redireciona ao
  `/login`. Sem revogação global.
- [x] **T9 — Flags de cookie e log (testes TS-07, TS-08, TS-11):** cookie de produção com
  `Secure`/`HttpOnly`/`SameSite` esperado; cookie de dev usável sem afrouxar produção; nenhum token em
  log. TS-07/TS-08 provados no container de produção (checagem de origem/secure é real lá).
- [x] **T10 — Mutação dos invariantes críticos (M1–M4):** aplicar cada mutação, provar a fase vermelha,
  reverter. Registrar as evidências.
- [~] **T11 — Bateria de validação (processo CRÍTICO):** testes direcionados + integração real
  (PostgreSQL), typecheck (src+test), lint, format, build, ciclo Docker/smoke no fechamento do Lote.
  Revisão adversarial em **três** agentes (Blind Security: cookie/revogação/fixação/expiração; Edge
  Case Hunter: tempo/concorrência/renovação; Acceptance Auditor: exclusivamente os critérios da 1.5),
  com **escritor único**. CI completo no fechamento do Lote 1.

---

## Notas de teste (armadilhas conhecidas desta base)

- **Banco real, não mock:** AC2 e o ciclo de vida da sessão só provam contra PostgreSQL de verdade —
  quem nega é o resolver + o banco. Testes rodam em paralelo: escreva na **Org C** com conta de escrita
  própria; envelheça a sessão no banco em vez de esperar o relógio (padrão do G1).
- **Prove a fase vermelha** dos testes de segurança (mutação M1–M4): quebre o invariante de propósito e
  confirme o teste vermelho antes de declarar verde. Um teste que não falha sob mutação não guarda nada.
- **Cross-origin:** o cookie de sessão precisa atravessar Web(:3000)→API(:3001). Reusar a config de
  CORS/CSRF da 1.4 (`trustedOrigins`), `credentials: 'include'` no fetch, e `sameSite` compatível.
  Provar no container de produção (a checagem de origem é relaxada em teste).

---

## Dev Agent Record

### Implementação (resumo)

- **Backend (`auth.factory.ts`):** `session.expiresIn=7d`, `updateAge=1d`, `cookieCache:{enabled:false}`
  explícitos. Sem `disableSessionRefresh`, sem teto absoluto. `httpOnly` default; `secure` deriva do
  esquema https do `BETTER_AUTH_URL`; `sameSite=lax`.
- **Seed:** conta de escrita **Iris** (`99999…`) com credencial (`seed.sql` + `seed-credentials.mjs`),
  exclusiva de `sessao.test.ts` — sessão real, cleanup por `userId`, vínculo próprio na Org C.
- **Testes API (`sessao.test.ts`):** 13 testes (TS-01..TS-11 + T012 duas sessões + T013 Membership),
  integração real, envelhecendo a sessão no banco; IP sintético isola o G2 do `login-http.test.ts`.
- **Web (BFF):** `lib/session.ts` (detecção de sessão dev/`__Secure-`, `decidirAcesso`, `ehMesmaOrigem`,
  `SESSION_MAX_AGE_S`), `lib/auth.ts` (login/logout/orgAtual server-side), `proxy.ts` (proteção de rota
  **+ deslize do cookie**), `/login`, `/api/session` (relay + CSRF), `/logout` (relay + CSRF), `/painel`
  (confirma no servidor). Testes Web: `session`, `auth`, `proxy`, `csrf-routes`.

### Gates e evidências

- **API 207/207**, **Web 33/33**; typecheck (src+test) API+Web; lint; format; build API+Web — verdes.
- **Mutação M1–M4** provada vermelha e revertida (`gates/1-5/mutation-evidence.md`).
- `context7-check`, `pre-implementation-check` (APROVADO), `security-check` (APROVADO),
  `observability-check` (APROVADO) — em `gates/1-5/`.
- **Revisão adversarial (3 agentes)**: 2 HIGH corrigidos e cobertos por teste (login CSRF no BFF; teto
  absoluto de 7 dias resolvido pelo deslize de cookie no proxy); MEDIUM/LOW tratados ou registrados como
  débito. Detalhe em `gates/1-5/review-adversarial.md`.
- **Pendente de fechamento (PR/CI):** job `containers` (ciclo Docker/smoke) reprova/prova TS-07 no
  container de produção; CI completo do Lote 1.

### File List

- `apps/api/src/kernel/auth/auth.factory.ts` (config de sessão)
- `apps/api/prisma/seed.sql`, `apps/api/prisma/seed-credentials.mjs` (conta Iris)
- `apps/api/test/sessao.test.ts` (novo)
- `apps/web/lib/session.ts`, `apps/web/lib/auth.ts` (novos)
- `apps/web/proxy.ts` (novo), `apps/web/app/login/page.tsx`, `apps/web/app/api/session/route.ts`,
  `apps/web/app/logout/route.ts`, `apps/web/app/painel/page.tsx` (novos)
- `apps/web/vitest.config.ts` (alias `@/`)
- `apps/web/test/{session,auth,proxy,csrf-routes}.test.ts` (novos)
- `specs/1-5-.../{spec,plan,tasks}.md`; `_bmad-output/.../gates/1-5/*`

### Débitos encaminhados

Catalogados com atributos completos (responsável, impacto, Story-alvo, teste de reprodução, critério
objetivo de correção e gate de staging) em **`gates/1-5/summary.md`**:

- **D-06** — rate limiter transacional pode 500 sob rajada direta a `/api/auth/*` (pré-1.4; falha
  **fechada**, não é bypass de segurança) → **bloqueia STAGING APPROVED** enquanto não houver mitigação
  e teste que prove ausência de 500 sob rajada.
- **D-07 (LOW)** — robustez da reconstrução do header de cookie no painel → refinamento, não bloqueia.

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (create-story). Classificada CORE/Lote 1, risco NORMAL, gate de Arquitetura PENDENTE. |
| 2026-07-13 | Ajuste de checkpoint (11 pontos): reclassificada **CRITICAL-FOCUSED**; gate de Arquitetura **RESOLVIDO** com baseline confirmada no context7 (expiresIn=7d/updateAge=1d, inatividade sem teto absoluto, sessão ativa renova indefinidamente); adicionado o **gate de `cookieCache`** (desabilitado, prova de revogação imediata); substituída a lista de tarefas/testes pela **bateria de 11 testes** obrigatórios + teste de Membership; adicionada a **mutação M1–M4** dos invariantes críticos; processo elevado para revisão adversarial em três agentes com escritor único. |
| 2026-07-13 | Implementação concluída: config de sessão explícita, seed da conta Iris, 13 testes de sessão (API), camada Web BFF (login/logout/proteção de rota + deslize de cookie). Mutação M1–M4 comprovada. Revisão adversarial (3 agentes): 2 HIGH corrigidos e cobertos — **login CSRF no BFF** (checagem de mesma origem) e **teto absoluto de 7 dias** (deslize do cookie no proxy) — MEDIUM/LOW tratados ou como débito. Gates locais verdes (API 207/207, Web 33/33). security-check e observability-check APROVADOS. Pendente: PR → CI (containers/smoke) → merge. |
| 2026-07-13 | **Story encerrada como `done`.** PR #5 integrado ao `main` (`--no-ff`, merge `c329cfa`) com CI verde nos 4 jobs (Qualidade, Testes PostgreSQL real, Containers boot+smoke, Segurança). Encerramento administrativo pela branch `tech/encerra-story-1-5`. Débito **D-06 formalizado** com os 6 atributos em `gates/1-5/summary.md` e marcado como **bloqueador de STAGING APPROVED**. `sprint-status.yaml`: `1-5 → done`. Próxima: preparação da Story 1.6 (substrato de autorização efetiva). |
