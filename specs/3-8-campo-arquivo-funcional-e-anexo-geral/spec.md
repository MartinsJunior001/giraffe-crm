# Spec — Story 3.8: Campo Arquivo funcional e anexo geral (Card/Registro)

Baseline sobre a **3.7 mergeada** (PR #103/#105, `main`) · Épico 3 · Risco ALTO · Depende de 3.7 (satisfeito), 3.3,
3.4, 2.9, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10. Governança: **ADR-001** (v5, ratificada) — **AC-2 marcado "[3.8, não 3.7]"**.

> **DESBLOQUEADA.** A 3.7 está mergeada e `done`. Os fatos reais da 3.7 que fecham os placeholders "NEEDS-3.7"
> estão em **`reconciliation-3-7.md`** (estados `DISPONIVEL`/`QUARENTENA`, assinatura do `FileAuthzContract`,
> `resourceType`=texto→allowlist, rotas reais, limites/allowlist, **DEB-3.7-SMOKE-STORAGE** como task T0). Onde
> este spec disser `AVAILABLE`/`QUARANTINED`, leia `DISPONIVEL`/`QUARENTENA`.

## 1. Resumo

**Primeiro consumidor concreto** da capacidade de arquivos (3.7). Ativa o **Campo Arquivo** (catálogo 2.4) nos
**três** Formulários (inicial/Fase/Database), removendo a indisponibilidade de 2.4, e cria o **anexo geral** por
recurso (Card e Registro). É **consumo puro** da 3.7 — não reimplementa storage, scan, quarentena, veredito nem
antiabuso base. Quatro frentes: **(1)** binding de autorização por recurso (liga o `FileAuthzContract` da 3.7 a
`pipe-authz`/`database-authz`); **(2)** valor do Campo `FILE` deixa de ser **texto** e passa a ser **referência a
`FileObject`(s) `AVAILABLE`**; **(3)** gate de consumo (409 `CAPACIDADE_ARQUIVO_INDISPONIVEL` — ADR AC-2); **(4)**
canal público (Campo Arquivo publicado, com limites do canal, sem anexo geral público, sem download público).

## Clarifications

### Session 2026-07-18 (Planner n+1 — defaults conservadores, a VALIDAR com o dono no clarify da abertura)

> Sem usuário interativo nesta rodada de planejamento antecipado. Cada ambiguidade material foi resolvida com o
> **default mais conservador (fail-closed)**, encodada abaixo e propagada às seções afetadas. **Todas as respostas
> são decisões do planner sujeitas a confirmação** quando a Story abrir de fato (3.7 mergeada). As inclinações de
> §6 passam a valer como default adotado.

- Q: Valor do Campo `FILE` referenciando `fileId` ainda `QUARANTINED`? → A: **Rejeita 409** (fail-closed; só
  `AVAILABLE` é referenciável). [Q1]
- Q: `fileId` de outro recurso pode ser referenciado na submissão? → A: **Não** — vínculo ao recurso/finalidade é
  validado; referência cross-recurso → negada (400/409). [Q1/R2]
- Q: Modelagem do anexo geral e de `resourceType`? → A: **Mínima que evite GRANT novo** (AD-11); preferir o
  discriminador de finalidade só se o JSONB não bastar; `resourceType` como valor validado por allowlist no
  consumidor (a 3.7 já nasce com `resourceType/resourceId` genérico). **A confirmar no plan.** [Q2]
- Q: Assinatura do `FileAuthzContract`? → A: **Segue o contrato que a 3.7 congelar** (Q2 da 3.7); binding injetado
  pelo consumidor em `FilesModule`. Não fixar assinatura antes da 3.7 mergeada. [Q3]
- Q: Limites do canal público — valores? → A: **Novas variáveis de ambiente com faixa validada no `getEnv()`**,
  fail-closed (ausente/ilegível → nega); valores recomendados no `.env.example` a definir no plan (ordem de
  grandeza conservadora, ≤ `FILE_MAX_PER_RESOURCE`). [Q4]
- Q: Leitura do Campo `FILE` na tabela de Registros (3.5)? → A: **Exibir (nome/estado + download), manter
  não-filtrável/ordenável**; o filtro `Arquivo possui/não possui` **não** entra na 3.8 (segue gated). [Q5]
- Q: Taxonomia de eventos? → A: **`FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED`** (Card e Registro), alinhada à
  projeção 3.6 / leitura 2.17. [Q6]
- Q: Pai (Pipe/Database) arquivado bloqueia upload no filho? → A: **Sim** — "recurso ativo" = filho ativo **e** pai
  não arquivado (consistência com a 3.9). [Q7]
- Q: Download no canal público? → A: **Não há** — submitter público faz upload mas não baixa (sem sessão); entrega
  sob sessão só do lado interno pós-conversão. [Q8]

## 2. Fora de escopo (não antecipar — Constitution II)

- Anexo geral em **Tarefa/Solicitação** (E5); anexo em **e-mail** (E6); **avatar** (3.10).
- **Cota agregada por tenant** (`FILE_MAX_TENANT_BYTES` — DEB-1, Fase 2); limites por Org/Formulário.
- **Read-side/projeção/mascaramento** dos eventos de arquivo no Histórico (2.17 Card / 3.6 Registro — a 3.8 só
  **emite**).
- Provedor de storage/scanner de staging/produção (DEB-2 — não bloqueia a 3.8 em dev/CI: gate default `false`).
- Reimplementar qualquer parte da máquina de segurança da 3.7 (storage, ClamAV, dois SHA, quarentena, expurgo,
  rate limit base, `ScanSlot`).

## 3. Requisitos funcionais

- **RF-1 (Campo Arquivo funcional):** com `FILE_UPLOAD_ENABLED=true` + capacidade 3.7 no ar, publicar um Formulário
  (inicial/Fase/Database) com Campo Arquivo **ativo** é permitido e o Campo é **funcional** — a indisponibilidade de
  2.4 deixa de se aplicar. Reusa o builder canônico (INV-FORM-01), sem segundo mecanismo de upload.
- **RF-2 (valor do Campo `FILE` como referência):** o valor submetido a um Campo `FILE` é **`fileId`(s)** de
  `FileObject` `AVAILABLE`, mesma Org, **vinculado a este recurso/finalidade** — único ou array conforme
  `typeConfig.multiplo` (congelado no snapshot — AD-12). Substitui o tratamento textual atual (`FILE` em
  `TIPOS_TEXTO` de `submission.ts`). Allowlist anti-mass-assignment mantida; ausência permitida quando não
  `required` (2.15). Referência a `fileId` de **outro recurso** ou ainda `QUARANTINED` → **rejeitada** (400/409,
  fail-closed — Clarify Q1). Propaga aos três caminhos que reusam `submission.ts`: 2.7 (interno), 2.8 (público),
  3.4 (Registro).
- **RF-3 (gate de consumo — ADR AC-2):** `FILE_UPLOAD_ENABLED=false` + `FormVersion` **publicada** com Campo
  Arquivo, ao ser SUBMETIDA (2.7/2.8/3.4) ⇒ **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`** — nunca erro opaco, nunca
  aceite silencioso. A 3.8 **satisfaz** o gate existente (`podePublicarComArquivo`/`tipoArquivoDisponivel`), não o
  reescreve.
- **RF-4 (anexo geral por recurso):** adicionar/listar/remover **lógico** anexo associado ao **recurso** (Card ou
  Registro), independente de Formulário. Ver/baixar = leitura; adicionar/remover = edição. Herda a autorização do
  recurso. **Não há anexo geral público.**
- **RF-5 (substituição sem perda silenciosa):** substituir um Campo Arquivo único gera **evento** no Histórico do
  recurso (mesma transação) e o anterior só recebe soft-delete **após** o novo virar `AVAILABLE`.
- **RF-6 (canal público):** `POST /public/forms/:publicId/submit` (2.8) recebe arquivos **só** via Campo Arquivo
  publicado, aplicando: limite por arquivo; máx. arquivos por Campo; máx. por submissão; total por submissão; rate
  limit (chave `<orgId>`, compõe com IP+publicId); validação magic-bytes (independente da extensão); arquivo
  indisponível até verificar (não converte referenciando `QUARANTINED`); sem URL pública permanente; sem contorno
  por upload direto. **Sem anexo geral público, sem download público.**
- **RF-7 (read-only sob arquivamento):** sob Card/Registro arquivado **ou pai (Pipe/Database) arquivado** — ver/
  baixar seguem; upload/substituição/remoção → **409** (padrão 2.11/3.4/D1; "recurso ativo" = filho ativo **e** pai
  não arquivado — Clarify Q7, consistência com 3.9).
- **RF-8 (download sob sessão):** ver/baixar = stream autenticado sob a sessão (Opção A), acesso ao recurso
  revalidado a cada requisição; só `AVAILABLE`; sem URL pré-assinada, sem link público permanente.
- **RF-9 (eventos de Histórico):** `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` (Card e Registro) emitidos na
  mesma transação da mutação, **sem PII** (só metadado/`fileId`/referência interna segura). Read-side = 2.17/3.6.

## 4. Requisitos não-funcionais / invariantes

- **INV-3.8-02 (herança de permissão — INV-FILE-03):** ver/baixar = leitura do recurso; enviar/substituir/remover =
  edição/operação. Card: `exigirLerCard`/`exigirOperarCard` (2.10). Registro: `exigirLerDatabase`/
  `exigirOperarDatabase` (3.4). Sem acesso → 404 não-enumerante; ler-sem-operar ao mutar → 403.
- **INV-3.8-03 (sem acesso cruzado mesmo conhecendo a chave — INV-FILE-02 / T2):** acesso ao recurso A nunca libera
  arquivo de B, mesma Org inclusive. Checagem por `(resourceType, resourceId)` **pela camada autorizada** — RLS é
  necessária e **insuficiente**. `fileId` só referenciável se pertencer a **este** recurso/finalidade e estiver
  `AVAILABLE`.
- **INV-3.8-04 (gate fail-closed — AD-28):** `FILE_UPLOAD_ENABLED` ausente/≠`true` ⇒ superfície indisponível de
  forma honesta; `FormVersion` publicada com Campo Arquivo ao ser usada → 409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`.
- **Isolamento (AD-6):** RLS `ENABLE+FORCE` + `WITH CHECK` (herdado da 3.7 em `FileObject`/`FileScan`); toda query
  por `withTenantContext`; `orgId`/`bucketKey`/`resourceId` do cliente nunca confiados; chave opaca `<orgId>/<uuid>`
  + guarda de prefixo por segmento (da 3.7).
- **Binding sem ciclo (AD-5):** o consumidor (`pipes/`/`databases/`) injeta o `FileAuthzContract` em `FilesModule`;
  `files/` não importa authz de domínio.
- **Append-only preservado:** `CardHistory`/`RecordHistory`/`FileScan` seguem GRANT só `SELECT/INSERT`. A 3.8 amplia
  taxonomia, não toca o read-side.
- **Sem exclusão física; PII protegida (LGPD):** remoção é lógica (`state`) + expurgo físico do binário (3.7);
  `nomeOriginal` nunca em log/evento crus.
- **Migration/GRANT mínimos:** idealmente **nenhum GRANT novo** além do da 3.7; migration aditiva só se a modelagem
  do anexo geral exigir (`purpose`/`resourceType`). Fase vermelha de RLS/GRANT provada por mutação se houver.
- **Guard C3 congelado:** `@Requer(...)` grosso + guarda fina no serviço (DBT-AUTHZ-01), sem tocar `ability.ts`.

## 5. Acceptance Criteria

Ver o story file (AC1–AC10). Resumo: Campo Arquivo funcional removendo a indisponibilidade de 2.4 (AC1); gate de
consumo 409 com mutação — **AC-2 da ADR, "[3.8, não 3.7]"** (AC2); valor de `FILE` referencial, não texto (AC3);
anexo geral com herança de permissão (AC4); substituição sem perda silenciosa + evento (AC5); canal público com
limites/magic-bytes/indisponível-até-verificar, sem anexo/ download público (AC6); read-only sob arquivamento (AC7);
isolamento cross-tenant + cross-recurso com autz neutralizada (AC8); eventos de Histórico sem PII (AC9); sem
antecipar escopo, migration/GRANT mínimos (AC10).

## 6. Decisões (clarify Q1–Q8 — resolvidas com default conservador do planner na sessão 2026-07-18; ver §Clarifications; VALIDAR na abertura)

- **Q1 — valor `FILE` no JSONB + `QUARANTINED`:** `fileId` único / `fileId[]`; cardinalidade em `typeConfig.multiplo`
  congelada no snapshot; referência a `fileId` `QUARANTINED` → **rejeita 409** (inclinação: fail-closed).
- **Q2 — modelagem do anexo geral + `resourceType`:** discriminador `purpose` (+ `fieldId?`) em `FileObject` vs.
  Campo no JSONB e anexo só na linha; enum `resourceType` (`CARD`/`RECORD`) vs. string validada. Inclinação: a
  modelagem mínima que evite GRANT novo (AD-11).
- **Q3 — `FileAuthzContract` assinatura exata:** alinhar com a Q2 da própria 3.7; provider token de injeção em
  `FilesModule`.
- **Q4 — limites do canal público (valores):** máx. por Campo/submissão/total — novas variáveis de ambiente com
  faixa validada no `getEnv()` (como a 3.7); valores no `.env.example`.
- **Q5 — leitura do Campo `FILE` na tabela (3.5):** exibir (nome/estado + download) mantendo-se não-filtrável/
  ordenável? Filtro `Arquivo possui/não possui` entra agora? Inclinação: exibir sim, filtrar não.
- **Q6 — taxonomia de eventos:** `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED`; alinhar com projeção 3.6 / leitura 2.17.
- **Q7 — pai arquivado:** Pipe/Database arquivado também bloqueia upload no filho? Inclinação: sim (consistência 3.9).
- **Q8 — download público:** confirmar que o submitter público não baixa (sem sessão); entrega sob sessão só do lado interno.

## 7. Riscos

- **R1 — valor do Campo `FILE` é hoje texto** (`submission.ts`): migrar para referência toca 2.7/2.8/3.4 + leitura
  3.5. Mitigação: regressão de E2/E3 verde; maior risco de escopo.
- **R2 — `fileId` de outro recurso = contorno de autorização:** provar que o `fileId` pertence a **este** recurso/
  finalidade e está `AVAILABLE` (não só "existe na Org"); teste cross-recurso com autz neutralizada.
- **R3 — download público sem sessão:** garantir ausência de caminho de leitura pública (Opção A — entrega sob
  sessão); modelo de ameaça revalidado.
- **R4 — atomicidade da substituição:** anterior só sai após o novo `AVAILABLE`; evento na mesma transação;
  falha de scan não perde os dois.
- **R5 — modelagem Campo × anexo geral:** coluna nova vs. JSONB — escolher a mínima sem erodir `Card ≠ Registro`.
- **R6 — dependência 3.7 não mergeada:** BLOQUEIO DURO; baseline e assinatura da porta só se fixam com a 3.7 fechada.
