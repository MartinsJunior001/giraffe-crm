# Tasks — Story 3.8: Campo Arquivo funcional e anexo geral (Card/Registro)

> DOCS-ONLY até aqui. Ordem por dependência; frentes F1–F8 do `plan.md`. **BLOQUEIO DURO:** nada abaixo de T001
> começa antes da **3.7 mergeada**. `[P]` = paralelizável (arquivos distintos, sem dependência pendente).

## Fase 1 — Gate pré-código (bloqueante)

- [ ] T001 Confirmar a **3.7 mergeada**; fixar `baseline_commit`, a **assinatura exata do `FileAuthzContract`**
  (Q2 da 3.7), a forma final de `FileObject` e o nome da constante de motivo do gate; rodar `pre-implementation-check`
  + `context7-check` (SDK S3/MinIO, ClamAV, Prisma 6.19.x, NestJS 11 — versões pós-3.7). Registrar em
  `gates/3-8/T001-pre-code-gate.md`. (AC: pré-requisito; resolve NEEDS-3.7)

## Fase 2 — Fundação: binding e valor referencial (bloqueia as demais)

- [ ] T002 [US1] **(F1)** Implementar `FileAuthzContract` para `resourceType=CARD` (`podeLer`→`exigirLerCard`,
  `podeEditar`→`exigirOperarCard`) em `apps/api/src/pipes/` e registrar em `PipesModule`. (AC2/AC4/AC8)
- [ ] T003 [P] [US1] **(F1)** Implementar `FileAuthzContract` para `resourceType=RECORD`
  (`exigirLerDatabase`/`exigirOperarDatabase`) em `apps/api/src/databases/` e registrar em `DatabasesModule`. (AC4/AC8)
- [ ] T004 [US1] **(F1)** Fiação da injeção da porta em `FilesModule` (provider token; consumidor fornece a
  implementação; `files/` não importa authz de domínio — AD-5, sem ciclo). (AC4/AC8)
- [ ] T005 [US1] **(F2)** Substituir o tratamento textual de `FILE` em `apps/api/src/pipes/cards/submission.ts`
  por validação de **referência** (`fileId` único / `fileId[]` por `typeConfig.multiplo`; `AVAILABLE`, mesma Org,
  vinculado ao recurso/finalidade; `QUARANTINED`/cross-recurso → 400/409); allowlist mantida. (AC3)
