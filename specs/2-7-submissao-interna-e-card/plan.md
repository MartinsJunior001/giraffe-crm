# Plan — Story 2.7 (submissão interna do Formulário inicial e criação do Card)

## Modelo de dados
- Nova tabela **`Card`** (org-scoped): `id, orgId, pipeId, phaseId, formId, formVersionId, idempotencyKey,
  valores Jsonb, createdAt, updatedAt`. `@@unique([orgId, formId, idempotencyKey])` (idempotência),
  `@@index([orgId, pipeId, phaseId])` (superfície do Kanban, 2.9). FKs org/pipe/phase/form/formVersion CASCADE.
- Nova tabela **`CardHistory`** (org-scoped, append-only): `id, orgId, cardId, type, summary, actorId?,
  createdAt`. `@@index([orgId, cardId, createdAt])`. Na 2.7 só o evento `CREATED`.
- `valores` em JSONB chaveado por `Field.id` (opção por `id`) — coerente com o snapshot JSON da 2.6; sem tabela
  de valores por Campo (AD-11).

## Migration (`20260714140000_cards`)
Replica o padrão de `..._forms`/`..._form_versions`: RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH
CHECK em INSERT e UPDATE), FKs CASCADE. **`Card`: GRANT SELECT, INSERT, UPDATE — sem DELETE** (arquivar será
`state` na 2.11). **`CardHistory`: GRANT SELECT, INSERT — sem UPDATE/DELETE**: a trilha é append-only e imutável,
fronteira de banco. `Card` e `CardHistory` entram em `MODELOS_AUDITADOS`.

## Núcleo puro (`submission.ts`)
`validarSubmissao(snapshot, valores)` → valida e devolve os valores normalizados; fail-closed: `valores` não-objeto,
snapshot malformado, chave desconhecida (allowlist), tipo errado, Seleção por `id` inexistente/repetido, limites
(string 10k, payload 256KB). NÃO valida obrigatoriedade (não existe em `Field`). `indexarCampos` lê o snapshot
fail-closed. Seleção por `id`, nunca rótulo (AD-11/AD-12).

## Serviço (`CardSubmissionService`)
- `submeter(pipeId, {idempotencyKey, valores})`: `exigirOperarPipe` (404/403) → localiza Form `PIPE_INITIAL`
  (404 se não materializado) → `publishedVersion` não nulo (409 se não publicado) → lê `FormVersion` publicada →
  `validarSubmissao` (400) → 1ª Fase ativa (409 se nenhuma) → **criação atômica**.

### Atomicidade (invariante-chave)
Criar toca 2 escritas (INSERT `Card` + INSERT `CardHistory`). `withTenantContext` recusa `$transaction` no client
ESTENDIDO — o client RAIZ roda a **transação interativa com contexto** (`set_config(..., true)` transaction-local,
via `definirContextoOrg`), o mesmo primitivo da publicação 2.6. Idempotência: se `(orgId, formId, idempotencyKey)`
já existe, o `UNIQUE` dispara P2002 → rollback → devolve o Card **existente** (nunca duplica nem erra). Auditoria
emitida à mão nesse caminho; nunca loga `valores`.

## Rotas (`CardsController`, `@Requer('ler','Pipe')`; fina no serviço)
`POST pipes/:pipeId/forms/initial/submit` (201). DTO manual (`cards.dto.ts`): `idempotencyKey` obrigatória
(≤200), `valores` objeto (ausente → `{}`).

## Sequência (red-green-mutação)
1. Unidade `submission.ts`: allowlist, tipo, Seleção por `id`, SELECT_MULTI, ausência de obrigatoriedade, malformado.
2. HTTP real: submeter cria Card (1ª Fase ativa, `formVersionId`, valores); idempotência (mesma chave→mesmo Card,
   chave nova→outro); validação → 400; não publicado → 409; form inexistente → 404; chave ausente → 400.
3. RLS: cross-tenant, sem contexto, WITH CHECK; `Card` sem DELETE; `CardHistory` append-only (sem UPDATE/DELETE →
   permission denied); UNIQUE de idempotência (P2002).
4. Authz: operar submete (Admin Org, Membro); Viewer 403; sem concessão 404.
- **Mutações provadas:** allowlist (código → vermelho → revert); dedup de idempotência (código → vermelho →
  revert); imutabilidade de `CardHistory` (GRANT UPDATE temporário → vermelho → revoke).

## Divergências registradas
- Atomicidade cross-tabela resolvida por transação interativa no client raiz (mesmo consumidor concreto da 2.6).
- `Card.formVersionId` é FK real (a versão nunca é deletada); `valores` sem normalização por Campo (AD-11).
