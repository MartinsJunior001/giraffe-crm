---
story_key: 1-6-substrato-de-autorizacao-efetiva
epic: 1
status: review
release: CORE (Lote 1)
risco: CRITICAL
baseline_commit: 687311b76525ec940dc366c2e7a46abde01a1a65
gate_arquitetura: RESOLVIDO em 2026-07-13 (pre-implementation-check) — autorização como 2º CanActivate após o TenantContextGuard global; papel efetivo derivado da Membership (banco), nunca de token; ability amarrada a { orgId }; sem bypass de ability (simétrico ao AD-6). Dependência @casl/ability 7.0.1 fixada; context7-check APROVADO.
---

# Story 1.6 — Substrato de autorização efetiva

**As a** plataforma,
**I want** um substrato CASL por papel efetivo, deny-by-default,
**So that** cada módulo aplique permissões consistentes e negadas por padrão.

**Status: ready-for-dev.** Classificada **CORE** (Lote 1), risco **CRITICAL** — introduz a camada
de autorização (`AuthZ`) do kernel. Um erro aqui é acesso concedido onde deveria ser negado, ou
herança de permissão entre Organizações — falha de segurança direta, não bug de UX. Dependências
**1.2, 1.3 e 1.4** estão todas `done`: existe isolamento por RLS (1.2), propagação segura do contexto
de Organização por transação (1.3) e identidade real por sessão (1.4). Esta Story **transforma o
`MembershipRole`/`MembershipState`** — que hoje estão no schema mas **não governam acesso nenhum** —
no limite efetivo do que cada principal pode fazer dentro da Organização resolvida.

> **Por que CRITICAL (e não NORMAL):** a autorização é a segunda metade do invariante-mãe. A RLS (1.2)
> isola *dados* por Organização; o CASL isola *ações* por papel dentro da Organização. Deny-by-default
> significa que a ausência de regra **nega** — o oposto do modo de falha comum, em que esquecer uma
> checagem libera. E a invalidação de abilities em cache ao mudar papel/Membership é o que impede que
> uma permissão revogada continue valendo até o cache expirar. Cada uma dessas três propriedades é
> provada por teste que primeiro falha (fase vermelha) e só então passa.

---

## Escopo (do épico, congelado)

CASL com `action + subject + conditions`; **papel da Organização como limite máximo**; deny-by-default;
**ausência de acesso implícito do Super Admin da Plataforma**; **contrato e mecanismo de invalidação de
abilities em cache** ao mudar papel/Membership.

