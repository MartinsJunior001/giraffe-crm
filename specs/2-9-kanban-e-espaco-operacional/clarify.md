# Clarify — Story 2.9

Dúvidas resolvidas pela hierarquia de artefatos (epics.md Story 2.9; PRD §4.4/§4.5; UX-DR10; NFR-3/4), sem inventar
comportamento de Produto. Onde o artefato **não** decide, a dúvida vira **Questão para o dono** (não é resolvida
aqui — ver spec.md §"Questões abertas").

1. **A 2.9 movimenta Card?** **Não.** O `epics.md` (autoritativo) lista movimentação em **Fora: (2.14)** e o AC da
   2.9 diz explicitamente "nenhuma movimentação é executada aqui". O brief e os comentários da migration 2.7
   assumem o contrário — **divergência registrada** (spec.md §Divergência; Q1). A 2.9 é **leitura**.

2. **Quem pode ver o Kanban/abrir o Card?** Quem tem **acesso ao Pipe**: Admin da Org (qualquer Pipe) ou quem tem
   `PipeGrant` ACTIVE (qualquer papel — ADMIN/MEMBER/VIEWER). Sem acesso → **404 não-enumerante** (indistinguível de
   "não existe"), herdado de `resolverPoderNoPipe`. Reusa `pipe-authz.ts` — **sem** novo GRANT, **sem** tocar o guard.

3. **O que "agrupados por Fase" significa?** Cards do Pipe organizados por `phaseId`, com as **Fases ativas**
   ordenadas por `position` (mesma ordem do gerenciamento de Fases, 2.3). Fase sem Card aparece **vazia** (coluna
   presente, lista vazia) — estado honesto, não erro.

4. **Ordenação dos Cards dentro da Fase?** O `epics.md` **não** pede ordem manual. Proposta: `createdAt` (estável,
   sem migration). Ordem manual/drag = chave `position` em `Card` + migration, e só faz sentido com reordenação
   (movimentação, 2.14+). **Não decidido pelo artefato → Q2.**

5. **O que é "estado atual" do Card?** A 2.9 precede a 2.11 (ciclo de vida: ativo/finalizado/arquivado) e a 2.13
   (saúde temporal). **`Card` não tem coluna de estado hoje.** Logo "estado atual" = a **Fase** em que o Card está.
   Não se inventa coluna de estado (AD-11 — sem normalização especulativa). **Confirmar → Q4.**

6. **O que o painel "Ações" mostra se nenhuma ação mutável existe ainda?** As ações reais chegam em 2.10/2.11/
   2.14/2.15. A 2.9 **estabelece a superfície**: devolve as **capacidades efetivas** do principal (derivadas do
   `poder`) para a UI **mostrar só o permitido** e **nunca revelar administrativas**. O executor de cada ação vem na
   sua Story. Shape do contrato de capacidades → **Q5**.

7. **O painel de Execução mostra o Histórico?** O **read-side** do `CardHistory` é a **Story 2.17** (Fora). A 2.9
   **estrutura** o painel, mas **não lê** a trilha. **Confirmar → Q7.**

8. **Isolamento?** Pelo **banco**: toda leitura passa por `withTenantContext()`; nenhum `where orgId` manual;
   nenhuma rota aceita `orgId` do cliente. RLS já ativa em `Card`/`Phase`. Contexto ausente → negado (fail-closed).

9. **Precisa de migration/GRANT?** **Não** (no escopo comprometido). O runtime já tem `SELECT` em `Card` (2.7) e
   `Phase` (2.3). Leitura pura não muda schema nem privilégio.

10. **Frontend (três painéis) entra nesta fatia?** Os ACs são fortemente de UI, mas as fatias 2.x anteriores foram
    entregues como **API interna**. Decisão de entregar `apps/web` agora → **Q3** (não resolvida pelo artefato).
