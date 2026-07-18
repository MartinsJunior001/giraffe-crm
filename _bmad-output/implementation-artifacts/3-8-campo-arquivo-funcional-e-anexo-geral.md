---
story_key: 3-8-campo-arquivo-funcional-e-anexo-geral
epic: 3
status: ready-for-dev
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: ALTO
baseline_commit: a definir — a Story constrói SOBRE a 3.7 MERGEADA (hoje `ready-for-dev`, em PR). Fixar o baseline no commit de merge da 3.7 no ato de abrir a implementação.
bloqueador: >-
  **BLOQUEIO DURO: a 3.7 (capacidade compartilhada de arquivos) precisa estar PRONTA e MERGEADA antes de esta Story
  entrar em implementação.** A 3.8 é o **primeiro consumidor concreto** da capacidade (junto com a 3.10 avatar); ela
  liga `Card` e `Registro` à base da 3.7 e ativa o Campo Arquivo. Enquanto a 3.7 não mergeia, `sprint-status.yaml`
  permanece `backlog` para a 3.8 (a transição de status é ato EXCLUSIVO do workflow BMAD, executado no ramo real
  quando a 3.8 abrir — ver "Pendência de sprint-status" no rodapé). Este arquivo é planejamento antecipado (Planner
  n+1): NÃO autoriza escrever código.
