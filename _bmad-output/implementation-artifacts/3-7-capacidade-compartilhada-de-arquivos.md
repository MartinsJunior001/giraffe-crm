---
story_key: 3-7-capacidade-compartilhada-de-arquivos
epic: 3
status: ready-for-dev
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: ALTO
baseline_commit: 04e8b21
governanca: ADR-001 (docs/03-arquitetura/adr-001-capacidade-de-arquivos.md, v5, MERGEADA no PR #93/#94) — RATIFICADA. Decisões do dono Q1/Q2/Q3 e emendas DIV-1/DIV-2 (sprint-change-proposal-2026-07-17.md) já aplicadas. AD-27/AD-28/AD-30/AD-24/AD-4/AD-5/AD-6/AD-10/AD-32.
gate_arquitetura: >-
  **Capacidade compartilhada de arquivos, fail-closed (AD-28), DESACOPLADA de Card e Registro** (ajuste 6 do épico — os
  consumidores integrados são a 3.8/3.10, não requisitos-base deste serviço). Gate único **`FILE_UPLOAD_ENABLED`** (já existe
  em `kernel/config/env.ts`, default `false`; ver ADR §10) — desabilitado ⇒ toda a superfície responde indisponibilidade
  honesta. **Duas entidades org-scoped** (ADR §2): **`FileObject`** (ciclo de vida MUTÁVEL — `state`, `nomeOriginal` PII,
  `resourceType`/`resourceId`, ponteiros de bucket) e **`FileScan`** (fato apurado **APPEND-ONLY e IMUTÁVEL** — `sha256Ingest`,
  `sha256Releitura`, `tamanhoBytes`, `mimeDetectado`, `veredito`, `scannedAt`), espelhando o par mutável×imutável de
  `Form`/`FormVersion`. RLS **ENABLE+FORCE** + `WITH CHECK` no INSERT **e** UPDATE em ambas; **GRANT como fronteira**:
  `FileObject` = `SELECT/INSERT` + `UPDATE` **column-scoped** (`state`, `nomeOriginal`, `updatedAt`, `purgedAt`) **sem DELETE**;
  `FileScan` = **só `SELECT/INSERT`** (append-only, sem UPDATE/DELETE). **Entrega SEMPRE por stream autenticado sob a sessão**
  (Opção A — proxy pela API; **sem URL pré-assinada**, sem link público permanente; ADR §4/§8) — a chave interna do objeto
  **nunca** é autorização. **Isolamento cross-tenant reforçado**: chave opaca `<orgId>/<uuidv4>`, guarda de prefixo **por
  segmento** (`split('/')[0] === orgId`, nunca `startsWith`); mesmo conhecendo a chave, sem acesso ao recurso → **404
  não-enumerante**. **Verificação fail-closed** (ADR §5/§6): quarentena até aprovar; ClamAV com `AlertExceedsMax yes`
  (senão zip-bomb vira OK) + canário EICAR + `CLAMAV_DB_MAX_AGE_HOURS` (scanner cego responde OK sem base) → erro/timeout/base
  velha ⇒ **BLOCKED**; **dois SHA-256** (ingest + releitura no scan) contra troca de bytes; promoção por **CopyObject
  if-match** (ADR §5). **Antiabuso (Q2):** rate limit + **semáforo de scan** (tabela global **`ScanSlot`**) consomem o
  **`kernel/antiabuso/`** — que é EXTRAÍDO da 2.8 por uma **tech story pré-requisito** mergeada ANTES desta (a 3.7 **não**
  toca `pipes/`). **Limites (Q1):** `FILE_MAX_PER_RESOURCE = 10` (CONTAGEM), `FILE_MAX_BYTES` por arquivo, allowlist de tipos
  por **magic bytes** (Q3 — `.txt/.csv/.json` FORA; bloquear executáveis/scripts). **MinIO/ClamAV só em override dev/CI** —
  **nunca** adicionados ao host compartilhado com o Chatwoot (AD-32). Expurgo físico após remoção lógica conforme retenção
  (LGPD, ADR §9). **FORA:** Campo Arquivo funcional e anexo geral por recurso (3.8); avatar (3.10); limites por Org/Formulário.
---

# Story 3.7 — Capacidade compartilhada de arquivos

**As a** plataforma,
**I want** uma capacidade única e fail-closed de arquivos,
**So that** Campos Arquivo, anexos e avatares sejam seguros e reutilizáveis, sem acesso cruzado.

**Status: ready-for-dev.** Sétima Story do **Épico 3**, risco **ALTO** — estabelece, **uma única vez**, a base segura de
arquivos reutilizada por vários recursos (E5 anexos de Tarefa/Solicitação, E6 anexos de e-mail, avatar 3.10). É
**infraestrutura compartilhada, DESACOPLADA de Card e Registro** (ajuste 6): Card e Registro são **consumidores
integrados em 3.8**, não requisitos-base deste serviço. Tudo governado pela **ADR-001 ratificada** (v5, PR #93) — este
arquivo é o guia de implementação; a ADR é a fonte de verdade técnica. **Gate AD-28 (`FILE_UPLOAD_ENABLED`) obrigatório:
desabilitado por default, a capacidade permanece indisponível de forma honesta.**

> **Pré-requisito bloqueante (Q2):** a extração do primitivo antiabuso (rate limiter atômico da 2.8) para
> `apps/api/src/kernel/antiabuso/` é uma **tech story separada** que **precede e é mergeada antes** desta Story. A 3.7
> **consome** `kernel/antiabuso/` já extraído (rate limit + o novo semáforo `ScanSlot`) e **não toca `pipes/`**. Ver
> "Sequenciamento" nas Dev Notes.

## Invariantes do dono (não erodir)

- **INV-FILE-01 (fail-closed é do banco e do gate, não da aplicação):** com `FILE_UPLOAD_ENABLED` ausente/≠`true`, toda a
  superfície de arquivos responde indisponibilidade honesta (nenhum upload, nenhuma promoção, nenhum download). Um arquivo
  **em quarentena** (sem `FileScan` com veredito `CLEAN`) **nunca** é baixável nem associável como disponível. Erro, timeout
  ou indisponibilidade da verificação ⇒ **bloqueio** (nunca "passa por omissão"). [Épico 3.7 AC#1; ADR §5/§6/§7]
- **INV-FILE-02 (sem acesso cruzado mesmo conhecendo a chave):** buckets **privados**; a chave interna do objeto **nunca** é
  autorização; entrega **sempre** por stream autenticado sob a sessão, vinculado ao usuário, ao recurso e à finalidade
  (Opção A). Sem acesso ao recurso → **404 não-enumerante** (não confirma a existência do arquivo). Guarda de tenant por
  **segmento** de prefixo, nunca `startsWith`. [Épico 3.7 AC#2/AC#3; ADR §4/§8; INV isolamento-mãe]
- **INV-FILE-03 (permissão herda do recurso):** ver/baixar = **leitura** do recurso; enviar/substituir/remover **lógico** =
  **edição** do recurso. A capacidade **não inventa** papéis próprios; acesso a um recurso **não** libera arquivos de recursos
  relacionados. Como a 3.7 é desacoplada, o **contrato de autorização** é injetado pelo consumidor (3.8/3.10) — a 3.7 define a
  **porta** (`FileAuthzContract`), não a política de um recurso concreto. [Épico 3.7 Escopo; ADR §3]
- **INV-FILE-04 (imutabilidade do fato apurado é do banco):** `FileScan` é **append-only** — GRANT só `SELECT/INSERT`, sem
  UPDATE/DELETE. O veredito de segurança, os dois hashes e o tamanho/mime detectado, uma vez escritos, não mudam. `FileObject`
  evolui só nas colunas de ciclo de vida (UPDATE column-scoped). **Sem exclusão física de linha** em runtime (sem GRANT de
  DELETE); remoção é **lógica** (`state`), seguida de **expurgo físico do binário** conforme retenção. [ADR §2/§7/§9]
- **INV-FILE-05 (validação server-side independente do cliente):** tipo por **magic bytes** (allowlist), **não** pela extensão
  nem pelo `Content-Type` declarado; tamanho e contagem validados no servidor; `.txt/.csv/.json` **fora** da allowlist
  inicial (Q3 — sem assinatura binária determinística; não enfraquecer o gate); executáveis/scripts/formatos inseguros
  **bloqueados**. [Épico 3.7 AC#5; ADR §5; Q3]
- **INV-FILE-06 (nunca no host do Chatwoot):** MinIO e ClamAV entram **só** por override de `docker-compose` de dev/CI. É
  **proibido** adicioná-los ao host/compose compartilhado com o Chatwoot (AD-32). O provisionamento de produção é decisão de
  operação, fora desta Story. [ADR §14/Provisionamento; memória de propriedade de trilhas]

## Escopo (do épico, congelado)

> **Fonte:** `epics.md` §"Story 3.7 — Capacidade compartilhada de arquivos" (linhas ~1170-1186). Reproduzido para
> congelamento; a ADR-001 detalha o *como*.

**Infraestrutura compartilhada, desacoplada de Card e Registro** (ajuste 6). Operações: **upload / visualizar / baixar /
substituir (arquivo único) / adicionar / remover logicamente**. **Permissão herda do recurso** (ver/baixar = leitura;
enviar/substituir/remover = edição); acesso a um recurso não libera arquivos de recursos relacionados. **Buckets privados**;
validação de **tamanho/tipo/conteúdo**; **checksum**; **impedir acesso cruzado mesmo conhecendo a chave do objeto**;
tipos/limites (bloquear executáveis/scripts/formatos inseguros; **tamanho máx por arquivo** e **limite total por recurso**
como config operacional global). Reutilizada por E5, E6 e avatar (3.10).

**Gates do épico:** AD-28 (fail-closed): desabilitada/oculta até storage/segurança prontos; **valores numéricos de limites
definidos antes das Stories de upload** (Q1 = 10/recurso); storage/validação/quarentena/antivírus/entrega segura/expurgo =
Arquitetura/Segurança.

**Fora do escopo:** Campo Arquivo/anexo geral por recurso (3.8); limites por Org/Formulário (fora da Fase 1); avatar (3.10).

## Acceptance Criteria

> Transcritos do épico (com a emenda DIV-2 já aplicada em AC2). Cada AC tem um teste com **fase vermelha provável**
> (o Spec Kit expande em `tasks.md`).

1. **Quarentena fail-closed.** **Given** um arquivo recém-enviado **When** ainda não aprovado na verificação de segurança
   **Then** permanece em **quarentena e indisponível**; erro, timeout ou indisponibilidade da verificação resulta em
   **bloqueio fail-closed**; um arquivo rejeitado **nunca** pode ser baixado ou associado como disponível.
2. **Entrega sob sessão (Opção A — emenda DIV-2).** **Given** um download autorizado **When** solicitado **Then** ocorre por
   **entrega autenticada sob a sessão do usuário (stream pela API), vinculada ao usuário, ao recurso e à finalidade**; a
   **chave interna do objeto nunca é usada como autorização**; não há link público permanente.
3. **Sem acesso cruzado.** **Given** um usuário sem acesso ao recurso (mesmo conhecendo a chave do objeto) **When** tenta
   acessar o arquivo **Then** o acesso é negado (buckets privados; sem acesso cruzado) — **404 não-enumerante**.
4. **Remoção lógica → expurgo físico.** **Given** uma remoção lógica **When** aplicada **Then** é seguida de **expurgo físico
   conforme a política de retenção**; backups **expiram naturalmente** conforme a política, sem retenção indefinida; retenção
   excepcional por obrigação legal é **registrada e controlada**.
5. **Validação de upload.** **And** o upload valida tamanho/tipo/conteúdo (bloqueia executáveis/scripts/inseguros) com
   **checksum**; limites exibidos antes do envio.

## Tasks / Subtasks

> A ordem respeita o sequenciamento: **a tech story antiabuso é mergeada antes**; a 3.7 começa consumindo
> `kernel/antiabuso/`. `dev-story` executa após os gates de pré-implementação e Spec Kit completos.

- [ ] **T1 — Pré-requisito (tech story separada, mergeada antes): extração do antiabuso** (AC: base de 1/5)
  - [ ] Mover o rate limiter atômico de `pipes/public-submissions/public-rate-limit.ts` para `apps/api/src/kernel/antiabuso/` como primitivo genérico (sem acoplamento a Pipe/submissão pública).
  - [ ] Manter a 2.8 verde consumindo o kernel (regressão de `public-submissions` provada); `pipes/` passa a importar do kernel.
  - [ ] Esta é uma **branch `tech/` própria** — não faz parte do diff da 3.7. Ver Dev Notes §Sequenciamento.
- [ ] **T2 — Migration: `FileObject` + `FileScan` + `ScanSlot`** (AC: 1,2,3,4,5)
  - [ ] `FileObject` org-scoped: `id`, `orgId`, `bucketKey`, `nomeOriginal` (PII), `resourceType`, `resourceId`, `state`, `createdAt`, `updatedAt`, `purgedAt`. RLS ENABLE+FORCE + 4 policies + `WITH CHECK` no INSERT e UPDATE. GRANT `SELECT, INSERT` + `UPDATE ("state","nomeOriginal","updatedAt","purgedAt")`, **sem DELETE**.
  - [ ] `FileScan` org-scoped **append-only**: `id`, `orgId`, `fileId`, `tamanhoBytes`, `mimeDetectado`, `sha256Ingest`, `sha256Releitura`, `veredito`, `scannedAt`. RLS ENABLE+FORCE + WITH CHECK. GRANT **só `SELECT, INSERT`**.
  - [ ] `ScanSlot` **global** (sem RLS, como `RateLimit`/`Account`/`PublicFormRoute`): `key` (`scan:<orgId>`), `token`, `expiraEm`. GRANT `SELECT, INSERT, DELETE` (liberarSlot apaga a linha). Vive conceitualmente sob `kernel/antiabuso/`.
  - [ ] Ambas as org-scoped em `MODELOS_AUDITADOS`. Migration versionada; **rollback drill** documentado (migration-check).
  - [ ] Provar a **fase vermelha** de cada policy/GRANT (quebrar WITH CHECK e o GRANT de DELETE de propósito e ver o teste falhar) — padrão `*-rls`.
- [ ] **T3 — Storage: client MinIO/S3 no kernel** (AC: 1,2,4)
  - [ ] Cliente S3 (buckets privados) sob `kernel/storage/` (AD-24/AD-4); chave opaca `<orgId>/<uuidv4>`; sem credencial em log/health.
  - [ ] Primitivas: `putQuarentena`, `getStream`, `copyIfMatch` (promoção), `remove` (expurgo). CopyObject **if-match** por hash/etag.
  - [ ] Guarda de tenant por **segmento** (`split('/')[0] === orgId`).
- [ ] **T4 — Validação de conteúdo (núcleo puro)** (AC: 5)
  - [ ] `file-validation.core.ts` **puro**: allowlist por **magic bytes**, limite de bytes, contagem `FILE_MAX_PER_RESOURCE`; fail-closed → 400. `.txt/.csv/.json` fora; executáveis/scripts bloqueados.
  - [ ] Teste de **mutação**: extensão mentida (`.png` num ELF) rejeitada pelo conteúdo real.
- [ ] **T5 — Verificação de segurança fail-closed (ClamAV)** (AC: 1)
  - [ ] Integração ClamAV com `AlertExceedsMax yes`; canário **EICAR** no boot/health do scanner; `CLAMAV_DB_MAX_AGE_HOURS` (base velha ⇒ recusa). Erro/timeout ⇒ **veredito BLOCKED**.
  - [ ] **Dois SHA-256**: no ingest e na **releitura** durante o scan; divergência ⇒ BLOCKED (troca de bytes).
  - [ ] Semáforo `ScanSlot` (`adquirirSlot`/`liberarSlot` em `finally`) limita scans concorrentes por Org; teto excedido ⇒ 429 (fail-closed, não fila infinita).
- [ ] **T6 — Máquina de estados + veredito composto** (AC: 1,4)
  - [ ] Núcleo puro dos estados (ADR §7): `QUARENTENA → (CLEAN|BLOCKED)`; `DISPONIVEL`; `REMOVIDO_LOGICO → EXPURGADO`. Veredito de promoção **composto** (ADR §5): magic bytes + tamanho + 2×SHA + ClamAV CLEAN + CopyObject if-match; qualquer falha ⇒ BLOCKED.
  - [ ] Promoção é **transação atômica** (INSERT `FileScan` + UPDATE `FileObject.state`) com contexto no client raiz (`definirContextoOrg`), padrão 2.6/2.7.
- [ ] **T7 — Rotas: upload / download(stream) / substituir / remover lógico** (AC: 1,2,3,5)
  - [ ] `POST` upload → quarentena → veredito; `GET` download = **stream sob sessão** (nunca redirect a URL de bucket); substituir arquivo único **não** apaga silenciosamente o anterior (gera transição/estado); remover = lógico.
  - [ ] Autorização por **`FileAuthzContract`** injetável (INV-FILE-03) — a 3.7 fornece a porta e um binding de teste; 3.8/3.10 ligam recursos reais.
  - [ ] Sem acesso → **404 não-enumerante**; capacidade desabilitada → indisponibilidade honesta.
- [ ] **T8 — Expurgo e retenção (LGPD)** (AC: 4)
  - [ ] Remoção lógica agenda/permite **expurgo físico** do binário conforme retenção (ADR §9); anonimização de PII no que for retido; sem retenção indefinida; retenção legal registrada.
  - [ ] `lgpd-check` e `backup-check` cobrindo expiração natural de backup.
- [ ] **T9 — Compose override dev/CI + observabilidade** (AC: todos)
  - [ ] `docker-compose.override` (ou arquivo dedicado dev/CI) adicionando MinIO + ClamAV **isolados** — **jamais** no host do Chatwoot (AD-32). CI provisiona os dois para os testes de integração.
  - [ ] Logs estruturados sanitizados (sem `nomeOriginal`/PII, sem chave de objeto, sem bytes); métricas de veredito/quarentena (`observability-check`).
- [ ] **T10 — Gate `FILE_UPLOAD_ENABLED`** (AC: 1)
  - [ ] Confirmar/consumir o gate existente (`kernel/config/env.ts`, default `false`); prova de que desabilitado ⇒ superfície inteira indisponível (fail-closed honesto). **Não** reintroduzir `FILES_ENABLED` (erro já corrigido na ADR v4).

## Dev Notes

### Fonte de verdade: a ADR-001 (ratificada)
A ADR-001 (`docs/03-arquitetura/adr-001-capacidade-de-arquivos.md`, v5) é **autoritativa**. Este story file **não** a
substitui; extrai os guardrails. Onde houver dúvida, a ADR vence. Seções-chave: §1 Armazenamento, §2 Persistência
(FileObject×FileScan), §3 Onde vive, §4 Upload stream, §5 Veredito composto, §6 ClamAV fail-closed, §7 Estados, §8 Download
stream, §9 Limites/expurgo/LGPD, §10 Gate, §11 Observabilidade/LGPD, §12 Antiabuso, §13 Proibições, Modelo de ameaça
(T1-T15), Rollback, Critérios de aceite (28 ACs com mutação).

### Sequenciamento (Q2 — bloqueante)
1. **Tech story antiabuso** (branch `tech/*` própria): extrai `public-rate-limit.ts` → `kernel/antiabuso/`, mantém a 2.8
   verde, PR → CI → **merge serial primeiro**.
2. **Só então** a 3.7: rebase/parte de main já com o kernel; consome `kernel/antiabuso/` (rate limit + `ScanSlot`); **não**
   toca `pipes/`. Isso mantém a 3.7 focada e evita que a extração polua o diff da capacidade de arquivos.

### Decisões do dono (2026-07-17) — NÃO reabrir
- **Q1:** `FILE_MAX_PER_RESOURCE = 10` (CONTAGEM, não bytes; sem `FILE_MAX_BYTES_PER_RESOURCE` na Fase 1 — cota agregada é o
  débito DEB-1). Configurável, faixa validada, fail-closed, **genérico** (não acoplar a Card/Registro).
- **Q2:** rate limit + semáforo de scan pertencem à 3.7; a **extração** do primitivo antiabuso é a tech story pré-requisito.
- **Q3:** `.txt/.csv/.json` **fora** da allowlist inicial; **não enfraquecer** o gate de magic bytes.

### Padrões da base que ESTA Story reusa (não reinventar)
- **Transação atômica com contexto no client raiz** (`definirContextoOrg` em `kernel/db/tenant-context.ts`) — igual 2.6
  (publicação) e 2.7 (submissão). A extensão recusa `$transaction`; o raiz roda `set_config(..., true)`.
- **Par mutável × imutável** (`Form`/`FormVersion`, `Card`/`CardHistory`, `Record`/`RecordHistory`) → `FileObject`/`FileScan`.
- **Tabela global sem RLS** (`Account`, `PublicFormRoute`, `RateLimit`) → `ScanSlot`.
- **GRANT column-scoped** (`Card.lifecycleState` na 2.11; `Record` na 3.4) → `FileObject`.
- **404 não-enumerante** em falta de acesso (todo o E2/E3).
- **Tratamento de concorrência** P2002/P2028 → idempotente/409, **nunca 500** (2.6/2.7/2.8).
- **Núcleo puro para invariantes** (`option-config.ts`, `snapshot.ts`, `record-query.core.ts`) → `file-validation.core.ts`
  e o núcleo de estados/veredito.

### Onde o código vive (AD-24/AD-4/AD-5)
- `apps/api/src/kernel/storage/` — client de objeto (fronteira técnica; **sem regra de negócio**).
- `apps/api/src/kernel/antiabuso/` — rate limit (extraído) + `ScanSlot` (semáforo).
- `apps/api/src/files/` — o domínio da capacidade (serviço, estados, veredito, validação pura, rotas, `FileAuthzContract`).
  Desacoplado de `pipes/` e `databases/`.

### Testing standards
- Integração real: PostgreSQL + **MinIO + ClamAV** (compose dev/CI). Suíte da API **em série** no CI (`pnpm test:ci`).
- `*-rls` para cada tabela nova, com **fase vermelha provada** (quebrar policy/GRANT).
- **Testes de mutação** para os gates de segurança: EICAR, zip-bomb (AlertExceedsMax), base velha, extensão mentida, troca de
  bytes entre ingest e releitura, chave cross-tenant, download sem sessão.
- Nunca reusar Ana/Bruno/Carla/Eva do seed em `membership.create` persistente (TEST-ISO-01) — conta descartável na Org C.

### Referências
- [Source: docs/03-arquitetura/adr-001-capacidade-de-arquivos.md] — ADR ratificada (governa tudo).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.7] — escopo/ACs congelados.
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17.md] — emendas DIV-1/DIV-2.
- [Source: _bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md] — AD-27/AD-28/AD-24/AD-32.
- [Source: apps/api/src/pipes/public-submissions/public-rate-limit.ts] — primitivo a extrair (tech story).
- [Source: apps/api/src/kernel/config/env.ts] — `FILE_UPLOAD_ENABLED` (já existe, default false).

## Questões para o Spec Kit (clarify)
1. **Substituição de arquivo único** — a 3.7 entrega a operação "substituir" genérica, mas o *evento* de substituição
   ("não apaga silenciosamente o anterior") pertence ao Histórico do recurso (3.8/consumidor). A 3.7 emite só a transição de
   estado do `FileObject`? (Proposta: sim — a 3.7 é desacoplada; o evento é do consumidor.)
2. **`FileAuthzContract`** — formato exato da porta injetável (assinatura da função de checagem leitura/edição por
   `resourceType`/`resourceId`) para que 3.8/3.10 liguem sem a 3.7 conhecer Card/Registro/Conta.
3. **Política de retenção/expurgo** — janela numérica default do expurgo físico após remoção lógica (ADR §9 dá o mecanismo; o
   valor operacional é config). MVP: expurgo sob demanda + job? ou só a operação `remove` exposta e o agendamento fica para
   operação?
4. **Escopo do semáforo `ScanSlot`** — teto de scans concorrentes por Org (valor default) e comportamento no teto (429 vs.
   espera curta com timeout fail-closed).

## Change Log
| Data | Autor | Mudança |
|---|---|---|
| 2026-07-17 | Dev (agente) | Criação da Story via `bmad-create-story` (workflow oficial); status → `ready-for-dev`; governada pela ADR-001 ratificada. |

## Review Findings
_(preenchido pelos revisores read-only de Segurança/Arquitetura/Edge Cases/Aceite após a implementação)_

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Debug Log References

### Completion Notes List

### File List
