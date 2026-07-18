# Data Model — Story 3.6

## Entidade lida (já existente — 3.4): `RecordHistory`

Append-only e IMUTÁVEL. GRANT `SELECT`/`INSERT` (sem UPDATE/DELETE). RLS ENABLE+FORCE por `orgId`.

| Coluna | Tipo | Projetado na API? | Nota |
|--------|------|-------------------|------|
| `id` | uuid | **sim** | identidade do evento (também é o cursor) |
| `orgId` | uuid | **não** | fora da fronteira (isolamento) |
| `recordId` | uuid | **não** | fora da fronteira (já implícito na rota) |
| `type` | string | **sim** | taxonomia aberta (`CREATED`/`VALUES_UPDATED`/`ARCHIVED`/`RESTORED`; cresce em 3.8/3.9) |
| `summary` | string | **sim** | resumo legível, sem PII desnecessária (escrito por 3.4) |
| `actorId` | uuid? | **sim** | iniciador (referência, quando disponível) |
| `createdAt` | datetime | **sim** (como `occurredAt`) | data-hora do evento |

Índice existente: `@@index([orgId, recordId, createdAt])` — cobre a listagem por Registro ordenada por tempo.

## Projeção de saída (allowlist)

```ts
interface EventoTimelineVisao {
  id: string;
  type: string;
  summary: string;
  actorId: string | null;
  occurredAt: Date;
}
interface PaginaHistorico {
  eventos: EventoTimelineVisao[];
  proximoCursor: string | null;
}
```

## Sem alterações de schema

Nenhuma migration, nenhum GRANT, nenhuma coluna nova. `MODELOS_AUDITADOS` inalterado (leitura).