governanca: >-
  ADR-001 (docs/03-arquitetura/adr-001-capacidade-de-arquivos.md, v5, MERGEADA no PR #93/#94) — RATIFICADA. O
  **AC-2 da ADR é marcado literalmente "[3.8, não 3.7]"** (409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`): esta Story é a
  dona desse critério. Decisões do dono Q1/Q2/Q3 e emendas DIV-1/DIV-2 (sprint-change-proposal-2026-07-17.md) já
  aplicadas. Rastreabilidade: OQ-47 · D3.5 · INV-FORM-01 · AD-11/12/13/24/27/28/29/30. **Consome:** capacidade de
  arquivos (3.7); Form Builder/publicação (2.4/2.5/2.6); guardas `pipe-authz`/`database-authz` (2.10/3.4).
gate_arquitetura: >-
  **Ativa o Campo Arquivo (catálogo 2.4) nos TRÊS Formulários (inicial/Fase/Database), removendo a indisponibilidade
  de 2.4, e cria o ANEXO GERAL por recurso (Card e Registro).** É consumo puro da capacidade da 3.7 — **não
  reimplementa storage, scan, quarentena, veredito nem antiabuso base**. Quatro frentes: (1) **binding de
  autorização**: fornecer implementações concretas do `FileAuthzContract` da 3.7 para `resourceType=CARD` (via
  `pipe-authz`: `exigirLerCard`/`exigirOperarCard`, 2.10) e `resourceType=RECORD` (via `database-authz`:
  `exigirLerDatabase`/`exigirOperarDatabase`, 3.4), INJETADAS pelo módulo consumidor — a capacidade NUNCA importa
  authz de domínio (preserva AD-5, sem ciclo). (2) **valor do Campo `FILE` deixa de ser TEXTO** (hoje é tratado como
  `TIPOS_TEXTO` em `submission.ts`) e passa a ser **referência a `FileObject`(s) `AVAILABLE`** deste recurso/submissão
  (único ou múltiplo por `typeConfig`), no JSONB `valores` por `Field.id` (AD-11, sem tabela de valores). (3) **gate
  de consumo (AC-2 da ADR)**: `FormVersion` publicada com Campo Arquivo sob `FILE_UPLOAD_ENABLED=false` ao ser
  SUBMETIDA → **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`** (nunca erro opaco, nunca aceite silencioso). (4) **canal
  público**: Campo Arquivo publicado no `POST /public/forms/:publicId/submit` (2.8) com limites do canal (por
  arquivo/por Campo/por submissão), rate limit (chave em `<orgId>`), validação magic-bytes, arquivo indisponível até
  verificar — **sem anexo geral público, sem download público**. **Read-only sob arquivamento** (Card/Registro): ver/
  baixar seguem; upload/substituir/remover → 409 (padrão 2.11/3.4). **Substituir arquivo único não apaga
  silenciosamente** o anterior e emite evento (`CardHistory`/`RecordHistory`, append-only, mesma transação). Guard C3
  congelado. **FORA:** anexo em Tarefa/Solicitação (E5); anexo em e-mail (E6); avatar (3.10); cota agregada por tenant
  (DEB-1, Fase 2); limites por Org/Formulário.
---

# Story 3.8 — Campo Arquivo funcional e anexo geral (Card/Registro)

**As a** usuário autorizado de um Pipe/Database,
**I want** anexar arquivos aos meus Cards e Registros — por Campo Arquivo do Formulário e como anexo geral do recurso —,
**So that** os arquivos fiquem seguros, verificados e com o mesmo controle de acesso do recurso, sem acesso cruzado.

**Status: ready-for-dev (planejamento antecipado — BLOQUEADO pela 3.7 não mergeada).** Oitava Story do **Épico 3**,
risco **ALTO** — é o **primeiro consumidor concreto** da capacidade compartilhada de arquivos (3.7), ligando `Card`
(via `pipes/`) e `Registro` (via `databases/`) à base segura e **ativando o tipo Arquivo** nos três Formulários. A
3.7 constrói a máquina (storage, quarentena, ClamAV fail-closed, dois SHA, antiabuso); a 3.8 **conecta** essa máquina
aos recursos reais e ao canal público. Tudo governado pela **ADR-001 ratificada** — que já reserva o **AC-2
explicitamente para esta Story**.

## Invariantes do dono (não erodir)

- **INV-3.8-01 (consumo, não reimplementação):** a 3.8 **consome** a capacidade da 3.7 — não recria storage, scan,
  veredito, quarentena, expurgo nem o antiabuso base. Toda a máquina de segurança de arquivo é da 3.7; a 3.8 acrescenta
  **binding de recurso**, **valor de Campo referencial**, **gate de consumo** e **limites do canal público**.
- **INV-3.8-02 (permissão herda do recurso — INV-FILE-03):** ver/baixar arquivo = **leitura** do recurso; enviar/
  substituir/remover **lógico** = **edição/operação** do recurso. **Card:** `exigirLerCard`/`exigirOperarCard` (2.10).
  **Registro:** `exigirLerDatabase`/`exigirOperarDatabase` (3.4). A capacidade **não inventa papéis próprios**; o
  binding é injetado pelo consumidor. Sem acesso → **404 não-enumerante**; ler-sem-operar ao mutar → **403**.
- **INV-3.8-03 (sem acesso cruzado mesmo conhecendo a chave — INV-FILE-02 / T2):** acesso ao recurso A **nunca** libera
  arquivo de recurso B, mesma Org inclusive. A checagem é por `(resourceType, resourceId)` resolvido **pela camada
  autorizada** — **RLS é necessária e insuficiente** (dois usuários da mesma Org passam por ela; quem nega é a guarda
  fina do recurso). Um `fileId` só é referenciável na submissão se pertencer a **este** recurso/finalidade e estiver
  `AVAILABLE` — referenciar `fileId` de outro recurso é contorno de autorização e é **negado**.
- **INV-3.8-04 (gate de consumo fail-closed — AC-2 da ADR, AD-28):** com `FILE_UPLOAD_ENABLED` ausente/≠`true`, toda a
  superfície de Campo Arquivo/anexo responde indisponibilidade honesta; uma `FormVersion` **já publicada** com Campo
  Arquivo, ao ser **usada** (submissão interna/pública/criação de Registro), retorna **409
  `CAPACIDADE_ARQUIVO_INDISPONIVEL`** — nunca erro opaco, nunca aceite silencioso. A 3.8 **satisfaz** o gate existente
  (`podePublicarComArquivo`/`tipoArquivoDisponivel` em `file-gate.ts`), **não o reescreve**.
- **INV-3.8-05 (entrega sempre sob sessão — INV-FILE-02 / Opção A):** download **sempre** por stream autenticado sob a
  sessão, com acesso ao recurso revalidado a cada requisição; **sem URL pré-assinada, sem link público permanente**; só
  `AVAILABLE` baixa. **No canal público não há download** — o submitter público faz upload mas não tem sessão; a
  entrega é do lado interno, para um usuário autenticado com acesso ao Card convertido.
- **INV-3.8-06 (substituir não apaga silenciosamente):** substituir um Campo Arquivo único gera **evento** no Histórico
  do recurso (`CardHistory`/`RecordHistory`, append-only, **mesma transação**) e o anterior só recebe soft-delete
  **após** o novo virar `AVAILABLE` (ADR §7) — nunca antes, senão uma falha de scan perderia os dois.
- **INV-3.8-07 (read-only sob arquivamento):** sob Card/Registro **arquivado**, arquivos existentes seguem
  visualizáveis/baixáveis (leitura); upload/substituição/remoção → **409** (coerente com 2.11/3.4/D1). A guarda de
  edição compõe com o estado de ciclo de vida do recurso.
- **INV-3.8-08 (sem exclusão física; PII protegida — LGPD):** remoção de arquivo é **lógica** (`state`), seguida do
  expurgo físico do binário pela política da 3.7; **nenhum GRANT de DELETE** de linha. `nomeOriginal` é PII: nunca em
  log/evento crus (só metadado/`fileId`/referência interna segura — ADR §11; a projeção/mascaramento do Histórico é
  2.17/3.6).
- **INV-3.8-09 (append-only preservado onde vale):** `CardHistory`/`RecordHistory`/`FileScan` continuam append-only
  (GRANT só `SELECT/INSERT`). A 3.8 **amplia a taxonomia** de eventos, sem tocar o read-side (2.17/3.6).
- **Guard C3 congelado:** `@Requer(...)` grosso + guarda fina no serviço (DBT-AUTHZ-01); sem tocar `kernel/authz/ability.ts`.
- **Sem antecipar escopo (AD-11):** SEM anexo em Tarefa/Solicitação (E5), anexo de e-mail (E6), avatar (3.10), cota por
  tenant (DEB-1), limites por Org/Formulário.

## Escopo (do épico, congelado — epics.md §"Story 3.8", linhas ~1188-1204)

**Dentro:**
- **Ativar o Campo Arquivo** (catálogo 2.4/2.5) nos Formulários **inicial / Fase / Database**, removendo a
  indisponibilidade de 2.4 — o mesmo builder, sem segundo mecanismo de upload (INV-FORM-01).
- **Anexo geral** — arquivos associados ao **recurso** (Card ou Registro), **não** como valor de Campo. Herança de
  permissão idêntica ao Campo Arquivo.
- Campo Arquivo **único ou múltiplos**; cada arquivo carrega identidade, nome original, tipo, tamanho, estado,
  referência à submissão/alteração.
- **Substituir** arquivo único **não apaga silenciosamente** o anterior e **gera evento**.
- **Card/Registro arquivado:** arquivos existentes visualizáveis/baixáveis; upload/substituição/remoção bloqueados.
- **Formulário público recebe arquivo SÓ via Campo Arquivo publicado — não há anexo geral público.** Limites do canal
  público: por arquivo; quantidade máx. por Campo e por submissão; total por submissão; rate limit e antiabuso;
  validação server-side independente da extensão declarada; arquivo indisponível até concluir a verificação; nenhuma
  URL pública permanente; nenhum contorno de autorização por upload direto.

**Fora (Stories futuras / fora da Fase 1):**
- Anexo geral em Tarefa/Solicitação (E5); anexo em e-mail (E6); avatar (3.10).
- Cota agregada por tenant (`FILE_MAX_TENANT_BYTES` — DEB-1, Fase 2); limites por Org/Formulário.
- Read-side/projeção/mascaramento dos eventos de arquivo no Histórico (2.17 Card / 3.6 Registro — a 3.8 só **emite**).
- O provedor de storage/scanner de staging/produção (DEB-2 — não bloqueia a 3.8 em dev/CI: gate default `false`).

## Acceptance Criteria

- **AC1 — Campo Arquivo funcional (remove indisponibilidade de 2.4):** com a capacidade habilitada
  (`FILE_UPLOAD_ENABLED=true` + 3.7 no ar), um Formulário com Campo Arquivo publica e o Campo é **funcional** nos três
  contextos (inicial/Fase/Database); a indisponibilidade de 2.4 deixa de se aplicar. [epics 3.8 AC#1]
- **AC2 — gate de consumo (ADR AC-2, "[3.8, não 3.7]"):** `FILE_UPLOAD_ENABLED=false` + `FormVersion` **publicada**
  com Campo Arquivo, ao ser SUBMETIDA (submissão interna 2.7, pública 2.8 ou criação de Registro 3.4) ⇒ **409
  `CAPACIDADE_ARQUIVO_INDISPONIVEL`**, nunca erro opaco nem aceite silencioso. **Mutação obrigatória:** deletar a
  função de gate ⇒ o teste fica vermelho.
- **AC3 — valor do Campo `FILE` é referência, não texto:** o valor submetido a um Campo `FILE` é validado como
  **`fileId`(s)** de `FileObject` `AVAILABLE`, mesma Org, **vinculado a ESTE recurso/finalidade** — não string livre;
  único ou array conforme `typeConfig.multiplo` congelado no snapshot; allowlist anti-mass-assignment mantida (chave
  desconhecida → 400); ausência permitida quando o Campo não é `required` (2.15). Referenciar `fileId` de outro
  recurso ou ainda `QUARANTINED` → **rejeitado** (400/409, ver Q1). Regressão de E2/E3 (2.7/2.8/3.4) verde.
- **AC4 — anexo geral por recurso (herança de permissão):** um usuário com **edição** do Card/Registro adiciona/remove
  anexo geral (associado ao recurso, não a um Campo); ver/baixar = **leitura**; o arquivo herda a autorização do
  recurso; sem acesso ao recurso → **404 não-enumerante** mesmo conhecendo a chave (INV-3.8-03). **Não há anexo geral
  público.**
- **AC5 — substituição sem perda silenciosa:** substituir um Campo Arquivo único gera **evento** de substituição no
  Histórico do recurso (mesma transação) e o anterior só sai **após** o novo virar `AVAILABLE`; o binário anterior
  segue o expurgo da 3.7. [epics 3.8 AC#2]
- **AC6 — canal público (Campo Arquivo publicado):** o `POST /public/forms/:publicId/submit` recebe arquivos SÓ via
  Campo Arquivo publicado, aplicando **limite por arquivo / por Campo / por submissão / total por submissão**, **rate
  limit** (chave em `<orgId>`, compõe com o de IP+publicId da 2.8), **validação magic-bytes** (independente da extensão),
  **arquivo indisponível até verificar** (não converte referenciando `QUARANTINED`), **sem URL pública permanente** e
  **sem contorno de autorização por upload direto**. **E não há anexo geral público.** [epics 3.8 AC#3/AC#4/`And`]
- **AC7 — read-only sob arquivamento:** sob Card/Registro arquivado, ver/baixar seguem; upload/substituição/remoção →
  **409**. Alinhar a semântica de "recurso ativo" (Q7: pai Pipe/Database arquivado também bloqueia?).
- **AC8 — isolamento e autorização (cross-tenant + cross-recurso):** RLS prova arquivo de outra Org invisível;
  cross-recurso intra-tenant (acesso ao A, não ao B) → **404**, com a autorização de aplicação neutralizada para provar
  a guarda fina (não só a RLS). `orgId`/`bucketKey`/`resourceId` do cliente nunca confiados. Guard C3 congelado.
- **AC9 — eventos de Histórico sem PII:** `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` (Card e Registro) emitidos na
  mesma transação da mutação, **sem `nomeOriginal` cru** — só metadado/`fileId`/referência interna segura; append-only
  preservado.
- **AC10 — sem antecipar escopo:** sem anexo E5/E6, sem avatar, sem cota por tenant, sem limites por Org/Formulário;
  sem read-side de Histórico de arquivo. Migration/GRANT **mínimos** (ver Q2 — idealmente nenhum GRANT novo além do da 3.7).

## Tasks / Subtasks

- [ ] **T001 — Gate pré-código:** `pre-implementation-check` + `context7-check` (SDK S3/MinIO, ClamAV, Prisma 6.19.x,
  NestJS 11 — versões efetivamente instaladas após a 3.7 mergeada). Confirmar que a 3.7 está **mergeada** e fixar o
  `baseline_commit`. Registrar em `gates/3-8/T001-pre-code-gate.md`. **(AC: pré-requisito)**
- [ ] **T002 — Binding de autorização por recurso (`FileAuthzContract`).** Implementar a porta da 3.7 para
  `resourceType=CARD` (via `pipe-authz`: leitura=`exigirLerCard`, edição=`exigirOperarCard`) e `resourceType=RECORD`
  (via `database-authz`: leitura=`exigirLerDatabase`, edição=`exigirOperarDatabase`), **injetados em `FilesModule`
  pelos módulos consumidores** (`PipesModule`/`DatabasesModule`) — a capacidade não importa authz de domínio (AD-5, sem
  ciclo). Deny-by-default; 404 não-enumerante; T2 (sem acesso cruzado). **(AC: 2, 4, 8)**
- [ ] **T003 — Valor do Campo `FILE` como referência (substituir tratamento textual).** Remover `FILE` de `TIPOS_TEXTO`
  em `pipes/cards/submission.ts`; validar `fileId`(s) (`AVAILABLE`, mesma Org, vinculado ao recurso/finalidade); suportar
  único/múltiplo via `typeConfig.multiplo` (congelado no snapshot — 2.6/AD-12). Propagar aos TRÊS caminhos que reusam
  `submission.ts`: submissão interna (2.7), pública (2.8) e criação/edição de Registro (3.4). Allowlist mantida.
  **Regressão de E2/E3 verde. (AC: 3)** — **maior risco de escopo (R1).**
- [ ] **T004 — Gate de consumo (AC-2 da ADR).** Consumir `FILE_UPLOAD_ENABLED` no ponto de submissão: capacidade
  desabilitada + `FormVersion` publicada com Campo Arquivo ⇒ **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`**. Confirmar que
  `podePublicarComArquivo`/`tipoArquivoDisponivel` (`file-gate.ts`) já liberam com a flag ligada (sem reescrever o
  gate). **Teste com mutação (deletar o gate → vermelho). (AC: 2)**
- [ ] **T005 — Anexo geral (Card e Registro).** Modelagem decidida no plan (Q2 — `purpose` em `FileObject` vs. JSONB;
  enum `resourceType` vs. string validada). Rotas de adicionar/listar/remover lógico anexo, herança de permissão
  (edição para mutar, leitura para ver/baixar), download stream sob sessão. **(AC: 4)**
- [ ] **T006 — Substituição sem perda silenciosa.** Fluxo de substituir arquivo único: novo `QUARANTINED` → promoção
  `AVAILABLE` → soft-delete do anterior → evento `FILE_REPLACED` **na mesma transação** referenciando ambos. **(AC: 5)**
- [ ] **T007 — Read-only sob arquivamento.** Bloquear upload/substituição/remoção quando Card/Registro (e, se decidido
  em Q7, pai Pipe/Database) arquivado → 409; manter ver/baixar. **(AC: 7)**
- [ ] **T008 — Canal público.** Ativar Campo Arquivo no `POST /public/forms/:publicId/submit` (2.8): limites por
  arquivo/Campo/submissão/total (Q4 — novas variáveis de ambiente com faixa validada no `getEnv()`), rate limit
  (`kernel/antiabuso/`, chave em `<orgId>`, compondo com IP+publicId), magic-bytes, indisponível até verificar, **sem
  anexo geral público, sem download público**. Testes de abuso. **(AC: 6)**
- [ ] **T009 — Eventos de Histórico.** Emitir `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` em `CardHistory`/
  `RecordHistory` (append-only, mesma transação), sem PII; alinhar taxonomia com a leitura 2.17/3.6 (Q6). **(AC: 9)**
- [ ] **T010 — Migration aditiva (se necessária).** Enum/valores de `resourceType` (`CARD`/`RECORD`) e/ou discriminador
  `purpose` em `FileObject`, **só se** a modelagem exigir (Q2). Idealmente **nenhum GRANT novo** além do da 3.7; se
  houver coluna nova, `migration-check` + fase vermelha de RLS/GRANT provada (`*-rls`) + rollback drill. **(AC: 10)**
- [ ] **T011 — Exibição do Campo `FILE` na leitura (3.5), se decidido (Q5).** Coluna exibível (nome/estado + link de
  download stream) mantendo-se **não-filtrável/ordenável**; ou o filtro `Arquivo possui/não possui`. Alinhar com a nota
  do CLAUDE.md (3.5) que hoje mantém `FILE` gated no filtro. **(AC: opcional, Q5)**
- [ ] **T012 — Testes RLS (PostgreSQL real):** cross-tenant invisível; cross-recurso 404 com autz de aplicação
  neutralizada; GRANT escopo provado por mutação. **(AC: 8)**
- [ ] **T013 — Testes HTTP + integração real (PostgreSQL + MinIO + ClamAV):** AC1–AC9; suíte em SÉRIE no CI
  (`--no-file-parallelism`). Um mock de scanner não prova fail-closed (ADR AC-28). **(AC: 1-9)**
- [ ] **T014 — Regressão E2/E3:** 2.4/2.5/2.6 (builder/publicação), 2.7/2.8 (submissão), 3.3/3.4/3.5 (Database/Registro/
  leitura) verdes. **(AC: 3, 10)**
- [ ] **T015 — Atualizar `CLAUDE.md`** (bloco de estado 3.8: Campo Arquivo funcional; anexo geral; binding do
  `FileAuthzContract`; valor de `FILE` referencial; gate de consumo 409; canal público; eventos de arquivo). **(AC: —)**
- [ ] **T016 — Gates finais:** `security-check`, `lgpd-check` (PII do nome de arquivo), `observability-check`,
  `migration-check` (se T010), `backup-check` (se aplicável). **(AC: —)**
- [ ] **T017 — Revisão adversarial CRÍTICA** (Segurança; Arquitetura/RLS; Edge Cases; Aceite) — CRITICAL/HIGH com
  regressão e mutação obrigatórias. **(AC: todos)**
- [ ] **T018 — `commit-check`** → PR → CI (4 jobs verdes) → merge (`--no-ff`) → closure BMAD. **(AC: —)**

## Dev Notes

### A fronteira 3.7 × 3.8 — linha por linha
A 3.7 constrói a **base desacoplada**; a 3.8 é o **primeiro consumidor**. Tabela de responsabilidade (do brief):

| Tema | 3.7 (base) | 3.8 (esta Story) |
|---|---|---|
| Storage/buckets/chave opaca `<orgId>/<uuid>` | `StoragePort` + MinIO | consome |
| `FileObject` (mutável) + `FileScan` (append-only) | cria | referencia por `fileId`; **liga ao recurso** |
| Upload/download stream sob sessão (Opção A) | rotas + porta `FileAuthzContract` | **injeta o binding** de Card/Registro |
| Veredito fail-closed (ClamAV, 2×SHA, quarentena) | toda a máquina | consome; upload só pós-`CLEAN` |
| Antiabuso base (rate limit + `ScanSlot`) | `kernel/antiabuso/` (tech story) | consome; **+ limites do canal público** |
| Gate `FILE_UPLOAD_ENABLED` | declara constante+função (puro) | **consome** → 409 `CAPACIDADE_ARQUIVO_INDISPONIVEL` |
| Ativar tipo `FILE` no builder/publicação | — | **remove a indisponibilidade de 2.4** |
| Anexo geral (associado ao recurso) | — | **cria** para Card e Registro |
| Limites do canal público | — | **cria** |

### Ligando o `FileAuthzContract` aos recursos reais (INV-FILE-03)
A 3.7 define a **porta** `FileAuthzContract` e um binding de teste, mas **não conhece** `pipe-authz`/`database-authz`
(desacoplamento por decisão — ajuste 6 / ADR §3). A 3.8 injeta os bindings concretos, respeitando a herança:

| Operação | Permissão no recurso | Card (`pipes/`) | Registro (`databases/`) |
|---|---|---|---|
| ver / baixar | leitura | `exigirLerCard` (2.10) | `exigirLerDatabase` (3.2/3.4) |
| enviar / substituir / remover lógico | edição/operação | `exigirOperarCard` (2.10) | `exigirOperarDatabase` (3.4) |

O binding vive **no consumidor**, injetado em `FilesModule`; `files/` só chama a porta (não importa authz de domínio →
preserva AD-5, sem ciclo de módulo). Formato exato da porta é **decisão de clarify da própria 3.7 (Q2)** — a 3.8
**alinha-se** ao que a 3.7 congelar. Proposta mínima: `podeLer(ctx, resourceType, resourceId)` /
`podeEditar(ctx, resourceType, resourceId)`, deny-by-default, 404 não-enumerante.

### GAP CRÍTICO (R1) — valor do Campo `FILE` é hoje TEXTO
Em `pipes/cards/submission.ts`, `FILE` está no conjunto `TIPOS_TEXTO` — validado como string curta. É stub coerente
com o gate (o Campo nunca chega a produção com capacidade ligada). A 3.8 **substitui** por validação de **referência**:
o valor passa a ser `fileId` (único) ou `fileId[]` (múltiplo, por `typeConfig.multiplo`), de `FileObject` `AVAILABLE`,
mesma Org, **vinculado a este recurso/finalidade** (não `fileId` arbitrário de outro recurso — senão vira contorno de
autorização por referência, R2). O mesmo `submission.ts` é reusado por **três** caminhos (2.7 interno, 2.8 público, 3.4
Registro) — a mudança toca os três e a leitura 3.5. **É o maior risco de escopo:** regressão de E2/E3 precisa ficar
verde.

### Gate de consumo — o AC-2 é DESTA Story (ADR §Rollback + AC-2)
`FormVersion` é **imutável** (runtime só `SELECT`/`INSERT`), então um Formulário publicado com Campo Arquivo
**sobrevive** a um rollback de `FILE_UPLOAD_ENABLED`. A ADR decide: a versão conserva o Campo e **seu uso retorna
indisponibilidade explícita** — 409 `{ motivo: 'CAPACIDADE_ARQUIVO_INDISPONIVEL' }`. A ADR marca este AC literalmente
**"[3.8, não 3.7]"**: na 3.7 ele é intestável (sem consumidor de Campo Arquivo, passaria por vacuidade inclusive com o
gate deletado). Precedente exato: 2.4 declara `podePublicarComArquivo`, 2.6 consome; aqui a 3.7 declara o gate, a 3.8
consome no ponto de submissão. **A 3.8 satisfaz o gate — não o reescreve.**

### Anexo geral vs. Campo Arquivo — modelagem (decisão de plan, Q2)
Campo Arquivo = **valor de um `Field`** (referência no JSONB `valores` por `Field.id`). Anexo geral = do **recurso**,
independente do Formulário. Duas modelagens possíveis: (a) discriminador `purpose ∈ {FIELD, ATTACHMENT}` +
`fieldId?` em `FileObject`; (b) Campo Arquivo mora só no JSONB e o anexo geral só na linha `FileObject`. Preferir a
**mínima** (AD-11 "sem tabela de valores por Campo") sem erodir `Card ≠ Registro`. `FileObject.resourceType/resourceId`
já é **imutável** na 3.7 (sem UPDATE) → recurso não transferível **garantido pelo banco**, o que casa com o vínculo
estável que a 3.8 precisa.

### Canal público — arquivo só via Campo Arquivo publicado (sem anexo geral, sem download público)
O canal público (2.8) recebe arquivos **exclusivamente** via Campo Arquivo de Formulário inicial **publicado**. A 3.8
acrescenta os limites do **consumidor/canal** (a 3.7 só tem `FILE_MAX_PER_RESOURCE=10` genérico): máx. arquivos por
Campo, por submissão, total por submissão; rate limit compõe com o de IP+publicId (chave binda em `<orgId>` — ADR §12,
HIGH-2); validação magic-bytes (INV-FILE-05); arquivo indisponível até verificar (não converte referenciando
`QUARANTINED`); **sem URL pública permanente**; **sem contorno por upload direto** (bytes atravessam a API — Opção A).
**O submitter público NÃO baixa** (sem sessão) — a entrega sob sessão é do lado interno pós-conversão (Q8).

### Read-only sob arquivamento — padrão da base
Coerente com 2.11 (Card) / 3.4 (Registro) / D1 (Database): baixar (`AVAILABLE`) segue; upload/substituir/remover → 409
(`{ motivo: 'RECURSO_ARQUIVADO' }`). Confirmar em Q7 se o **pai** arquivado (Pipe/Database) também bloqueia — a 3.9
define "recurso ativo" como Card/Registro ativos **e** pais não arquivados; a 3.8 deve alinhar por consistência.

### Eventos de Histórico — a 3.8 EMITE, o read-side é 2.17/3.6
`CardHistory`/`RecordHistory` (append-only, GRANT `SELECT/INSERT`) ganham `FILE_ATTACHED`/`FILE_REPLACED`/
`FILE_REMOVED` na **mesma transação** da mutação (`definirContextoOrg`, padrão 2.10/2.11/3.4). Sem PII (só metadado/
`fileId`/referência interna segura — ADR §11). A **projeção/mascaramento** é 2.17 (Card) / 3.6 (Registro) — a 3.8 não
toca o read-side.

### Riscos
- **R1 — valor do Campo `FILE` é hoje texto** (`submission.ts`). Migrar toca 2.7/2.8/3.4 + leitura 3.5. Regressão verde.
- **R2 — `fileId` de outro recurso** = contorno de autorização. Provar que o `fileId` pertence a **este** recurso/
  finalidade e está `AVAILABLE` (não só "existe na Org").
- **R3 — download público sem sessão:** garantir que não há caminho de leitura pública (Opção A — entrega sob sessão).
- **R4 — atomicidade da substituição:** anterior só sai após o novo `AVAILABLE`; evento na mesma transação.
- **R5 — modelagem Campo × anexo geral:** coluna nova vs. JSONB — escolher a mínima sem erodir `Card ≠ Registro`.

### Project Structure Notes
- Consumidor Card: `apps/api/src/pipes/` (subdomínio de arquivos de Card — provável `pipes/cards/files/` ou binding em
  `pipes/`); consumidor Registro: `apps/api/src/databases/records/files/` (ou binding em `databases/`).
- Capacidade: `apps/api/src/files/` (da 3.7) — **não** editar regra de negócio ali além do contrato de porta.
- Antiabuso: `apps/api/src/kernel/antiabuso/` (da tech story pré-requisito da 3.7) — o canal público **consome**.
- Testes em `apps/api/test/` (fora de `src/`), padrão `*-rls`/`*-http`; integração real (PostgreSQL + MinIO + ClamAV),
  suíte em SÉRIE no CI.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.8] — escopo/AC congelados (linhas ~1188-1204); §3.7 (~1170-1186).
- [Source: docs/03-arquitetura/adr-001-capacidade-de-arquivos.md] — governança; **AC-2 "[3.8, não 3.7]"** (§Rollback +
  Critérios de aceite nº 2); §3 (portas/consumidores); §4/§8 (Opção A upload/download); §12 (antiabuso, chave `<orgId>`).
- [Source: _bmad-output/implementation-artifacts/3-7-capacidade-compartilhada-de-arquivos.md] — INV-FILE-01..06;
  `FileObject`/`FileScan`; `FileAuthzContract` (clarify Q2 da 3.7).
- [Source: _bmad-output/implementation-artifacts/tooling/plano-3-8-campo-arquivo.md] — brief antecipado (commit e6beb15).
- [Source: apps/api/src/pipes/cards/submission.ts] — `FILE` em `TIPOS_TEXTO` (R1, a substituir).
- [Source: apps/api/src/pipes/forms/file-gate.ts / snapshot.ts] — `podePublicarComArquivo`/`tipoArquivoDisponivel` (gate a satisfazer).
- [Source: apps/api/src/pipes/pipe-authz.ts / databases/database-authz.ts] — `exigirLer/OperarCard`, `exigirLer/OperarDatabase`.

## Questões para o Spec Kit (clarify)

- **Q1 — Formato do valor do Campo `FILE` no JSONB + `QUARANTINED`:** `fileId` único e `fileId[]` para múltiplo? A
  cardinalidade vive em `typeConfig.multiplo`, congelada no snapshot (AD-12)? Submissão referenciando `fileId` ainda
  `QUARANTINED` → **rejeita 409** ou aceita e segura? **Inclinação:** rejeitar (fail-closed; o arquivo só é referenciável
  quando `AVAILABLE`).
- **Q2 — Modelagem do anexo geral + `resourceType`:** discriminador `purpose ∈ {FIELD, ATTACHMENT}` (+ `fieldId?`) em
  `FileObject`, ou Campo Arquivo só no JSONB e anexo geral só na linha? Enum `resourceType` (`CARD`/`RECORD`) no schema
  ou string validada por allowlist no consumidor? **Inclinação:** a modelagem mínima que evite GRANT novo (AD-11); a 3.7
  já nasce com `resourceType/resourceId` genérico.
- **Q3 — `FileAuthzContract` — assinatura exata:** alinhar com a Q2 da própria 3.7. Onde os bindings de Card/Registro
  são registrados (módulo consumidor injeta em `FilesModule` via provider token)?
- **Q4 — Limites do canal público — valores:** máx. arquivos por Campo, por submissão, total por submissão — novas
  variáveis de ambiente com faixa validada no `getEnv()` (como as da 3.7)? Valores recomendados no `.env.example`?
- **Q5 — Leitura do Campo `FILE` na tabela de Registros (3.5):** a coluna passa a ser **exibível** (nome/estado +
  download) mantendo-se **não-filtrável/ordenável**? O filtro `Arquivo possui/não possui` entra na 3.8 ou fica para
  depois? (CLAUDE.md diz 3.7/3.8; o épico 3.5 o lista como futuro — **inclinação:** exibir sim, filtrar não, nesta Story.)
- **Q6 — Taxonomia de eventos exata:** `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` em `CardHistory`/`RecordHistory`?
  Alinhamento com a projeção/mascaramento da 3.6 e a leitura da 2.17.
- **Q7 — Pai arquivado:** Pipe/Database arquivado (não só o Card/Registro) também bloqueia novos uploads no filho?
  (Alinhar com a definição de "recurso ativo" da 3.9 — **inclinação:** sim, por consistência.)
- **Q8 — Download no canal público:** confirmar que o submitter público **não** baixa (sem sessão); a entrega sob sessão
  é só do lado interno pós-conversão (Card).

## Change Log

| Data | Mudança |
|------|---------|
| 2026-07-18 | Story criada (E3, Wave 4) por planejamento antecipado (Planner n+1) a partir de `epics.md` (Story 3.8), da ADR-001 ratificada (AC-2 "[3.8, não 3.7]"), do story file da 3.7 (base consumida) e do brief antecipado (commit e6beb15). Risco **ALTO** (primeiro consumidor da capacidade de arquivos; substitui o tratamento textual do Campo `FILE` por referência; canal público). Escopo **congelado**: ativar Campo Arquivo (3 Formulários) + anexo geral (Card/Registro) + gate de consumo 409 + canal público. **BLOQUEIO DURO:** depende da **3.7 mergeada** (hoje `ready-for-dev`, em PR). Status do arquivo → **ready-for-dev**; `sprint-status.yaml` **NÃO** movido (ver Pendência abaixo). |

## Pendência de sprint-status (registrada, NÃO resolvida por este planejamento)

**`sprint-status.yaml` permanece `backlog` para `3-8-campo-arquivo-funcional-e-anexo-geral`.** Motivos:
1. **A transição de status é ato EXCLUSIVO do workflow BMAD** (CLAUDE.md / Constitution XI) — este planejamento foi
   feito num **worktree isolado que não será mergeado** (sem push/PR), então mover o status aqui não teria efeito
   autoritativo e **divergiria** do ramo real.
2. **A 3.8 está BLOQUEADA pela 3.7 não mergeada** — abri-la como `ready-for-dev` no tracking autoritativo antes de a
   dependência dura fechar contradiz o sequenciamento (o próprio brief exige "sprint-status intocado até a 3.7 estar
   pronta e mergeada").
3. **Ambiente Windows sem Python** — o passo de finalização do workflow (`resolve_customization.py`) não roda; a
   resolução de customização foi feita manualmente (sem overrides), mas a transição autoritativa de status deve ser
   executada pelo workflow no **ramo real** quando a 3.8 for efetivamente aberta (3.7 mergeada).

**Ação futura:** ao mergear a 3.7 e abrir a 3.8 no ramo `story/3-8-...`, rodar `bmad-create-story` (ou o passo de
finalização) para mover `3-8-...` de `backlog → ready-for-dev` de forma autoritativa. Este story file já está pronto
como insumo.

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
