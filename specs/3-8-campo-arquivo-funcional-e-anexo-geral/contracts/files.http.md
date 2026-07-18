# Contrato HTTP — Campo Arquivo funcional e anexo geral (Story 3.8)

> Assinaturas finais (rotas de upload/download genéricas) são **da 3.7**; a 3.8 acrescenta as rotas ligadas a
> Card/Registro e o binding de autorização. Entrega **sempre** por stream sob sessão (Opção A) — sem URL
> pré-assinada. Guard C3 congelado: `@Requer(...)` grosso + guarda fina no serviço.

## Anexo geral de Card (herança de permissão via `FileAuthzContract` → `pipe-authz`)

- `POST /cards/:cardId/files` (multipart) → **201** `{ fileId, state }` — poder: **operar** (`exigirOperarCard`).
  Bytes atravessam a API (Opção A); arquivo entra `QUARANTINED` até o veredito; **indisponível até `AVAILABLE`**.
- `GET /cards/:cardId/files` → **200** lista de metadados (`fileId`, nome, tipo, tamanho, estado) — poder: **ler**.
- `GET /cards/:cardId/files/:fileId/download` → **200** stream (`attachment` + `Content-Type` detectado + `nosniff`
  + CSP + `no-store`); só `AVAILABLE` — poder: **ler**. Estado ≠ `AVAILABLE` → **409** `{ motivo: 'ARQUIVO_INDISPONIVEL' }`.
- `DELETE /cards/:cardId/files/:fileId` (remoção **lógica**) → **200** — poder: **operar**. Sem exclusão física.
- **Substituir** Campo Arquivo único (via edição do valor do Campo) → o anterior só some após o novo `AVAILABLE`;
  evento `FILE_REPLACED`.

## Anexo geral de Registro (herança via `FileAuthzContract` → `database-authz`)

- `POST /databases/:databaseId/records/:recordId/files` → **201** — poder: **operar** (`exigirOperarDatabase`).
- `GET .../records/:recordId/files` → **200** — poder: **ler** (`exigirLerDatabase`).
- `GET .../records/:recordId/files/:fileId/download` → **200** stream — poder: **ler**.
- `DELETE .../records/:recordId/files/:fileId` → **200** (lógico) — poder: **operar**.

## Campo Arquivo (valor de `Field`, não anexo geral)

- Submetido via os endpoints existentes de submissão (2.7 interno, 2.8 público, 3.4 Registro). O valor é `fileId`
  (único) ou `fileId[]` (múltiplo). Validação: `AVAILABLE`, mesma Org, vinculado a este recurso/finalidade.
  `QUARANTINED`/cross-recurso → **400/409**. Gate de consumo: capacidade desligada + Campo Arquivo na `FormVersion`
  publicada → **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`**.

## Canal público

- `POST /public/forms/:publicId/submit` (não autenticado) recebe arquivos **só** via Campo Arquivo publicado.
  Limites: por arquivo (`FILE_MAX_BYTES`), por Campo, por submissão, total (novas variáveis). Rate limit (chave
  `<orgId>`, compõe com IP+publicId da 2.8) → **429**. Magic-bytes (independente da extensão). Arquivo indisponível
  até verificar (não converte referenciando `QUARANTINED`). **Sem anexo geral público. Sem download público**
  (submitter sem sessão). Resposta sem vazamento (padrão 2.8 `{ ok: true }`).

## Matriz de resposta (herda a base)

| Situação | Código |
|---|---|
| Sem acesso ao recurso (outro tenant ou outro recurso intra-tenant), mesmo conhecendo `fileId`/chave | **404** uniforme |
| Com acesso, estado ≠ `AVAILABLE` | **409** `{ motivo: 'ARQUIVO_INDISPONIVEL' }` (motivo único) |
| Capacidade desligada + Campo Arquivo em `FormVersion` publicada usada | **409** `{ motivo: 'CAPACIDADE_ARQUIVO_INDISPONIVEL' }` |
| Recurso (ou pai) arquivado, ao mutar arquivo | **409** `{ motivo: 'RECURSO_ARQUIVADO' }` |
| Rate limit do canal público excedido | **429** |
| Ler-sem-operar ao mutar | **403** |

## Eventos emitidos (append-only, sem PII)

`FILE_ATTACHED` / `FILE_REPLACED` / `FILE_REMOVED` em `CardHistory`/`RecordHistory`, na mesma transação da mutação.
Read-side (projeção/mascaramento) = 2.17 (Card) / 3.6 (Registro).
