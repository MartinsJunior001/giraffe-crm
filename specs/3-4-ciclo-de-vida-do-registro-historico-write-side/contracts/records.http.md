# Contrato HTTP — Ciclo de vida do Registro (Story 3.4)

Todas sob `@Controller('databases/:databaseId')`, `@Requer('ler','Database')` (guarda grossa; fina no serviço).
`orgId` nunca no payload. `databaseId`/`recordId` via `validarIdRota`. Sem rota de exclusão. Sem listagem/tabela
(3.5). Sem read-side de Histórico (3.6).

## Operação (poder: operar — `exigirOperarDatabase`)

- `POST /databases/:databaseId/records` → **201** `RecordVisao`
  - Corpo: `{ idempotencyKey: string (obrigatória), valores: object }`.
  - Cria ≤1 Registro contra a `FormVersion` **publicada** vigente; valida `valores` contra o snapshot (allowlist,
    tipo, Seleção por `id`); evento `CREATED`. Idempotência por `[orgId, databaseId, idempotencyKey]`.
  - **Idempotente:** um retry com a mesma `idempotencyKey` devolve o MESMO Registro (também **201** — paridade com
    a submissão de Card 2.7; não duplica).
  - Erros: 400 (idempotencyKey ausente / valores inválidos); 403 (VIEWER); 404 (sem acesso / Database
    inexistente); 409 (Formulário de Database **não publicado**; Database arquivado `DATABASE_ARQUIVADO`; corrida
    de idempotência irreconciliável — P2002/P2028).
- `PATCH /databases/:databaseId/records/:recordId` → **200** `RecordVisao`
  - Corpo: `{ valores: object }`. Revalida contra a `FormVersion` **do próprio Registro** (congelada). Evento
    `VALUES_UPDATED`.
  - Erros: 400 (valores inválidos); 403 (VIEWER); 404 (sem acesso / Registro inexistente); 409
    (`RECORD_ARQUIVADO` / `DATABASE_ARQUIVADO`).
- `POST /databases/:databaseId/records/:recordId/archive` → **200** `RecordVisao`
  - Idempotente (já arquivado → no-op, sem `updateMany`). Evento `ARCHIVED`. 409 (`DATABASE_ARQUIVADO` /
    transição inválida / guarda otimista).
- `POST /databases/:databaseId/records/:recordId/restore` → **200** `RecordVisao`
  - Idempotente (já ativo → no-op). Volta a ATIVO. Evento `RESTORED`. 409 (`DATABASE_ARQUIVADO` — Database
    arquivado = somente-leitura integral / transição inválida / guarda otimista).

## Leitura (poder: ler — `exigirLerDatabase`)

- `GET /databases/:databaseId/records/:recordId` → **200** `RecordVisao`
  - Estado + valores crus. Sem listagem/filtro (3.5), sem timeline (3.6). 404 sem acesso / inexistente.

## `RecordVisao` (projeção de saída)

`{ id, databaseId, formId, formVersionId, origin, lifecycleState, valores, createdAt, updatedAt }`.
**Nunca** `orgId`. `valores` é PII potencial — devolvido no detalhe (coerente com o Card 2.9), nunca em log.

## Status codes

- 201: criar Registro (nova criação **e** retry idempotente — paridade com Card 2.7). 200: obter/editar/arquivar/
  restaurar.
- 400: idempotencyKey ausente, valores inválidos (chave desconhecida/tipo/Seleção).
- 403: VIEWER do Database ao operar. 404: sem acesso ao Database/Registro (não-enumerante) / owner inválido.
- 409: Formulário de Database **não publicado**; idempotência irreconciliável (P2002/P2028); guarda otimista de
  estado; `RECORD_ARQUIVADO`/`DATABASE_ARQUIVADO`.
