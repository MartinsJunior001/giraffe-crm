# Research — Capacidade compartilhada de arquivos (Story 3.7)

> Registro do **context7-check (T002)**: assinaturas verificadas na fonte, não inventadas. Fonte: MCP Context7.

## Prisma 6.19.3 (persistência — Fatia 1)

- Fonte: `/prisma/web` (redirecionado de `/prisma/docs`).
- Confirmado: `enum`, `@db.Uuid`, `@db.Timestamptz`, `Json`/JSONB, `@@index`/`@@unique`, `@default(uuid())`.
- Baseline primária adicional: a migration gêmea `20260716180000_records` (mesmo repo, mesma versão) — RLS ENABLE+FORCE + 4 policies + WITH CHECK + GRANT column-scoped. Replicada em `..._files_capability`.

## AWS SDK for JavaScript v3 — `@aws-sdk/client-s3` (storage — Fatia 3)

- Fonte: `/aws/aws-sdk-js-v3` (High reputation).
- **S3-compatível (MinIO)**: `new S3Client({ endpoint, forcePathStyle: true, region, credentials: { accessKeyId, secretAccessKey } })`.
- **PutObjectCommand**: `{ Bucket, Key, Body, ContentLength }`. Retorna `ETag`.
- **GetObjectCommand**: `{ Bucket, Key }` (aceita `IfMatch`, `Range`). `response.Body` é `SdkStream` — em Node é `Readable`; `response.Body.transformToByteArray()` para bytes, ou consumir o stream direto (download por stream sob sessão). `response.Body.destroy()` libera o socket. `response.ETag`.
- **CopyObjectCommand**: `{ Bucket, Key, CopySource (URL-encoded), CopySourceIfMatch }` — o if-match da promoção (o conteúdo copiado é comprovadamente o verificado). Retorna `CopyObjectResult.ETag`.
- **DeleteObjectCommand**: `{ Bucket, Key }` — expurgo físico do binário.

## ClamAV — protocolo nativo `INSTREAM`/`VERSION` sobre `node:net` (antivírus — Fatia 3)

- **DECISÃO:** NÃO usar `clamscan` (npm). Falar direto com o `clamd` por TCP usando o protocolo nativo sobre `node:net` — **zero dependência externa** (menos superfície de supply chain; o ambiente Windows não conseguia finalizar `pnpm install` com deps novas, o que reforçou eliminar o que fosse dispensável). Consultado o protocolo do clamd (doc oficial ClamAV).
- **INSTREAM**: enviar `nINSTREAM\n`, depois cada chunk emoldurado por 4 bytes big-endian de tamanho, e terminar com um chunk de tamanho zero (`\x00\x00\x00\x00`). Resposta: `stream: OK` (limpo), `... FOUND` (infectado), ou erro/`size limit exceeded` (não escaneável).
- **VERSION**: enviar `nVERSION\n` → `ClamAV 1.4.0/27000/<data>`; parsear a 3ª parte (data da base).
- **FAIL-CLOSED (decisivo)**: `FOUND` → INFECTADO; `OK` → LIMPO; qualquer outra coisa (erro/limite/timeout/conexão) → NAO_ESCANEAVEL (nunca LIMPO por omissão). **CLEAN só com `OK` explícito.**
- **AlertExceedsMax / zip bomb**: configurado no `clamd.conf` do container (compose), não em código — `AlertExceedsMax yes` + limites (`MaxScanSize`/`MaxFileSize`/`MaxRecursion`) fazem o clamd reportar "limite excedido" → não é `OK` → NAO_ESCANEAVEL → BLOCKED.
- **EICAR canário**: escanear a string EICAR e exigir `INFECTADO`; se vier `OK`/erro, o scanner está "cego" → recusar promoções (fail-closed).
- **DB max age (`CLAMAV_DB_MAX_AGE_HOURS`)**: comparar a data do `VERSION` com o teto; base velha (ou data desconhecida) → recusar veredito.

## Multipart (API — Fatia 4)

- NestJS 11 já traz `@nestjs/platform-express` (multer). Upload por `FileInterceptor` com `memoryStorage` + `limits.fileSize = FILE_MAX_BYTES` (bound de memória — DoS). Tipos: `@types/multer` (dev). Validação server-side por **conteúdo real** (magic bytes) independe do `Content-Type` declarado.

## Versões

- Fixadas no `pnpm-lock.yaml` ao adicionar (nunca `latest` solto). `@aws-sdk/client-s3`, `clamscan`, `@types/multer` — versões resolvidas registradas no lockfile no commit da Fatia 3/4.
