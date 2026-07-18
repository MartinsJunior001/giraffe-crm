# Research — Story 3.8 (context7-check + análise de fronteira)

> **Nota de sequenciamento:** o `context7-check` **definitivo** (versões efetivamente instaladas de SDK S3/MinIO,
> ClamAV client, Prisma, NestJS) deve rodar **na abertura da Story, sobre a 3.7 mergeada** — é ela que introduz as
> dependências de storage/scanner. Este research antecipa a análise de fronteira e os pontos a confirmar.

## context7-check (a executar na abertura — baseline pelas versões do `package.json` pós-3.7)

- **SDK de storage (S3-compatible / MinIO):** confirmar a assinatura de stream de upload/download e `CopyObject`
  com `x-amz-copy-source-if-match` (usado na promoção if-match — ADR §5.2). **Consumo da 3.7** — a 3.8 não fala com
  o SDK direto (só via `StoragePort`).
- **ClamAV client:** idem — consumo via `ScannerPort` da 3.7; a 3.8 não toca o adapter.
- **Prisma 6.19.x / PostgreSQL:** validação de referência de `fileId` no JSONB `valores` (por `Field.id`); se a
  modelagem do anexo geral (Q2) exigir enum/coluna, confirmar índice parcial e `WITH CHECK` (padrão da base).
- **NestJS 11:** injeção do `FileAuthzContract` por provider token entre módulos (`FilesModule` recebe a
  implementação de `PipesModule`/`DatabasesModule`) sem ciclo — confirmar o padrão de `forwardRef`/token já usado
  na base (3.3 fez `DatabasesModule` importar `PipesModule` unidirecional).

## Análise de fronteira 3.7 → 3.8 (o que já existe vs. o que a 3.8 acrescenta)

| Peça | Origem (3.7/E2/E3) | Uso na 3.8 |
|---|---|---|
| `StoragePort`/`ScannerPort`/`FileObject`/`FileScan` | 3.7 | consome; referencia por `fileId` |
| Rotas genéricas upload/download stream sob sessão | 3.7 | injeta binding de recurso; expõe rotas de Card/Registro |
| `FileAuthzContract` (porta) | 3.7 | **liga** a `pipe-authz`/`database-authz` |
| Veredito fail-closed / quarentena / dois SHA / expurgo | 3.7 | consome; upload só pós-`CLEAN` |
| `kernel/antiabuso/` (rate limit + `ScanSlot`) | tech story pré-3.7 | consome; compõe no canal público |
| `FILE_UPLOAD_ENABLED` + `file-gate.ts` (puro) | 2.4/env.ts | **consome** → 409 no ponto de submissão |
| `submission.ts` (validação por tipo) | 2.7 | **substitui** o ramo textual de `FILE` por referência |
| `exigirLer/OperarCard` | 2.10 | binding de Card |
| `exigirLer/OperarDatabase` | 3.4 | binding de Registro |
| `CardHistory`/`RecordHistory` (append-only) | 2.7/3.4 | **amplia taxonomia** (eventos de arquivo) |
| Padrão de transação interativa (`definirContextoOrg`, client raiz) | 2.6/2.7/3.4 | evento na mesma tx da mutação |
| Rate limit por IP+publicId (2.8) | 2.8 | **compõe** com o de arquivo (chave `<orgId>`) |

## Decisões de pesquisa

- **Decision:** valor do Campo `FILE` = referência a `fileId`(s) no JSONB `valores` por `Field.id` (não tabela nova).
  **Rationale:** AD-11 (sem tabela de valores por Campo); reusa o padrão de submissão; `FileObject.resourceType/
  resourceId` imutável (3.7) garante o vínculo estável pelo banco. **Alternativa rejeitada:** tabela de valores de
  arquivo por Campo — viola AD-11, adiciona GRANT.
- **Decision:** binding de authz vive no consumidor, injetado em `FilesModule`. **Rationale:** AD-5 (a capacidade
  não conhece Card/Registro); sem ciclo de módulo. **Alternativa rejeitada:** `files/` importar `pipe-authz`/
  `database-authz` — acopla a capacidade ao domínio.
- **Decision:** gate de consumo satisfaz `file-gate.ts` (puro), não o reescreve. **Rationale:** precedente exato
  2.4 declara / 2.6 consome; a ADR marca o AC-2 como desta Story.
- **Decision:** limites do canal público como novas variáveis de ambiente fail-closed. **Rationale:** coerência com
  a família `FILE_*` da 3.7 (faixa validada no `getEnv()`, ausente → nega). **Alternativa rejeitada:** constantes no
  código — não configurável, contra o padrão da 3.7.
- **Decision:** coluna `FILE` na tabela (3.5) exibível, não filtrável/ordenável. **Rationale:** o épico 3.5 lista o
  filtro de Arquivo como futuro; exibir o dado é honesto sem abrir superfície de filtro nova.

## Fontes

- `docs/03-arquitetura/adr-001-capacidade-de-arquivos.md` (v5) — §3/§4/§5/§8/§12 + Critérios de aceite nº 2.
- `_bmad-output/implementation-artifacts/3-7-capacidade-compartilhada-de-arquivos.md` — INV-FILE-01..06; clarify Q2.
- `_bmad-output/implementation-artifacts/tooling/plano-3-8-campo-arquivo.md` (commit e6beb15) — brief antecipado.
- `apps/api/src/pipes/cards/submission.ts`, `pipes/forms/file-gate.ts`, `pipes/pipe-authz.ts`,
  `databases/database-authz.ts`, `databases/records/record-query.core.ts`, `kernel/config/env.ts`.
