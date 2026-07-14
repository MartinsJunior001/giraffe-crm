# Plan — Story 2.12 (Marcos por Fase e override por Card)

> **DECISÕES RESOLVIDAS (2026-07-14, dono via `AskUserQuestion`) — ver `spec.md §Decisões`:** GATE-ARQ = `Int`
> minutos + cálculo sob demanda na leitura + `@db.Timestamptz`; **D-OA1 = A** (snapshot na entrada, só futuras);
> **D-OA2 = A/A/snapshot** (`CardPhaseEntry` append-only + colunas em `Phase` + `configSnapshot Json`); **D-OA3 = A**
> (`fieldId?` por marco); **D-OA4** = helper `registrarEntradaNaFase` na tx dos 2 sítios de criação + backfill. As
> tabelas abaixo permanecem como registro dos trade-offs; o caminho escolhido é o marcado ✅/A.

## GATE-ARQ — parâmetros numéricos, cálculo/agendamento e fuso (decisão de ARQUITETURA)
Registrado no epics §945 como **gate**. **Não inventar.** A 2.12 **não** fixa:
- **Unidade e limites das durações.** A duração é numérica; a coluna será **`Int`** (segundos ou minutos — a
  **unidade é de Arquitetura**). Justificativa técnica (Context7, Prisma 6.19.3): **não há tipo `interval` nativo** no
  Prisma — `interval` cairia em `Unsupported`, sem tipagem no client. Guardar `Int` (contagem de unidade fixa) é o
  padrão da casa para grandezas numéricas; a **unidade** e os **limites** (mínimo/máximo, se dias corridos vs. úteis)
  ficam para Arquitetura.
- **Regra de cálculo/agendamento.** Se os marcos são **derivados sob demanda** na leitura (a 2.12 guarda só a base:
  instante de entrada + durações/override; o veredito é 2.13) **ou** avaliados por **job/agendador**. O escopo da
  2.12 aponta para "guardar a base"; a existência de agendador é decisão de Arquitetura com consumidor em 2.13.
- **Fuso horário.** Que fuso rege as durações relativas e o **instante de entrada**. Decorrência técnica a validar:
  adotar **`@db.Timestamptz`** para o instante absoluto de entrada (mais correto para instantes) **vs.** manter
  `TIMESTAMP(3)` (convenção atual de todo o schema). **Divergência registrada** em `analyze.md` (DIV-1).

## Decisões EM ABERTO (bloqueantes) — opções e trade-offs

### D-OA1 — Comportamento quando a configuração da Fase muda (dono/Arquitetura — registrada no epics)
Restrição dura comum a todas: **nenhuma** opção pode **recalcular retroativamente em silêncio** (epics §945/§951).

| Opção | Descrição | Trade-off |
|---|---|---|
| **A — Só entradas futuras (config "congelada" na entrada)** | A referência de entrada **guarda um snapshot** das durações/override vigentes no instante da entrada (padrão-snapshot da 2.6). Mudar a config da Fase afeta **apenas entradas futuras**; Cards já na Fase mantêm os marcos da entrada vigente. | + Previsível, sem surpresa, coerente com `FormVersion`/append-only; "sem recálculo silencioso" cai **por construção**. − Um Card já na Fase só reflete a nova política ao **reentrar**; exige a coluna de snapshot na referência (D-OA2c). |
| **B — Recálculo EXPLÍCITO dos Cards atuais** | A config é lida **ao vivo**; aplicar a nova política aos Cards atuais exige uma **ação explícita** (comando de recálculo autorizado), que gera **evento**; nunca automático. | + Flexível (corrige política sem esperar reentrada). − Nova superfície (rota + autz + evento + idempotência); a leitura "ao vivo" reabre o risco de recálculo silencioso se alguém esquecer o gate — mais caminhos para errar. |

**Aberto para o dono/Arquitetura.** Observação de desenho: a opção **A** essencialmente **decide a D-OA2c** (snapshot
na entrada); a **B** exige superfície de recálculo. Escolher A ou B muda o modelo de dados — por isso **precede** a
implementação.

### D-OA2 — Modelo de dados (referência de entrada + config de marcos + snapshot)
**(a) Referência temporal de entrada**
| Opção | Descrição | Trade-off |
|---|---|---|
| **A — `CardPhaseEntry` (nova tabela org-scoped, append-only)** ✅ recomendada | `(id, orgId, cardId, phaseId, enteredAt, origin, [snapshot], createdAt)`; RLS ENABLE+FORCE + WITH CHECK; **GRANT SELECT/INSERT — sem UPDATE, sem DELETE** (imutável, como `CardHistory`/`FormVersion`). "Entrada atual" = linha mais recente por `(cardId, enteredAt desc)`. Reentrada = **novo INSERT**. | + Estruturada (instante **e** origem), histórico nativo, imutável; **não** toca `Card` (mantém `Card` fora do UPDATE — a 2.11 já introduz o 1º UPDATE column-scoped de ciclo de vida). − Nova tabela/migração/testes RLS. |
| B — Derivar de `CardHistory`/`Card.createdAt` | Instante da 1ª entrada = `Card.createdAt`; reentradas = eventos de movimentação (2.14). | **Rejeitada:** `CardHistory.type` é string livre, sem `phaseId`/`origin` estruturados; não há origem tipada de entrada; reentrada dependeria de parsear eventos — frágil e viola "referência própria". |

