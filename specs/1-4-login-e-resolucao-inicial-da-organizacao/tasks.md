# Tasks — Story 1.4 (login e resolução inicial da Organização)

Ordenadas por dependência. Cada task nomeia o artefato e a prova.

## Phase 1 — Gates pré-código

- [ ] T001 `context7-check` do Better Auth na versão fixada: chave do rate limiter, `storage`, adapter Prisma, `modelName`, timing de conta inexistente
- [ ] T002 `pre-implementation-check` — GO / GO WITH CONDITIONS / NO-GO

## Phase 2 — Schema e migration (D1, D2)

- [ ] T003 `Account` recebe `emailVerified` e `image` (o `user` do Better Auth **é** o `Account` — D1)
- [ ] T004 Models `AuthSession`, `AuthCredential`, `AuthVerification`, `RateLimit`, `LoginFailure`
- [ ] T005 Migration **versionada** (nunca `db push`), com `.down.sql` correspondente
- [ ] T006 GRANTs mínimos ao papel `giraffe_app`; `DELETE` em `Account` **continua proibido** (cascata da FK atravessa a RLS — lição da 1.2)
- [ ] T007 Teste: o runtime **não** consegue apagar `Account` nem escalar privilégio nas tabelas novas
- [ ] T008 `migration-check` e `backup-check` — migration em banco vazio, sobre estado existente, rollback, backup+restore

## Phase 3 — Better Auth (D1, D3)

- [ ] T009 Instalar na versão fixada; adapter Prisma; `modelName` mapeando `user → Account`
- [ ] T010 `rateLimit: { storage: 'database', customRules: { '/sign-in/email': { window: 900, max: 20 } } }` (G2)
- [ ] T011 Teste G2: 21ª solicitação do mesmo IP ⇒ 429 + `X-Retry-After`, **mesmo variando o identificador** (SC-404)
- [ ] T012 Teste: contadores sobrevivem a **restart** (SC-408) e são compartilhados entre **instâncias** (SC-409)

## Phase 4 — IP confiável (D5)

- [ ] T013 `TRUSTED_PROXY_IPS` no env (Zod), **vazio por padrão**; sem proxy confiável ⇒ IP do socket
- [ ] T014 Teste de **spoofing**: `X-Forwarded-For` forjado pelo cliente **não** contorna o G2 (SC-407)
- [ ] T015 Teste: cadeia encaminhada sem proxy confiável configurado é **ignorada**
- [ ] T016 Registrar **gate de staging**: validar contra o proxy real do Coolify (não inventar faixas agora)

## Phase 5 — Contador G1 (D4)

- [ ] T017 `LoginFailure` com chave **HMAC** do identificador normalizado + prefixo de finalidade; segredo de ambiente
- [ ] T018 Incremento **atômico** (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`) — **sem** `SELECT`-depois-`UPDATE`
- [ ] T019 Só **falhas** incrementam (FR-406)
- [ ] T020 Sucesso limpa **só** o contador do identificador; **não** o de IP (FR-407, SC-405)
- [ ] T021 Teste: 6ª falha ⇒ 429 **mesmo com a senha correta** (SC-403)
- [ ] T022 Teste: **nenhum bloqueio permanente** — expirada a janela, a vítima entra (SC-406)
- [ ] T023 Teste de **concorrência**: 5 falhas simultâneas contam 5, sem *lost update* (SC-411)
- [ ] T024 Teste: normalização — `  ANA@Exemplo.TEST ` e `ana@exemplo.test` caem na **mesma** chave
- [ ] T025 Teste: **nenhum e-mail em claro** na tabela, no log, no erro ou na métrica (SC-410)
- [ ] T026 Rotação do segredo HMAC versionada (D6) + teste: rotação **não** zera contadores em silêncio; emite `auth.hmac.rotated`

## Phase 6 — Enumeração e timing (D7)

- [ ] T027 Teste: senha errada vs. conta inexistente ⇒ corpo, status e formato **idênticos** (SC-402)
- [ ] T028 Teste: **tempo** na mesma ordem de grandeza (o caminho "conta não existe" não pode ser mais barato)
- [ ] T029 Teste: 429 do G1 é indistinguível entre conta existente e inexistente (FR-409)
- [ ] T030 Teste: senha **nunca** em log, erro ou métrica (FR-403)

## Phase 7 — Sessão e Principal (FR-404)

- [ ] T031 `SessaoPrincipalProvider` substitui `SemSessaoPrincipalProvider` — **o guard e o resolvedor da 1.3 não mudam uma linha**
- [ ] T032 Teste: sessão válida ⇒ 200; sessão inválida/expirada ⇒ **401** (SC-412)
- [ ] T033 Teste de regressão: `/health` e `/ready` continuam dispensados

## Phase 8 — Resolução inicial da Organização (FR-414..418)

- [ ] T034 Zero Membership ativa ⇒ estado autenticado **sem Organização** (não o Dashboard)
- [ ] T035 Uma ⇒ contexto selecionado. Múltiplas ⇒ **escolha explícita** (SC-413)
- [ ] T036 `activeOrganizationId` é **pedido**, não autoridade — conferido pelo `OrgContextResolver` da 1.3
- [ ] T037 Teste de regressão: Membership `SUSPENDED`/`REMOVED` não concede contexto (SC-414); Organização alheia ⇒ 403 (SC-415)

## Phase 9 — Gates e integração

- [ ] T038 Mutação nas defesas críticas: quebrar G1, G2, o HMAC, a atomicidade e a confiança de proxy — **cada uma deve deixar um teste vermelho**
- [ ] T039 `security-check`, `lgpd-check`, `observability-check`, `migration-check`, `backup-check` registrados em `gates/1-4/`
- [ ] T040 Ciclo completo: format, lint, typecheck, test, build, Docker com **volume novo**, smoke, Trivy
- [ ] T041 Code review adversarial (3 revisores independentes) → correções → gates → `commit-check` → PR → CI verde

## Débito herdado (não se resolve aqui)

- [ ] **CR-09** — `/ready` precisa de rate limiting **na borda**. **Bloqueia o `STAGING APPROVED`.** Não misturar com login (camadas e propósitos diferentes) e **não** proteger com autenticação: o healthcheck do orquestrador levaria 401 e o deploy morreria.
