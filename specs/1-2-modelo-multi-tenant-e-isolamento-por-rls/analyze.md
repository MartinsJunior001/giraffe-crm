# Analyze — consistência cruzada e veredito (Story 1.2)

Data: 2026-07-12 · Entradas: Story BMAD 1.2 (validada), `epics.md`, Architecture Spine (AD-6/7/10/11, AD-17, AD-32, AD-33), NFR-3, NFR-4, INV-ADMIN-01, Constitution v1.0.0, Story 1.1 (`done`) e seu Code Review, documentação oficial do Prisma (context7).

## Cobertura (spec ⇄ tasks ⇄ AC)

| Requisito | Coberto por (tasks) | AC | Estado |
|---|---|---|---|
| FR-201 `Account` global, sem RLS | T012, T025 | — | ✅ |
| FR-202 `Organization` + `Membership` (papel único + estado) | T013, T014 | AC1–3 | ✅ |
| FR-203 `orgId` NOT NULL + índice | T015 | AC1–3 | ✅ |
| FR-204 `ENABLE` + `FORCE` RLS | T020 | AC4 | ✅ |
| FR-205 policies por operação com `WITH CHECK` | T021, T022, T024 | AC2, AC3 | ✅ |
| FR-206 contexto transaction-local | T016, T017, T018 | AC1–4 | ✅ |
| FR-207 deny-by-default | T038 | AC4 | ✅ |
| FR-208 papéis sem `BYPASSRLS`, não-proprietário | T008, T009, T010, T011 | AC4 | ✅ |
| FR-209 nenhum bypass | T019 | AC4 | ✅ |
| FR-210 Membership legível pela própria conta | T023, T039 | AC1 | ✅ |
| FR-211 migration controlada + rollback | T026, T027, T028 | AC2 | ✅ |
| FR-212 `/ready` com banco (200/503) | T048, T049, T050, T051 | AC4 | ✅ |
| FR-213 logs com Org, sem PII/senha | T006, T041, T042 | AC4 | ✅ |
| FR-214 auditoria mínima | T043 | AC4 | ✅ |

Nenhum requisito órfão; nenhuma task sem requisito. Todos os 4 ACs têm **teste negativo** associado.

## Findings

| # | Severidade | Achado | Ação |
|---|---|---|---|
| B1 | **Alta (segurança)** | O exemplo oficial do Prisma para RLS traz `bypass_rls_policy` + `bypassRLS()`. Copiá-lo por inércia cria a porta dos fundos que a Story existe para fechar | Proibido explicitamente (T019, D4, FR-209). Teste deve provar ausência de bypass |
| B2 | **Alta (segurança)** | O exemplo oficial cria policies só com `USING`. `USING` **não** protege `INSERT` → escrita cruzada entra e fica invisível | `WITH CHECK` obrigatório (T022, T024); teste negativo de `INSERT` forjado é o guard (T035) |
| B3 | **Alta (desenho)** | `Membership` protegida só por `orgId = ctx` quebraria o **login da Story 1.4** (listar "minhas Organizações" acontece antes de haver contexto) | Resolvido: `SELECT` permite `orgId = ctx` **OU** `accountId = ctx` (T023, FR-210) |
| B4 | **Média (regressão)** | `/ready` passar a checar o banco **quebra** o teste HTTP, o `HEALTHCHECK` e o `smoke` da Story 1.1 quando o banco cai | Intencional. Cobrir os dois caminhos (T050, T051); **proibido** afrouxar a asserção de payload |
| B5 | **Média (postgres)** | Dono da tabela contorna RLS por padrão — `FORCE` sozinho não basta | `FORCE` **+** papel não-proprietário, juntos (T009, T020); provado em `pg_roles` (T011) |
| B6 | **Média (runtime)** | Binário de engine do Prisma ausente na imagem falha **só no boot**, não no build | Teste real de boot do container (T052) — lição F2/F8 da Story 1.1 |
| B7 | **Baixa (decisão)** | Testcontainers seria dependência nova para o PostgreSQL de teste | Decidir no `pre-implementation-check` (T002); alternativa sem nova dep = container do Compose |

**Contradições bloqueadoras:** nenhuma.
**Violações de escopo / Non-Goals:** nenhuma. Sem entidade de domínio, sem CASL, sem sessão, sem `packages/`.
**Decisões de Produto presumidas:** nenhuma. `OQ-1..4` (matriz Pipe/Card) segue **aberta** e é insumo da Story 1.6 — não bloqueia esta.

## Constitution gate

**PASS.** Princípio I respeitado (BMAD → Spec Kit → Implementação — corrigindo o desvio da Story 1.1). Princípio II preservado (nenhuma antecipação). Princípios IV e V são o **objeto** desta Story. Atenção material em **IX (LGPD)**: `Account.email` é a **primeira PII do projeto** — `lgpd-check` sai de N/A e passa a ser obrigatório (T045). Idem `migration-check` (T030) e `backup-check` (T031).

## Tratamento do CR2-09

`packages/` **não** será criado: o Prisma vive dentro de `apps/api`, e nada nesta Story exige contrato compartilhado com a Web (a Web não fala com o banco). Criá-lo seria abstração sem consumidor concreto (Constitution II / AD-4). O CR2-09 permanece **dormente**, com duas salvaguardas: (a) T053 verifica explicitamente que nenhum `packages/` surgiu, e **reabre o CR2-09 nesta Story** se surgir; (b) T052 exige **boot real** do container de produção, que é o teste que pegaria o `MODULE_NOT_FOUND` de qualquer forma.

## Veredito

**READY FOR IMPLEMENT**

Condicionado à execução dos gates pré-código na primeira fase da implementação: `context7-check` (T001 — fixar PostgreSQL/Prisma e confirmar a API de Client Extensions da versão) e `pre-implementation-check` (T003), incluindo a decisão sobre a estratégia de PostgreSQL real nos testes (T002).
