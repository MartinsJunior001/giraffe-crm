# Pre-Implementation Check Report — Story 2.2 (papéis e acesso por Pipe)

## Identificação da tarefa
Story 2.2 — Papéis e acesso por Pipe. Branch `story/2-2-papeis-e-acesso-por-pipe` (empilhada sobre a 2.1).
Baseline: HEAD da 2.1 (PR #17, em review). Risco **CRÍTICO**.

## Fase e etapa atual
Fase 1, Épico 2, **Lote 2 (WAVE 2 do épico)**. Documentação Base ✅ → BMAD ✅ (Story criada) → Spec Kit ✅
(spec/plan/checklist/tasks/analyze) → **Implementação (aqui)**. Dependências **2.1** (em review) e **1.6**
(done). Decisões de Produto **D1.4/D1.3** aprovadas.

## Objetivo
Autorização **por recurso** sobre `Pipe`: o Admin da Org concede papéis por Pipe (Admin do Pipe / Membro do
Pipe / Somente leitura); MEMBER/GUEST acessam **apenas** os Pipes concedidos; ausência de papel = sem
acesso, sem revelar o recurso. Nova entidade `PipeGrant` com RLS e migration; isolamento provado no banco.

## Escopo incluído / Fora do escopo
Incluído: `PipeGrant` (schema/migration/RLS/índice único parcial); autorização por recurso **no serviço**
(DBT-AUTHZ-01); rotas de concessão + ajuste da listagem de Pipes; testes reais. **Fora (congelado):**
acesso/concessão de **Card** (2.10); Responsável/Observador/Comentador (D1.5); **modos condicionais**
"visão restrita"/"apenas formulário inicial" (não são papéis, D1.4); Fases (2.3); gestão de membros (Épico 8).

## Story e critérios de aceite
AC1 sem papel → sem acesso (não-enumeração); AC2 poder exato do papel, ≤1 por Pipe; AC3 Admin da Org sem
concessão; AC4 isolamento (RLS) + revogação. SC-221..228.

## Regras de negócio afetadas
Consome D1.4 (papéis oficiais + concessão explícita por Pipe; Admin do Pipe ≠ Admin da Org) e D1.3 (matriz
papel×verbo). MEMBER/GUEST deixam de ser negados **no tipo** Pipe e passam a acesso **condicional à
concessão**. Nenhuma regra migra para o frontend (backend é a autoridade — AD-9).

## Permissões afetadas
CASL: abilities de Pipe para MEMBER/GUEST construídas **a partir da concessão carregada** (no serviço), não
no vácuo. Admin da Org preserva acesso total (AC3). `authz.guard.ts` **não** muda (C3; decisão D-1 da 2.1
fechada).

## Modelo de dados e migração
Nova tabela `PipeGrant` (liga a `Membership`, não `Account`); enums `PipeRole`/`PipeGrantState`; **índice
único parcial** `(pipeId, membershipId) WHERE state='ACTIVE'` via **raw SQL** na migration (Prisma 6.19.3
não suporta no schema — ver `context7-check`). RLS ENABLE+FORCE, 4 policies por `current_org_id()`, GRANT
SELECT/INSERT/UPDATE (sem DELETE; revogação é UPDATE de `state`). Migration encadeia **depois** da `_pipes`
(ts posterior), **não** concorrente. Rollback remove só os objetos da 2.2.

## Isolamento e segurança (invariante-mãe)
`PipeGrant` org-scoped por RLS (FORCE); dono ≠ runtime; sem bypass (AD-6). A RLS de `Pipe` continua
org-scoped — o filtro "quais Pipes o MEMBER vê" é da **query** (junção com concessão ATIVA), com
**não-enumeração** (404 para Pipe não concedido, nunca 403 que revelaria existência). Fase vermelha provada
nos testes.

## Riscos e mitigações
- **Vazar existência de Pipe não concedido** → 404 não-enumeração; **SC-227** prova (papel no X não vê o Y).
- **Autorização fina no guard por engano (DBT-AUTHZ-01)** → checagem no serviço; teste prova que o serviço
  nega mesmo com o guard concedendo o tipo.
- **Regressão do acesso do Admin da Org (2.1)** → suíte da 2.1 roda junto; **SC-224**.
- **Corrida na unicidade** → índice único **parcial no banco**, não checagem só na app.
- **Ordem com a 2.1** → empilhada; não abrir PR contra `main` antes do merge; rebasear e revalidar depois.

## Estratégia de rollback
Migration reversível (`<ts>_pipe_grants.down.sql`: DROP policies/table/enums) + remoção do histórico
(`db-migrate.mjs rollback`). A testar em banco descartável (SC-228). Revogação de concessão é soft-delete
(não apaga).

## Decisões pendentes
Nenhuma bloqueadora. As 4 decisões de modelagem (membership vs account; soft-delete; unicidade parcial; só
Admin da Org concede) estão **fundamentadas** no `plan.md`/`analyze.md`, confirmáveis no code-review.

## Gates de verificação durante a implementação (do analyze)
**RV-1** não-enumeração na listagem filtrada; **RV-2** autorização fina no serviço (DBT-AUTHZ-01); **RV-3**
ordem (2.1 precede).

## Status final
**APROVADO** — nova entidade com RLS replicando padrão provado; autorização por recurso no lugar certo
(serviço); migration versionada e reversível; sem bypass; GRANT mínimo; consome decisões de Produto
aprovadas; sem antecipar Card/modos condicionais; dependências presentes (1.6 done; 2.1 em review, empilhada).
Prosseguir com a implementação das partes que **não** dependem do merge da 2.1; abrir PR só após o merge.
Revisão adversarial **independente** (não subagente do implementador) obrigatória antes de concluir — lição
do PR #17.
