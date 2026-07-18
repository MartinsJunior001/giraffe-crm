# Tasks — Capacidade compartilhada de arquivos (Story 3.7)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **ADR**: `docs/03-arquitetura/adr-001-capacidade-de-arquivos.md`

> Testes de segurança são **obrigatórios** (não opcionais) nesta Story: fail-closed, isolamento e imutabilidade só se provam com integração real + mutação. Cada tabela nova tem `*-rls` com **fase vermelha provada**.

## Fase 0 — Pré-requisito bloqueante (tech story SEPARADA, mergeada antes)

- [ ] T001 Extrair o rate limiter atômico de `apps/api/src/pipes/public-submissions/public-rate-limit.ts` para `apps/api/src/kernel/antiabuso/` (primitivo genérico), mantendo a 2.8 verde (branch `tech/*` própria, PR → merge **antes** da 3.7). *(Fora do diff da 3.7 — ver Dev Notes da story.)*

## Fase 1 — Setup e gate

- [ ] T002 Rodar `context7-check` para o SDK S3 e o client ClamAV nas versões a fixar; registrar as assinaturas usadas (não inventar) em `plan.md`/research.
- [ ] T003 Adicionar ao `docker-compose` um override **dev/CI isolado** (`docker-compose.dev-files.yml`) com MinIO + ClamAV; **jamais** no host do Chatwoot (AD-32). Wire no CI (`.github/workflows/ci.yml`) provisionando ambos para a suíte da API.
- [ ] T004 Consumir/estender `apps/api/src/kernel/config/env.ts`: confirmar `FILE_UPLOAD_ENABLED` (default false) e adicionar envs de storage (endpoint/bucket/credencial), ClamAV (host/porta/`CLAMAV_DB_MAX_AGE_HOURS`) e limites (`FILE_MAX_BYTES`, `FILE_MAX_PER_RESOURCE=10`, allowlist), validados por Zod, fail-closed. **Não** reintroduzir `FILES_ENABLED`.

## Fase 2 — Foundational (bloqueia todas as US)

- [ ] T005 Migration `files_capability`: criar `FileObject`, `FileScan`, `ScanSlot` (schema.prisma + SQL) conforme `data-model.md`. RLS ENABLE+FORCE + 4 policies + WITH CHECK (INSERT e UPDATE) em `FileObject`/`FileScan`; `ScanSlot` global sem RLS.
- [ ] T006 GRANTs: `FileObject` = `SELECT,INSERT` + `UPDATE(state,nomeOriginal,updatedAt,purgedAt)` **sem DELETE**; `FileScan` = `SELECT,INSERT`; `ScanSlot` = `SELECT,INSERT,DELETE`. Adicionar `FileObject`/`FileScan` a `MODELOS_AUDITADOS`.
- [ ] T007 [P] Documentar e ensaiar o **rollback drill** da migration (migration-check); `db:rollback` reverte limpo.
- [ ] T008 `apps/api/src/kernel/storage/` — client S3 (buckets privados): `putQuarentena`, `getStream`, `copyIfMatch`, `remove`; chave opaca `<orgId>/<uuidv4>`; guarda de tenant por **segmento**; sem credencial em log/health.
- [ ] T009 `apps/api/src/kernel/antiabuso/scan-slot.ts` — semáforo `adquirirSlot`/`liberarSlot` sobre `ScanSlot` (statement atômico; teto por Org; 429 no teto).

## Fase 3 — US1: Upload com quarentena e verificação fail-closed (P1) 🎯 MVP

