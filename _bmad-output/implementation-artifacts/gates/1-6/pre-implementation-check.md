# Pre-Implementation Check Report

## Identificacao da tarefa
Story 1.6 — Substrato de autorização efetiva (CASL, deny-by-default, invalidação de abilities).
Branch `story/1-6-substrato-de-autorizacao-efetiva`.

## Fase e etapa atual
Fase 1, Épico 1 (Fundação e Conta), Lote 1 (L1). Sequência L1: 1.5 (done) → **1.6** → 1.7 → 1.8 → tech-2.
Documentação Base ✅ → BMAD ✅ (story criada) → Spec Kit ✅ (compacto) → **Implementação (aqui)**.
Tarefa liberada: dependências 1.2/1.3/1.4 estão `done` e no `main`. Não antecipa Fase 2.

## Objetivo
Introduzir a camada de autorização (`AuthZ`) do kernel com CASL, tornando o papel efetivo da Membership
o teto do que cada principal pode na Organização resolvida, deny-by-default, com invalidação de abilities.

## Escopo incluido
Contrato `action+subject+conditions`; factory `(papel, orgId)→ability`; ponto de aplicação (guard +
decorator) deny-by-default; mecanismo/porta de invalidação por `(accountId, orgId)`; observabilidade da
negação; testes de integração real. (FR-601..608)

## Fora do escopo
Matrizes de permissão por módulo; papéis de Pipe/Card/Database; gestão de membros e mudança de papel real
(Épico 8 — só o contrato de invalidação aqui); step-up por ação; acesso do Super Admin da Plataforma a
dados de Organização (pendente, INV-ADMIN-01(c)). **Nenhuma migration.**

## Documentacao consultada
`epics.md#Story-1.6`; `ARCHITECTURE-SPINE.md#AD-9` e `#AD-6`; `prd.md#INV-ADMIN-01`, `#NFR-4`; código
atual `kernel/context/{tenant-context.guard,org-context.resolver,principal.provider,request-context}.ts`;
Context7 `/stalniy/casl` (API `AbilityBuilder(createMongoAbility)`, `subject()`, deny-by-default nativo).

## Story e criterios de aceite
AC1 deny-by-default; AC2 escopo de Org sem herança; AC3 Plataforma sem acesso implícito; AC4 invalidação
imediata. Traduzidos em SC-601..608 no `spec.md`. Definidos e verificáveis.

## Regras de negocio afetadas
`deny-by-default`; `PERMISSÃO = AÇÃO + ESCOPO`; papel da Organização como limite máximo; `Super Admin
(Plataforma) ≠ Admin da Organização` (INV-ADMIN-01); sem permissão duradoura em token (AD-9).

## Permissoes afetadas
Esta Story **é** a camada de permissões. Não define matrizes por módulo; define o **mecanismo**. Negação
por padrão aplicada. Comportamento de Convidado/Super Admin: sem acesso implícito (deny-by-default cobre).

## Dados e entidades afetados
`Membership` (`role`/`state`) como **fonte de verdade** do papel efetivo — já existe (1.2), lida no
contexto da 1.3. **Sem novo campo, sem migration.** Isolamento multi-tenant preservado: a leitura do papel
ocorre dentro de `withAccountContext`/contexto resolvido, e a ability é amarrada a `{ orgId }`.

## Arquitetura e modulos afetados
Novo diretório `apps/api/src/kernel/authz/` (fronteira transversal, sem regra de negócio — AD-4/AD-5).
Alteração cirúrgica em `OrgContextResolver`/`ContextoOrganizacional` para **expor o `role`** da Membership
resolvida (a query já lê a Membership; hoje seleciona só `orgId`).

**Gate de Arquitetura — RESOLVIDO.** Desenho do ponto de aplicação:
- O `TenantContextGuard` é **global** e roda primeiro: resolve identidade (1.4) + Organização (1.3) e
  preenche o `RequestContext`. O guard de autorização é um **segundo `CanActivate`**, acionado por
  metadata do decorator `@Requer(action, subject)`, que **assume** contexto de Org já resolvido, lê o
  **papel efetivo** do `RequestContext`, constrói/obtém a ability e nega (403) deny-by-default.
- O papel efetivo é **derivado do banco** (Membership), nunca de token/cookie (AD-9). Reuso total do
  caminho de resolução da 1.3 — **sem** header de conveniência de papel.
- Simetria com o AD-6: assim como não pode existir bypass de RLS, não pode existir bypass de ability.

## Dependencias tecnicas
**Nova dependência: `@casl/ability`** (a fixar no `apps/api/package.json`; versão exata registrada no
`context7-check` após `pnpm add`). Sem outras. NestJS 11, TypeScript estrito já presentes.

## Skills obrigatorias para esta tarefa
- `context7-check` (CASL) — **obrigatória antes de codificar** (T002).
- `security-check` — **obrigatória** (superfície de autorização direta).
- `observability-check` — **obrigatória** (log de negação sanitizado, INV-REPORT-01).
- `migration-check` — **não se aplica** (sem migration).
- `lgpd-check` — não se aplica diretamente (sem novo dado pessoal; papel não é PII sensível).
- `backup-check`, `performance-check` — não bloqueiam (cache in-memory por processo; sem I/O novo pesado).

## Riscos identificados
1. Embutir permissão em token (armadilha AD-9) → mitigação: permissão sempre derivada do banco; teste SC-607.
2. Bypass de ability acidental (`can('manage','all')`) → mitigação: teste de fase vermelha do deny-by-default (SC-601).
3. Herança cross-tenant → mitigação: ability amarrada a `{ orgId }`; teste PostgreSQL real Org C↛Org A (SC-602).
4. Cache obsoleto após troca de papel → mitigação: invalidação explícita + mutação (SC-606/T014).

## Plano minimo de implementacao
Ordem: (1) tipos `authz/ability.ts`; (2) expor `role` no contexto; (3) `ability.factory.ts`; (4) testes
factory (SC-601/603/604) vermelho→verde; (5) `authz.guard.ts` + `@Requer` decorator; (6) testes guard
(SC-605/602); (7) `ability.cache.ts` + porta de invalidação; (8) teste SC-606 + mutação; (9) log de
negação + SC-607/608; (10) gates. **Não alterar:** o contrato do `TenantContextGuard`/`OrgContextResolver`
além de expor o `role`; nada em `db/tenant-context.ts` (RLS); nada no frontend.

## Estrategia de testes
`apps/api/test/authz.test.ts`, integração real (AppModule porta efêmera, PostgreSQL real), escrita na
**Org C**, provando a **fase vermelha** de cada teste de segurança. Mutação da invalidação registrada.

## Estrategia de rollback
Sem migration → rollback é reverter o código. A camada é **aditiva**: enquanto nenhum handler usar
`@Requer`, o comportamento atual (contexto da 1.3) permanece idêntico. Reversão sem efeito em dados.

## Decisoes pendentes
Versão exata de `@casl/ability` (definida no `pnpm add` + `context7-check`). Nenhuma decisão de
negócio/segurança/dados pendente que gere retrabalho estrutural.

## Status final
**APROVADO** — gate de Arquitetura resolvido; escopo, ACs, permissões, dados e riscos definidos;
dependência única e verificável; sem migration; rollback trivial. Prosseguir para `context7-check` (T002)
e implementação, executando `security-check` e `observability-check` antes de concluir a Story.
