# Tasks — Story 2.10

Ordem dependente. **Tarefas 2+ estão BLOQUEADAS pela Tarefa 1** (decisões em aberto). Nenhuma marcada concluída
(planejamento).

1. **[BLOQUEANTE] Resolver e registrar D-OA1/D-OA2/D-OA3** (dono/Arquitetura), + autorização adjacente (quem
   atribui/concede). Sem isso, o modelo de dados e a fronteira de GRANT ficam indefinidos. [ ]
2. Schema (condicional às decisões): `CardGrant` (se D-OA1=A) org-scoped com capacidades (`read`/`operar`/
   `moverCard`) + `state`/`revokedAt`; Responsável (coluna `responsavelMembershipId?` em `Card` **ou**
   `CardResponsavel`, por D-OA2); `PipeGrant.restritoAoProprio Boolean @default(false)`; back-relations. [ ]
3. Migration `..._card_access`: tabelas novas com RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH CHECK
   INSERT/UPDATE), FKs CASCADE, índice parcial de unicidade ativa; **GRANT SELECT/INSERT/UPDATE — sem DELETE**; se
   D-OA2=A, **GRANT UPDATE de `Card` restrito** à coluna do Responsável; `ALTER TABLE "PipeGrant"` +
   `restritoAoProprio`. [ ]
4. `tenant-context.ts`: novas tabelas em `MODELOS_AUDITADOS`. [ ]
5. `pipe-authz` (estender, C3 congelado): `resolverAcessoNoCard` (compõe papel-de-Pipe + `CardGrant` + "restrito ao
   próprio" + Responsável atual); `exigirLerCard`/`exigirOperarCard`; deny-by-default; 404 não-enumerante; **nunca**
   consultar `creator`/histórico. [ ]
6. Subdomínio `pipes/cards/access/`:
   - `responsavel.service`+`controller`: atribuir/alterar/remover; valida acesso operacional prévio do **alvo**
     (SC-2101); eventos `CardHistory` (RESPONSAVEL_ASSIGNED/CHANGED/REMOVED); atribuição não amplia acesso. [ ]
   - `card-grant.service`+`controller`: conceder Observador (`read`) / operacional direta (`operar`[+`moverCard`]),
     revogar (state); eventos ACCESS_GRANTED/ACCESS_REVOKED; escopo limitado ao Card (SC-2103/2104). [ ]
   - `membership-contract.ts` (função **pura**, D-OA3): `preflightEncerramentoMembership` +
     `aoAlterarMembership` (revoga concessões, remove/sinaliza Responsável, preserva `creator`, sem restauração).
     **Sem chamador** (E8 consome depois). [ ]
7. Registro no `pipes.module.ts`. [ ]
8. Testes reais (PostgreSQL):
   - `card-access-authz`: Observador só lê; direta só o Card (sem lista/config); `moverCard` opt-in; "restrito ao
     próprio" (Responsável/direta sim; creator/histórico não). [ ]
   - `responsavel-http`: exige acesso prévio (SC-2101); atribuição não dá acesso a outro Card (SC-2102). [ ]
   - `membership-contract`: preflight bloqueia sse-e-só-se a regra exigir; pós-alteração revoga/remove/sinaliza/
     preserva `creator`; reativação não restaura (SC-2106/2107/2108). [ ]
   - `card-access-rls`: isolamento, WITH CHECK, **sem DELETE**; se D-OA2=A, **escopo do GRANT UPDATE de `Card`**
     (só Responsável gravável; `phaseId` negado). [ ]
   - **Mutações (fase vermelha)** de cada portão (ver `plan.md` §Sequência). [ ]
9. Gates: pre-implementation-check, security-check, migration-check (RLS), observability-check; typecheck/format/
   lint/build; suíte cheia verde; commit-check → commit atômico. [ ]

## Notas de execução
- **Reuso, não novo sistema:** estender `pipe-authz`, adicionar **capacidade/flag** (`restritoAoProprio`) como a 2.8
  fez com `reviewPublicSubmissions`. Não tocar CASL/guard.
- **Escrever o teste que prova o escopo do GRANT** ao conceder qualquer privilégio novo (especialmente o UPDATE de
  `Card`, se D-OA2=A) — regra da casa (CLAUDE.md).
- **Nada de antecipar** 2.11/2.14/E8: `moverCard` e o contrato de Membership são **dado/contrato**, não operação.
