# Autorrevisão (INSUMO) — Story 2.1 (PR #17)

> ⚠️ **Isto NÃO é uma revisão independente e NÃO destrava o merge.** Foi produzida pelo agente que
> implementou a Story 2.1, na mesma sessão de implementação. Vale como **insumo de autorrevisão** —
> equivalente às revisões de subagente registradas em `aceites-independentes.md` — que o revisor externo
> genuíno (humano ou IA iniciada separadamente pelo usuário) pode conferir ou contestar. O veredito que
> autoriza o merge (Path C → A) é do revisor independente e do arquiteto humano, nunca deste documento.

## Objeto

Diff `main...story/2-1-ciclo-de-vida-e-catalogo-de-pipes` (commit de implementação `c91e321`). Foco nos
arquivos de aplicação; artefatos de processo consultados como referência, não revisados como código.

## O que foi verificado diretamente (contra o código, não por resumo)

- **RLS:** `migration.sql` liga `ENABLE` **e** `FORCE ROW LEVEL SECURITY`; 4 policies por
  `current_org_id()`, com `WITH CHECK` no INSERT **e** no UPDATE; `GRANT SELECT, INSERT, UPDATE` (sem
  DELETE); FK → `Organization ON DELETE CASCADE`.
- **Teste prova a fase vermelha:** `pipes-rls.test.ts` exercita `WITH CHECK` com `createMany` (sem
  `RETURNING`, não passa pelo motivo errado via policy de SELECT) e verifica `relowner` (não só a flag de
  RLS). Cobre runtime sem BYPASSRLS/superuser, contexto ausente falha fechado (client cru), `deleteMany` →
  `permission denied`.
- **Não-enumeração:** `obter` → 404 em `null`; `atualizar`/`arquivar`/`restaurar` passam por `obter` ⇒ 404
  uniforme. Split 403 (guard, nível de tipo) × 404 (RLS, nível de recurso) correto.
- **tenant-context:** `set_config(..., true)` transaction-local; `$transaction` interna usa o client raiz;
  `$transaction` externa recusada; auditoria capta as três formas de negação (inclusive `count: 0`).
- **Sem `orgId` do cliente e sem `where orgId` manual:** todo acesso via `withTenantContext`.

## Findings por severidade

### CRITICAL
Nenhum.

### HIGH
Nenhum.

### MEDIUM
Nenhum. (O único item de comportamento observável — `?arquivados=1` — é LOW, abaixo.)

### LOW (todos já rastreados em `debitos-gerados.md` / `analyze.md`)

- **R-1 — Ruído de auditoria na idempotência.** Arquivar/restaurar um Pipe já no estado-alvo produz
  `{ count: 0 }`, registrado como `denied`. Troca deliberada: falso positivo custa uma linha de log; o
  falso negativo custaria acesso cruzado invisível. **Aceito.**
- **M-1 — `?arquivados=1` → só ativos.** `parseIncluirArquivados` compara `=== 'true'`. UX, não
  isolamento. **Aceito.**
- **R-3 / DBT-ROLLBACK-CI — CI não exercita rollback.** SC-206 provou o rollback à mão em banco
  descartável; automatizar no CI é débito do L6. **Aceito.**
- **TOCTOU em arquivar/restaurar.** 3 round-trips (obter → updateMany → obter) sem atomicidade entre si.
  Transições idempotentes e sem DELETE ⇒ a janela não gera estado corrompido. Aceitável nesta escala.
  **Não bloqueia.**

## Conclusão sobre D-1 / C3

`authz.guard.ts:49`: `subject(sujeito, { id: orgId })` → `subject(sujeito, { id: orgId, orgId })`.

- **Análise técnica:** para `Organizacao` (condition `{ id }`) o campo `orgId` extra é **inerte** (o CASL
  avalia só as chaves da condition) ⇒ comportamento preservado bit a bit; para `Pipe` (condition
  `{ orgId }`) passa a casar. Um sujeito futuro cujo `id` fosse o **id do recurso** falharia **fechado**
  (negaria) — direção segura, coerente com guarda grossa (tipo) + RLS fina (recurso).
- **Limite:** o arquivo pertence ao contrato congelado **C3**. Se isto é "extensão do catálogo de sujeitos
  (AD-9)" ou "alteração do mecanismo congelado" é decisão de **arquiteto humano**, não do implementador.
- **Recomendação técnica (não-vinculante):** compatível — `C3 COMPATIBLE`, mas requer o veredito
  independente do Architecture Agent / arquiteto.

## Critérios de aceite (avaliação como insumo)

| AC | Descrição | Situação (insumo) |
|---|---|---|
| AC1 | Admin cria/lista/obtém/renomeia Pipe, org-scoped | Coberto (controller + `pipes-http.test.ts`) |
| AC2 | Arquivar/restaurar reversível, sem perda de dados | Coberto (state ⇄, `archivedAt`; sem DELETE) |
| AC3 | Sem exclusão definitiva | Garantido pelo GRANT (sem DELETE), provado por teste |
| AC-ISO | Isolamento por Organização (RLS) | Provado por `pipes-rls.test.ts` real |
| AC-AUTHZ | Só ADMIN em 2.1; MEMBER/GUEST negados | `pipes-authz.test.ts` + guard |

Confirmação formal dos AC contra o Spec é tarefa do **Acceptance Auditor** independente.

## Riscos residuais

- Todos LOW e rastreados (R-1, M-1, R-3, TOCTOU acima).
- Rollback apaga os Pipes (`DROP TABLE`) — próprio de rollback de schema; exige backup verificado em
  produção (`backup-check.md`).
- D-1/C3 pendente de decisão independente (único item que não é LOW-fechado).

## Recomendação final (como insumo, não gate)

Do ponto de vista técnico do implementador, a 2.1 está **pronta para revisão independente**: sem
CRITICAL/HIGH, isolamento provado por teste real contra o padrão correto, privilégio mínimo garantido pelo
banco, CI 4/4 verde. **Bloqueios remanescentes para o merge:** (1) veredito de revisão independente
(Blind Security, Edge Case Hunter, Acceptance Auditor); (2) decisão do Architecture Agent sobre D-1/C3;
(3) correção de qualquer finding bloqueador que essas revisões levantem. **Nenhum merge** antes disso.
