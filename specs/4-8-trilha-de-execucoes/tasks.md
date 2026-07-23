# Tasks — Story 4.8: Trilha de Execuções

Dependência-ordenada. Read-side puro (sem migration/GRANT).

- T1. `execution-view.ts` (núcleo puro): `motivoLegivel`, `avaliacaoCondicoes`, `duracaoMs`, `projetarResultadoAcao` (com mascaramento), `projetarExecucao`. Allowlist explícita.
- T2. `executions.dto.ts`: `parseFiltrosExecucoes` (de/ate/estado/eventType, fail-closed → 400), `parseCursor`/`parseLimite` (reuso 3.6).
- T3. `executions-read.service.ts`: `resolverEscopo` (TODAS/RESTRITO via pipe-authz), `listar`, `obter`; batch-load DomainEvent/Automation/ActionResults; cursor `[createdAt,id]`; `withTenantContext`.
- T4. `executions.controller.ts`: `GET .../executions`, `GET .../executions/:executionId`; `@Requer('ler','Automacao')`.
- T5. Wiring em `pipes.module.ts`.
- T6. Testes de integração PG real:
  - `execution-view.core.test.ts` (unit puro): motivo legível, agregado de condição, duração, mascaramento, allowlist.
  - `execution-trail-http.test.ts`: autz por papel (Admin Org/Admin Pipe/Membro/restrito/Viewer/Convidado/sem-acesso), 404 não-enumerante, filtros + fail-closed, cursor, cross-tenant.
  - `execution-trail-e2e.test.ts`: estados distintos + conjunto mínimo + asserção negativa de sanitização + cadeia/interrupção 4.7.
- T7. Gates: format/lint/typecheck/build; suíte da API; regressão 4.6/4.7; `prisma generate` sem diff. Fase vermelha documentada.
