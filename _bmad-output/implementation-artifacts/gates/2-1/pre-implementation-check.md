# Pre-Implementation Check Report

## Identificacao da tarefa
Story 2.1 — Ciclo de vida e catálogo de Pipes. Branch `story/2-1-ciclo-de-vida-e-catalogo-de-pipes`.
Baseline `c1baef7`. Risco **CRÍTICO**.

## Fase e etapa atual
Fase 1, Épico 2, **Lote 2 (L2)** — primeiro CORE vertical após o L1 (congelado). Documentação Base ✅ →
BMAD ✅ → Spec Kit ✅ → **Implementação (aqui)**. Dependências 1.6/1.7 `done`. Contratos C1–C8 congelados.

## Objetivo
Entidade `Pipe` (catálogo por Organização) com ciclo de vida (criar/renomear/arquivar/restaurar), RLS e
migration versionada. Admin da Org opera; isolamento por tenant provado no banco.

## Escopo incluido / Fora do escopo
Incluído: schema/migration/RLS de `Pipe`; CASL (sujeito `Pipe`); módulo Pipes (CRUD + archive/restore);
testes reais. **Fora (congelado):** papéis por Pipe (2.2); Fases (2.3); Formulários/Cards; exclusão
definitiva/duplicação/reordenação global; semântica de `locked`; **trava de arquivamento por Cards
ativos (contrato futuro 2.11 — não materializar tabela de Card, AD-11)**.

## Story e criterios de aceite
AC1 catálogo consistente org-scoped; AC2 arquivamento reversível (dados preservados); AC3 sem exclusão/
duplicação/reordenação e não-Admin negado; AC4 isolamento RLS provado. SC-201..206.

## Regras de negocio afetadas
Admin da Org administra o ciclo de vida do Pipe; Admin do Pipe (2.2) configura mas não controla o ciclo
(fora de 2.1). Papel único e escopo por Org (AD-7/AD-10). Nenhuma regra migra para o frontend.

## Permissoes afetadas
Novo sujeito CASL `Pipe`. Em 2.1: **ADMIN** → `ler`/`administrar` Pipe no `orgId` resolvido; MEMBER/GUEST
**negados** (deny-by-default). Consome C3 (mecanismo) **sem** alterá-lo. Autorização efetiva no servidor.

## Dados e entidades afetados
**Nova tabela `Pipe`** (org-scoped) + enum `PipeState`. **Nova migration** (DDL) + rollback. RLS
ENABLE+FORCE, policies por `orgId = current_org_id()`. GRANT runtime **SELECT/INSERT/UPDATE** (sem
DELETE). Nome de Pipe **não** é PII de pessoa (rótulo de processo).

## Arquitetura e modulos afetados
`prisma/schema.prisma` (+`Pipe`/enum/relação); `prisma/migrations/<ts>_pipes/` + `prisma/rollback/`;
`src/pipes/*`; `src/kernel/authz/ability.ts`+`ability.factory.ts`; `src/app.module.ts`; `CLAUDE.md`.
**Gate de Arquitetura:** nova entidade organizacional com RLS — replica o padrão de Membership (AD-6);
não cria superfície de bypass; consome C1–C8.

## Dependencias tecnicas
Nenhuma nova (Prisma/CASL/NestJS já em uso — `context7-check` APROVADO).

## Skills obrigatorias para esta tarefa
`context7-check` ✅. `security-check` (RLS, bypass, GRANT, authz negativa). `lgpd-check` (nome de Pipe
não é PII). `migration-check` (versionada, rollback, banco limpo/atualizado, isolamento). `backup-check`
(migration reversível; arquivamento não apaga). `observability-check` (logs sanitizados).
`performance-check` não bloqueia (CRUD simples + índice `(orgId, state)`).

## Riscos identificados
1. **Bypass/erro de RLS** → replicar padrão de Membership; teste prova negação sem contexto (fase
   vermelha) e isolamento cross-tenant. **Proibido** caminho de bypass (AD-6).
2. **Exclusão definitiva** → sem GRANT DELETE; teste prova.
3. **Drift schema↔migration** (SQL hand-written) → DDL fiel às convenções do Prisma + `prisma generate`
   + typecheck + testes reais.
4. **Colisão de migration no pipeline 2.1/2.2** → uma migration estrutural ativa por cadeia; 2.2 encadeia
   depois (branch empilhada), nunca concorrente com o mesmo estado-base.
5. **Colisão de restaurar por unique de nome** → decisão: **sem** unique de nome (id é o ref estável).

## Plano minimo de implementacao
(1) schema + migration + rollback + generate; (2) CASL; (3) módulo Pipes; (4) testes reais; (5) docs;
(6) gates finais. **Não alterar:** contratos C1–C8, RLS/auth existentes, migrations já integradas.

## Estrategia de testes
Vitest + PostgreSQL real. Escrita na **Org C** (área de escrita paralela). RLS/isolamento (fase
vermelha: contexto ausente → negado); autorização negativa (MEMBER/GUEST 403); CRUD + archive/restore
com dados preservados; GRANT sem DELETE; migration deploy (limpo) + rollback (descartável).

## Estrategia de rollback
Migration reversível (`<ts>_pipes.down.sql`: DROP policies/table/type) + remoção do histórico
(`db-migrate.mjs rollback`). Testado em banco descartável. Arquivamento é mudança de estado (não apaga).

## Decisoes pendentes
Nenhuma bloqueadora. `locked` sem semântica de bloqueio em 2.1 (só atributo). Trava por Cards = 2.11.

## Status final
**APROVADO** — nova entidade com RLS replicando padrão provado; migration versionada e reversível; sem
bypass; GRANT mínimo; dependências já presentes; riscos mitigados e testáveis. Prosseguir com
`security-check`/`migration-check`/`backup-check`/`lgpd-check`/`observability-check` e revisão adversarial
reforçada antes de concluir.

---

## Revalidação pós-implementação (2026-07-13)

O gate previa "testado em banco descartável" como **intenção**; isso agora é **fato**: SC-206 executado,
13/13 (deploy → RLS/policies/GRANT → smoke de isolamento → rollback → remoção cirúrgica → reaplicação),
evidência em `migration-check.md`.

Confirmado que o escopo congelado foi respeitado: sem papéis por Pipe (2.2), sem Fases (2.3), sem tabela de
Card, sem semântica de `locked`. Nenhuma decisão pendente virou bloqueio.

**Desvio a registrar:** o `authz.guard.ts` (contrato congelado **C3**) **foi modificado** — o gate não
previa tocar o guard, apenas estender `ability.ts`/`ability.factory.ts`. Comportamento de `Organizacao`
preservado e suíte do L1 verde, mas o desvio é real e está declarado como decisão **D-1** em
`specs/2-1-.../analyze.md`. É o item que exige revisão independente.

**Status mantido: APROVADO** (com o desvio D-1 declarado).
