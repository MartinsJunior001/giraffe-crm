# Checklist — Story 2.12

Estado: **planejamento** (backlog). Itens `[ ]` = a cumprir na implementação, **após** as decisões em aberto.

## Bloqueantes (precedem a implementação)
- [ ] **GATE-ARQ** resolvido e registrado (Arquitetura) — unidade/limites das durações (`Int`; sem `interval` nativo
      no Prisma 6.19.3), regra de cálculo/agendamento (sob demanda vs. job) e **fuso** (`@db.Timestamptz` vs.
      `TIMESTAMP(3)`).
- [ ] **D-OA1** resolvida e registrada (dono/Arquitetura, no epics) — mudança de config afeta **só entradas futuras**
      (A) **ou** exige **recálculo explícito** (B); **sem recálculo retroativo silencioso**.
- [ ] **D-OA2** resolvida — referência de entrada (`CardPhaseEntry` append-only vs. derivar); config de marcos
      (`Phase` colunas vs. `PhaseSchedule`); **snapshot** na entrada (sse D-OA1=A).
- [ ] **D-OA3** resolvida — mapeamento Campo→marco do override (onde vive, tipos aceitos, fail-closed em malformado).
- [ ] **D-OA4** resolvida — write-side da entrada inicial (estender transação da 2.7) + **função-contrato de
      reentrada** (consumida por 2.14) + **backfill** dos Cards existentes.

## Configuração de marcos (config do Pipe — C3 congelado)
- [ ] Definir/editar as três durações por Fase; **`esperado ≤ vencimento ≤ expiração`** validado (igualdade ok) →
      violação **400** (SC-2123).
- [ ] **Só Admin da Org / Admin do Pipe** configuram: `exigirGerenciarPipe(db, principal, phase.pipeId)`; **Membro →
      403**; Viewer → 403; sem acesso ao Pipe → **404** não-enumerante (SC-2126) — **fase vermelha** provada.
- [ ] Nenhuma rota aceita `orgId`/`pipeId` do cliente; o Pipe dono resolve por `phase.pipeId`.

## Referência temporal de entrada na Fase
- [ ] Cada **entrada efetiva** cria uma referência própria: **instante + origem**; append-only e **imutável**
      (SC-2121).
- [ ] **Reentrada** cria **nova** referência preservando as anteriores; "entrada atual" = a mais recente (SC-2123).
- [ ] Marcos do Card calculados a partir da **entrada atual** (`entrada + duração`), exceto override (SC-2121).
- [ ] Entrada inicial gravada na **mesma transação** da criação do Card (AD-13); reentrada via função-contrato
      **sem** chamador de movimentação (2.14 consome depois — AD-11).

## Override por Campo Data/Data-hora
- [ ] Valor `DATE`/`DATETIME` do Card (absoluto) **prevalece** sobre a duração-da-Fase; **precedência** valor-do-Card
      › config-da-Fase › ausência (SC-2122).
- [ ] **Ausência** do valor é **ignorada** (cai para a config da Fase), **não** zera/anula o marco (SC-2122) — teste
      de mutação "ausência cai fora da config → falha".
- [ ] Valor lido do `valores` JSONB por **`Field.id`** (nunca rótulo — AD-12); malformado = fail-closed (ignora
      override).

## Não-retroatividade da configuração
- [ ] Mudar a config da Fase **não reescreve** o histórico de entradas (SC-2124).
- [ ] Conforme D-OA1: Cards atuais **não** mudam sem (A) reentrada / (B) ação explícita — **nunca em silêncio**
      (SC-2124) — regressão determinística provada.

## Isolamento e fronteira (invariante-mãe)
- [ ] Tabela(s) nova(s): RLS ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK em INSERT/UPDATE (SC-2125).
- [ ] **GRANT como fronteira:** `CardPhaseEntry` **SELECT/INSERT apenas — sem UPDATE, sem DELETE** (append-only
      imutável, como `CardHistory`/`FormVersion`) — teste de escopo do GRANT provando que UPDATE/DELETE são negados.
- [ ] `Card` **não** ganha GRANT de UPDATE nesta Story (referência é tabela à parte; movimentação = 2.14).
- [ ] Config de marcos (colunas em `Phase` ou `PhaseSchedule`): GRANT SELECT/INSERT/UPDATE (config muda), sem DELETE.
- [ ] Toda query por `withTenantContext`; tabela(s) nova(s) em `MODELOS_AUDITADOS`.

## Sem antecipar (AD-11)
- [ ] Sem derivação/estado de saúde (2.13), sem operação de mover/recálculo por movimentação (2.14), sem Dashboard
      (E7), sem agendador/notificação. Nada materializado sem consumidor concreto (a base serve a 2.13, imediata).

## Gates
- [ ] typecheck/format/lint/build verdes; suíte contra PostgreSQL real; **fase vermelha** de cada portão provada;
      pre-implementation-check + security-check + observability-check + migration-check (RLS); commit-check antes do
      commit; context7-check registrado (Prisma 6.19.3: sem `interval` nativo; índice parcial só v7.4+).
