# Plano — Story 4.2

## Contexto técnico
- NestJS 11, Prisma 6.19.3, Node 24, PostgreSQL 16. Context7 confirmado: `$transaction(async (tx)=>…)`, `PrismaClientKnownRequestError.code` P2002 (unique); P2028 (tx fechada) — padrão já consolidado em `publication.service.ts`.
- Baseline: 4.1 (`apps/api/src/pipes/automations/`). Estende, não reescreve.

## Artefatos de código

### Núcleos puros (testáveis sem banco)
1. `automations/automation-lifecycle.transitions.ts` — `planejarTransicao(acao, estado)`; estados `INACTIVE/ACTIVE/ARCHIVED`; ações `ativar/desativar/arquivar/restaurar`; retorna `transicao | idempotente | invalido`. Sem `previous` (restaurar → sempre INACTIVE).
2. `automations/automation-snapshot.ts` — `montarSnapshotAutomacao(config)` + `calcularRevisaoAutomacao(snapshot)` (sha256 canônico, espelho de `forms/snapshot.ts`).
3. `automations/automation-references.ts` — extrai `revalidarReferencias`/`idsAlcancaveis` de `AutomationsService` (reuso por criar/editar/ativar/duplicar).

### Serviço/controller
4. `automations/automation-lifecycle.service.ts` — `editar`, `ativar`, `desativar`, `arquivar`, `restaurar`, `duplicar`, `listarVersoes`, `obterVersao`. Tx interativa no client raiz (`definirContextoOrg`), guarda otimista (`updateMany where state=<lido>`), P2002/P2028 → 409, auditoria manual.
5. `automations/automations.controller.ts` — acrescenta rotas PATCH/activate/deactivate/archive/restore/duplicate/versions (todas `@Requer('ler','Automacao')`).
6. `automations/dto/automations.dto.ts` — `parseEditarAutomacao`, `parseDuplicarAutomacao` (allowlist, idempotencyKey opcional).
7. `automations/automations.service.ts` — `criar` passa a aceitar `idempotencyKey?` (opcional, retrocompatível) e usa `automation-references`.

### Schema + migration
8. `schema.prisma` — `Automation.activeVersion Int?`, `Automation.idempotencyKey String?`, `@@unique([orgId,id])`, `@@unique([orgId,pipeId,idempotencyKey])`, relação `versions`; modelo `AutomationVersion`.
9. `migrations/20260726120000_automation_lifecycle/migration.sql` + `rollback/20260726120000_automation_lifecycle.down.sql`.
10. `kernel/db/tenant-context.ts` — `AutomationVersion` em `MODELOS_AUDITADOS`.
11. `pipes.module.ts` — registra `AutomationLifecycleService`.

## Testes (apps/api/test/)
- `automation-lifecycle-transitions.test.ts` — matriz pura de transições.
- `automation-snapshot.test.ts` — revisão determinística/estável.
- `automation-lifecycle-rls.test.ts` — GRANT UPDATE column-scoped (state/config sim; orgId/pipeId não → permission denied); `AutomationVersion` append-only (sem UPDATE/DELETE); FK composta da versão; isolamento cross-tenant.
- `automation-lifecycle-http.test.ts` — ACs pela porta HTTP: transições idempotentes/inválidas, edição-ativa cria versão, duplicar, autz (Admin/Membro/GUEST/sem-acesso), idempotência de duplicação.
- `automation-lifecycle-log.test.ts` — auditoria da transição na trilha, sanitização (sem config/PII).

## Ordem
núcleos puros → schema/migration → serviço/controller/dto → module/tenant-context → migrate → testes → gates.
