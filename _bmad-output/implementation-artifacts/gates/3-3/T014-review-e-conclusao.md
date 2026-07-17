# Gate T014 — Revisão adversarial CRÍTICA + gates de conclusão da Story 3.3

Data: 2026-07-16 · Branch: `story/3-3-formulario-de-database-schema-visual-do-registro` (off `origin/main` @ 53ad4b8)

## Gates de qualidade (evidência real)

- **typecheck** (`tsc --noEmit`, src + test): ✅ verde.
- **lint** (`eslint .`): ✅ verde.
- **format** (`prettier --check .`): ✅ `All matched files use Prettier code style`.
- **testes-alvo** (`database-forms-rls` + `database-forms-http`): ✅ **14/14** em PostgreSQL real (era 10; +4 casos
  de cobertura crítica adicionados na triagem + a aresta DATABASE+phaseId no CHECK).
- **suíte serial completa** (`test:ci`): **695/696** — a única falha foi `login-http.test.ts:317` (rate-limit de
  login), **flake ambiental sob carga** (worktree novo), **não relacionado à 3.3** (que não toca auth); confirmado
  **23/23 verde isolado**. Regressão de E2 (2.4/2.5/2.6/2.15) verde dentro dos 695. Gate autoritativo = CI limpo.
- **SC-206** (deploy → rollback cirúrgico → reapply em PostgreSQL real): ✅ verde. Rollback atômico (Postgres
  envolve o `.down.sql` multi-statement em transação implícita); remove só `Form.databaseId`/CHECK/índices;
  reapply íntegro; `db:status` up to date.

## Revisão adversarial CRÍTICA (4 camadas read-only)

Segurança, Arquitetura/RLS, Edge Cases e Aceite — em paralelo, sobre o diff da 3.3.

**Resultado: nenhum achado CRÍTICO/ALTO de código.** Aceite = **APROVADO** (AC1–AC7 e invariantes do dono
atendidos; C3 congelado confirmado por `git diff 53ad4b8 -- kernel/authz/` vazio). Triagem:

- **Segurança:** roteamento de autz por contexto sólido (todo sítio de mutação/leitura passa por `form-authz`;
  MEMBER/VIEWER só leem → 403 ao mutar; sem acesso → 404); CHECK de owner correto; sem GRANT novo; imutabilidade
  de `FormVersion` preservada; sem ciclo de módulo. **1 LOW** (rollback) + INFO (coerência org↔owner = padrão
  vigente de pipeId/phaseId, mitigado pelo relê sob RLS).
- **Arquitetura/RLS:** INV-FORM-01 preservado (controllers reusam os 3 serviços, zero segundo builder);
  generalização **aditiva** sem regressão (caminho Pipe/Fase é default); migration coerente com o padrão de
  owner, sem drift; fiação unidirecional Databases→Pipes sem ciclo. Mesmo **LOW** (rollback).
- **Edge Cases:** código de produção correto; achados = **lacunas de teste (MÉDIO)** — endereçadas.
- **Aceite:** APROVADO COM RESSALVAS — ressalvas documentais/cobertura, endereçadas.

### Achados endereçados nesta Story

- **LOW (rollback re-adiciona CHECK de 2 cláusulas antes de dropar a coluna):** é **fail-safe por construção** —
  se houver Form `DATABASE`, o `ADD CONSTRAINT` falha e a transação implícita **reverte o rollback inteiro** (sem
  estado parcial, sem perda). Reverter a feature com schema de Database vivo orfanaria os Formulários; o caminho
  correto é removê-los antes. **Ação:** pré-condição documentada no `.down.sql`. (SC-206 passou por rodar em base
  sem Form DATABASE.)
- **MÉDIO (cobertura de teste em contexto DATABASE):** **adicionados** — opções de Seleção (SELECT_SINGLE +
  adicionar opção), mutação por MEMBER (editar + reorder → 403), publicação inválida (não materializado → 404;
  materializado sem Campo ativo → 400) e **publish/unpublish por Admin do Database** (grant ADMIN → 201/200).
- **Ressalva doc (publish 200→201):** o código retorna **201** (paridade com E2 — publish cria `FormVersion`);
  **corrigido o contrato** `database-forms.http.md` (o código já estava certo).
- **BAIXO (CHECK cobria DATABASE+pipeId, não +phaseId):** **adicionada** a aresta phaseId ao teste RLS.

## Gates de conclusão

- **security-check:** ✅ (revisão de Segurança acima; RLS/CHECK/GRANT/roteamento de autz).
- **observability-check:** ✅ `Form`/`Field`/`FormVersion` já em `MODELOS_AUDITADOS`; sem log de PII; `orgId` fora
  do payload.
- **migration-check (SC-206):** ✅ verde (acima).
- **lgpd-check:** ✅ sem exclusão física (sem GRANT DELETE novo); nenhum dado pessoal novo; `Form` é schema, não
  dado do titular.
- **backup-check:** ✅ migration aditiva (1 coluna + CHECK + índices); sem alteração destrutiva de dado existente.
- **performance-check:** ✅ índice único parcial + `@@index([orgId, databaseId])` cobrem a resolução por owner;
  toda query org-scoped; reuso do builder (sem N+1 novo).

## Veredito

**APROVADO PARA COMMIT/PR.** Todos os gates verdes com evidência real; revisão adversarial CRÍTICA sem achado
alto; achados menores endereçados na própria Story. Gate autoritativo da suíte serial = CI limpo.
