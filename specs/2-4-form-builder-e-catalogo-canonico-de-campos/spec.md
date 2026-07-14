# Spec — Story 2.4: Form Builder e catálogo canônico de Campos

> Risco **CRÍTICO** (novo domínio **Formulário** org-scoped — `Form`/`Field`/`FieldOption` — com RLS +
> migration; invariante-mãe de isolamento; **catálogo canônico** de 12 tipos; **contrato do Form Builder**
> reutilizado pelo Épico 3; gate **AD-28 fail-closed** do Campo Arquivo). Spec completo.
> Fonte: `_bmad-output/implementation-artifacts/2-4-form-builder-e-catalogo-canonico-de-campos.md`;
> `epics.md` Story 2.4; `prd.md` Modelo de Formulários/Campos (D3.1/D3.2); `regras-negocio-fase-1.md`
> RN-050..054 (INV-FORM-01); `ARCHITECTURE-SPINE.md` AD-11/AD-12/AD-27/AD-28.

## Contexto
As Stories 2.1/2.2/2.3 deram ao Épico 2 o **Pipe** (ciclo de vida), o **acesso por concessão por Pipe**
(`PipeGrant`) e a **Fase** — ativando, na 2.3, o **poder diferencial por papel de Pipe** para "config do Pipe"
(Admin da Org **ou** Admin do Pipe). A 2.4 introduz o **domínio Formulário**: o **catálogo canônico de tipos
de Campo** (12 tipos, o mesmo para toda Organização) e o **Form Builder** com que um usuário autorizado
**monta** Formulários. Configurar Formulário (inicial e de Fase) é **config do Pipe** (D3.2) — logo **reusa** a
resolução de poder da 2.3, **sem** alterar o mecanismo C3 (guard/`ability.ts` congelados). Entrega dois
contratos consumidos adiante: o **catálogo/estrutura de Campo** e o **builder reutilizado pelo Épico 3** (sem
segundo builder). Publicação (2.6), evolução segura de Campos (2.5) e submissão/Card (2.7+) **não** entram.

## Modelo de dados
- **`Form`** (Formulário de um contexto): `id` (uuid, PK), `orgId` (uuid, FK `Organization`, `onDelete:
  Cascade`), **contexto** (`FormContext` = `PIPE_INITIAL` | `PHASE` | `DATABASE`), **owner** por contexto
  (`pipeId` para o inicial; `phaseId` para o de Fase; `databaseId` no E3 — FKs nuláveis conforme a modelagem),
  timestamps. **Um Form por owner** (unicidade org-scoped por owner+contexto). A **representação** (tabela
  única com contexto+FKs nuláveis vs alternativa) é **decisão do plan** — recomendação: tabela única (ver
  Clarifications/plan). Cada contexto é uma **linha distinta**, o que faz de INV-FORM-01 uma consequência
  natural de linhas separadas.
- **`Field`** (Campo de um Formulário): `id` (uuid, PK — **identidade estável**, AD-12), `orgId` (uuid, FK),
  `formId` (uuid, FK `Form`, `onDelete: Cascade`), `label` (String), `type` (`FieldType`, 12 valores), `help`
  (nullable), `typeConfig` (`Json` — config específica do tipo), `defaultValue` (`Json`, nullable), `position`
  (**chave fracionária** `Decimal`, como `Phase`), `state` (`FieldState` = `ACTIVE` | `ARCHIVED`), timestamps.
  A representação de `typeConfig`/`defaultValue` (colunas fixas + `Json` vs normalização) é **decisão do plan**
  — recomendação: `Json`.
- **Opções de Seleção com identidade estável:** **tabela `FieldOption`** (`id`, `orgId`, `fieldId`, `label`,
  `position`, `state`) **ou** JSON com UUIDs estáveis — **decisão do plan** (recomendação: tabela, pela
  exigência de identidade estável + arquivamento futuro da 2.5). Ver plan.
- **Enum `FieldType` (catálogo canônico, global — de código, não dado por Org):** os **12 tipos** de D3.1 —
  Texto curto, Texto longo, Número, Seleção única, Seleção múltipla, Sim/Não, Data, Data e hora, E-mail,
  Telefone, URL, Arquivo. É um conjunto **fechado**, igual para toda Organização (como `PipeRole`), **não** um
  catálogo configurável por Organização. Grafia dos identificadores = plan.
- **Ordenação intra-Formulário:** `Field.position` reusa a chave fracionária da `Phase` (mover = 1 UPDATE),
  condicionada pela recusa de `$transaction` em `withTenantContext`. Ordem determinística por `position, id`.
