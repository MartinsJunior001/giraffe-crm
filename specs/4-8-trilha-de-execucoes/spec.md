# Spec — Story 4.8: Trilha de Execuções

> Passagem consolidada do Spec Kit (specify → clarify → plan → checklist → tasks → analyze). Contrato funcional:
> `epics.md` §1439–1453. Decisões duráveis: `_bmad-output/implementation-artifacts/decisions/execution-trail-4-8.md`.

## specify — O QUE

A aba **"Execuções"** (API interna, read-side) sobre as Automações de um Pipe: leitura sanitizada, autorizada e
paginada das Execuções lógicas (`AutomationExecution`, 4.6) com seus resultados de Ação (`AutomationActionResult`)
e metadados de cadeia (4.7). Registra/expõe o conjunto mínimo do §1444 com estados **honestos e distintos**
(UX-DR6). **Nunca** vaza payload/segredo/token/URL assinada/chave de storage/prompt/resposta de IA/stack
trace/`valores`/PII (§1446, NFR-1/8/16, AD-30). Acesso por papel (§1447). Filtros período/estado/Evento +
paginação (§1448). Separada da observabilidade técnica (Pino/Sentry — §1449).

### Fora de escopo

- Observabilidade técnica (Pino/Sentry/logs) — transversal.
- Persistência/emissão de evento de leitura, reexecução, re-drive de dead-letter (4.7 `DEB-4-7-REPROCESSAMENTO`).
- Resultado **por-Condição** (não persistido por 4.4/4.6 — `DEB-4-8-CONDICOES-POR-CONDICAO`).
- Árvore completa da cadeia (`DEB-4-8-CHAIN-TREE`); UI/frontend (nenhuma regra de domínio no front).

## clarify — ambiguidades materiais resolvidas (sem escalar)

1. **Piso de acesso** = OPERAR o Pipe (Admin Org/Admin Pipe/Membro; Viewer/Convidado 403; sem acesso 404) — D1.
2. **"resultado de cada Condição"** — não persistido; expõe agregado derivado do estado — D6, `DEB-4-8-CONDICOES-POR-CONDICAO`.
3. **Filtro "Evento"** = `eventType` (do `DomainEvent`, pré-resolvido por `eventId IN`) — D2.
4. **`causationId`** — não exposto (não consta do §1444; interno) — D5.

## plan — COMO

Novo subdomínio **`apps/api/src/pipes/automations/executions/`** (read-side puro, espelha `records/history/` 3.6):

- `execution-view.ts` — **núcleo puro**: projeção allowlist (`projetarExecucao`/`projetarResultadoAcao`),
  `motivoLegivel(codigo)` (mapa estático pt-BR), `avaliacaoCondicoes(state)`, `duracaoMs(startedAt, finishedAt)`,
  `mascararAlvo(...)`. Testável sem banco.
- `executions.dto.ts` — validação manual fail-closed dos filtros (`de`/`ate`/`estado`/`eventType`) + `cursor`/
  `limite` (reuso do padrão 3.6). Sem `class-validator`.
- `executions-read.service.ts` — resolve escopo (`TODAS`/`RESTRITO`) via `pipe-authz.ts`, monta o `where`,
  pagina por cursor `[createdAt, id]`, faz o batch-load (DomainEvent, Automation, ActionResults) e mapeia pela
  projeção pura. Toda query por `withTenantContext`.
- `executions.controller.ts` — `GET .../executions` (lista) e `GET .../executions/:executionId` (detalhe),
  `@Requer('ler','Automacao')` grossa; autz fina no serviço.
- Wiring em `pipes.module.ts` (controller + service).

**Sem migration, sem GRANT, sem tocar engine/4.7, sem tocar `ability.ts`.**

## checklist — gates (RISCO ALTO: toca autz/isolamento/sanitização)

- [ ] Autz por papel: Admin Org, Admin Pipe, Membro-não-restrito, Membro-restrito, Viewer(403), Convidado(403), sem-acesso(404).
- [ ] Isolamento cross-tenant (RLS): Execução de outra Org invisível/404.
- [ ] 404 não-enumerante (Execução inexistente/outro Pipe/recurso inacessível ao restrito).
- [ ] Sanitização: asserção **negativa** — nenhum campo proibido no JSON; projeção allowlist provada.
- [ ] Mascaramento de `targetResourceId` para o Membro restrito.
- [ ] Filtros (período/estado/Evento) + allowlist fail-closed → 400; cursor determinístico.
- [ ] Estados distintos (8) + `avaliacaoCondicoes` agregado + `executionChainId`/`chainDepth`.
- [ ] Fase vermelha: quebrar projeção/autz e confirmar falha.
- [ ] Regressão 4.6/4.7 verde; `prisma generate` sem diff; lint/typecheck/build; format.

## Contrato de saída (projeção allowlist)

`ExecucaoResumoVisao` (lista) e `ExecucaoDetalheVisao` (detalhe = resumo + `acoes[]` + `cadeia`):

```
ExecucaoResumoVisao {
  executionId, automation: { id, name, versao, revision },
  evento: { eventId, tipo, origem, recursoPrincipal: { tipo, id } | null },
  state, avaliacaoCondicoes, tentativa, executionChainId, chainDepth,
  iniciador: { tipo, accountId|null, automationId|null },
  startedAt, finishedAt, duracaoMs|null, correlationId,
  lastErrorCode|null, motivoLegivel|null, createdAt
}
ResultadoAcaoVisao { actionIndex, actionType, state, errorCode|null, motivoLegivel|null, targetResourceId|null, referenciaRestrita }
ExecucaoDetalheVisao extends ExecucaoResumoVisao { acoes: ResultadoAcaoVisao[], cadeia: { executionChainId|null, chainDepth, interrompidaPorLimite, motivoLegivel|null } }
```

`orgId`/`executionId`-interno/`leaseOwner`/`nextAttemptAt`/`configSnapshot`/payloads **fora da fronteira**.
