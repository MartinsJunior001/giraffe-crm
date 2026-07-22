# Gates — Story 4.2 (Ciclo de vida e gestão da Automação)

Risco: **ALTO** (autz multi-tenant + ciclo de vida + snapshot). Gates proporcionais: integração real (PostgreSQL de verdade), regressão de segurança, migration + rollback drill, typecheck/lint/build, CI no SHA exato.

## context7-check (obrigatório)
- **Prisma 6.19.3** (Context7 `/prisma/web`): `$transaction(async (tx) => …, { timeout, isolationLevel })`, `PrismaClientKnownRequestError.code === 'P2002'` (unique). P2028 (tx fechada/timeout) — padrão já consolidado em `publication.service.ts`. Nenhuma assinatura inventada.
- **NestJS 11**: `@Controller/@Post/@Patch/@Get`, `@HttpCode`, `ConflictException/NotFoundException/BadRequestException/ForbiddenException` — baseline do próprio código.
- Baseline de versão: `apps/api/package.json` (`@prisma/client`/`prisma` 6.19.3; `@nestjs/*` ^11).

## pre-implementation-check / safe-implementation
- Estende `Automation` (4.1), não reescreve o modelo. Reusa `pipe-authz`, `validarConfiguracao`, `definirContextoOrg`, padrão de tx interativa (2.6/2.11) e de snapshot (`FormVersion`). Sem abstração especulativa (sem tabela de Execuções — é 4.8; sem catálogos — 4.3/4.4/4.5). **APROVADO.**

## security-check
- **Autorização (deny-by-default):** gerenciar = `exigirGerenciarPipe` (Admin da Org/Admin do Pipe); ler versões = `resolverPoderNoPipe`. Membro/leitor → **403** ao mutar; sem acesso → **404 não-enumerante**; GUEST barrado pelo teto do PipeGrant. Guard/`ability.ts` intocados (C3). Provado em `automation-lifecycle-http`.
- **Isolamento multi-tenant:** `AutomationVersion` RLS ENABLE+FORCE + `WITH CHECK` no INSERT e UPDATE; toda query por `withTenantContext`/tx com `definirContextoOrg`; nenhum `where orgId` manual; `orgId` nunca do cliente; FK composta `(orgId, automationId) → Automation(orgId, id)` recusa versão cross-tenant. Provado em `automation-lifecycle-rls`.
- **GRANT como fronteira:** `Automation` ganha UPDATE **column-scoped** (state/activeVersion/config/updatedAt) — `orgId`/`pipeId`/`id`/`idempotencyKey` **negados** (`permission denied`). `AutomationVersion` só `SELECT/INSERT` (append-only; UPDATE/DELETE negados). Provado em `automation-lifecycle-rls`.
- **Mass-assignment:** allowlist nos DTOs (criar/editar/duplicar); `state`/`orgId`/`activeVersion`/`schemaVersion` recusados do cliente.
- **Concorrência/idempotência:** guarda otimista (`updateMany where state=<lido>`); número de versão único → rollback → 409; P2002/P2028 → idempotente/409, **nunca 500**; corrida perdida com versão congelada faz ROLLBACK (sem versão órfã). Idempotência de criação/duplicação por `idempotencyKey`.
- **Sem PII em log:** a configuração (possível PII) nunca entra na trilha — auditoria só metadados. Provado em `automation-lifecycle-log`.
- **APROVADO.**

## observability-check
- **Auditoria administrativa (FR-214):** cada transição/edição emite evento estruturado (Pino) sanitizado no client raiz (`this.auditar` — ator/Org/ação/recurso/resultado); criação/duplicação via extensão auto-audita (`MODELOS_AUDITADOS` inclui `Automation` e agora `AutomationVersion`); tentativa negada por RLS é registrada como `denied`, nunca `allowed`. Health/readiness inalterados. **APROVADO.**

## migration-check
- **Aditiva e reversível:** `20260726120000_automation_lifecycle` — 2 colunas nullable + 2 UNIQUE aditivos em `Automation`, 1 tabela nova (`AutomationVersion`), GRANT UPDATE column-scoped. Rollback em `prisma/rollback/20260726120000_automation_lifecycle.down.sql`.
- **Sem destrutivo, sem backfill:** colunas novas nascem NULL; tabela nova nasce vazia; nenhum dado existente alterado. Sem lock prolongado (ADD COLUMN nullable não reescreve; índices sobre tabela vazia).
- **Rollback drill:** aplicado em banco DESCARTÁVEL (porta 5446, projeto `giraffe42db`), revertido e reaplicado — ver evidência abaixo.
- **APROVADO.**

## lgpd-check (aplicável leve)
- Sem exclusão física: arquivar é `state`; `AutomationVersion` append-only. Config (possível PII) fora de log. Sem novo dado pessoal do titular (a Automação é config, não dado de Card/Registro). **OK.**

## Evidência de execução (integração real PostgreSQL)
- Provas (a)–(h) dos testes adversariais: ver `automation-lifecycle-{transitions,snapshot,rls,http,log}.test.ts` + regressão de `automations-{rls,http,log,core}.test.ts`.