- **Sem exclusão definitiva:** runtime **sem GRANT de DELETE**; arquivar Campo é `state = ARCHIVED`
  (operacionalizado na **2.5**). O atributo `state` existe na estrutura desde a 2.4.
- **`Form`/`Field`/`FieldOption` em `MODELOS_AUDITADOS`** (montar/ordenar Campo são mutações de config
  auditadas).

## Catálogo canônico e estrutura do Campo (D3.1)
- Catálogo oficial (12 tipos), **comum aos três contextos**, **instâncias independentes** (INV-FORM-01).
- Estrutura comum do Campo: **identidade estável**, rótulo, tipo, ajuda opcional, config do tipo, valor
  padrão, posição, estado ativo/arquivado. **Opções de Seleção têm identidade estável.**
- **Obrigatoriedade pertence ao uso do Campo no contexto**, não ao tipo global; a **validação de submissão** e
  o bloqueio por Campo obrigatório são de 2.7+/2.15 — **fora** daqui.
- **Fora da Fase 1:** regras condicionais entre campos, validação programável, exibição dinâmica.

## Contextos e isolamento (INV-FORM-01)
- Três contextos — **inicial** do Pipe, **de Fase**, **de Database** — mesmo catálogo/estrutura, **estados
  independentes**: alterar um **não** altera outro (RN-050/051/052/054). O contexto em edição é **sempre
  identificado**.
- Neste Épico, o builder é **funcional para inicial e Fase**. O contexto **`DATABASE`** existe no
  **contrato/enum**, mas **não** é funcional (owner de Database é do E3) — **sem** segundo builder no E3.
- **RN-054 é crítica** e marcada `NÃO CONFIRMADO` na doc-fonte: exige **teste comportamental dedicado** de
  não-contaminação (não é decisão de produto em aberto).

## Autorização (CASL, C3) — por recurso, no serviço; REUSA a resolução da 2.3
- **Configurar Formulário** (montar/ordenar Campos) do contexto **inicial** (do Pipe) e **de Fase** (da Fase
  daquele Pipe) é **config do Pipe** (D3.2, PRD §7): pode o **Admin da Org** (qualquer Pipe, sem concessão)
  **ou** o **Admin do Pipe** (`PipeGrant.role = ADMIN`, `state = ACTIVE`, com `Membership.state = ACTIVE`).
  **MEMBER/VIEWER** concedidos → **leem** a definição, **não** a montam (**403**). **Sem acesso ao Pipe** →
  **404 não-enumerante**.
- Para o **Formulário de Fase**, o poder resolve pelo **Pipe dono da Fase** (`phase.pipeId`) — a config da
  Fase é config do mesmo Pipe.
- A guarda **grossa** (`AuthzGuard`, org-scoped) mantém `@Requer('ler','Pipe')` nas rotas (o tipo é acessível
  a qualquer Membership ativa, como em Fases); a guarda **fina** por recurso vive **no serviço**
  (**DBT-AUTHZ-01**), **reusando** `resolverPoder`/`exigirGerenciar` da 2.3 (**lê `role`**, **reconfere
  `Membership.state`**). **Não** altera o mecanismo C3; apenas consome o já entregue. A forma do reuso
  (helper compartilhado vs replicação) é **decisão do plan**.

## Gate do Campo Arquivo (AD-27/AD-28, fail-closed)
- O tipo **Arquivo** entra no catálogo/contrato, mas a **capacidade de arquivos** é do **Épico 3** e fica
  **desabilitada por configuração e indisponível na UX** (fail-closed).
- **Regra:** um Formulário com **Campo Arquivo ativo** **não pode ser publicado** enquanto a capacidade
  estiver desabilitada; a indisponibilidade é indicada **honestamente**.
- **Escopo:** publicar é da **2.6** — a 2.4 entrega o **contrato/função de verificação** (unit-testável,
  fail-closed) e marca o tipo como **não funcional** no builder; a 2.6 **consome** o gate no ato de publicar.
  **Nenhum** mecanismo de upload/storage é criado aqui (seam declarado, sem stub).

## Isolamento / RLS (AD-6)
- `Form`/`Field`/`FieldOption` (as tabelas novas) com **ENABLE + FORCE ROW LEVEL SECURITY**; 4 policies
  `select/insert/update/delete` por `orgId = current_org_id()`, **WITH CHECK no INSERT e no UPDATE**. Queries
  por `withTenantContext`.
