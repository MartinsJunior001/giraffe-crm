# Reconciliação com a 3.7 mergeada — Story 3.8

A 3.7 (PR #103/#105, `main`) fechou os pontos que o planejamento antecipado marcava como **NEEDS-3.7**. Este
documento fixa os fatos REAIS da 3.7 que superam quaisquer placeholders dos demais artefatos. Onde um artigo do
Spec Kit usa `AVAILABLE`/`QUARANTINED`, **leia** `DISPONIVEL`/`QUARENTENA` (enum real).

## Estados reais do `FileObject` (enum `FileState`, pt)
`QUARENTENA` → `DISPONIVEL` → `REMOVIDO_LOGICO` → `EXPURGADO` (+ `BLOCKED` terminal). O único estado **referenciável/
baixável** é `DISPONIVEL`. Substitui, em todos os docs da 3.8: `AVAILABLE`=`DISPONIVEL`, `QUARANTINED`=`QUARENTENA`.
Veredito (`FileVerdict`): `CLEAN`/`BLOCKED`.

## `FileAuthzContract` — assinatura CONGELADA (resolve Q3/R6)
Arquivo `apps/api/src/files/file-authz.contract.ts`:
```ts
export interface FileAuthzContract {
  podeLer(resourceType: string, resourceId: string): Promise<boolean>;
  podeEditar(resourceType: string, resourceId: string): Promise<boolean>;
}
export const FILE_AUTHZ_CONTRACT = Symbol('FILE_AUTHZ_CONTRACT');
```
`FilesModule` já registra um binding **deny-all** por padrão (`{ provide: FILE_AUTHZ_CONTRACT, useValue: { podeLer:()=>false, podeEditar:()=>false } }`) e **exporta** `FILE_AUTHZ_CONTRACT`. A 3.8 **sobrescreve** esse provider no módulo consumidor (Pipes/Databases) ligando `pipe-authz`/`database-authz` — sem tocar `files/`. Sem acesso → o serviço da 3.7 responde **404 não-enumerante**; ler-sem-editar em mutação → 403.

## `resourceType` é TEXTO (resolve Q2)
`FileObject.resourceType` é `String` genérico (não enum) e imutável (fora do GRANT de UPDATE). Logo a 3.8 adota a
**Opção A** (data-model): valida `resourceType` por **allowlist no consumidor** (`'CARD'`/`'RECORD'`), **sem migration
e sem GRANT novo**. O anexo geral é a linha `FileObject` **não** referenciada por nenhum `Field.id` em `valores`.

## Rotas/API reais da 3.7 (contracts)
- Upload: `POST /files/resource/:resourceType/:resourceId` (multipart `file`) → 201 `{ id, state, ... }` (a chave/`bucketKey` NUNCA sai).
- Download: `GET /files/:fileId/content` (stream sob sessão, `application/octet-stream`+`nosniff`+`no-store`; só `DISPONIVEL`; 404 não-enumerante).
- Remoção lógica: `POST /files/:fileId/remove` (200). Expurgo: `POST /files/:fileId/purge` (200). Limites: `GET /files/limits`.
- Verificação **síncrona** (sem agendador): o upload já retorna `DISPONIVEL` ou `BLOCKED`. **Não há estado `QUARENTENA` observável pós-resposta** no caminho feliz — o Campo Arquivo referencia o `fileId` **após** o upload retornar `DISPONIVEL`.

## Limites e allowlist reais
`FILE_MAX_BYTES` (≤ 50 MiB, teto do multer), `FILE_MAX_PER_RESOURCE=10`, `SCAN_MAX_CONCURRENT_PER_ORG`, `SCAN_SLOT_TTL_SECONDS`,
`CLAMAV_TIMEOUT_MS`, `CLAMAV_DB_MAX_AGE_HOURS`. Allowlist por magic bytes exportada em `MIMES_PERMITIDOS`
(`file-validation.core.ts`): `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`. `.txt/.csv/.json`
e ZIP/office **fora**. Os limites do **canal público** (RF-6/Q4) são envs NOVOS da 3.8 (fail-closed no `getEnv`), ≤ os da 3.7.

## Remoção/expurgo/falhas parciais (o que a 3.8 herda)
- Remoção é `state` (sem DELETE físico — LGPD); expurgo remove o binário e marca `EXPURGADO`, preservando a linha.
- `enviar` compensa falha parcial (throw entre criar/promover → QUARENTENA→BLOCKED, remove órfãos). A **substituição**
  (RF-5) da 3.8 deve respeitar isto: o anterior só recebe soft-delete (`REMOVIDO_LOGICO`) **após** o novo virar `DISPONIVEL`.

## Débito da 3.7 que a 3.8 DEVE fechar (bloqueia "consumir a capacidade")
**DEB-3.7-SMOKE-STORAGE** (`specs/3-7-.../review-and-debts.md`): o caminho HTTP/SigV4 de `StorageService` e o
`ClamavService` real **não** têm smoke de integração contra MinIO/ClamAV (o e2e da 3.7 usa fakes; o provisionamento
no CI foi revertido). Como a **3.8 é o primeiro consumidor concreto**, ela DEVE incluir um **smoke real** (upload→scan
→download contra MinIO+ClamAV via o override `docker-compose.dev-files.yml`, provisionado no CI) — ou registrar
explicitamente por que segue com fakes. Isto vira **task T0 da 3.8** (ver `tasks.md`), pré-requisito das ACs que
dependem do caminho real de storage. Não reimplementar a 3.7 — apenas **exercitá-la de verdade** uma vez.

## Itens do planner agora RESOLVIDOS (não mais NEEDS-3.7)
Q2 (resourceType=texto→allowlist, Opção A), Q3 (assinatura da porta), R6 (dependência 3.7) — fechados. Os demais
(Q1/Q4/Q5/Q6/Q7/Q8) seguem como defaults conservadores do planner, a confirmar no `clarify` da abertura com o dono.
