# Spec — Story 2.3: Gerenciamento de Fases

> Risco **CRÍTICO** (nova entidade `Fase` org-scoped + RLS + migration; invariante-mãe de isolamento; **e**
> ativação do poder diferencial por papel de Pipe deferido na 2.2 — DBT-2.2-ROLE-DORMENTE). Spec completo.
> Fonte: `_bmad-output/implementation-artifacts/2-3-gerenciamento-de-fases.md`; `epics.md` Story 2.3;
> `regras-negocio-fase-1.md` RN-030; `permissoes-fase-1.md` §7/§15;
> `gates/2-2/revisao-independente-incremento-2.md` (DBT-2.2-ROLE-DORMENTE).

## Contexto
A Story 2.1 deu ao Admin da Org o ciclo de vida do **Pipe**; a 2.2 abriu o **acesso por concessão** por Pipe
(`PipeGrant`), mas o **papel** (`PipeRole` ADMIN/MEMBER/VIEWER) ficou **armazenado e inerte** — toda concessão
ACTIVE concede leitura, sem diferenciar (decisão SC-222=B, rastreada por **DBT-2.2-ROLE-DORMENTE**). A 2.3
introduz a **Fase** — a etapa do fluxo dentro de um Pipe — e, por gerenciar Fases ser **config do Pipe** (PRD
§7), é a Story onde o poder **diferencial** por papel de Pipe **ativa**: o **Admin do Pipe** passa a
administrar as Fases do seu Pipe; MEMBER/VIEWER só leem. Consome o substrato C3 (1.6) e o padrão de RLS/GRANT
da 2.1/2.2 **sem alterar o mecanismo** (guard/`ability.ts` congelados).

## Modelo de dados
- **`Phase`** (Fase de um Pipe): `id` (uuid, PK), `orgId` (uuid, FK `Organization`, `onDelete: Cascade`),
  `pipeId` (uuid, FK `Pipe`, `onDelete: Cascade`), `name` (String), `state` (`PhaseState` = `ACTIVE`|
  `ARCHIVED`), **chave de ordenação** (representação a fixar no plan — ver Clarifications/plan), `archivedAt`
  (nullable), timestamps.
- **RN-030 (invariante estrutural):** cada Fase pertence a **exatamente um** Pipe; **nenhuma Fase migra
  entre Pipes** e nenhuma pertence a mais de um Pipe (`phase.pipeId`, imutável na prática — sem rota que
  troque `pipeId`).
- **Ordenação intra-Pipe:** a ordem das Fases é **por Pipe** (a reordenação de um Pipe não afeta outro). A
  **representação** da chave (inteiro esparso / decimal / rank lexicográfico vs inteiro contíguo) e a
  eventual **unicidade** de posição são **decisão do plan** — condicionadas pela recusa de `$transaction`
  em `withTenantContext` (uma reordenação não pode depender de multi-statement transacional). Ver plan.
- **Invariante "≥1 Fase ativa por Pipe":** todo Pipe mantém ao menos uma Fase ACTIVE; não é expressável por
  constraint trivial de banco — enforcement recomendado **no serviço** (ver plan).
- **Enum** `PhaseState`. Sem enum de papel novo: o diferencial reusa `PipeRole` (2.2).
- **Sem exclusão definitiva:** arquivar é `state = ARCHIVED` (+ `archivedAt`); restaurar é `state = ACTIVE`
  (+ `archivedAt = null`), voltando ao **final da ordem ativa**. Runtime **sem GRANT de DELETE**.
- **`Phase` é `MODELOS_AUDITADOS`** (criar/renomear/reordenar/arquivar/restaurar auditados).

## Autorização (CASL, C3) — por recurso, no serviço; ATIVA o papel de Pipe
- **Leitura de Fases** segue o **acesso ao Pipe** aberto pela 2.2: **Admin da Org** (qualquer Pipe) **ou**
  qualquer **concessão ACTIVE** do principal para o Pipe → lê as Fases; caso contrário → **404
  não-enumerante** (não revela a existência do Pipe/Fases).
- **Gerenciar Fases** (criar/renomear/reordenar/arquivar/restaurar) exige **poder de config do Pipe**:
  **Admin da Org** (sem concessão) **ou** **Admin do Pipe** (`PipeGrant.role = ADMIN`, `state = ACTIVE`, com
  `Membership.state = ACTIVE`). **MEMBER/VIEWER** concedidos → **403** (leem, não gerenciam).