- [ ] T010 [US1] `apps/api/src/files/file-validation.core.ts` (puro): magic bytes (allowlist; `.txt/.csv/.json` fora), tamanho, contagem `FILE_MAX_PER_RESOURCE`; fail-closed → 400.
- [ ] T011 [US1] `apps/api/src/files/file-states.core.ts` (puro): máquina de estados + transições idempotentes (guarda otimista).
- [ ] T012 [US1] `apps/api/src/files/file-verdict.core.ts` (puro): veredito **composto** (magic bytes + tamanho + 2×SHA + ClamAV CLEAN + if-match).
- [ ] T013 [US1] Integração ClamAV (`files.service` ou `kernel`): `AlertExceedsMax yes`, canário EICAR no health, `CLAMAV_DB_MAX_AGE_HOURS`; erro/timeout → `BLOCKED`.
- [ ] T014 [US1] `files.service`: fluxo upload→quarentena→scan(2×SHA, ScanSlot)→promoção **atômica** (INSERT FileScan + UPDATE FileObject.state no client raiz, `definirContextoOrg`); P2002/P2028 → idempotente/409.
- [ ] T015 [US1] `POST` upload em `files.controller` (multipart), gate `FILE_UPLOAD_ENABLED`, autz `podeEditar` via `FileAuthzContract`.
- [ ] T016 [US1] `test/files-rls.test.ts` — provar RLS/GRANT das 3 tabelas com **fase vermelha** (quebrar WITH CHECK e o GRANT sem-DELETE de propósito).
- [ ] T017 [US1] `test/files-scan-fail-closed.test.ts` (mutação) — EICAR→BLOCKED; ClamAV down/timeout→BLOCKED; zip bomb→BLOCKED; base velha→recusa; troca de bytes ingest×releitura→BLOCKED.

## Fase 4 — US2: Download por stream sob sessão (P1)

- [ ] T018 [US2] `GET` download em `files.controller`: **stream** sob sessão (nunca redirect a bucket), só `DISPONIVEL`, autz `podeLer`; nunca aceita a chave como autorização.
- [ ] T019 [US2] `test/files-download-session.test.ts` — usuário com leitura baixa por stream; resposta sem chave/URL de bucket/link permanente; sem sessão → negado.

## Fase 5 — US3: Sem acesso cruzado mesmo conhecendo a chave (P1)

- [ ] T020 [US3] Endurecer a guarda de tenant (por segmento) no client de storage e no serviço; sem acesso → 404 não-enumerante.
- [ ] T021 [US3] `test/files-cross-tenant.test.ts` (mutação) — Org B com a chave da Org A → 404; provar segmento (não `startsWith`).

## Fase 6 — US4: Remoção lógica → expurgo físico (P2)

- [ ] T022 [US4] Operação `remover` (lógica) → `REMOVIDO_LOGICO`; primitiva de expurgo físico do binário (storage `remove`); elegibilidade por retenção.
- [ ] T023 [US4] `test/files-purge-lgpd.test.ts` — remoção→indisponível→expurgo; sem DELETE físico de linha; retenção legal registrada. `lgpd-check` + `backup-check`.

## Fase 7 — US5: Validação server-side com checksum (P2)

- [ ] T024 [US5] Expor limites (para "exibir antes do envio") e substituir arquivo único (transição, sem apagar silenciosamente — evento é do consumidor 3.8).
- [ ] T025 [US5] `test/files-validation.test.ts` (mutação) — executável renomeado `.png` rejeitado; acima do tamanho rejeitado; 11º arquivo rejeitado (limite 10).

## Fase 8 — Polish e gates transversais

- [ ] T026 [P] `FileAuthzContract` (porta) + binding de teste; `files.module.ts`; export do necessário para 3.8/3.10 ligarem depois.
- [ ] T027 [P] Observabilidade: logs sanitizados (sem PII/chave/bytes), métricas de veredito/quarentena (`observability-check`).
- [ ] T028 Gates finais: `security-check`, `pre-implementation-check` (relatório APROVADO), typecheck/lint/format, suíte serial verde (`pnpm test:ci`).

## Dependências e ordem

- **T001 (tech story) mergeada ANTES de tudo.** Depois: Fase 1 → Fase 2 (foundational, bloqueia US) → US1 (MVP) → US2 → US3 → US4 → US5 → Polish.
- Paralelizáveis [P]: T007, T026, T027 (arquivos independentes).
- **MVP** = US1 (upload+quarentena+fail-closed) — já entrega "arquivo seguro com verificação fail-closed", a demonstração vertical do épico.
