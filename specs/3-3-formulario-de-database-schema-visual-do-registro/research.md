# Research — Story 3.3

## Reuso do builder (o que já existe)

- `apps/api/src/pipes/forms/` é o Form Builder canônico: `forms.service.ts` (montagem 2.4), `fields.service.ts`
  (evolução 2.5), `publication.service.ts` (publicação 2.6), `snapshot.ts` (validação + gate de Arquivo),
  `option-config.ts` (invariantes das opções de Seleção), `file-gate.ts` (AD-28), `form-locate.ts` (resolução de
  contexto/owner).
- `Form` já tem `context ∈ {PIPE_INITIAL, PHASE, DATABASE}` e o enum `FormContext` inclui `DATABASE`. Faltam a
  coluna owner `databaseId`, a relação, o CHECK que aceite DATABASE e o índice único parcial.
- CHECK atual (`20260714120000_forms/migration.sql`): `Form_context_owner_ck` cobre só PIPE_INITIAL/PHASE — uma
  linha `context='DATABASE'` é hoje **inválida** (comentário confirma o contrato do E3).
- Unicidade "um Form por owner+contexto": índices únicos parciais `Form_pipe_initial_uq`/`Form_phase_uq`. Falta
  `Form_database_uq`.
- Autorização: hoje `pipe-authz.ts` (`resolverPoderNoPipe`/`exigirGerenciarPipe`) é chamado diretamente pelos 3
  serviços. `database-authz.ts` (3.2) já provê `resolverPoderNoDatabase`/`exigirGerenciarDatabase` (funções puras).

## Context7 (a confirmar no T001)

- Prisma 6.19.3: `ALTER TABLE ADD COLUMN`, `ADD/DROP CONSTRAINT ... CHECK`, índice parcial via raw SQL (não
  expressável no schema — já provado por `Form_*_uq`); relação opcional `Database.forms Form[]`.
- NestJS 11: `Module` `exports`/`imports` para compartilhar providers entre módulos; controllers com
  `@Requer('ler','Database')` + `@HttpCode`.

## Precedentes aplicáveis

- **DBT-AUTHZ-01** (2.3→2.4): guarda fina extraída para helper compartilhado, roteada por contexto.
- **2.6 publicação:** transação interativa no client raiz (`definirContextoOrg`); UNIQUE de número → 409.
- **RN-061** (`Database ≠ Pipe`): rotas/subject de Database; a lógica do builder é platform-level (compartilhada).
