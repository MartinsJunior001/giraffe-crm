# Clarify — Story 2.12

Dúvidas resolvidas pela hierarquia de artefatos (PRD D2.7/D3.1, epics.md Story 2.12, AD-11/12/13). As que **não** têm
resposta autoritativa estão escaladas ao dono/Arquitetura como **GATE-ARQ / D-OA1..4** — **não inventadas**.

## Resolvidas pelos artefatos

1. **Marcos são valores absolutos ou durações?** **Durações relativas à entrada na Fase** (epics §943). O instante
   absoluto vem da referência de entrada; o marco é `entrada + duração` — exceto no override.
2. **O que é o override?** Um **valor absoluto** vindo de um Campo `DATE`/`DATETIME` do Card, que **prevalece** sobre
   a duração-relativa-da-Fase. **Precedência:** valor-do-Card › configuração-da-Fase › ausência (epics §943/§949).
   Ausência do valor é **ignorada** (cai para a config da Fase), não zera o marco.
3. **Ordenação dos marcos?** `prazo esperado ≤ vencimento ≤ expiração`, validado na **configuração** (epics §943/
   §950). Igualdade é permitida (`≤`).
4. **Quem configura?** **Admin da Org / Admin do Pipe** — é **config do Pipe** (mesma classe de Fases 2.3 e
   Formulários 2.4-2.6): `exigirGerenciarPipe`. **Membro não configura** (§943/§950). Viewer/sem acesso idem.
5. **O que é "entrada na Fase"?** Cada **entrada efetiva** do Card numa Fase — preserva **instante** e **origem**;
   **nova referência a cada reentrada**, com **histórico** das anteriores; marcos calculados a partir da **entrada
   atual** (a mais recente) (epics §944). É **referência temporal**, não estado do Card (`Fase ≠ Status do Card`).
6. **A referência é mutável?** Não. É **append-only e imutável** — cada entrada é uma linha nova; "entrada atual" é a
   mais recente. Alinha `CardHistory`/`FormVersion` (GRANT sem UPDATE/DELETE). Reentrada = novo INSERT, **não** um
   UPDATE (mantém `Card` fora do caminho de UPDATE que a 2.11 introduz para ciclo de vida).
7. **Mudar a config recalcula o passado?** **Não silenciosamente** (epics §945/§951). O histórico de entradas nunca
   é reescrito; se os Cards atuais são afetados **e como** é a **D-OA1** (dono). Sem recálculo retroativo silencioso.
8. **C3/CASL mudam?** Não. Autorização fina no serviço via `pipe-authz` (`exigirGerenciarPipe` já existe). Guard/
   `ability.ts`/CASL intocados.
9. **A saúde (atrasado/vencido/expirado) entra aqui?** **Não** — é 2.13. A 2.12 só **configura** o marco e
   **materializa a base** (entrada + duração/override). Fixtures de saúde não são solução funcional (epics §962).

## Escaladas ao dono/Arquitetura (SEM inventar resposta)

10. **GATE-ARQ — parâmetros/cálculo/fuso.** epics §945 fixa como **gate**: "parâmetros numéricos dos marcos, regras
    de cálculo/agendamento e fuso = Arquitetura". Inclui a **unidade** da duração (a coluna é `Int` — o Prisma
    6.19.3 não tem `interval` nativo, confirmado no Context7), seus **limites**, **quando/como** os marcos são
    avaliados (sob demanda vs. job) e **qual fuso** rege durações e o instante de entrada. Ver `plan.md §GATE-ARQ`.
11. **D-OA1 — mudança de configuração afeta Cards atuais?** epics §945 exige a decisão **antes** da implementação:
    "afetam só entradas futuras OU exigem recálculo explícito dos Cards atuais — sem recálculo retroativo
    silencioso". **Decisão de dono/Arquitetura, registrada no epics.** Opções/trade-offs em `plan.md §D-OA1`.
12. **D-OA2 — onde vivem a referência de entrada e a config de marcos?** epics não fixa o modelo físico. Referência:
    tabela `CardPhaseEntry` append-only (recomendada) vs. derivar; config: `PhaseSchedule` vs. colunas em `Phase`;
    **snapshot** da config na entrada (para congelar marcos). Ver `plan.md §D-OA2`.
13. **D-OA3 — como um Campo é designado override de um marco?** O epics diz "override absoluto por Campo Data/Data-
    hora" mas **não** fixa o **mapeamento Campo→marco** (onde a config guarda qual Campo alimenta cada marco), nem se
    há um Campo por marco ou um só. **Não inventar o mapeamento.** Ver `plan.md §D-OA3`.
14. **D-OA4 — quem escreve a entrada e a reentrada?** A **entrada inicial** hoje só ocorre na **criação** do Card
    (2.7, já mergeada); a **reentrada** virá da **movimentação** (2.14, inexistente). 2.12 materializa a entrada
    inicial (estendendo a transação da 2.7) + a **função-contrato de reentrada** consumida por 2.14 (análogo ao
    `membership-contract` da 2.10, AD-11), e decide o **backfill** dos Cards existentes. Ver `plan.md §D-OA4` e a
    divergência de sequenciamento em `analyze.md` (DIV-2).
