# Quickstart — Validação da Story 2.14 (Movimentação e regras de transição)

> Roteiro de validação **executável** (não é implementação). Prova a movimentação end-to-end contra PostgreSQL
> **real**, incluindo a **fase vermelha** do GRANT. Detalhes de contrato em `contracts/` e `data-model.md`.

## Pré-requisitos

```bash
cp .env.example .env                                   # senhas exigidas pelo Compose
docker compose up -d db                                # PostgreSQL 16 (127.0.0.1:5434)
pnpm --filter @giraffe/api db:migrate                  # inclui a nova migration card_movement
pnpm --filter @giraffe/api db:seed                     # Orgs A, B, C
```

> **Regra de ouro dos testes:** escrever na **Org C** com contas descartáveis (`randomUUID`). **Nunca** reusar
> Ana/Bruno/Carla/Eva do seed em `membership.create` persistente ([[test-iso-01-causa-raiz]]).

## Cenário 1 — Movimentação feliz (CA1)

1. Criar (submissão interna, 2.7) um Card num Pipe com ≥2 Fases ativas → nasce na 1ª Fase; existe `CardPhaseEntry`
   (origin=SUBMISSION) e `CardHistory` (CREATED).
2. `POST /cards/:id/move` com `{ destinoPhaseId: <2ª Fase>, confirmado: true }` por um principal que **opera** o Card.
3. **Esperado:** **200**; `Card.phaseId` = 2ª Fase; **nova** `CardPhaseEntry` (origin=MOVE) vira a atual; **novo**
   `CardHistory` (type=MOVED). Tudo numa transação. Marcos/saúde (detalhe do Card) passam a derivar da nova entrada.

## Cenário 2 — Bloqueio ⇒ nada muda (CA2)

1. `POST .../move` com `{ confirmado: false }` (ou destino arquivado / outro Pipe).
2. **Esperado:** **409** com `motivo`; `Card.phaseId` **inalterado**; **nenhum** `CardHistory` novo; **nenhuma**
   `CardPhaseEntry` nova. Sem movimentação parcial.

## Cenário 3 — Autorização e regras de transição (CA3)

| Sub-cenário | Ação | Esperado |
|-------------|------|----------|
| Observador/Viewer (só lê) | move | **403** |
| Sem acesso ao Card | move | **404** não-enumerante |
| Fase destino **arquivada** | move | **409** (`FASE_DESTINO_ARQUIVADA`) |
| Fase destino de **outro Pipe** | move | **409** (`FASE_DESTINO_OUTRO_PIPE`) |
| Card **FINALIZADO/ARQUIVADO** | move | **409** (`CICLO_NAO_ABERTO`) |

## Cenário 4 — Contrato de preflight extensível (CA4)

- Teste unitário puro (`transition-preflight.test.ts`): compor `[...VALIDADORES_PADRAO, validadorFake]` e provar que
  `executarPreflight` respeita a ordem e curto-circuita no 1º bloqueio — **sem** reescrever o serviço. Demonstra que
  2.15/E4/E5 se integram por composição.

## Cenário 5 — GRANT: fase vermelha e escopo (segurança)

`card-move-rls.test.ts` (PostgreSQL real):

1. **Fase vermelha:** com a linha de GRANT removida/comentada, UPDATE de `Card.phaseId` sob contexto →
   `permission denied`. (Prova que é o **banco** que autoriza, não a app.)
2. **Depois do GRANT:** UPDATE de `phaseId` funciona **no contexto correto**; **negado cross-tenant** (WITH CHECK da
   `card_update` barra mover a linha para outra Org).
3. **Escopo column:** UPDATE de `valores` e de `orgId` → `permission denied` (seguem **sem** GRANT).
4. **Sem DELETE:** DELETE em `Card` → `permission denied`.

## Cenário 6 — Concorrência e idempotência

- Dois `POST .../move` concorrentes (`Promise.all`) para a mesma Fase destino: **1 vence** (200), o outro é **200**
  idempotente **ou** **409** — **nunca 500** (P2002/P2028 reconhecidos).
- Retry ao mesmo destino após movido: **200** no-op (D4), sem 2º evento — idempotência estrutural, sem chave.
- Mover para a **mesma** Fase (origem == destino): **200** no-op (sem UPDATE/evento/entrada — D4).

## Comandos de teste

```bash
# suíte da API (local, paralela por padrão)
pnpm --filter @giraffe/api test

# arquivos desta Story
pnpm --filter @giraffe/api exec vitest run test/transition-preflight.test.ts
pnpm --filter @giraffe/api exec vitest run test/card-move-rls.test.ts
pnpm --filter @giraffe/api exec vitest run test/card-move-http.test.ts

# suíte cheia como no CI (serial — estado-alvo do isolamento)
pnpm --filter @giraffe/api test:ci
```

## Critério de pronto

- [ ] CA1–CA4 verdes contra PostgreSQL real.
- [ ] Fase vermelha do GRANT provada (quebra antes, concede depois).
- [ ] `valores`/`orgId` seguem sem UPDATE; sem DELETE.
- [ ] Concorrência sem 500; idempotência confirmada.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test:ci` verdes.