**(b) Configuração de marcos por Fase**
| Opção | Descrição | Trade-off |
|---|---|---|
| **A — Colunas em `Phase`** | `expectedDuration Int?`, `dueDuration Int?`, `expirationDuration Int?` (+ mapeamento de override, D-OA3). `Phase` já tem GRANT SELECT/INSERT/UPDATE. | + Mínimo; sem tabela nova; config é atributo natural da Fase. − Se D-OA1=A exigir **versionar** a config para congelar por entrada, coluna direta não versiona (o snapshot na entrada resolve). |
| **B — `PhaseSchedule` (tabela 1:1 com `Phase`, versionável)** | Config isolada, potencialmente versionada (`version`), referenciada pelo snapshot da entrada. | + Versionamento explícito; separa config de identidade da Fase. − Mais uma tabela/RLS; só se justifica se D-OA1=A optar por referência versionada em vez de snapshot embutido. |

**(c) Snapshot da config na referência de entrada** — necessário **sse D-OA1=A**: a `CardPhaseEntry` guarda as
durações/override efetivos no instante da entrada (JSON ou colunas), congelando os marcos daquela entrada.

**Aberto para o dono/Arquitetura.**

### D-OA3 — Override por Campo Data/Data-hora (mapeamento Campo→marco)
O epics fixa "override absoluto por Campo `DATE`/`DATETIME`" e a **precedência**, mas **não** o **mapeamento**: como a
config da Fase designa **qual Campo** alimenta **qual marco**.
- **Opção A (recomendada):** a config da Fase carrega, por marco, um `fieldId?` opcional (`expectedFieldId`,
  `dueFieldId`, `expirationFieldId`) referenciando um `Field` `DATE`/`DATETIME` do Formulário. Na avaliação: se o Card
  tem valor **não-nulo** naquele `Field.id` (lido do `valores` JSONB por `id` — AD-12), o **valor absoluto**
  prevalece; senão, `entrada + duração`; senão, marco não se aplica.
- **Aberto:** validar tipos aceitos (`DATE` e/ou `DATETIME`), o que fazer com valor malformado (fail-closed → ignora
  o override, como o resto do domínio), e se há 1 Campo por marco ou um Campo compartilhado. **Não inventar.**

### D-OA4 — Write-side da entrada e contrato de reentrada (sequenciamento)
- **Entrada inicial:** hoje só ocorre na **criação** do Card (2.7, mergeada). 2.12 **estende a transação interativa da
  submissão** (2.7/2.8, `definirContextoOrg` no client raiz) para inserir a `CardPhaseEntry` inicial **na mesma
  transação** (AD-13: não há Card sem sua 1ª entrada). Alternativa: **backfill** por migração para Cards existentes.
- **Reentrada:** virá da **movimentação (2.14, inexistente)**. 2.12 materializa uma **função-contrato pura/serviço**
  `registrarEntradaNaFase(cardId, phaseId, origin)` **sem chamador de movimentação** — a 2.14 a consumirá dentro da
  sua transação (padrão idêntico ao `membership-contract.ts` da 2.10, AD-11: contrato agora, consumidor depois).
- **Backfill:** decidir se os Cards já criados recebem uma `CardPhaseEntry` inicial (recomendado, para a saúde 2.13
  ter base) via passo de migração idempotente. **Aberto.**

## Modelo de dados (condicional às decisões)
- **`CardPhaseEntry`** (D-OA2a=A): org-scoped, RLS+FORCE, WITH CHECK, **GRANT SELECT/INSERT** (imutável — sem UPDATE,
  sem DELETE); `MODELOS_AUDITADOS`. `enteredAt` (`Timestamptz` vs. `TIMESTAMP(3)` = GATE-ARQ). Índice
  `(orgId, cardId, enteredAt)`.
- **Config de marcos** (D-OA2b): colunas `Int?` em `Phase` **ou** `PhaseSchedule`. Mapeamento de override (D-OA3).
- **Snapshot** na entrada (D-OA2c) **sse** D-OA1=A.
- **`Card` intocado por 2.12:** a referência de entrada é tabela à parte; 2.12 **não** adiciona GRANT de UPDATE em
  `Card` (o 1º UPDATE de `Card` é o de ciclo de vida da 2.11; `phaseId`/movimentação seguem sem UPDATE até 2.14).

