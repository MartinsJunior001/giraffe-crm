# Contrato HTTP — Histórico do Registro (read-side, 3.6)

## GET /databases/:databaseId/records/:recordId/history

Timeline do Histórico do Registro, paginada por cursor determinístico. API INTERNA, somente leitura.

### Autorização
- Guarda GROSSA: `@Requer('ler','Database')` (qualquer Membership ativa — 3.2).
- Guarda FINA (serviço): `exigirLerDatabase(databaseId)` — acesso ATUAL ao Database dono. Sem acesso → **404**.
- O histórico **não** concede acesso: ter sido ator/iniciador não habilita leitura.

### Query params
| Param | Tipo | Default | Regra |
|-------|------|---------|-------|
| `cursor` | uuid | ausente (1ª página) | `id` do último evento da página anterior; lixo → 400 |
| `limite` | int > 0 | 50 | teto rígido 100 aplicado no serviço; lixo → 400 |

### Respostas
- **200** — página:
```json
{
  "eventos": [
    { "id": "…", "type": "CREATED", "summary": "Registro criado", "actorId": "…", "occurredAt": "2026-07-16T12:00:00.000Z" }
  ],
  "proximoCursor": null
}
```
- **400** — `cursor`/`limite` inválidos, ou `databaseId`/`recordId` malformados.
- **404** — sem acesso ao Database, Registro inexistente, Registro de outro Database, ou de outra Organização
  (RLS) — **não-enumerante** (indistinguíveis).

### Invariantes de resposta
- Só a allowlist (`id/type/summary/actorId/occurredAt`). **Nunca** `orgId`/`recordId`/payload/binário/chave/URL.
- Ordem cronológica estável `[createdAt, id]`; `proximoCursor` presente somente se há próxima página.