- **GRANT runtime:** `SELECT, INSERT, UPDATE` — montar/ordenar/(arquivar na 2.5) são `INSERT`/`UPDATE`, **sem
  DELETE** (simétrico a 2.1/2.2/2.3). A policy de DELETE existe por defesa/simetria; o runtime não recebe o
  privilégio.

## Contrato de API (interna)
> Rotas sob `pipes/:pipeId/...` (config do Pipe). Local/prefixo exatos = plan. Nenhuma rota recebe `orgId`;
> nenhuma rota de exclusão; nenhuma rota de publicar (2.6) nem de editar/arquivar Campo (2.5).
- `GET /pipes/:pipeId/forms/initial` — obtém o Formulário **inicial** do Pipe e lista seus Campos **na ordem**
  (getOrCreate se ainda não existe — decisão do plan). Requer acesso ao Pipe; senão **404**. → `Form` + `Field[]`.
- `GET /pipes/:pipeId/phases/:phaseId/form` — obtém o Formulário **de Fase** e seus Campos na ordem. Requer
  acesso ao Pipe; senão **404**. → `Form` + `Field[]`.
- `POST .../fields` — **adiciona** Campo (tipo do catálogo, ao final da ordem; `typeConfig` mínimo). Requer
  **config do Pipe**. → 201.
- `POST .../fields/reorder` — **reordena** Campo intra-Formulário (1 UPDATE; corpo = campo a mover + âncora).
  Requer config. → 200.
- **Campo Arquivo** é aceito mas marcado **indisponível** (gate); a **regra de publicação** é exposta como
  função verificável, não como rota. Payload sem `orgId` e sem `position` (chave interna).

## Estados e transições
`Field.state`: `ACTIVE` de origem. `ACTIVE → ARCHIVED` (arquivar) e edição/travas são **2.5** — a 2.4 só
**cria** o Campo ACTIVE e o **reordena**. `Form` não tem ciclo de publicação em 2.4 (rascunho/publicado = 2.6).
Reordenar reusa o cálculo de ponto médio da `Phase` (single-statement, sem `$transaction`).

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-241** — adicionar Campo aceita **apenas** os 12 tipos do catálogo canônico; um tipo fora do catálogo é
  **rejeitado**; o Campo aparece **na ordem** do Formulário, org-scoped. (AC1)
- **SC-242** — **identidade estável**: o `id` do Campo e das opções de Seleção não depende do rótulo (base
  para AD-12; renomear — na 2.5 — não desloca valores). (AC1)
- **SC-243** — **INV-FORM-01**: alterar os Campos do contexto inicial **não** altera os do contexto de Fase (e
  vice-versa) — teste comportamental dedicado (RN-054); o contexto em edição é sempre identificado. (AC2)
- **SC-244** — **gate do Campo Arquivo (fail-closed):** a regra de publicação **recusa** um Formulário com
  **Campo Arquivo ativo** enquanto a capacidade de upload está **desabilitada**; o tipo é apresentado como
  **indisponível** no builder. (AC3)
- **SC-245** — **contrato reutilizável:** o catálogo/estrutura/contrato de contexto entregues aqui são os que
  o E3 reutiliza para o Formulário de Database — **sem** segundo builder; o valor de contexto `DATABASE`
  existe no contrato mas não é funcional em 2.4. (AC4)
- **SC-246** — **[ROLE] autorização de config (reusa a 2.3):** Admin da Org monta Campos de qualquer Pipe;
  **Admin do Pipe** (`PipeRole=ADMIN` ACTIVE + `Membership` ACTIVE) monta os do seu Pipe; **MEMBER/VIEWER**
  concedidos → **403** ao montar (mas **leem**); a resolução **lê `role`** e **reconfere `Membership.state`**
  (Membership SUSPENDED com concessão ADMIN → negado). (AC5)
- **SC-247** — **não-enumeração:** sem acesso ao Pipe (não-Admin sem concessão ACTIVE) → **404** em todas as
  rotas de Formulário/Campo, indistinguível de "não existe". (AC5)
- **SC-248** — **isolamento:** outra Organização **não** vê Formulários/Campos; INSERT/SELECT/UPDATE de
  `Form`/`Field`/`FieldOption` sem contexto (ou de outra Org) é **negado pelo banco** (FORCE RLS); o runtime
  **não** apaga (sem GRANT DELETE). (AC6)
- **SC-249** — migration `deploy` cria as tabelas + RLS + enum(s) + índices; `rollback` as remove sem tocar
  `Pipe`/`Phase`/`PipeGrant`/`Membership`; reaplicação ok. (migration-check)

