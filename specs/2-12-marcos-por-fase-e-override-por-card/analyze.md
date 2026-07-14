# Analyze — Story 2.12

Análise de consistência cruzada (spec ↔ plan ↔ tasks ↔ epics/PRD) **antes** da implementação. Story em backlog; o
foco é garantir cobertura dos ACs e **expor** decisões/divergências, não afirmar execução.

## Cobertura dos critérios (SC-212x ↔ ACs do epics §948-951)
- **SC-2121** (entrada cria referência própria — instante/origem; marcos relativos a ela) — AC1. `plan §D-OA2a`/
  tasks 7 (`registrarEntradaNaFase`), 9 (`phase-entry`). Coberto (condicional D-OA2/D-OA4). ✅-plano
- **SC-2122** (override absoluto por Campo; precedência valor › Fase › ausência; ausência ignorada) — AC2.
  `plan §D-OA3`/tasks 5, 9 (`milestones`); mutação "ausência cai fora da config → falha". Coberto (condicional
  D-OA3). ✅-plano
- **SC-2123** (reentrada cria nova referência preservando histórico; `esperado ≤ venc ≤ exp`; Membro não configura) —
  AC3. tasks 7/9 (`phase-entry`, `phase-milestones-http`). Coberto. ✅-plano
- **SC-2124** (mudança de config não altera retroativamente nem recalcula em silêncio) — AC4. `plan §D-OA1`/tasks 9
  (`non-retroactivity`). Coberto **como decisão de dono** (A ou B); ambas proíbem recálculo silencioso. ✅-plano
- **SC-2125** (isolamento/fronteira) — derivado do invariante-mãe: RLS+FORCE+WITH CHECK, GRANT de `CardPhaseEntry`
  sem UPDATE/DELETE, `MODELOS_AUDITADOS`, C3 congelado. Coberto. ✅-plano
- **SC-2126** (só Admin da Org/Admin do Pipe configuram) — derivado de §943; `exigirGerenciarPipe`; Membro 403, sem
  acesso 404. Coberto por reuso. ✅-plano

## ⚠️ Divergências e riscos registrados (ESCALAR antes de implementar)

- **DIV-1 — Fuso e tipo do instante de entrada: convenção do schema vs. correção temporal.** Todo o schema usa
  `DateTime @default(now())` → `TIMESTAMP(3)` **sem** time zone. Um "instante de entrada na Fase" é um instante
  absoluto e pediria **`@db.Timestamptz`**. Adotar timestamptz **diverge da convenção** vigente e é parte do
  **GATE-ARQ (fuso)**. Não decidir sozinho — a escolha afeta como 2.13 compara marcos. **Escalar (GATE-ARQ).**

- **DIV-2 — Sequenciamento com 2.14 (inexistente) e com 2.7 (mergeada).** A "reentrada" só existe com **movimentação
  (2.14)**, que **depende de 2.12** (epics §977). Logo, em 2.12 **a única entrada real é a criação do Card** (2.7).
  Consequências: (a) a **entrada inicial** exige **estender a transação da submissão 2.7/2.8** (mergeada) — mudança
  num caminho já fechado, a validar; (b) a **reentrada** vira **função-contrato sem chamador** (AD-11, como o
  `membership-contract.ts` da 2.10), consumida por 2.14; (c) **backfill** dos Cards já criados (D-OA4). Risco de
  ordenação de sprint — **escalar (D-OA4)**.

- **DIV-3 — Colisão de área com a 2.11 (em implementação paralela).** A 2.11 adiciona `Card.lifecycleState`/
  `previousLifecycleState` e o **1º GRANT UPDATE column-scoped** em `Card`. A 2.12 **não** deve ampliar esse GRANT
  (reentrada é INSERT em `CardPhaseEntry`, não UPDATE de `Card`) — mas as **migrações concorrem** na área de `Card`
  (numeração por timestamp, ordem de aplicação, `schema.prisma` compartilhado). **Coordenar a numeração/merge das
  duas migrações**; garantir que o teste de escopo do GRANT de `Card` (2.11) e o de `CardPhaseEntry` (2.12) não se
  contaminem. **Escalar/coordenar.**

- **DIV-4 — Mapeamento Campo→marco não especificado.** O epics fixa "override por Campo Data/Data-hora" e a
  precedência, mas **não** diz **como** um Campo é designado a um marco (§943/§949). Sem isso, o override é ambíguo
  (qual Campo alimenta qual marco?). Proposta em `plan §D-OA3` (`fieldId?` por marco na config da Fase) **precisa de
  confirmação** — **não inventar** o mapeamento. **Escalar (D-OA3).**

- **DIV-5 — Snapshot vs. leitura ao vivo da config (acopla D-OA1 ao modelo).** A opção A da D-OA1 ("só futuras")
  praticamente **exige** que a referência de entrada **congele** (snapshot) a config vigente — do contrário, editar a
  Fase mudaria os marcos de Cards já na Fase (recálculo silencioso, **proibido**). A opção B ("recálculo explícito")
  lê ao vivo e adiciona superfície de recálculo + evento. **A decisão D-OA1 determina D-OA2c** (haver ou não coluna
  de snapshot) — precisam ser decididas **juntas**. **Escalar (D-OA1+D-OA2).**

- **DIV-6 — Owner do domínio (Fase vs. Card) e onde vive o serviço.** Configurar marcos é atributo da **Fase**
  (config do Pipe); a **referência de entrada** e a leitura da base pertencem ao **Card**. O subdomínio pode dividir-
  se entre `pipes/phases/` (config) e `pipes/cards/` (entrada/leitura). Sem impacto de segurança, mas **registrar**
  para não espalhar responsabilidade. Menor — decisão de organização de código.

## Consistência de invariantes
- **`Fase ≠ Status do Card`:** respeitado — a entrada gera **referência temporal**, não estado; os eixos ciclo-de-
  vida (2.11) e saúde (2.13) seguem distintos e a 2.12 não os funde.
- **AD-11 / sem antecipar:** a base (entrada + durações/override) tem consumidor **imediato** (2.13); a função-
  contrato de reentrada não tem chamador de movimentação até 2.14 — materializada como contrato, não como operação.
- **AD-12:** override lido por `Field.id`, nunca rótulo. **AD-13:** entrada inicial na mesma transação da criação.
- **Deny-by-default / 404 não-enumerante / isolamento pelo banco / C3 congelado:** replicados do padrão 2.3-2.10;
  autz por **reuso** de `exigirGerenciarPipe` (nenhum helper/guard novo).
- **Context7 (Prisma 6.19.3):** confirmado — **sem tipo `interval` nativo** (durações = `Int`, unidade = GATE-ARQ);
  **índice parcial só a partir de v7.4** (se necessário, raw SQL na migration — mas a recomendação dispensa índice
  parcial); `@db.Timestamptz` disponível (adoção = GATE-ARQ/DIV-1).

## Veredito
**PRONTO PARA REVISÃO DO DONO — NÃO PRONTO PARA IMPLEMENTAR.** Cobertura de ACs desenhada; **1 gate de Arquitetura**
(parâmetros/cálculo/fuso), **1 decisão de dono bloqueante registrada no epics** (D-OA1, mudança de config), **3
decisões de modelo/override/write-side** (D-OA2/3/4) e **6 divergências** (DIV-1..6) escaladas. Implementação só após
decisão registrada — e coordenada com a migração da 2.11 (área de `Card`) e a posição da 2.14 no sprint.
