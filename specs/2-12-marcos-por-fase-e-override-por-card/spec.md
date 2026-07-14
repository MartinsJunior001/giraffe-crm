# Spec — Story 2.12 (Marcos por Fase e override por Card)

> Rastreabilidade: FR-10; PRD D2.7 (marcos por Fase), D3.1 (Campos Data/Data-hora); AD-11/AD-12/AD-13. epics.md
> Story 2.12 (§937-951). Dep.: 2.3 (Phase), 2.4 (Form/Field — tipos `DATE`/`DATETIME`), 2.9 (Kanban/leitura de
> Card). **Adjacências em implementação paralela:** 2.11 (ciclo de vida do Card — `lifecycleState`, 1º GRANT UPDATE
> column-scoped em `Card`) e o futuro 2.14 (movimentação — cria reentradas e recalcula marcos/saúde).

## Objetivo
Permitir que cada Fase defina **prazos esperados/vencimento/expiração como durações relativas à entrada na Fase**,
com **override absoluto** por um Campo Data/Data-hora do Card, e **materializar a referência temporal de entrada na
Fase** — o instante e a origem de cada entrada efetiva, preservados a cada reentrada — que a **saúde temporal (2.13)**
e a **movimentação (2.14)** consumirão. Tudo **sem inventar** parâmetros numéricos, regras de cálculo/agendamento ou
fuso (decisão de Arquitetura) e **sem recálculo retroativo silencioso** quando a configuração da Fase mudar.

## Marcos (3, ordenados)
Três marcos por Fase, expressos como **durações relativas à entrada**: **prazo esperado ≤ vencimento ≤ expiração**
(invariante de ordenação validado na configuração). A **derivação da saúde** a partir deles (atrasado/vencido/
expirado) **não** é desta Story (é 2.13). Aqui só se **configura** o marco e se **estabelece a base de cálculo**
(instante de entrada + duração/override), não o veredito de saúde.

## Escopo
- **Configuração de marcos por Fase (durações relativas):** definir/editar as três durações por Fase; validar
  `esperado ≤ vencimento ≤ expiração`; **só Admin da Org / Admin do Pipe** (`exigirGerenciarPipe`, config do Pipe —
  como Fases 2.3 e Formulários 2.4/2.5/2.6); **Membro não configura** (403); sem acesso ao Pipe → 404.
- **Referência temporal de entrada na Fase:** cada **entrada efetiva** de um Card numa Fase cria uma referência
  própria — **instante** de entrada + **origem** da entrada; **append-only e imutável**; **nova referência a cada
  reentrada**, preservando as anteriores (histórico das entradas). Os marcos do Card valem como durações relativas à
  **entrada atual** (a referência mais recente).
- **Override absoluto por Campo Data/Data-hora:** quando o Card tem valor num Campo `DATE`/`DATETIME` designado para
  um marco, esse valor (data **absoluta**) **prevalece** sobre a duração-relativa-da-Fase. **Precedência:**
  valor-do-Card › configuração-da-Fase › ausência (marco não se aplica).
- **Não-retroatividade:** mudar a configuração de marcos da Fase **não altera** o histórico de entradas nem
  **recalcula silenciosamente** os Cards atualmente na Fase (comportamento exato = **decisão de dono**, ver
  "Decisões EM ABERTO").
- Isolamento pelo banco replicado nas estruturas novas (RLS ENABLE+FORCE, WITH CHECK, GRANT **sem DELETE**; a
  referência de entrada é **sem UPDATE** também — imutável, como `CardHistory`/`FormVersion`), tabelas em
  `MODELOS_AUDITADOS`, toda query por `withTenantContext`.

## Fora de escopo
**Derivação da saúde temporal** (`ok`/`atrasado`/`vencido`/`expirado`) e sua emissão de evento — é 2.13. **Operação de
movimentação** que produz as **reentradas** e dispara o **recálculo** — é 2.14 (aqui só o **contrato/write-side** da
referência de entrada; a 2.12 não implementa "mover"). **Dashboard/priorização** (E7). **Agendador/job** de avaliação
temporal (se existir, é definição de Arquitetura e consumidor em 2.13). **Notificação** de prazo (E5).

