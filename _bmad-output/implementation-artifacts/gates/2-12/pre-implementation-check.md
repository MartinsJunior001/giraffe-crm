# Pre-Implementation Check — Story 2.12 (Marcos por Fase e override por Card)

> Gate obrigatório antes de código. Status: **APROVADO**.

## Escopo
Configurar prazos por Fase (prazo esperado ≤ vencimento ≤ expiração, durações relativas à entrada), override absoluto
por Campo `DATE`/`DATETIME` do Card, e materializar a **referência temporal de entrada na Fase** (instante + origem)
que a saúde temporal (2.13) e a movimentação (2.14) consumirão. **Fora:** derivação da saúde (2.13); operação de mover
que gera reentradas (2.14); Dashboard (E7); agendador/notificação.

## Decisões resolvidas pelo dono/Arquitetura (2026-07-14, `AskUserQuestion`)
Gate do epics §945 fechado (parâmetros/cálculo/fuso = Arquitetura; comportamento de mudança de config = dono):
- **GATE-ARQ:** durações em `Int` de **minutos**; cálculo **sob demanda na leitura** (função pura, sem agendador);
  instante de entrada em **`@db.Timestamptz`** (DIV-1 aceita — diverge do `TIMESTAMP(3)` do schema por escolha).
- **D-OA1 = A** (snapshot na entrada, só entradas futuras) → exige `configSnapshot` na `CardPhaseEntry`.
- **D-OA2 = A/A/snapshot:** `CardPhaseEntry` append-only (GRANT SELECT/INSERT) + colunas de config em `Phase` +
  `configSnapshot Json`.
- **D-OA3 = A:** `expectedFieldId?`/`dueFieldId?`/`expirationFieldId?` em `Phase`; precedência valor-do-Card ›
  duração-da-Fase › ausência; malformado → fail-closed (ignora override).
- **D-OA4:** helper `registrarEntradaNaFase(tx, contexto, …)` na tx dos 2 sítios de criação (2.7/2.8) + backfill
  idempotente na migração.

## context7-check (Prisma 6.19.3 / PostgreSQL 16)
- **Prisma `@db.Timestamptz(3)`** — mapeamento padrão para `timestamptz` no conector PostgreSQL; tipagem `DateTime` no
  client inalterada. Confirmado que o restante do schema usa `DateTime` sem `@db.` (mapeia `timestamp(3)`); a divergência
  é intencional e localizada em `CardPhaseEntry.enteredAt`.
- **Prisma `Json`** — `configSnapshot Json` mapeia `jsonb`; leitura como `Prisma.JsonValue`, escrita como
  `Prisma.InputJsonValue`. Mesmo padrão de `Card.valores`/`FormVersion.snapshot`.
- **Índice parcial** — não necessário: "entrada atual" = linha mais recente por `(cardId, enteredAt desc)`, não há
  "linha ativa" única. Confirmado (prep) que índice parcial no schema é Prisma v7.4+; aqui dispensado.
- **CHECK de ordenação** — `esperado ≤ vencimento ≤ expiração` tolerante a NULL como defesa em profundidade, além da
  validação no núcleo puro. `GRANT SELECT, INSERT` (sem UPDATE/DELETE) em `CardPhaseEntry` — mesma fronteira de
  `CardHistory`/`FormVersion`.

## Verificações
- **Sem antecipar escopo (AD-11):** a `CardPhaseEntry` e o helper `registrarEntradaNaFase` nascem com **consumidor
  concreto** (a entrada inicial, gravada na criação do Card em 2.7/2.8); o mesmo helper é o contrato que 2.14
  consumirá — sem materializar movimentação nem saúde.
- **C3 congelado:** autorização fina no serviço — configurar = `exigirGerenciarPipe` (config do Pipe, como Fases/Forms);
  ler config = `resolverPoderNoPipe` (qualquer poder ≥ ler → 404 sem acesso). Guard/CASL intocados.
- **Card append-only preservado:** 2.12 **não** abre GRANT de UPDATE em `Card` (a referência de entrada é tabela à
  parte); `phaseId`/movimentação seguem sem UPDATE até 2.14.
- **Invariantes:** `Fase ≠ Status do Card` (entrada gera referência temporal, não estado); override por `Field.id`
  nunca rótulo (AD-12); efeito + trilha na mesma transação (AD-13, quando houver evento); isolamento por RLS
  ENABLE+FORCE + WITH CHECK; `configSnapshot` congela a config na entrada (não-retroatividade por construção).

**Veredito: APROVADO.**
