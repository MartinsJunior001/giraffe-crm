# Tasks — Story 1.5 (continuidade de sessão, logout e proteção de rotas)

Ordenadas por dependência. Cada task nomeia o artefato e a prova. Sem migration.

## Phase 1 — Gates pré-código

- [x] T001 `context7-check` do Better Auth 1.6.23 (expiresIn/updateAge, cookieCache off, sign-out da sessão corrente, cookies) — `gates/1-5/context7-check.md`
- [x] T002 `pre-implementation-check` — **APROVADO** — `gates/1-5/pre-implementation-check.md`

## Phase 2 — Config de sessão (P1)

- [ ] T003 `auth.factory.ts`: `session.expiresIn=60*60*24*7`, `updateAge=60*60*24`, `cookieCache:{enabled:false}` (explícitos; sem `disableSessionRefresh`; sem teto absoluto)
- [ ] T004 Confirmar `httpOnly` (default) e `secure` automático em produção; `sameSite=lax`; **não** afrouxar produção

## Phase 3 — Testes de backend: ciclo de vida (P3)

- [ ] T005 TS-01 sessão vale antes de `expiresIn` (persistência; requisições subsequentes 200) — FR-501
- [ ] T006 TS-02 uso antes de `updateAge` **não** reescreve `expiresAt` — FR-503
- [ ] T007 TS-03 uso depois de `updateAge` renova por `expiresIn` (sessão ativa renova) — FR-502/503
- [ ] T008 TS-04 inatividade > 7 dias invalida (envelhecer `expiresAt` no banco → 401) — FR-502
- [ ] T009 TS-05 sessão expirada/adulterada falha fechada (401, nunca 200) — FR-504
- [ ] T010 TS-10 concorrência na renovação não cria sessão inconsistente — SC-510

## Phase 4 — Logout e Membership (P2)

- [ ] T011 TS-06 logout revoga a sessão corrente **imediatamente** (getSession→null pós sign-out; cookieCache off) — FR-505/506
- [ ] T012 Duas sessões da mesma Account: logout numa **não** derruba a outra — FR-505
- [ ] T013 Teste de Membership (sem novo código): suspenso e REMOVED → 403; ACTIVE → 200 em `/organizations/current` — FR-509
- [ ] T014 TS-09 isolamento cross-tenant pela via da sessão (sessão da Org C não acessa A/B) — FR-510

## Phase 5 — Web: login, proteção de rota, logout (P4)

- [ ] T015 `/login` mínimo: POST à API interna com `credentials:'include'`; estados honestos (credencial inválida neutra; 429 aviso) — FR-512
- [ ] T016 `middleware.ts`: rota protegida sem sessão → redireciona `/login` (UX); página protegida confirma no servidor (backend é a autoridade) — FR-511
- [ ] T017 Controle de logout (Web) → `POST /api/auth/sign-out` → `/login`; sem revogação global — FR-512
- [ ] T018 Testes Web: login (sucesso/erro/429), middleware (redirect sem sessão), logout

## Phase 6 — Cookie e log (P1/P3)

- [ ] T019 TS-07 cookie de produção com `Secure`/`HttpOnly`/`SameSite` esperado (container de produção) — FR-507
- [ ] T020 TS-08 cookie de dev usável sem afrouxar produção — FR-507
- [ ] T021 TS-11 nenhum token/cookie em log (login/uso/logout; redaction efetiva) — FR-508

## Phase 7 — Mutação e gates (P3, processo CRÍTICO)

- [ ] T022 Mutação M1 (remover expiração) → TS-04/TS-05 vermelhos; reverter
- [ ] T023 Mutação M2 (`disableSessionRefresh:true`, impedir renovação) → TS-03 vermelho; reverter
- [ ] T024 Mutação M3 (remover `Secure`/`HttpOnly` em produção) → TS-07 vermelho; reverter
- [ ] T025 Mutação M4 (aceitar sessão expirada / cookieCache longo) → TS-06/TS-05 vermelhos; reverter
- [ ] T026 Gates: typecheck (src+test), lint, format, build, API+Web verdes, ciclo Docker/smoke; `security-check` + `observability-check`
- [ ] T027 Revisão adversarial em 3 agentes (Blind Security / Edge Case Hunter / Acceptance Auditor), escritor único; corrigir CRITICAL/HIGH; CI completo no fechamento do Lote 1