- A guarda **grossa** (`AuthzGuard`, org-scoped) mantém `@Requer('ler','Pipe')` nas rotas de Fase (o tipo é
  acessível a qualquer Membership ativa, como na 2.2); **qual** Pipe e **qual** poder são decididos **no
  serviço** com a concessão carregada — a guarda **fina** por recurso (**DBT-AUTHZ-01**), que **não** é
  condition do guard.
- **Ativa DBT-2.2-ROLE-DORMENTE:** a resolução do poder efetivo passa a **ler `role`** e a **reconferir
  `Membership.state = ACTIVE`** (fecha também DBT-2.2-MEMBERSHIP-ADVISORY para esta superfície). **Admin do
  Pipe ≠ Admin da Org**: administra config (Fases), não o ciclo de vida do Pipe (Story 2.1).
- Não altera o mecanismo C3; estende o **catálogo/serviço** (como a 2.1/2.2). Mecanismo do diferencial
  (filtro de serviço vs `construirAbility` estendida) é decisão do plan.

## Isolamento / RLS (AD-6)
- `Phase` com **ENABLE + FORCE ROW LEVEL SECURITY**; 4 policies `select/insert/update/delete` por
  `orgId = current_org_id()`, **WITH CHECK no INSERT e no UPDATE** (o INSERT não aceita `orgId` alheio; o
  UPDATE não "move" a Fase para outra Org). Queries por `withTenantContext`.
- **GRANT runtime:** `SELECT, INSERT, UPDATE` — arquivar/restaurar/reordenar são `UPDATE`, **sem DELETE**
  (simétrico à 2.1/2.2). A policy de DELETE existe por defesa/simetria, mas o runtime não recebe o privilégio.

## Contrato de API (interna)
- `GET /pipes/:pipeId/phases` — lista as Fases do Pipe **na ordem** (default só ACTIVE; `?arquivadas=1`
  inclui ARCHIVED). Requer acesso ao Pipe (Admin da Org ou concessão ACTIVE); senão **404**. → `Phase[]`.
- `POST /pipes/:pipeId/phases` — cria Fase ao final da ordem ativa (Requer gerenciar Fases). → 201.
- `PATCH /pipes/:pipeId/phases/:phaseId` — renomeia (Requer gerenciar). → 200.
- `POST /pipes/:pipeId/phases/reorder` — reordena **intra-Pipe** (corpo = nova ordem; Requer gerenciar).
  → 200.
- `POST /pipes/:pipeId/phases/:phaseId/archive` — arquiva (`ACTIVE → ARCHIVED`); **bloqueado** se for a
  última Fase ativa do Pipe. Requer gerenciar. → 200.
- `POST /pipes/:pipeId/phases/:phaseId/restore` — restaura (`ARCHIVED → ACTIVE`) ao **final da ordem ativa**.
  Requer gerenciar. → 200.
- **Nenhuma** rota aceita `orgId` do cliente; **nenhuma** rota de exclusão; nenhuma rota troca `pipeId`
  (RN-030). Payload sem `orgId`.

## Estados e transições
`ACTIVE → ARCHIVED` (`archivedAt = now`; bloqueado se for a última ACTIVE do Pipe). `ARCHIVED → ACTIVE`
(`archivedAt = null`; entra ao **final** da ordem ativa). Renomear/reordenar são `UPDATE` de linhas ACTIVE.
Idempotência de arquivar/restaurar tratada como na 2.1 (caminho idempotente sem `updateMany` de `count:0`,
para não sujar a auditoria com falso `denied`).

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-231** — criar/renomear Fase aparece **na ordem** do Pipe, **org-scoped**, e nunca em outro Pipe/Org.
  (AC1)
- **SC-232** — reordenar é **intra-Pipe**: a nova ordem persiste e não afeta a ordem de outro Pipe nem de
  outra Org. (AC2)
- **SC-233** — **≥1 Fase ativa**: arquivar a **última** Fase ativa de um Pipe é **bloqueado**. (AC3)
- **SC-234** — arquivar reversível: arquivada sai do fluxo ativo preservando dados; **restaurar volta ao
  final da ordem ativa**, com dados preservados. (AC4)
