# Feature Specification: Capacidade compartilhada de arquivos

**Feature Branch**: `story/3-7-capacidade-compartilhada-de-arquivos`

**Created**: 2026-07-17

**Status**: Draft

**Input**: Story 3.7 do Épico 3 (`epics.md`), governada pela **ADR-001 ratificada** (`docs/03-arquitetura/adr-001-capacidade-de-arquivos.md`, v5, PR #93). Estabelecer, uma única vez, uma capacidade **fail-closed** de arquivos — upload, verificação de segurança, armazenamento privado, entrega autenticada sob sessão, remoção lógica e expurgo — **desacoplada de Card e Registro** (consumidores integrados em 3.8/3.10). Decisões do dono: Q1 (10 arquivos/recurso por contagem), Q2 (rate limit + semáforo consomem `kernel/antiabuso/` extraído por tech story pré-requisito), Q3 (`.txt/.csv/.json` fora da allowlist; gate de magic bytes intacto).

## Clarifications

### Sessão 2026-07-17 (decisões do dono — NÃO reabrir)

- **Q1 (limite por recurso):** contagem máxima = **10 arquivos por recurso** (por CONTAGEM, não bytes; sem cota agregada por bytes na Fase 1 — é o débito DEB-1). Configurável, faixa validada, fail-closed, genérico.
- **Q2 (antiabuso):** rate limit + semáforo de verificação pertencem à 3.7 e **consomem** `kernel/antiabuso/`; a **extração** desse primitivo (da submissão pública 2.8) é **tech story pré-requisito**, mergeada **antes** da 3.7, que **não** toca `pipes/`.
- **Q3 (tipos):** `.txt/.csv/.json` **fora** da allowlist inicial (sem assinatura binária determinística para o gate de magic bytes); **não enfraquecer** o gate.
- **Entrega (DIV-2, emendada):** download por **stream sob sessão** (Opção A), **sem URL pré-assinada**; "vinculada ao usuário/recurso/finalidade" e "sem link público permanente" preservados.

### Resoluções de design (defaults ancorados na ADR-001 — para o `/speckit-plan`)

- **C1 — Contrato de autorização (porta):** a 3.7 expõe uma interface `FileAuthzContract` que resolve, para `(resourceType, resourceId)` e principal, os poderes **leitura** e **edição**. A 3.7 fornece a porta + um binding de teste; os recursos concretos (Card/Registro/Conta) são ligados pelos consumidores (3.8/3.10). A 3.7 **não** conhece Card/Registro. [ADR §3]
- **C2 — Substituir arquivo único:** a 3.7 entrega a operação genérica que produz a **transição de estado** do `FileObject`; o **evento** "não apaga silenciosamente o anterior" pertence ao Histórico do recurso consumidor (3.8). [Épico 3.8; ADR §7]
- **C3 — Janela de expurgo:** a operação `remove` (lógica) + a primitiva de expurgo físico são entregues na 3.7; o **agendamento** do expurgo é config operacional (default: expurgo elegível imediatamente após remoção lógica, executado por rotina de operação; o valor da janela é parâmetro). Sem retenção indefinida; retenção legal excepcional registrada. [ADR §9; LGPD]
- **C4 — Teto do semáforo `ScanSlot`:** limite de verificações concorrentes por Organização é config (default conservador); ao exceder, **fail-closed** com resposta de saturação (429), sem fila infinita. [ADR §12]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload com quarentena e verificação fail-closed (Priority: P1)

Um usuário autorizado envia um arquivo através de um recurso que consome a capacidade. O arquivo entra em **quarentena**: fica indisponível até passar por uma verificação de segurança composta (tipo real por conteúdo, tamanho, checksum, antivírus). Só depois de **aprovado** ele se torna disponível. Qualquer erro, timeout ou indisponibilidade da verificação resulta em **bloqueio** — nunca em disponibilidade por omissão.

**Why this priority**: É o coração da capacidade e o invariante de segurança-mãe. Sem quarentena fail-closed, todo o resto (download, referência) fica inseguro. É o MVP mínimo demonstrável: "arquivo seguro, com verificação fail-closed".

**Independent Test**: Enviar um arquivo benigno e confirmar que ele só fica disponível após a verificação aprovar; enviar EICAR e confirmar bloqueio; simular scanner indisponível/timeout e confirmar bloqueio (não disponibilidade).

**Acceptance Scenarios**:

1. **Given** um arquivo recém-enviado, **When** a verificação ainda não aprovou, **Then** ele permanece em quarentena e indisponível (não baixável, não associável como disponível).
2. **Given** a verificação de segurança retorna erro, timeout ou está indisponível, **When** o veredito é computado, **Then** o arquivo é **bloqueado** (fail-closed), nunca liberado.
3. **Given** um arquivo rejeitado pela verificação, **When** qualquer recurso tenta usá-lo, **Then** ele nunca pode ser baixado nem associado como disponível.

---

### User Story 2 - Download por entrega autenticada sob a sessão (Priority: P1)

Um usuário autorizado a **ler** o recurso solicita o arquivo. A entrega ocorre por **stream autenticado sob a sessão do usuário** (proxy pela aplicação), vinculada ao usuário, ao recurso e à finalidade. A chave interna do objeto **nunca** é usada como autorização e **não existe link público permanente**.

**Why this priority**: A entrega é o outro lado do invariante de isolamento. Uma URL pré-assinada seria *bearer* (vincula-se à chave e ao relógio, não ao usuário); a Opção A vincula ao usuário. Sem isso, o isolamento cross-tenant é falso.

**Independent Test**: Um usuário com leitura ao recurso baixa o arquivo por stream; confirmar que nenhuma resposta redireciona para uma URL de bucket nem expõe a chave; confirmar que não há endpoint que sirva o arquivo sem sessão válida.

**Acceptance Scenarios**:

1. **Given** um download autorizado, **When** solicitado, **Then** ocorre por entrega autenticada sob a sessão (stream pela aplicação), vinculada ao usuário/recurso/finalidade, sem link público permanente.
2. **Given** qualquer via de download, **When** inspecionada, **Then** a chave interna do objeto nunca é aceita como autorização.

---

### User Story 3 - Sem acesso cruzado mesmo conhecendo a chave (Priority: P1)

Um usuário **sem acesso** ao recurso — mesmo conhecendo a chave do objeto — tenta acessar o arquivo. O acesso é **negado** de forma **não-enumerante** (não confirma a existência do arquivo), porque os buckets são privados e a autorização vem do recurso, não da chave.

**Why this priority**: É o isolamento multi-tenant aplicado a arquivos — o invariante-mãe do projeto. Uma falha aqui é vazamento cross-tenant.

**Independent Test**: Um usuário da Org B, de posse da chave de um arquivo da Org A, recebe 404 não-enumerante; provar que a guarda de tenant é por segmento de prefixo (não `startsWith`), de modo que `orgAlvo` não é prefixo de `orgAlvo-malicioso`.

**Acceptance Scenarios**:

1. **Given** um usuário sem acesso ao recurso (mesmo conhecendo a chave), **When** tenta acessar o arquivo, **Then** o acesso é negado (buckets privados, sem acesso cruzado) com resposta não-enumerante.

---

### User Story 4 - Remoção lógica seguida de expurgo físico (retenção/LGPD) (Priority: P2)

Um usuário com edição remove **logicamente** um arquivo. A remoção lógica é seguida de **expurgo físico** do binário conforme a política de retenção; backups **expiram naturalmente** conforme a política (sem retenção indefinida); retenção excepcional por obrigação legal é **registrada e controlada**.

**Why this priority**: Fecha o ciclo de vida e o requisito LGPD (sem exclusão física de linha, mas com expurgo do binário). Depende de US1 existir, por isso P2.

**Independent Test**: Remover logicamente um arquivo disponível e confirmar que fica indisponível imediatamente e que o binário é expurgado conforme a retenção; confirmar que nenhuma linha é apagada fisicamente (remoção é mudança de estado).

**Acceptance Scenarios**:

1. **Given** uma remoção lógica, **When** aplicada, **Then** é seguida de expurgo físico conforme a política de retenção; backups expiram naturalmente; retenção legal excepcional é registrada e controlada.
2. **Given** um arquivo removido logicamente, **When** consultado, **Then** não é baixável nem associável, mas sua linha de metadados não é apagada fisicamente (auditoria/histórico preservados).

---

### User Story 5 - Validação de tamanho/tipo/conteúdo antes de aceitar (Priority: P2)

O upload valida **tamanho, tipo (por conteúdo real) e conteúdo**, com **checksum**, bloqueando executáveis, scripts e formatos inseguros. Os limites são **exibidos antes do envio**.

**Why this priority**: A validação server-side independente do cliente é o gate que impede burlar o tipo pela extensão. É P2 porque opera dentro do fluxo de US1.

**Independent Test**: Enviar um executável renomeado como `.png` e confirmar rejeição pelo conteúdo real; enviar arquivo acima do tamanho máximo e confirmar rejeição; exceder a contagem por recurso e confirmar rejeição; confirmar que os limites são conhecidos pelo cliente antes do envio.

**Acceptance Scenarios**:

1. **Given** um upload, **When** processado, **Then** valida tamanho/tipo/conteúdo (bloqueia executáveis/scripts/inseguros) com checksum.
2. **Given** um cliente prestes a enviar, **When** consulta a capacidade, **Then** os limites (tamanho por arquivo, contagem por recurso, tipos permitidos) são exibidos antes do envio.
3. **Given** um arquivo cujo conteúdo real não bate com a extensão declarada, **When** validado, **Then** o veredito usa o **conteúdo real** (magic bytes), não a extensão.

---

### Edge Cases

- **Zip bomb / arquivo que excede o limite do scanner**: a verificação deve tratar "limite excedido" como **suspeito/bloqueado**, nunca como "OK por omissão".
- **Scanner com base de assinaturas vazia ou desatualizada** ("scanner cego"): responde OK sem realmente verificar → deve ser detectado (canário) e a base velha deve **recusar** o veredito.
- **Troca de bytes entre o aceite e a verificação**: o conteúdo verificado deve ser comprovadamente o mesmo que será promovido (dois checksums: no aceite e na releitura durante a verificação).
- **Colisão de chave / chave adivinhada**: chave opaca; guarda de tenant por segmento; conhecer a chave não concede acesso.
- **Capacidade desabilitada (gate AD-28)**: toda a superfície responde indisponibilidade **honesta** (sem 500, sem vazamento de URL/segredo).
- **Saturação por muitos uploads/scans simultâneos**: rate limit + semáforo de scan por Organização; ao exceder o teto, **fail-closed** (recusa), não fila infinita.
- **Substituir arquivo único**: a operação não pode apagar silenciosamente o anterior (a semântica de evento pertence ao recurso consumidor, 3.8).
- **Recurso arquivado (no consumidor)**: fora do escopo direto da 3.7 (é 3.8), mas o contrato de autorização injetado deve permitir ao consumidor bloquear mutação.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A capacidade MUST ser **desacoplada** de Card e Registro — nenhuma dependência de entidade de domínio consumidora; a autorização por recurso é injetada por um **contrato** (porta) que os consumidores (3.8/3.10) implementam.
- **FR-002**: A capacidade MUST permanecer **desabilitada por default** e indisponível de forma honesta enquanto o gate técnico (`FILE_UPLOAD_ENABLED`) não estiver ligado (AD-28, fail-closed).
- **FR-003**: Um arquivo recém-enviado MUST entrar em **quarentena** e permanecer indisponível até a verificação de segurança **aprovar**.
- **FR-004**: Erro, timeout ou indisponibilidade da verificação MUST resultar em **bloqueio** (fail-closed); um arquivo rejeitado MUST nunca ser baixável nem associável como disponível.
- **FR-005**: A verificação MUST ser **composta**: tipo por conteúdo real (magic bytes), tamanho, checksum, antivírus com veredito CLEAN, e prova de que o conteúdo verificado é o que será promovido.
- **FR-006**: O antivírus MUST tratar "limite excedido" como suspeito (não OK), detectar scanner "cego" (base vazia/velha) e recusar veredito com base desatualizada.
- **FR-007**: O download autorizado MUST ocorrer por **entrega autenticada sob a sessão** do usuário (stream pela aplicação), vinculada ao usuário/recurso/finalidade; a **chave interna do objeto nunca** é autorização; **sem link público permanente**.
- **FR-008**: Um usuário sem acesso ao recurso — **mesmo conhecendo a chave** — MUST ser negado de forma **não-enumerante** (buckets privados, sem acesso cruzado).
- **FR-009**: A permissão MUST **herdar do recurso**: ver/baixar = leitura; enviar/substituir/remover lógico = edição; acesso a um recurso não libera arquivos de recursos relacionados.
- **FR-010**: O upload MUST validar tamanho/tipo/conteúdo no **servidor**, independente da extensão/`Content-Type` declarados, bloqueando executáveis/scripts/formatos inseguros, com **checksum**.
- **FR-011**: A allowlist inicial de tipos MUST ser por magic bytes; `.txt/.csv/.json` ficam **fora** da allowlist inicial (sem enfraquecer o gate).
- **FR-012**: Os limites MUST incluir tamanho máximo por arquivo e **contagem máxima por recurso = 10** (config operacional global, validada por faixa, fail-closed); os limites MUST ser conhecíveis pelo cliente antes do envio.
- **FR-013**: A remoção MUST ser **lógica** (mudança de estado), **sem exclusão física de linha** de metadados em runtime.
- **FR-014**: A remoção lógica MUST ser seguida de **expurgo físico** do binário conforme a política de retenção; backups expiram naturalmente; retenção legal excepcional é registrada e controlada.
- **FR-015**: O **fato apurado** da verificação (hashes, tamanho, tipo detectado, veredito, instante) MUST ser **imutável** (append-only) uma vez escrito.
- **FR-016**: Toda mutação de metadados de arquivo MUST entrar na trilha de auditoria e ser isolada por Organização pelo banco (RLS), sem `orgId` aceito do cliente.
- **FR-017**: Rate limit e semáforo de verificação MUST consumir o módulo genérico `kernel/antiabuso/` (extraído por tech story pré-requisito), sem acoplar a capacidade a domínios existentes.
- **FR-018**: Logs e histórico MUST ser **sanitizados**: sem binários, sem nome original (PII) desnecessário, sem chave de objeto, sem link temporário.
- **FR-019**: O provisionamento de storage e antivírus para dev/CI MUST ocorrer por override isolado; MUST NOT ser adicionado ao host/compose compartilhado com o Chatwoot.

### Key Entities *(include if feature involves data)*

- **FileObject** — o **ciclo de vida** do arquivo (mutável), por Organização: identidade, referência opaca ao objeto no storage, nome original (PII), tipo de recurso e identificador do recurso, estado (quarentena/disponível/removido/expurgado), instantes de criação/atualização/expurgo. Evolui só nas colunas de ciclo de vida.
- **FileScan** — o **fato apurado** da verificação (append-only, imutável), por Organização: referência ao arquivo, tamanho em bytes, tipo detectado, checksum no aceite, checksum na releitura, veredito, instante. Nunca alterado após escrito.
- **ScanSlot** — o **semáforo** de verificação (global, sem tenant): chave por Organização, token de posse, expiração; adquirido antes do scan e liberado ao fim (limita concorrência de verificação, fail-closed no teto).
- **Contrato de autorização (porta)** — a interface injetável que resolve, para um `(tipo de recurso, id do recurso)`, se o principal tem **leitura** (ver/baixar) ou **edição** (enviar/substituir/remover). Implementada pelos consumidores (3.8/3.10); a 3.7 fornece a porta e um binding de teste.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos arquivos em quarentena são indisponíveis para download/associação até o veredito CLEAN; 0% de arquivos rejeitados/bloqueados tornam-se baixáveis (provado por testes de mutação: EICAR, timeout, scanner cego, zip bomb).
- **SC-002**: 0 casos de acesso cruzado: um principal sem acesso ao recurso, mesmo de posse da chave, nunca obtém o arquivo nem confirmação de sua existência (resposta não-enumerante), em 100% das tentativas cross-tenant testadas.
- **SC-003**: 100% dos downloads autorizados ocorrem por stream sob sessão; 0 respostas expõem chave de objeto, URL de bucket ou link público permanente.
- **SC-004**: 100% dos uploads com conteúdo real divergente da extensão declarada são rejeitados pelo conteúdo (magic bytes); 100% dos uploads acima do tamanho ou da contagem por recurso (10) são rejeitados no servidor.
- **SC-005**: Com o gate desabilitado, 100% da superfície responde indisponibilidade honesta (sem 500, sem vazamento) — nenhum arquivo é aceito ou servido.
- **SC-006**: Toda remoção lógica é seguida de expurgo físico do binário dentro da janela de retenção configurada; 0 linhas de metadados apagadas fisicamente em runtime (sem GRANT de DELETE).

## Assumptions

- A verificação antivírus é feita por um serviço externo (padrão de mercado, tipo ClamAV) provisionado apenas em dev/CI nesta Story; o provisionamento de produção é decisão de operação, fora do escopo.
- O storage de objetos é compatível com S3 (padrão de mercado, tipo MinIO) com buckets privados; provisionado apenas em dev/CI nesta Story (AD-32 proíbe adicioná-lo ao host do Chatwoot).
- A autenticação, a Organização, o contexto de tenant e a autorização de E1 (1.2/1.3/1.4/1.6) já existem e são reutilizados; a 3.7 **não** depende de Card/Registro.
- O primitivo de rate limit já existe na base (submissão pública 2.8) e será **extraído** para `kernel/antiabuso/` por uma tech story pré-requisito, mergeada **antes** da implementação da 3.7.
- A semântica de "evento de substituição" e o bloqueio sob recurso arquivado pertencem ao consumidor (3.8); a 3.7 entrega a operação genérica e a porta de autorização.
- Os valores numéricos dos limites são config operacional global: contagem por recurso = 10 (Q1); tamanho por arquivo e allowlist de tipos definidos na config, validados por faixa e fail-closed.