## Decisões — RESOLVIDAS pelo dono/Arquitetura (2026-07-14)
As opções foram escaladas via `AskUserQuestion` (postura idêntica ao gate antiabuso da 2.8 e às D-OA da 2.10) e o
dono resolveu. Registro autoritativo:
- **GATE-ARQ — parâmetros/cálculo/fuso:** durações em **`Int` de minutos** (o Prisma 6.19.3 **não** tem tipo
  `interval` nativo; guardar `Int` é o padrão da casa); **cálculo SOB DEMANDA na leitura** (função pura; **sem
  agendador/job** — a 2.12 guarda só a base, o veredito de saúde é 2.13); instante de entrada em **`@db.Timestamptz`**
  (instante absoluto, escolha tecnicamente correta; diverge do `TIMESTAMP(3)` do restante do schema por decisão
  explícita — DIV-1 aceita).
- **D-OA1 = A — só entradas FUTURAS (config "congelada" na entrada):** a referência de entrada **guarda um snapshot**
  das durações/override vigentes no instante da entrada (padrão-snapshot da 2.6/`FormVersion`). Mudar a config da Fase
  afeta **apenas entradas futuras**; um Card já na Fase só reflete a nova política ao **reentrar** (2.14). "Sem
  recálculo retroativo silencioso" cai **por construção**. **Decide a D-OA2c** (snapshot na entrada obrigatório).
- **D-OA2 = A/A/snapshot:** (a) nova tabela **`CardPhaseEntry`** org-scoped, **append-only** (GRANT SELECT/INSERT —
  sem UPDATE, sem DELETE); (b) **colunas em `Phase`** para a config (`...DurationMin Int?` + `...FieldId String?`);
  (c) **snapshot** da config na `CardPhaseEntry` (coluna `configSnapshot Json`), congelando os marcos da entrada.
- **D-OA3 = A — override por `fieldId?` por marco na config da Fase:** a `Phase` carrega `expectedFieldId?`,
  `dueFieldId?`, `expirationFieldId?` referenciando um `Field` `DATE`/`DATETIME` do Formulário inicial do Pipe. Na
  avaliação: valor **não-nulo** do Card naquele `Field.id` (lido de `valores` por `id` — AD-12) → valor absoluto
  prevalece; senão `entrada + duração`; senão marco não se aplica. Valor malformado → **fail-closed** (ignora o
  override, cai para a duração). Validação de tipo no serviço de config.
- **D-OA4 — write-side:** helper compartilhado **`registrarEntradaNaFase(tx, contexto, {cardId, phaseId, origin})`**
  insere a `CardPhaseEntry` (com snapshot) **na mesma transação** dos DOIS sítios de criação de Card (submissão
  interna 2.7 e conversão pública 2.8) — a entrada inicial é o **consumidor concreto** (AD-11); o mesmo helper é o
  **contrato de reentrada** que a 2.14 consumirá (`origin=MOVE`). **Backfill** idempotente por passo de migração
  insere a 1ª `CardPhaseEntry` (`origin=SUBMISSION`) de cada Card já existente, para a saúde 2.13 ter base.

## Invariantes preservados
`Fase ≠ Status do Card` (a entrada na Fase gera uma **referência temporal**, não um estado do Card; os eixos
ciclo-de-vida (2.11) e saúde (2.13) permanecem distintos); `Card ≠ Registro`; deny-by-default; `PERMISSÃO = AÇÃO +
ESCOPO` (configurar marcos = **gerenciar o Pipe**); isolamento por Organização pelo banco; **C3/`ability.ts`/guard
congelados** (autorização fina em `pipe-authz`); **AD-11** (nada materializado só para o futuro — a referência de
entrada e a função-contrato de reentrada só entram com consumidor/teste concretos); **AD-12** (identidade estável;
override por `Field.id`, nunca rótulo); **AD-13** (efeito + trilha na mesma transação, quando houver evento).