## Não-objetivos
**Evolução segura de Campos** (2.5): editar rótulo/ajuda/config/valor padrão; **arquivar/restaurar** Campo com
travas (obrigatório em publicado/requisito de Fase/marco); **mudança de tipo bloqueada**; ciclo de **opções**
(remover só se nunca publicada/usada, senão arquivar). **Publicação/versionamento** (2.6): rascunho→publicar→
despublicar; sessões de submissão; **aplicação** do gate do Arquivo no ato de publicar. **Submissão e criação
de Card** (2.7+); bloqueio de transição por Campo obrigatório (2.15) — **não se materializa** Card/Submissão
(AD-11). **Databases / contexto Database funcional** (E3): sem owner de Database, sem segundo builder.
**Exclusão definitiva**; regras condicionais/validação programável/exibição dinâmica (fora da Fase 1).

## Segurança / observabilidade / LGPD
Sem bypass de RLS (AD-6). **A definição de Formulário/Campo (rótulo/ajuda/config) é metadado de configuração,
não valor submetido nem PII** — o valor capturado surge só com a submissão (2.7+); confirmar no `lgpd-check`.
Campo Arquivo **fail-closed** (AD-27/AD-28) até o E3. Montar/ordenar Campo entra na trilha de auditoria
(mudança de config — AD-30/D1.6). Logs sanitizados; payload sem `orgId` nem `position`; nenhum segredo.

## Dependências e ordem
Empilha sobre a **Story 2.3** (`Phase`, PR #22) e, por transitividade, a **2.2** (`PipeGrant`, PR #20), a
**2.1** (`Pipe`, PR #17) e a **1.6** (authz). Bloco **2.4–2.6** paralelo a **2.1–2.3** (Sprint S5). Não abrir
PR contra `main` antes de a base (2.3) estar mergeada; após o merge, rebasear e revalidar
diff/migration/CASL/RLS/testes. Correções da 2.1/2.2/2.3 têm prioridade.

## Clarifications (a resolver no plan)
1. **Catálogo de tipos** — enum de código global (`FieldType`, 12 valores) vs tabela por Organização.
   *Recomendação: enum de código (catálogo canônico fechado, como `PipeRole`).*
2. **Representação de `Form`** — tabela única com `FormContext` + FKs de owner nuláveis (`pipeId`/`phaseId`/
   `databaseId`) e um Form por owner, vs tabelas por contexto. *Reco: tabela única; INV-FORM-01 cai como
   consequência de linhas distintas.* Inclui **semeadura** (lazy `getOrCreate` vs explícita) — *reco: lazy,
   sem alterar `criar` de Pipe (2.1)/Fase (2.3).*
3. **Estrutura do `Field`** — colunas fixas + `typeConfig Json` + `defaultValue Json` vs normalização por tipo.
   *Reco: `Json` para o que varia por tipo; validação por tipo no serviço; validações numéricas por tipo são
   gate da 2.5.*
4. **Opções de Seleção** — tabela `FieldOption` (id/orgId/fieldId/label/position/state) vs JSON com UUIDs
   estáveis. *Reco: tabela `FieldOption` (identidade estável + arquivamento futuro na 2.5), aceitando o custo
   de RLS.*
5. **Fronteira 2.4 × 2.5** — o que exatamente a 2.4 entrega (adicionar/listar/reordenar + atributo `state`) vs
   o que fica na 2.5 (editar/arquivar/restaurar com travas, mudança de tipo, ciclo de opções). *Reco: 2.4 =
   montagem; 2.5 = evolução segura; travas de segurança permanecem na 2.5 mesmo se arquivar "básico" for
   antecipado.*
6. **Reuso da resolução de poder da 2.3** — extrair `resolverPoder`/`exigirGerenciar` para helper
   compartilhado vs replicar o padrão. *Reco: extrair (evita divergência entre a guarda fina de Fases e a de
   Formulários), resolvendo o Formulário de Fase pelo `phase.pipeId`; sem tocar C3.*
7. **Local do módulo** — `src/pipes/forms/` (amarrado a Pipe) vs `src/forms/` (módulo de domínio reutilizável
   pelo E3). *Reco: avaliar; um módulo `forms` reutilizável favorece o contrato do E3 (AC4), com a resolução
   de poder por Pipe injetada.*
8. **Gate do Campo Arquivo** — a 2.4 entrega a função de verificação fail-closed (consumida pela 2.6) e a flag
   de capacidade (default desabilitada). *Reco: sim; sem rota de publicar nem storage (2.6/E3).*
