# Tasks — Story 2.12

Ordem dependente. **Tarefas 2+ estão BLOQUEADAS pela Tarefa 1** (decisões em aberto). Nenhuma marcada concluída
(planejamento).

1. **[BLOQUEANTE] Resolver e registrar GATE-ARQ + D-OA1/2/3/4** (dono/Arquitetura). Sem isso, ficam indefinidos: a
   unidade/tipo da duração, o fuso, o comportamento na mudança de config, o modelo de dados (referência de entrada +
   config + snapshot), o mapeamento de override e o write-side/backfill. [ ]
2. Schema (condicional): `CardPhaseEntry` (se D-OA2a=A) org-scoped — `(orgId, cardId, phaseId, enteredAt, origin,
   [snapshot], createdAt)`, append-only; config de marcos (`...Duration Int?` em `Phase` **ou** `PhaseSchedule`, por
   D-OA2b) + mapeamento de override (`expectedFieldId?`/`dueFieldId?`/`expirationFieldId?`, por D-OA3);
   back-relations. **`Card` intocado** (sem GRANT de UPDATE nesta Story). [ ]
3. Migration `..._phase_milestones`: tabela(s) nova(s) com RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH
   CHECK INSERT/UPDATE), FKs CASCADE; **GRANT de `CardPhaseEntry` = SELECT/INSERT apenas — sem UPDATE, sem DELETE**
   (append-only imutável); config = SELECT/INSERT/UPDATE (sem DELETE). Índices de consulta; índice parcial **só** se
   necessário e via **raw SQL** (Prisma 6.19.3 < v7.4). **Backfill idempotente** da 1ª entrada dos Cards existentes
   (se D-OA4). [ ]
4. `tenant-context.ts`: tabela(s) nova(s) em `MODELOS_AUDITADOS`. [ ]
5. Núcleo puro dos marcos (`milestones.ts` / `phase-schedule.ts`): cálculo `entrada + duração`; **precedência** do
   override (valor-do-Card › config-da-Fase › ausência); validação `esperado ≤ vencimento ≤ expiração`; leitura de
   `valores` por **`Field.id`** (nunca rótulo); fail-closed em valor malformado. **Sem** derivar saúde (2.13). [ ]
6. Autorização fina (reuso, C3 congelado): configurar marcos = `exigirGerenciarPipe(db, principal, phase.pipeId)`.
   **Nenhum** helper novo no `pipe-authz`, guard/`ability.ts`/CASL intocados. [ ]
7. Serviço/subdomínio (em `pipes/phases/` ou `pipes/cards/`, conforme owner):
   - Config de marcos por Fase: `definir/editar` durações + mapeamento de override; valida ordenação; `exigir
     GerenciarPipe`. [ ]
   - `registrarEntradaNaFase(cardId, phaseId, origin)`: grava `CardPhaseEntry` (com snapshot sse D-OA1=A). Chamada na
     **mesma transação** da criação do Card (estender a submissão 2.7/2.8, client raiz `definirContextoOrg`); e como
     **função-contrato sem chamador de movimentação** para a 2.14 consumir (AD-11). [ ]
   - Leitura da base de marcos de um Card (entrada atual + durações/override resolvidos), reusando `exigirLerCard`
     quando houver superfície de leitura — **sem** veredito de saúde. [ ]
8. Registro no `pipes.module.ts` (se novo serviço). [ ]
9. Testes reais (PostgreSQL):
   - `milestones` (unidade): cálculo, precedência do override, ordenação, `Field.id`, fail-closed. [ ]
   - `phase-milestones-http`: só Admin da Org/Pipe configuram; **Membro → 403**; ordenação inválida → 400; sem acesso
     → 404 (SC-2126/2123). [ ]
   - `phase-entry`: criação de Card grava a 1ª entrada na mesma transação; reentrada cria nova referência preservando
     as anteriores (SC-2121/2123). [ ]
   - `non-retroactivity`: mudar config não reescreve entradas passadas; Cards atuais não mudam sem reentrada (A) /
     ação explícita (B) — nunca em silêncio (SC-2124). [ ]
   - `phase-entry-rls`: isolamento, WITH CHECK (`createMany`), **e escopo do GRANT: `CardPhaseEntry` nega UPDATE e
     DELETE** (append-only) — provar a fase vermelha (SC-2125). [ ]
   - **Mutações (fase vermelha)** de cada portão (ver `plan.md §Sequência`). [ ]
10. Gates: pre-implementation-check, security-check, migration-check (RLS), observability-check; typecheck/format/
    lint/build; suíte cheia verde; commit-check → commit atômico. [ ]

## Notas de execução
- **Reuso, não novo sistema:** autz reusa `exigirGerenciarPipe`; nada de helper/guard novo. A referência de entrada
  imita `CardHistory`/`FormVersion` (append-only, GRANT sem UPDATE/DELETE). O contrato de reentrada imita o
  `membership-contract.ts` da 2.10 (função sem chamador, consumidor em 2.14).
- **`Card` fora do UPDATE:** a 2.11 introduz o 1º UPDATE column-scoped de `Card` (ciclo de vida). A 2.12 **não**
  amplia esse GRANT — reentrada é INSERT em `CardPhaseEntry`, não UPDATE de `Card`. Coordenar com a migração da 2.11
  (ordem/numeração de timestamp; ambas tocam a área de `Card`).
- **Escrever o teste que prova o escopo do GRANT** ao criar `CardPhaseEntry` (provar que UPDATE/DELETE são negados) —
  regra da casa (CLAUDE.md).
- **Nada de antecipar** 2.13/2.14/E7: a 2.12 guarda a **base** (entrada + durações/override); o veredito de saúde e a
  movimentação/recálculo são das Stories seguintes.
