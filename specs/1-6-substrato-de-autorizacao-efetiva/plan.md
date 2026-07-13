# Plan — Story 1.6: Substrato de autorização efetiva

> Compacto. Fonte: `spec.md` (FR-601..608, SC-601..608) + `1-6-...md`. Baseline de versões: `package.json`
> / `pnpm-lock.yaml`. Verificação documental (CASL) obrigatória no `context7-check` antes de codificar.

## Stack e fronteiras

- **NestJS 11** (kernel da API). Nova fronteira transversal: `apps/api/src/kernel/authz/`. **Sem regra de
  negócio** no kernel (AD-4/AD-5).
- **CASL** (`@casl/ability`, nova dependência — decidir e fixar versão no pre-implementation-check):
  `AbilityBuilder(createMongoAbility)`; deny-by-default nativo; `subject('Tipo', obj)` para DTOs.
- Reuso obrigatório: `kernel/context/request-context` (contexto de Org da 1.3), `PrincipalProvider`
  (identidade da 1.4), `MembershipRole`/`MembershipState` (schema da 1.2). **Não** reinventar contexto,
  identidade nem header de conveniência de papel.

## Decisões técnicas

- **P1 — Contrato de tipos** (`authz/ability.ts`): `Action` (união fechada mínima necessária a esta
  Story — ex.: `manage`, e as ações que o teste exercer), `Subject` (nomes de subject como strings de
  contrato), `AppAbility = MongoAbility<[Action, Subject]>`. Sem inventar subjects de domínio que não têm
  consumidor concreto (Constitution II) — apenas o suficiente para provar o mecanismo.
- **P2 — Principal de autorização**: estender o conceito de principal para carregar **papel efetivo**
  (`MembershipRole`) e **estado** (`MembershipState`) da Org resolvida. A resolução lê a Membership no
  banco dentro do contexto da 1.3 (a mesma consulta que o `OrgContextResolver` já faz, ou reuso dela) —
  **não** confiar em payload de token (AD-9).
- **P3 — Factory de abilities** (`authz/ability.factory.ts`): `(papel, orgId) → AppAbility`. Membership
  ativa + papel ⇒ abilities do papel, com `conditions` amarradas a `{ orgId }`. Membership não-ativa ou
  ausente ⇒ ability vazia (`build()` sem nenhum `can`). Papel de Plataforma ⇒ **nenhum** ramo que
  conceda abilities de Org (INV-ADMIN-01(c)).
- **P4 — Ponto de aplicação** (`authz/authz.guard.ts` + decorator `@Requer(action, subject)`):
  `CanActivate` que resolve o principal + Org do request-context, constrói/obtém a ability e chama
  `ability.can(action, subject)`. `false` ⇒ `ForbiddenException` (403). Fora de contexto de Org ⇒ o
  guard da 1.3 já barrou antes; este guard **assume** contexto resolvido e nunca o dispensa.
- **P5 — Cache + invalidação** (`authz/ability.cache.ts`): cache por chave `(accountId, orgId)` com
  operação `invalidar(accountId, orgId)` exposta como **contrato/porta**. Política explícita (ex.:
  in-memory por processo nesta Fase; contrato permite troca por store distribuído depois). Sem TTL que
  substitua a invalidação explícita — a invalidação é a fonte da verdade da AC4. O Épico 8 **consumirá**
  a porta; esta Story só a entrega e a testa.
- **P6 — Observabilidade da negação**: log estruturado de negação (Pino) com `action`, `subject-type`,
  `orgId`, `accountId` — **sem** identificador do recurso concreto (INV-REPORT-01) e sem PII.

## Sequência de implementação (red-green por AC)

1. P1/P2 (contrato + principal) — compila, sem comportamento ainda.
2. P3 factory → SC-601 (deny-by-default), SC-603 (não-ativa), SC-604 (Plataforma) vermelhos→verdes.
3. P4 guard → SC-605 (403 vs permissão) e SC-602 (sem herança, PostgreSQL real) vermelhos→verdes.
4. P5 cache/invalidação → SC-606 (invalidação imediata) + **mutação** (desligar invalidação → vermelho).
5. P6 log → SC-608; SC-607 (permissão não viaja no token) coberto por asserção sobre o cookie/sessão.

## Testes

- `apps/api/test/authz.test.ts` (integração real, AppModule em porta efêmera, PostgreSQL real,
  escrita na **Org C**). Provar a **fase vermelha** de cada teste de segurança (CLAUDE.md).
- Mutação da invalidação registrada em `gates/1-6/mutation-evidence.md`.

## Riscos e ressalvas

- **Não** embutir permissão em token (armadilha AD-9). **Não** criar bypass de ability (simétrico ao
  bypass de RLS proibido pelo AD-6). **Não** antecipar subjects/matrizes de domínio sem consumidor.
- Gate de Arquitetura PENDENTE: confirmar no pre-implementation que o ponto de aplicação (guard global
  com metadata × decorator por handler) não conflita com o pipeline de guards já montado (contexto 1.3).