- **SC-235** — **RN-030**: nenhuma Fase migra entre Pipes / pertence a mais de um Pipe (não há caminho que
  altere `pipeId`). (AC1)
- **SC-236** — **[ROLE] poder diferencial (fecha DBT-2.2-ROLE-DORMENTE):** Admin da Org gerencia Fases de
  qualquer Pipe; **Admin do Pipe** (`PipeRole=ADMIN` ACTIVE + `Membership` ACTIVE) gerencia as do seu Pipe;
  **MEMBER/VIEWER** concedidos → **403** ao gerenciar (mas **leem**); a resolução **lê `role`** e **reconfere
  `Membership.state`** (Membership SUSPENDED com concessão ADMIN → negado). (AC5)
- **SC-237** — **não-enumeração:** sem acesso ao Pipe (não-Admin sem concessão ACTIVE) → **404** em todas as
  rotas de Fase, indistinguível de "não existe". (AC5)
- **SC-238** — **isolamento:** outra Organização **não** vê as Fases; INSERT/SELECT/UPDATE de `Phase` sem
  contexto (ou de outra Org) é **negado pelo banco** (FORCE RLS); o runtime **não** apaga Fase (sem GRANT
  DELETE). (AC6)
- **SC-239** — migration `deploy` cria tabela+RLS+ordenação; `rollback` a remove sem tocar `Pipe`/`PipeGrant`/
  `Membership`; reaplicação ok. (migration-check)

## Não-objetivos
**Formulário de Fase** (2.15, RN-032/RN-051); **movimentação de Card** entre Fases (2.14) e regras de
transição (RN-033, PENDENTE); **Cards** (2.7+) — logo a trava "não arquivar Fase com Cards ativos" e "impede
novos Cards/movimentações para a Fase arquivada" são **contrato futuro** (não se materializa tabela de Card —
AD-11); **papel diferencial de Card** (Membro do Pipe opera Cards → 2.7/2.10, a outra metade de
DBT-2.2-ROLE-DORMENTE); **exclusão definitiva** de Fase; semeadura/estrutura de Formulário; automações.

## Segurança / observabilidade / LGPD
Sem bypass de RLS (AD-6). **Nome de Fase é rótulo de processo, não PII** (como o nome de Pipe — confirmar no
`lgpd-check`). Criar/renomear/reordenar/arquivar/restaurar entram na trilha de auditoria (mudança de config —
AD-31/D1.6). Logs sanitizados; payload sem `orgId`; nenhum segredo.

## Dependências e ordem
Empilha sobre a **Story 2.2** (`PipeGrant` + acesso por concessão, PR #20) e, por transitividade, a **2.1**
(`Pipe`) e **1.6** (authz). Não abrir PR contra `main` antes de a base (2.2) estar mergeada; após o merge,
rebasear e revalidar diff/migration/CASL/RLS/testes. Correções da 2.1/2.2 têm prioridade.

## Clarifications (a resolver no plan)
1. **Representação da chave de ordenação** (esparsa/rank vs inteiro contíguo) e **unicidade** de posição —
   condicionadas pela recusa de `$transaction` (reordenar deve ser single-statement). *Recomendação: chave
   esparsa/rank, mover = um UPDATE de uma linha; `ORDER BY chave, id` determinístico.*
2. **Enforcement de "≥1 Fase ativa"** — no serviço (contar ACTIVE antes de arquivar) vs constraint. *Reco:
   no serviço, com o cuidado de auditoria da 2.1.*
3. **Semeadura da 1ª Fase ao criar Pipe** — semear (toca o `criar` da 2.1) vs Pipe sem Fases até a 1ª ser
   criada. *Reco: não alterar a 2.1; enforçar "≥1 ativa" apenas na operação de arquivar.*
4. **Nomes** — model `Phase`/enum `PhaseState`/campo de ordenação/módulo `phases`. *Reco: inglês, simétrico a
   `Pipe`.*
5. **Mecanismo do diferencial** — filtro no serviço (como a 2.2) vs `construirAbility` estendida com o papel
   de Pipe (dá consumidor ao `role` no substrato). Ambos sem tocar C3. *Reco: filtro no serviço; avaliar o
   CASL nativo se o time quiser materializar `role` no substrato.*
