# Implementation Plan: Capacidade compartilhada de arquivos

**Branch**: `story/3-7-capacidade-compartilhada-de-arquivos` · **Spec**: [spec.md](./spec.md) · **ADR**: `docs/03-arquitetura/adr-001-capacidade-de-arquivos.md` (v5, ratificada)

> A ADR-001 é a **fonte de verdade técnica**. Este plano orquestra e faz o Constitution Check; não duplica o design detalhado (persistência, veredito, estados, ClamAV, threat model) — cita a ADR por seção.

## Technical Context

- **Linguagem/Runtime**: TypeScript estrito (monorepo, `tsconfig.base.json` — `strict` + `noUncheckedIndexedAccess`). NestJS 11 (API), Prisma 6.19.3, PostgreSQL. Vitest 4.
- **Storage**: objeto S3-compatível (MinIO em dev/CI), buckets **privados**, chave opaca `<orgId>/<uuidv4>`. Client sob `apps/api/src/kernel/storage/` (AD-24/AD-4). [ADR §1/§3]
- **Antivírus**: ClamAV (dev/CI), fail-closed (`AlertExceedsMax yes`, canário EICAR, `CLAMAV_DB_MAX_AGE_HOURS`). [ADR §6]
- **Antiabuso**: `apps/api/src/kernel/antiabuso/` — rate limiter **extraído da 2.8** por tech story pré-requisito + semáforo `ScanSlot`. [ADR §12; decisão Q2]
- **Domínio**: `apps/api/src/files/` — serviço, núcleo puro de validação/veredito/estados, rotas, `FileAuthzContract`. Desacoplado de `pipes/` e `databases/`.
- **Gate**: `FILE_UPLOAD_ENABLED` (já existe em `kernel/config/env.ts`, default `false`). [ADR §10]
- **Persistência**: `FileObject` (mutável) + `FileScan` (append-only) org-scoped; `ScanSlot` global. Migration versionada, RLS ENABLE+FORCE + WITH CHECK, GRANT como fronteira. [ADR §2]
- **Contexto/transação**: `withTenantContext` para queries de modelo; promoção (INSERT FileScan + UPDATE FileObject) em **transação interativa no client raiz** via `definirContextoOrg` (padrão 2.6/2.7). [ADR §5]
- **NEEDS CLARIFICATION**: nenhum bloqueante — C1..C4 resolvidos em spec §Clarifications.

## Constitution Check

| Princípio / invariante | Como o plano cumpre |
|---|---|
| **Sequência oficial** (BMAD→Spec Kit→Impl→gates) | Story via `bmad-create-story` (feito); Spec Kit completo antes de código; gates `pre-implementation/security/migration/lgpd/backup/observability/mutation` obrigatórios. |
| **Isolamento por Organização (invariante-mãe)** | `FileObject`/`FileScan` com RLS ENABLE+FORCE + WITH CHECK (INSERT e UPDATE); toda query por `withTenantContext`; `orgId` nunca do cliente; guarda de tenant por segmento de prefixo. |
| **Deny-by-default / PERMISSÃO=AÇÃO+ESCOPO** | Permissão herda do recurso via `FileAuthzContract`; sem acesso → 404 não-enumerante; ler≠editar. |
| **GRANT é fronteira de segurança** | `FileObject`: SELECT/INSERT + UPDATE column-scoped, **sem DELETE**; `FileScan`: só SELECT/INSERT (append-only); `ScanSlot`: SELECT/INSERT/DELETE. Cada privilégio com teste que prova o escopo (fase vermelha). |
| **Sem bypass de RLS (AD-6)** | Nenhum caminho de bypass; dois papéis (`giraffe_app`/`giraffe_migrator`) preservados. |
| **Sem exclusão física (LGPD)** | Remoção é `state`; expurgo é do binário; linha de metadados preservada; sem GRANT de DELETE. |
| **Sem antecipar escopo (Const. II)** | Desacoplado de Card/Registro (consumidores 3.8/3.10); só a porta `FileAuthzContract`, sem consumidor especulativo além do binding de teste. |
| **Fail-closed de capacidade sensível (AD-28)** | Gate `FILE_UPLOAD_ENABLED` default false; verificação fail-closed; arquivo em quarentena indisponível. |
| **Kernel sem regra de negócio (AD-4/AD-5)** | `kernel/storage` e `kernel/antiabuso` são técnicos; a política de arquivos vive em `files/`. |
| **Não tocar host do Chatwoot (AD-32)** | MinIO/ClamAV só em override dev/CI. |
| **context7-check** | Verificar a API do SDK S3 e do client ClamAV na versão instalada antes de codificar. |

**Veredito do gate**: PASS — nenhuma violação; nenhuma exceção a justificar.

## Project Structure (arquivos a criar/tocar)

```
apps/api/
  prisma/
    schema.prisma                         # + FileObject, FileScan, ScanSlot
    migrations/<ts>_files_capability/      # DDL + RLS + GRANT (com rollback drill)
  src/
    kernel/
      storage/                             # NEW client S3 (putQuarentena/getStream/copyIfMatch/remove)
      antiabuso/                           # rate-limit (extraído, tech story) + scan-slot (semáforo)
      config/env.ts                        # consumir FILE_UPLOAD_ENABLED + novos envs (limites, ClamAV)
    files/                                 # NEW domínio
      file-validation.core.ts              # puro: magic bytes, tamanho, contagem
      file-verdict.core.ts                 # puro: veredito composto
      file-states.core.ts                  # puro: máquina de estados
      files.service.ts                     # orquestra upload/scan/promote/download/remove
      files.controller.ts                  # rotas (stream sob sessão)
      file-authz.contract.ts               # porta injetável
      files.module.ts
  test/
    files-rls.test.ts, files-*.test.ts     # integração real + mutação
docker-compose.*                           # override dev/CI: MinIO + ClamAV isolados
```

## Phase 0 — Research (resolvido)

- **Veredito composto e ordem** → ADR §5 (magic bytes → tamanho → 2×SHA → ClamAV CLEAN → CopyObject if-match).
- **ClamAV fail-closed** → ADR §6 (AlertExceedsMax, EICAR, DB max age).
- **Estados** → ADR §7. **Download stream** → ADR §8. **Expurgo/LGPD** → ADR §9. **Antiabuso** → ADR §12. **Threat model** → ADR "Modelo de ameaça" (T1..T15).
- **context7-check pendente (na implementação):** API do SDK S3 e do client ClamAV nas versões que forem fixadas no `package.json` — confirmar assinaturas antes de codificar (não inventar).

## Phase 1 — Design & Contracts

- **data-model.md** — `FileObject`/`FileScan`/`ScanSlot` (colunas, RLS, GRANT, estados). Ver arquivo.
- **contracts/** — `FileAuthzContract` (porta) + contrato das rotas (upload/download/substituir/remover). Ver `contracts/`.
- **quickstart.md** — cenários runnable que provam US1..US5 fim-a-fim (com MinIO/ClamAV dev). Ver arquivo.

## Re-avaliação do Constitution Check (pós-design)

PASS — o design mantém isolamento pelo banco, GRANT como fronteira, fail-closed e desacoplamento. Nenhuma complexidade nova a justificar além do já registrado na ADR-001.