## Migration (`..._phase_milestones` / `..._phase_entry`)
- `CREATE TABLE "CardPhaseEntry"` (se D-OA2a=A): RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH CHECK em
  INSERT/UPDATE por simetria/defesa), FKs org/card/phase CASCADE, índice de consulta. **GRANT SELECT, INSERT — sem
  UPDATE, sem DELETE** (append-only imutável, como `CardHistory`/`FormVersion`).
- Config de marcos: `ALTER TABLE "Phase" ADD COLUMN ...Duration Int` + colunas de override (D-OA2b=A) **ou**
  `CREATE TABLE "PhaseSchedule"` (D-OA2b=B) com o mesmo padrão RLS/GRANT (SELECT/INSERT/UPDATE — config muda).
- **Índices parciais** (se algum for necessário, ex.: "1 entrada atual"): **raw SQL na migration** — o Prisma 6.19.3
  **não** expressa índice parcial no schema (é **v7.4+**, confirmado no Context7). Nota: a recomendação (entrada atual
  = linha mais recente) **dispensa** índice parcial de unicidade — não há "linha ativa" única, só a mais recente.
- Novas tabelas em `MODELOS_AUDITADOS` (`tenant-context.ts`).
- **Backfill** opcional (D-OA4): passo idempotente inserindo a 1ª `CardPhaseEntry` de cada Card existente.

## Autorização fina — `pipe-authz` (reuso, C3 congelado)
- Configurar marcos da Fase = **gerenciar o Pipe**: reusa `exigirGerenciarPipe(db, principal, phase.pipeId)` (o Pipe
  dono resolve-se por `phase.pipeId`, como Fases 2.3 e Formulário de Fase 2.4). **Membro não configura** → 403; sem
  acesso → 404 não-enumerante. **Nenhum helper novo, nenhuma mudança no guard/CASL.**
- Ler os marcos/base de um Card segue o acesso de leitura de Card já existente (2.9/2.10 — `exigirLerCard`), quando
  houver superfície de leitura; a **derivação** exibida é 2.13.

## Eventos (`CardHistory`) — condicional
A **referência de entrada** (`CardPhaseEntry`) já é o histórico estruturado das entradas. Se o dono quiser um evento
**legível** de entrada/mudança-de-config no `CardHistory`, ele entra **na mesma transação** (AD-13); caso contrário,
o evento de **movimentação** (que gera reentradas) pertence a 2.14 e evita duplicar taxonomia. **Aberto** (D-OA4/2.14).

## Sequência de teste (red-green-mutação; PostgreSQL real)
1. Unidade (núcleo puro): cálculo do marco `entrada + duração`; **precedência** override (valor-do-Card › Fase ›
   ausência); validação `esperado ≤ vencimento ≤ expiração`; leitura de `valores` por `Field.id` (nunca rótulo).
2. Config HTTP: **só** Admin da Org/Admin do Pipe configuram (`exigirGerenciarPipe`); **Membro → 403**; Viewer/sem
   acesso → 403/404; ordenação inválida → 400; **fase vermelha** provada.
3. Referência de entrada: criação de Card grava a 1ª `CardPhaseEntry` (instante+origem) na **mesma transação**;
   reentrada (via a função-contrato, chamada em teste) cria **nova** referência preservando as anteriores.
4. Não-retroatividade (D-OA1): mudar a config **não** reescreve entradas passadas; conforme A/B, Cards atuais **não**
   mudam sem (A) reentrada / (B) ação explícita — **nunca em silêncio** (teste de regressão determinística).
5. RLS: isolamento da(s) tabela(s) nova(s), WITH CHECK (via `createMany`, sem RETURNING), **sem DELETE**; para
   `CardPhaseEntry`, **provar que o runtime NÃO tem UPDATE nem DELETE** (append-only imutável) — teste de escopo do
   GRANT, como `CardHistory`/`FormVersion`.
- **Mutações (fase vermelha):** Membro consegue configurar (deve falhar); ausência de valor do Campo **não** cai para
  a config (deve falhar); mudar a config recalcula um Card atual em silêncio (deve falhar); `CardPhaseEntry` aceita
  UPDATE/DELETE (deve falhar).

## Não-implementado de propósito (AD-11)
Derivação/estado de saúde (2.13); operação de mover que gera reentradas e recálculo (2.14); Dashboard (E7);
agendador/notificação. A **função-contrato de reentrada** existe **sem** chamador de movimentação; nenhum marco/base
materializado sem consumidor concreto (a base serve a 2.13, imediatamente seguinte).