**Rastreabilidade:** NFR-4 (canônico); AD-9; Modelo de Permissões Efetivas; INV-ADMIN-01.
[Source: epics.md#Story-1.6; ARCHITECTURE-SPINE.md#AD-9; prd.md#INV-ADMIN-01]

**Integração (do épico):** esta Story estabelece **o contrato e o mecanismo de invalidação**; o
**Épico 8** integra as operações reais de alteração/suspensão/reativação/encerramento de Membership a
esse contrato, **sem recriar** o mecanismo de autorização.

**Fora do escopo (do épico, não antecipar — Constitution II):**
- papéis de Pipe/Card/Database (Épicos de domínio);
- gestão de membros / convites / suspensão real (Épico 8);
- **matrizes de permissão por módulo** (ficam nos Épicos de domínio; aqui só o mecanismo e o papel de
  Organização como teto);
- **step-up / reautenticação por ação sensível** (definição de *quais* ações = Produto + Segurança);
- qualquer acesso do Super Admin da Plataforma a dados de Organização (decisão separada e pendente —
  INV-ADMIN-01(c)).

**Demonstração vertical (do épico):** **negação por padrão comprovável** — um subject sem regra
explícita nega o acesso, e a prova roda contra o mecanismo real, não contra um mock.

---

## Acceptance Criteria

> Do épico (BDD congelado). Cada critério é traduzido em Spec Kit (`SC-6xx`) e coberto por teste.

1. **AC1 — deny-by-default.** *Given* um subject sem regra explícita *When* um principal tenta a ação
   *Then* o acesso é **negado**.
2. **AC2 — escopo de Organização, sem herança.** *Given* uma checagem de autorização *When* ocorre
   *Then* acontece **dentro do escopo da Organização resolvida** (a mesma da propagação da 1.3), **sem
   herdar** permissões de outra Organização.
3. **AC3 — Plataforma sem acesso implícito.** *Given* um Super Admin da Plataforma *When* acessa dados
   de uma Organização *Then* **não recebe acesso automático** (INV-ADMIN-01(c)).
4. **AC4 — invalidação imediata.** Mudança de papel/Membership **invalida abilities em cache
   imediatamente** — a próxima checagem já reflete o novo papel, sem janela de cache obsoleto.

---

## Tasks / Subtasks

- [ ] **T1 — Gate pré-código e verificação documental (AC: todos)**
  - [ ] `pre-implementation-check` (obrigatório antes de qualquer código): resolver o gate de
        Arquitetura PENDENTE, decidir a adição da dependência `@casl/ability` e registrar o relatório.
  - [ ] `context7-check` do CASL registrado em `gates/1-6/context7-check.md` (baseline pela versão que
        será fixada no `package.json`; API confirmada: `AbilityBuilder(createMongoAbility)`,
        deny-by-default nativo, `subject()` helper).
- [ ] **T2 — Contrato de autorização no kernel (AC: 1, 2)**
  - [ ] Criar `apps/api/src/kernel/authz/` (nova fronteira transversal do kernel; **sem regra de
        negócio** — só o mecanismo). Definir `action`/`subject`/`AppAbility` como tipos do contrato.
  - [ ] Definir o **principal de autorização**: estender o conceito de `Principal` para carregar o
        **papel efetivo** (`MembershipRole`) e o **estado** (`MembershipState`) da Organização
        resolvida — sem tokens com permissão duradoura (AD-9).
- [ ] **T3 — Factory de abilities por papel efetivo (AC: 1, 2, 3)**
  - [ ] `AbilityBuilder(createMongoAbility)` que traduz `(papel, orgId)` em abilities. **Papel da
        Organização é o teto**; ausência de regra = negado (deny-by-default, garantido pelo próprio
        CASL — não reimplementar).
  - [ ] Membership **não-ativa** (`SUSPENDED`/`REMOVED`) → ability vazia (nega tudo na Org).
  - [ ] **Plataforma não concede acesso implícito**: nenhum caminho onde papel de Plataforma injete
        abilities de Organização (INV-ADMIN-01(c)) — provado por teste dedicado.
- [ ] **T4 — Ponto de aplicação (guard/decorator) deny-by-default (AC: 1, 2)**
  - [ ] Guard/decorator NestJS que exige ability para a ação, **dentro do escopo de Org resolvido pela
        1.3** (reusar `request-context`, não inventar novo). Sem regra correspondente → **403**.
  - [ ] A checagem **nunca** ocorre fora de contexto de Organização (herda a garantia da 1.3).
- [ ] **T5 — Mecanismo de invalidação de abilities em cache (AC: 4)**
  - [ ] Contrato de cache de abilities **com invalidação por (accountId, orgId)** ao mudar
        papel/Membership. Chave e política explícitas; **sem permissão duradoura** que sobreviva à
        troca de papel.
  - [ ] Expor a operação de invalidação como **contrato** que o Épico 8 consumirá (esta Story não
        implementa a mudança de papel real; implementa o mecanismo que o Épico 8 dispara).
- [ ] **T6 — Testes (fase vermelha comprovada) (AC: todos)**
  - [ ] AC1: subject sem regra → negado (quebrar o deny-by-default de propósito e confirmar falha).
  - [ ] AC2: principal com papel na Org C **não** obtém acesso a recurso da Org A (sem herança).
  - [ ] AC3: principal de Plataforma → sem acesso automático a dados de Organização.
  - [ ] AC4: após invalidação, a próxima checagem reflete o novo papel (sem janela obsoleta).
  - [ ] **Mutação:** desligar a invalidação e provar que o teste de AC4 fica vermelho.
- [ ] **T7 — Gates de conclusão (AC: todos)**
  - [ ] `security-check` (superfície de autorização), `observability-check` (negação logada sem PII e
        sem revelar recurso — INV-REPORT-01), e reexecução dos gates de qualidade.

---

## Dev Notes

### Onde isto vive (e onde **não** pode viver)

- Novo diretório `apps/api/src/kernel/authz/` — a autorização é **fronteira técnica transversal**
  (AD-4/AD-5), igual a `config/`, `db/`, `auth/`, `context/`. **Regra de negócio nunca vive no
  kernel.** As *matrizes* de permissão por módulo (o que cada papel pode em Pipe/Card/Database) são dos
  Épicos de domínio; aqui só entram o **mecanismo** e o **papel de Organização como teto**.
- **Nenhuma regra de domínio no frontend** (CLAUDE.md). O backend é a autoridade de autorização
  (AD-9); a Web nunca decide permissão, só reflete estado.

### CASL — API confirmada no Context7 (`/stalniy/casl`)

```ts
import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability';
// AbilityBuilder(createMongoAbility) → { can, cannot, build }
// deny-by-default é NATIVO: ausência de rule que case = can() retorna false. Não reimplementar.
// subject('Tipo', obj) resolve o tipo do subject para objetos simples (DTOs).
```

- **Não** usar `defineAbility` aninhado; a doc oficial recomenda `AbilityBuilder` para fábricas
  customizadas (é exatamente o nosso caso: `(papel, orgId) → ability`).
- `createMongoAbility` (não o `PureAbility` cru) porque as `conditions` usam sintaxe tipo-Mongo
  (`{ orgId: X }`), que é o casamento natural com o escopo de Organização.
- A versão exata será **fixada no `package.json`** e conferida no `context7-check` antes de codificar
  (gate obrigatório). Não assumir assinatura de memória.

### Deny-by-default é o modo de falha correto (AC1)

O CASL nega quando nenhuma rule casa. Isso **inverte** o modo de falha perigoso: esquecer de escrever
uma permissão **nega** o acesso, em vez de liberar. O teste de AC1 deve provar a **fase vermelha**:
quebrar essa propriedade (ex.: um `can('manage','all')` acidental) e confirmar que o teste de negação
falha — como a base já exige para testes de segurança (CLAUDE.md, "prove a fase vermelha").

### Escopo de Organização e ausência de herança (AC2)

A checagem **reusa o contexto resolvido pela Story 1.3** (`kernel/context/request-context`), que já é
transaction-local e não vaza pelo pool (herança direta da 1.2/1.3). A ability é construída **para a
Organização resolvida**; um principal com Membership em várias Orgs recebe abilities **só** da Org
ativa. O teste de AC2 usa a fixture de Orgs (A/B leitura, **C para escrita** — CLAUDE.md) e prova que
papel na Org C não alcança recurso da Org A.

### Plataforma não herda Organização (AC3, INV-ADMIN-01)

INV-ADMIN-01(c): *"o Papel de Plataforma (Super Admin) não concede, por si só, nenhuma permissão
dentro do Painel Administrativo de uma Organização específica"*. A factory de abilities **nunca** deve
ter um ramo onde um papel de Plataforma injete abilities de Organização. Como o módulo de Plataforma
não existe nesta Fase, o teste prova a **ausência de caminho**: um principal marcado como Plataforma
(ou sem Membership ativa na Org) recebe ability vazia para dados daquela Organização. `Super Admin
(Plataforma) ≠ Admin da Organização` (invariante conceitual, CLAUDE.md).

### Invalidação de abilities em cache (AC4) — o ponto sensível

AD-9: *"Remoção/suspensão/mudança de papel invalida acesso e abilities em cache… sem permissões
duradouras em tokens."* Duas armadilhas:
1. **Não** embutir permissões no cookie/token de sessão — a sessão (1.5) carrega identidade, **não**
   permissão; permissão é sempre derivada do Membership no momento da checagem.
2. O cache de abilities (se existir, por performance) precisa de **invalidação explícita por
   (accountId, orgId)**. Esta Story entrega o **contrato de invalidação**; o Épico 8 é quem, ao mudar
   um papel de verdade, o **dispara**. O teste de AC4 simula a mudança de papel e prova que a próxima
   checagem já reflete o novo papel — e a **mutação** desliga a invalidação para provar que o teste
   pega a regressão.

### Forma do principal (a estender)

Hoje `kernel/context/principal.provider.ts` expõe `Principal { accountId }` — só identidade, por
decisão da 1.4. Esta Story adiciona o **papel efetivo** e o **estado** da Membership na Org resolvida.
`MembershipRole`/`MembershipState` já existem no schema (1.2) mas **não governavam acesso** — é aqui
que passam a governar. Reusar o caminho de resolução da 1.3; **não** criar header de conveniência de
papel (seria o mesmo "andaime que sobrevive à obra" que a 1.4 recusou para identidade).

### Testes (padrão da base)

- Integração real: a autorização é provada com AppModule em porta efêmera e **PostgreSQL real** (a
  Membership vem do banco), como o contrato HTTP e a RLS (CLAUDE.md). Um mock de papel não provaria o
  deny-by-default de verdade.
- Arquivos em `apps/api/test/`, `include: ['test/**/*.test.ts']`; escrever na **Org C**; provar a
  **fase vermelha** de cada teste de segurança.
- Negação **observável mas sanitizada**: log de negação não revela o recurso (INV-REPORT-01) nem PII.

### Project Structure Notes

- Alinhado à estrutura do kernel (`config/`, `db/`, `auth/`, `context/` → **`authz/`**). Sem novo app,
  sem package novo além de `@casl/ability`.
- Possível variância a decidir no plan: se o ponto de aplicação é um `CanActivate` (guard) global com
  metadata por rota, ou um decorator explícito por handler. Decisão registrada no Spec Kit/plan, não
  aqui.

### References

- [Source: epics.md#Story-1.6] — escopo congelado, dependências, integração, BDD.
- [Source: ARCHITECTURE-SPINE.md#AD-9] — CASL `action+subject+conditions`; backend é autoridade;
  Plataforma sem acesso implícito; invalidação de abilities em cache; sem permissão duradoura em token.
- [Source: ARCHITECTURE-SPINE.md#AD-6] — deny-by-default + RLS; contexto de Org dentro da transação.
- [Source: prd.md#INV-ADMIN-01] — separação de permissões/contexto Organização × Plataforma.
- [Source: prd.md#NFR-4] — autorização por permissões efetivas (canônico).
- [Source: apps/api/src/kernel/context/principal.provider.ts] — forma atual do `Principal`.
- [Source: Context7 /stalniy/casl] — `AbilityBuilder(createMongoAbility)`, `subject()`, deny-by-default.

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code)

### Debug Log References

- Typecheck inicial falhou: `@casl/ability` 7 declara tipos só via `exports.types`, ignorado pelo
  `moduleResolution: Node`. Resolvido com `paths` cirúrgico no `apps/api/tsconfig.json` (sem trocar o
  sistema de módulos da API — evita mudança de stack). Não afeta runtime.
- Tipagem do sujeito: declarar o sujeito só como string quebrava `conditions` e o helper `subject()`.
  Corrigido para o padrão do CASL (`Subjects = 'Nome' | Interface`) — `SujeitoAutorizado | Organizacao`.
- Bug nos próprios testes: retornar a closure do guard para fora do `executarNoEscopo` a executava
  fora do escopo ALS (lançaria `ContextoIndisponivelError`). Corrigido invocando o guard **dentro** do
  escopo e capturando o erro.

### Completion Notes List

- Substrato de autorização (`kernel/authz/`) com CASL 7.0.1: factory `(papel, orgId) → ability`
  deny-by-default, guard global `AuthzGuard` (roda após o `TenantContextGuard`), decorator `@Requer`,
  cache com invalidação por `(accountId, orgId)`.
- Papel efetivo derivado da Membership no banco (via `OrgContextResolver`/`ContextoOrganizacional`),
  **nunca** de token (AD-9). Ability amarrada a `{ id: orgId }` — sem herança cross-tenant (AD-6).
- Primeiro consumidor concreto: `GET /organizations/current` protegido por `@Requer('ler','Organizacao')`
  — prova o guard fim-a-fim sobre HTTP sem regressão (todo membro ativo tem o piso `ler`).
- `AbilityCache.invalidar` exposto como contrato para o Épico 8 consumir ao mudar papel/Membership.
- Mutação M1–M4 comprovada. Gates: security-check e observability-check APROVADOS. Qualidade verde:
  typecheck, format, lint, **API 218/218**, **Web 33/33**, build.

### File List

**Novos (`apps/api/src/kernel/authz/`):** `ability.ts`, `ability.factory.ts`, `ability.cache.ts`,
`requer.decorator.ts`, `authz.guard.ts`, `authz.module.ts`.
**Novo teste:** `apps/api/test/authz.test.ts`.
**Modificados:** `apps/api/src/kernel/context/request-context.ts` (+`papel`),
`apps/api/src/kernel/context/org-context.resolver.ts` (seleciona/retorna `role`),
`apps/api/src/app.module.ts` (importa `AuthzModule`),
`apps/api/src/organizations/organizations.controller.ts` (`@Requer('ler','Organizacao')`),
`apps/api/tsconfig.json` (`paths` do CASL), `apps/api/package.json` + `pnpm-lock.yaml` (`@casl/ability`),
`apps/api/test/org-context.test.ts` e `apps/api/test/request-context.test.ts` (asserções com `papel`).
**Processo/Spec Kit:** `specs/1-6-.../{spec,plan,tasks}.md`; `gates/1-6/*`; `sprint-status.yaml`.

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (create-story) a partir de `epics.md` (Story 1.6), AD-9, INV-ADMIN-01, NFR-4 e da forma atual do `Principal` (1.4). Classificada **CORE (Lote 1)**, risco **CRITICAL** (substrato de autorização, superfície de segurança direta). Gate de Arquitetura **PENDENTE** (a resolver no pre-implementation-check). Dependências 1.2/1.3/1.4 confirmadas `done`. API do CASL verificada no Context7 (`/stalniy/casl`): `AbilityBuilder(createMongoAbility)`, deny-by-default nativo, `subject()`. Status → ready-for-dev. |
| 2026-07-13 | Gate de Arquitetura **RESOLVIDO** (pre-implementation-check APROVADO): autorização como 2º `CanActivate` após o `TenantContextGuard` global; papel efetivo derivado da Membership (banco); ability amarrada a `{ id: orgId }`; sem bypass de ability. `@casl/ability` 7.0.1 fixada; context7-check APROVADO. Status → in-progress. |
| 2026-07-13 | **Implementação concluída.** Substrato `kernel/authz/` (factory deny-by-default, `AuthzGuard` global, `@Requer`, `AbilityCache` com invalidação); `papel` propagado pelo contexto (1.3) a partir da Membership; `GET /organizations/current` protegido por `@Requer('ler','Organizacao')` (prova HTTP sem regressão). Mutação M1–M4 comprovada. security-check e observability-check **APROVADOS**. Gates verdes: typecheck, format, lint, **API 218/218**, **Web 33/33**, build. Status → review. Pendente: PR → CI → merge. |
| 2026-07-13 | **PR #7 aberto, CI verde nos 4 jobs. Code Review adversarial APROVADO** (`gates/1-6/code-review.md`): 1 finding MEDIO — `AbilityCache` crescia sem teto (vazamento de memória lento, não bypass) — **corrigido** com teto FIFO `MAX_ENTRADAS=10_000` + teste de regressão que prova que a evicção não corrompe a correção. Nenhum CRITICAL/HIGH. Gates reverdes: **API 219/219**. Pronto para merge. |