- [ ] T006 [US1] **(F3)** Consumir `FILE_UPLOAD_ENABLED` no ponto de submissão (2.7/2.8/3.4): Campo Arquivo em
  `FormVersion` publicada + capacidade desligada → **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`**; satisfazer (não
  reescrever) `file-gate.ts`. (AC2)

## Fase 3 — US1 (Campo Arquivo interno funcional) — MVP

- [ ] T007 [US1] **(F5)** Substituição de Campo Arquivo único: novo `QUARANTINED` → promoção `AVAILABLE` →
  soft-delete do anterior → evento `FILE_REPLACED` na mesma transação (`definirContextoOrg`). (AC5)
- [ ] T008 [US1] **(F5)** Emitir `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` em `CardHistory`/`RecordHistory`
  (append-only, mesma tx, sem PII). (AC9)
- [ ] T009 [US1] **(F7)** Read-only sob arquivamento (Card/Registro e pai): upload/substituir/remover → 409;
  ver/baixar OK. (AC7)

## Fase 4 — US2 (Anexo geral por recurso)

- [ ] T010 [P] [US2] **(F4)** Anexo geral de Card: rotas `POST/GET/DELETE /cards/:cardId/files` + download stream
  sob sessão, herança de permissão via F1, em `apps/api/src/pipes/cards/files/`. (AC4)
- [ ] T011 [P] [US2] **(F4)** Anexo geral de Registro: rotas sob `databases/:databaseId/records/:recordId/files`
  em `apps/api/src/databases/records/files/`. (AC4)
- [ ] T012 [US2] **(F7/data-model)** Fixar a modelagem do anexo geral (Q2: JSONB vs. `purpose`); se coluna nova,
  migration aditiva + fase vermelha de RLS/GRANT. Meta: **nenhum GRANT novo**. (AC10)

## Fase 5 — US3 (Canal público)

- [ ] T013 [US3] **(F7)** Novas variáveis de ambiente do canal público (limites por Campo/submissão/total) em
  `apps/api/src/kernel/config/env.ts` (Zod, faixa validada, fail-closed) + `.env.example`. (AC6)
- [ ] T014 [US3] **(F6)** Ativar Campo Arquivo no `POST /public/forms/:publicId/submit` (2.8): limites do canal;
  rate limit `kernel/antiabuso/` chave `<orgId>` compondo com IP+publicId; magic-bytes; indisponível até verificar;
  **sem anexo geral público, sem download público**. (AC6)

## Fase 6 — US4 (Leitura — coluna FILE exibível)

- [ ] T015 [US4] **(F8)** `databases/records/record-query.core.ts` + `records-read.service`: exibir a coluna
  `FILE` (nome/estado + referência de download), mantendo-a **não-filtrável/ordenável** (filtro de Arquivo segue
  rejeitado). Regressão da 3.5 verde. (AC1/AC10)

## Fase 7 — Testes (integração REAL — mock não prova fail-closed, ADR AC-28)

- [ ] T016 [P] Testes RLS/isolamento (`card-files-rls`, `record-files-rls`): cross-tenant invisível; cross-recurso
  404 com autz de aplicação **neutralizada**; GRANT provado por mutação (se houver coluna nova). (AC8)
- [ ] T017 [P] Testes HTTP (`card-files-http`, `record-files-http`): AC1/AC3/AC4/AC5/AC7/AC9 contra MinIO+ClamAV reais.
- [ ] T018 [P] Teste do gate de consumo (`file-gate-consumo`): 409 `CAPACIDADE_ARQUIVO_INDISPONIVEL` **com mutação**
  (deletar o gate → vermelho). (AC2)
- [ ] T019 [P] Teste do canal público (`public-file-submission-http`): limites/rate limit/magic-bytes/indisponível;
  sem anexo/ download público. (AC6)
- [ ] T020 Regressão E2/E3: submissão (2.7/2.8), publicação (2.6), Registro (3.4), leitura (3.5) verdes. (AC3/AC10)

## Fase 8 — Polimento e gates finais

- [ ] T021 Atualizar `CLAUDE.md` (bloco de estado 3.8: Campo Arquivo funcional; anexo geral; binding
  `FileAuthzContract`; valor de `FILE` referencial; gate 409; canal público; eventos de arquivo).
- [ ] T022 Gates finais: `security-check`, `lgpd-check` (PII do nome), `observability-check`, `migration-check`
  (se T012 gerou migration), `backup-check` (se aplicável).
- [ ] T023 Revisão adversarial CRÍTICA (Segurança; Arquitetura/RLS; Edge Cases; Aceite) — CRITICAL/HIGH com
  regressão e mutação obrigatórias.
- [ ] T024 `commit-check` → PR → CI (4 jobs verdes, suíte serial) → merge (`--no-ff`) → closure BMAD.

## Dependências (ordem de conclusão de história)

- **T001** bloqueia tudo (3.7 mergeada + contrato fixado).
- **Fase 2 (T002–T006)** é fundação: F1 (binding) e F2/F3 (valor referencial + gate) habilitam US1–US4.
- **US1 (MVP)** = Campo Arquivo interno funcional (T005–T009). Entregável e testável isolado.
- **US2** (anexo geral) depende de F1 (T002–T004); **US3** (público) depende de F2 + F6/F7; **US4** (leitura)
  depende de F2. US2/US3/US4 são majoritariamente independentes entre si após a fundação.
- **Testes (Fase 7)** e **gates (Fase 8)** fecham cada incremento.

## MVP sugerido

**US1** — Campo Arquivo interno funcional (referência + gate de consumo + substituição/eventos + read-only sob
arquivamento), com T016–T018 e T020. Entrega o valor central e o AC-2 da ADR; US2/US3/US4 incrementam.
