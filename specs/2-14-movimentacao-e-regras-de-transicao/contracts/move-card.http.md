# Contrato HTTP — Mover Card (`card-movement.controller.ts`)

> Rota interna (autenticada, contexto de Org resolvido no servidor). **Nunca** aceita `orgId` do cliente. Guarda
> fina no serviço (`pipe-authz`), não no guard (C3 congelado).

## Endpoint

```
POST /cards/:cardId/move
```

### Request body (`card-movement.dto.ts`)

```jsonc
{
  "destinoPhaseId": "uuid",     // obrigatório — Fase destino (validada sob RLS: mesmo Pipe, ativa)
  "confirmado": true            // obrigatório — confirmação humana explícita (D2); ausente/false ⇒ bloqueio
}
```

- `destinoPhaseId` é **validado sob contexto** (RLS): pertencer a outra Org é indistinguível de inexistente.
- `phaseId`/`orgId` de origem **nunca** vêm do cliente — lidos do próprio Card sob `withTenantContext`.
- **Sem `idempotencyKey`**: a movimentação é idempotente por construção (guarda otimista por `phaseId` + no-op D4).
  Uma chave de dedup seria errada — suprimiria uma re-movimentação legítima (A→B→A→B são `MOVED` distintos).

## Respostas

| Situação | Status | Corpo |
|----------|--------|-------|
| Movido com sucesso | **200** | Card atualizado (visão mínima: `id`, `phaseId`, `lifecycleState`) |
| Mesma Fase (origem == destino) — no-op idempotente (D4) | **200** | Card inalterado |
| Retry ao mesmo destino (já movido) — no-op D4 | **200** | Card já na Fase destino |
| Bloqueio de preflight (ciclo não-aberto / Fase arquivada / outro Pipe) | **409** | `{ motivo: MotivoBloqueio }` |
| Confirmação ausente (`confirmado ≠ true`) | **409** | `{ motivo: "CONFIRMACAO_AUSENTE" }` |
| Principal só-leitura/Observador (tem acesso, não opera / sem `podeMover`) | **403** | — |
| Sem acesso ao Card (não-enumerante) | **404** | — |
| Conflito de concorrência (perdeu a corrida; P2002/P2028) | **409** | — (**nunca 500**) |

> **Nota de status:** transições no domínio respondem **200** (não 201 — não há criação de recurso; o Card já
> existe). Segue a convenção "transições respondem 200, criação 201" (CLAUDE.md).

## Autorização (pré-condição do serviço — T4)

1. `exigirOperarCard(db, principal, cardId)` (2.10):
   - sem acesso nenhum → **404** não-enumerante;
   - acesso de leitura mas não opera (Observador/Viewer) → **403**;
   - devolve o `AcessoNoCard` resolvido (com `podeMover`).
2. Capacidade **`podeMover`**: para acesso por **concessão direta** (`CardGrant`), exige `podeMover === true`; Admin
   da Org / Admin do Pipe / Membro no escopo efetivo já o têm por construção. `restritoAoProprio` limita o alcance.
   - Se justificado, extrair **`exigirMoverCard`** em `pipe-authz.ts` compondo `exigirOperarCard` + checagem de
     `podeMover` (guarda fina no serviço; C3 congelado).

## Efeito atômico (sem bloqueio) — transação interativa no client raiz (`definirContextoOrg`)

1. **UPDATE** `Card.phaseId` com guarda otimista (`updateMany where id AND phaseId = <origem lida>`).
   - `count === 0` → reconsulta: já na destino ⇒ 200 idempotente; senão ⇒ **409**.
2. **`registrarEntradaNaFase(tx, { orgId }, { cardId, phaseId: destino, origin: 'MOVE' })`** — reentrada
   (`CardPhaseEntry` novo INSERT; congela `configSnapshot` da Fase destino).
3. **INSERT** `CardHistory { type: 'MOVED', actorId, cardId, ... }` (append-only; sem PII).
4. Auditoria manual (FR-214) na mesma transação.

Havendo **qualquer** bloqueio de preflight ou autorização: **nada** dos passos 1–4 acontece (sem UPDATE de
`phaseId`, sem `CardPhaseEntry`, sem `CardHistory`). **Sem movimentação parcial.**
