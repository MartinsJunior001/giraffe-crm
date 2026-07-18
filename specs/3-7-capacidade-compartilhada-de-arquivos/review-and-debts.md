# Revisão adversarial (4 revisores) — resultado e débitos — Story 3.7

Registro do code review adversarial read-only (Segurança · RLS/Migration · Arquitetura/Concorrência · Aceite/Operação) do PR #103 e das correções aplicadas pelo Writer. **0 CRITICAL** em todos os quatro.

## Correções aplicadas (HIGH + MEDIUM/LOW seguros)

| # | Origem | Severidade | Correção |
|---|--------|-----------|----------|
| 1 | RLS | HIGH | `apps/api/prisma/rollback/20260717120000_files_capability.down.sql` criado — o `db:rollback` recusava por não haver `.down.sql` do topo da pilha. |
| 2 | Arquitetura/Segurança/Aceite | HIGH | **Compensação fail-closed** em `FilesService.enviar`: qualquer throw entre criar e promover marca a linha QUARENTENA→BLOCKED (libera a cota) e remove os binários órfãos (qKey + final). `remove(qKey)` do caminho feliz virou best-effort. Regressão em `files-e2e` (releitura que lança → sem linha presa, cota livre). |
| 3 | Aceite | HIGH | Bloco **US4** em `files-e2e`: remover→404→expurgar→binário removido, **linha preservada** (EXPURGADO, `purgedAt`), idempotência. |
| 4 | Segurança/Arquitetura | MEDIUM | if-match com ETag ausente → **BLOCKED explícito** (nunca `x-amz-copy-source-if-match` vazio). |
| 5 | Segurança | MEDIUM | Limites do multipart apertados (`files:1, fields:5, parts:10`) contra DoS de memória. |
| 6 | Arquitetura | MEDIUM | `CLAMAV_TIMEOUT_MS` (env) + coerência `SCAN_SLOT_TTL_SECONDS*1000 > CLAMAV_TIMEOUT_MS` no `superRefine` (evita over-admissão por slot expirado durante o scan). |
| 7 | Aceite | MEDIUM | `FILE_MAX_BYTES` ganhou teto (`.max(50 MiB)`) casando com o multer — não fica silenciosamente capado. |
| 8 | Aceite | MEDIUM | `tiposPermitidos` de `/files/limits` derivado da `ALLOWLIST` (fonte única) — não mente ao cliente. |
| 9 | Arquitetura | LOW | `promover` checa `updateMany.count`: no-op não grava FileScan nem audita (sem fato/auditoria falsos); no-op inesperado → 409. |
| 10 | RLS | LOW | CHECK `FileObject_bucketKey_prefix_ck` (`bucketKey LIKE orgId||'/%'`) — defesa em profundidade do prefixo de tenant no banco. |
| 11 | RLS | LOW | `copyIfMatch` só considera sucesso 200 **com** `<CopyObjectResult>` e **sem** `<Error>` (quirk do S3 200-com-erro). |
| 12 | Segurança | LOW | SigV4 colapsa espaços internos sequenciais nos valores de header (canonicalização AWS exata). |

## Débitos registrados (não bloqueantes — sem consumidor/risco imediato)

- **DEB-3.7-TOCTOU:** o teto de 10/recurso é check-then-create não atômico; dois uploads concorrentes ao mesmo recurso podem exceder em ≥1. É limite **soft** (antiabuso), não fronteira de tenant, e o semáforo por Org (default 3) limita o excesso. Fechar via advisory lock por `(orgId,resourceType,resourceId)` quando houver apetite. (Arquitetura M2 / Segurança L2 / Aceite M1.)
- **DEB-3.7-RETENCAO:** a "janela de retenção configurável" (C3/SC-006) não foi entregue; o expurgo é elegível imediatamente a partir de REMOVIDO_LOGICO (default de C3) via `POST /:fileId/purge`, sem rotina agendada nem parâmetro de janela. Entregar o parâmetro + rotina operacional quando houver o consumidor de retenção. (Aceite M4.)
- **DEB-3.7-SMOKE-STORAGE:** o caminho HTTP/SigV4 de `StorageService` (put/get/copyIfMatch/remove) e o `ClamavService` real só têm cobertura de unidade (vetor SigV4 provado) + fakes no e2e; o CI **não** provisiona MinIO/ClamAV (revertido para não exigir os serviços). Detalhes que só falham contra o servidor real (content-length, ETag com aspas no if-match, host:porta) ficam sem smoke de integração. **Priorizar um smoke real de MinIO/ClamAV antes de a 3.8 consumir a capacidade.** O override `docker-compose.dev-files.yml` + `clamd.conf` já existem para isso. (Aceite M5/M6, Arquitetura ressalva de cobertura.)
- **DEB-3.7-METRICAS:** logs sanitizados existem (FR-018 OK), mas não há métricas de veredito/quarentena (T027). (Aceite L4.)
- **DEB-1 (cota por bytes):** já registrado na `spec.md` — sem cota agregada por bytes na Fase 1.

## Nota de honestidade documental (Aceite M5)

Os artefatos `pre-implementation-check.md`, `analysis.md` e `research.md` foram escritos ANTES da decisão de implementação **zero-dependência**. A entrega final NÃO adicionou `@aws-sdk/client-s3`/`clamscan`/`@types/multer` — o storage usa **SigV4 próprio sobre `node:http`** e o antivírus usa **clamd INSTREAM sobre `node:net`**, sem alterar `package.json`/`pnpm-lock.yaml`. O `research.md` foi atualizado para refletir isso; este arquivo é a nota de mudança consolidada. O provisionamento real de MinIO/ClamAV no CI foi revertido (fakes determinísticos no e2e) e é o **DEB-3.7-SMOKE-STORAGE** acima.

## Categorias confirmadas LIMPAS pelos revisores

Isolamento/RLS/GRANT (fase vermelha sólida), fail-closed do veredito, guarda de tenant por segmento, SigV4 (2 vetores AWS), atomicidade da promoção e aquisição do ScanSlot (advisory lock), ordem do expurgo, máquina de estados, observabilidade/sanitização de log, MinIO/ClamAV só dev/CI (AD-32), ausência de regressão e de vazamento de escopo (3.8/3.10).
