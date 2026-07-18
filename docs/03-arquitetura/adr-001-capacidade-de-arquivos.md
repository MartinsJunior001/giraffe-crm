# ADR-001 — Capacidade compartilhada de arquivos (resolve OQ-47, destrava AD-28 para arquivos)

- **Status:** **RATIFICADA (design) — em re-revisão final do delta v5.** Opção A e as decisões de escopo são do dono
  (2026-07-17); as duas divergências autoritativas foram **emendadas pelos workflows oficiais** (§0) e as três
  decisões do dono, **tomadas** (§0/DIV-3). A v5 fecha os achados de **três** revisões independentes (a v4 foi
  aprovada com ressalvas, fechadas aqui) e aguarda a **re-revisão read-only do delta v5** antes do merge. **Alcance:**
  o **design** está ratificado pelo dono; os gates de **runtime/implementação** da Story 3.7
  (`pre-implementation-check`, `security-check`, `migration-check`, `lgpd-check`) **permanecem obrigatórios no momento
  de escrever o código** — a implementação é passo futuro **ainda não autorizado**, e nada nesta ADR o antecipa.
- **Escopo:** **apenas arquivos.** E-mail outbound e IA **permanecem gated** pelo AD-28 (OQ-32, OQ-43..46 abertas).
- **Rastreabilidade:** OQ-47 (Produto) · AD-4/AD-5 (fronteiras) · AD-6 (isolamento) · AD-9 (principal) · AD-13
  (transação) · **AD-24 (portas)** · AD-27 (Storage) · AD-28 (fail-closed) · AD-29 (observabilidade) · AD-30
  (auditoria) · **AD-32 (ambientes)** · D3.5 · NFR-8 · Épico 3 Stories 3.7/3.8/3.10 · consumidores E5, E6 ·
  **`sprint-change-proposal-2026-07-17.md`** (emendas DIV-1/DIV-2).
- **Relação com o AD-27:** o AD-27 **já é autoritativo**. Esta ADR o **instancia em quase tudo** (números, antivírus
  nomeado, modelo de execução, fronteira de porta) e o **EMENDOU num ponto** — a cláusula "acesso por URL temporária
  e curta", que a Opção A revoga. A emenda **já foi ratificada** pelo workflow oficial (§0). **Instanciar e emendar
  não são a mesma coisa, e a v3 chamou o conjunto de "instanciação".**

---

## 0. Divergências autoritativas — RESOLVIDAS pelos workflows oficiais, e decisões do dono TOMADAS

A Constitution XI proíbe alterar artefato autoritativo fora do seu fluxo próprio, e o CLAUDE.md manda **registrar a
divergência e escalar antes de implementar**. As duas divergências abaixo foram **emendadas pelo workflow oficial
`bmad-correct-course`** (Sprint Change Proposal `sprint-change-proposal-2026-07-17.md`, 2026-07-17), **preservando o
texto original por marcação de emenda** — não por exclusão. **Não estão mais abertas.**

### DIV-1 — AD-27, cláusula "URL temporária e curta" — **EMENDADA e RATIFICADA**

Texto autoritativo **original** (o que a Rule dizia antes da emenda):

> … buckets privados; **acesso por URL temporária e curta**; validar tamanho/tipo/conteúdo …

Texto autoritativo **vigente** (`ARCHITECTURE-SPINE.md:179`, AD-27 Rule, após a emenda de 2026-07-17):

> … buckets privados; **acesso por entrega autenticada sob a sessão do usuário (proxy/stream pela API)** [emenda
> 2026-07-17 — OQ-47/Opção A; a redação original "acesso por URL temporária e curta" foi substituída …]; validar
> tamanho/tipo/conteúdo …

A Opção A (§4/§8) entrega por **stream sob sessão**, sem URL assinada, e o AD-27 agora diz exatamente isso. **Resolvida.**

### DIV-2 — epics 3.7 AC#2 — **EMENDADA e RATIFICADA**

Texto autoritativo **original** (o que o AC dizia antes da emenda):

> **Then** ocorre por **URL temporária, de curta duração, vinculada ao usuário, ao recurso e à finalidade**; a chave
> interna do objeto nunca é usada como autorização; não há link público permanente.

Texto autoritativo **vigente** (`epics.md:1178`, após a emenda de 2026-07-17):

> **Then** ocorre por **entrega autenticada sob a sessão do usuário (stream pela API), vinculada ao usuário, ao recurso
> e à finalidade**; a chave interna do objeto nunca é usada como autorização; não há link público permanente. *(Emenda
> 2026-07-17 …)*

A entrega sob sessão cumpre "vinculada ao usuário/recurso/finalidade" **melhor** que uma URL pré-assinada (que é
*bearer* e não se vincula a usuário nenhum), e mantém "sem link público permanente". **Resolvida.**

> **Por que o histórico fica registrado.** A v3 citou este AC cortando a primeira cláusula e concluindo que a Opção A
> "cumpre a epics 3.7 AC#2" — era falso, e o Spine registrava o conflito. A correção **não** foi reescrever a ADR para
> fingir conformidade: foi **emendar o artefato autoritativo pelo seu workflow**, preservando o original. **Regra
> mantida: toda citação de artefato autoritativo nesta ADR é bloco literal com `arquivo:linha`, nunca paráfrase.**

### DIV-3 — decisões do dono — **TOMADAS (2026-07-17)**

| # | Questão | Decisão do dono |
|---|---|---|
| **Q1** | `epics.md:1175`: *"tamanho máx por arquivo e limite total por recurso"* — bytes ou contagem? | **CONTAGEM: `FILE_MAX_PER_RESOURCE` = 10 arquivos/recurso**, configurável, faixa validada, fail-closed, **genérico** (não acopla a Card/Registro). A recomendação anterior de "adotar os dois" fica **revogada** — não há `FILE_MAX_BYTES_PER_RESOURCE` na Fase 1. Ver §9. |
| **Q2** | `epics.md:1193` põe *"rate limit e proteção contra abuso"* no escopo da 3.8. | **A proteção genérica contra saturação (rate limit + semáforo de scan) pertence à 3.7** — "a capacidade nunca entra no ar desprotegida". A **extração do primitivo antiabuso é tech story pré-requisito da 3.7** (não trabalho embutido). A **3.8** acrescenta só limites do **consumidor/canal público**. Ver §12. |
| **Q3** | `.txt`/`.csv`/`.json` não têm magic bytes; incluí-los quebraria o gate. | **FORA da allowlist inicial da 3.7. NÃO enfraquecer o gate de magic bytes** para aceitá-los. Entram no futuro só com validação de UTF-8, parser específico, limites estruturais e testes próprios. Ver §4.1. |

---

## Histórico de revisão (o que estava errado, e por quê)

Registrado porque o erro é instrutivo e **reincidente na mesma classe**: afirmação não verificada sobre o código ou
sobre artefato autoritativo, e AC que não pode reprovar.

**v1:**
- **"Negado pelo storage".** Inexequível: o MinIO não tem RLS e o backend tem credencial única. O AC não podia
  reprovar nada.
- **"URL assinada" + "validação por magic bytes" no mesmo parágrafo.** Incompatíveis: com `PUT` direto o servidor
  nunca vê os bytes, só a *declaração*.
- **"Reuso de `podePublicarComArquivo` no rollback".** Falso, verificado: `file-gate.ts:24` decide **publicabilidade
  de Formulário**; **único** chamador `snapshot.ts:79` (`publication.service.ts:121` apenas repassa a capacidade, não
  a chama). Não conhece rota, upload nem download.
- **"10 por Registro".** Acoplava a capacidade a um consumidor da 3.8 e erodia `Card ≠ Registro`.

**v2:**
- **`checksumOk` comparando um hash consigo mesmo** — sempre igual. O AC passava em qualquer sistema.
- **AC da guarda de prefixo pela rota HTTP** — a RLS matava a requisição antes de o adapter existir no caminho; o AC
  passava com a guarda **deletada**.
- **ClamAV (~2 GB) somado ao `docker-compose.yml`**, cujo próprio comentário declara *"4 GB / 2 vCPU — o orçamento
  acordado"* (`docker-compose.yml:8`), **já no teto** (1.5+1.5+1), num host que coabita com o Chatwoot. Era um OOM
  no sistema vizinho, escrito sem ler o comentário do arquivo que mandava alterar.

**v3 (reprovada por Arquitetura e Segurança, independentemente):**
- **Citou a epics 3.7 AC#2 pela metade** e chamou de cumprimento → DIV-2.
- **Inventou `FILES_ENABLED`** sem jamais mencionar `FILE_UPLOAD_ENABLED`, que existe (`env.ts:169`) → §10.
- **Modelo de ameaça creditou controles removidos**: T1 citava a STS que a §2.2 adiou; T10 citava a cota que a §9.1
  removeu. A assinatura do "AC que não pode reprovar", movida para a tabela que um revisor de segurança lê primeiro.
- **"O TOCTOU some junto com o limite que o exigia"** — falso: `FILE_MAX_PER_RESOURCE` **é** um contador, e era racy.
- **Reteve o nome do arquivo (que ela mesma classifica como PII) indefinidamente** em `INFECTED`/`DELETED` — seis
  seções depois de acusar a v1 de *"retenção indefinida contradizendo o próprio T9"*.
- **AC de cross-tenant tautológico**: *"negado pelo banco (RLS+FORCE) e pela RLS"* — a mesma camada, nomeada duas
  vezes, sem mutação.
- **Não especificou a persistência**: 417 linhas sobre isolamento multi-tenant de arquivos sem dizer o nome da
  tabela, a RLS, o GRANT, ou se o metadado recebe DELETE — numa base onde *"o GRANT é fronteira de segurança"*.
- **Contradisse-se sobre o escopo**: o Rollback dizia *"a 3.7 não toca `pipes/`"* enquanto a §Antiabuso mandava
  extrair código de `pipes/public-submissions/`.

---

## Decisão

### 1. Armazenamento

Storage **S3-compatible privado** (MinIO — AD-27), **conteúdo fora do banco**. Banco guarda **metadado e
autorização**; objeto guarda **bytes**. Nenhum bucket ou URL público, em nenhum ambiente.

**Dois buckets:** `quarentena` e `liberados`. Não são prefixos: prefixo é convenção, **bucket é fronteira** — uma
policy de prefixo errada é um typo silencioso; um bucket errado é um 404. A entrega **só** lê `liberados`.

#### 1.1 Chave opaca, gerada no servidor

**`<orgId>/<uuidv4>`. Nenhum byte da chave vem do cliente** — nem nome, nem extensão, nem id de recurso. Sustenta
quatro garantias de uma vez:

- **Não adivinhável** — a chave sai da **linha** lida sob `withTenantContext`, nunca de input.
- **Sem PII** — nome de arquivo é PII com frequência desconfortável (`exame-fulano.pdf`). A chave viaja por lugares
  que a §11 não controla (log do MinIO, proxy, Sentry, `mc ls`). Proibir o nome só no log da aplicação sanitizaria
  **um lado da porta**.
- **Sem colisão** — dois anexos de mesmo nome no mesmo recurso sobrescreveriam o primeiro, já escaneado: TOCTOU **sem
  ataque nenhum**, por caminho legítimo do produto. UUID elimina por construção, não por sanitização.
- **Sem ambiguidade de parsing** — `%2F`, `\`, CR/LF e normalização Unicode quebram proxies e normalizadores.

Nome original vive **apenas** na linha de metadado, org-scoped, sob RLS — e é **anonimizado no expurgo** (§9).

#### 1.2 A fronteira de tenant no storage (o AD-6 não alcança o MinIO)

**O MinIO não tem RLS, e o backend tem uma credencial ÚNICA.** Esta é a frase honesta. No banco há duas camadas
(aplicação **e** banco). **No storage há uma: a aplicação.** Dizer o contrário é o pior tipo de garantia — a que
ninguém confere porque acha que já está conferida.

**O isolamento entre Organizações no storage é garantido por:**

1. **Autorização** — deny-by-default, antes de qualquer byte.
2. **RLS** — a linha do `fileId` só é legível sob o contexto da Org dona. **Especificada na §2, com AC próprio e fase
   vermelha** — sem isso, "camada 2" seria prosa.
3. **Chave construída no servidor** (§1.1) — sai da linha, nunca de input; conhecê-la exige já ter passado pela RLS.
4. **Guarda de prefixo no adapter** — a porta recebe o `TenantContext` e **recusa** qualquer chave cujo **primeiro
   segmento** ≠ `<orgId>`, **antes** de tocar o cliente MinIO.

> **Comparação de prefixo é por SEGMENTO, não por `startsWith`.** `chave.split('/')[0] === orgId`, mais rejeição de
> chave sem `/`, com `..`, `%2F` ou CR/LF. Um `startsWith(orgId)` ingênuo é o bug de uma linha desta seção — e **o
> AC-26 o pega**, porque inclui o caso `<orgA>extra/<uuid>`. (Exploração é impraticável — `Organization.id` é UUID de
> 36 chars, `schema.prisma:298` — mas o AC deve pegar o bug, não depender de o formato do id salvar a implementação.)

**Risco residual, ACEITO e declarado:** uma camada, não duas. Qualquer leitura futura de `fileId` fora de
`withTenantContext` mata as camadas 2 e 3 de uma vez, e a guarda de prefixo (4) é o único backstop.

**Controles compensatórios:** storage privado (nenhum bucket ou URL público), credencial de **menor privilégio**
escopada aos dois buckets e vinda do cofre (AD-31 — a credencial da aplicação **não é** a raiz do MinIO), e nenhuma
chave fornecida pelo cliente.

**Hardening futuro, NÃO bloqueador da 3.7 (decisão do dono, 2026-07-17):** credenciais por prefixo via STS
`AssumeRole` (`s3:prefix=<orgId>/`). Enquanto não existir, **nenhum AC promete isolamento imposto pelo storage** —
porque nenhum componente pode reprovar esse teste. **O "Modelo de ameaça" não credita a STS a nada** (era o
defeito da v3).

### 2. Persistência — a camada 2, especificada (não em prosa)

> A v3 não tinha esta seção. Sem ela, o AC de cross-tenant não tem componente concreto que o reprove, e a Story
> entraria em implementação com a decisão mais pesada — GRANT de DELETE ou não — em aberto.

**DUAS tabelas, e a divisão não é organizacional — é de MUTABILIDADE.** Uma versão anterior desta seção tinha uma
tabela só e **um GRANT impossível de cumprir**; ver a nota ao fim da seção.

**`FileObject`** — o **ciclo de vida**, org-scoped, mutável: `id`, `orgId`, `bucketKey` (`<orgId>/<uuid>`),
`nomeOriginal` (**PII**), `resourceType`, `resourceId`, `state`, `createdAt`, `updatedAt`, `purgedAt`.

**`FileScan`** — o **fato apurado, APPEND-ONLY e IMUTÁVEL**: `id`, `orgId`, `fileId`, `tamanhoBytes`,
`mimeDetectado`, `sha256Ingest`, `sha256Releitura`, `veredito`, `scannedAt`. Escrita **uma única vez**, ao fim do
scan, quando **tudo já é conhecido**.

> **Por que duas.** `FileObject` nasce **antes do primeiro byte** (§4, passo 3) — precisa nascer, senão existe objeto
> sem linha durante todo o scan, `QUARANTINED` não é um estado persistido e o expurgo por expiração não tem o que
> varrer. Mas tamanho, MIME e hash **só existem depois** dos bytes. Numa tabela só, ou eles são graváveis por UPDATE
> (e o banco deixa de garantir a imutabilidade do hash forense), ou não são graváveis nunca (e o design não funciona).
> **Separar resolve os dois:** o fato imutável é INSERIDO uma vez, já completo, e **a imutabilidade passa a ser do
> banco** — exatamente o padrão que esta base já usa em `FormVersion`, `CardHistory` e `RecordHistory`.

**Isolamento pelo banco — o padrão obrigatório desta base, sem exceção, nas DUAS** (CLAUDE.md, *Isolamento
multi-tenant*):

- `ENABLE` **e** `FORCE ROW LEVEL SECURITY`.
- Policies `select`/`insert`/`update`/`delete` por `orgId = current_org_id()`.
- **`WITH CHECK` no INSERT *e* no UPDATE** — sem ele, um INSERT com `orgId` alheio é aceito e fica invisível, e um
  UPDATE pode **mover** a linha para outra Organização.
- Entrada em **`MODELOS_AUDITADOS`** (`tenant-context.ts:23`) — a lista é finita e explícita; tabela ausente dela
  **não gera trilha de auditoria, em silêncio**, inclusive na tentativa negada.
- Toda query por `withTenantContext`; nenhum `where orgId` manual; `orgId` nunca aceito do cliente.

**GRANT como fronteira** — molde do precedente `Record`/`RecordHistory`
(`migrations/20260716180000_records/migration.sql:120-123`):

```sql
GRANT SELECT, INSERT ON "FileObject" TO giraffe_app;
GRANT UPDATE ("state", "nomeOriginal", "updatedAt", "purgedAt") ON "FileObject" TO giraffe_app;

GRANT SELECT, INSERT ON "FileScan" TO giraffe_app;   -- append-only: SEM UPDATE, SEM DELETE.
```

- **Nenhuma das duas tem DELETE** — coerente com toda entidade de domínio desta base: soft-delete é `state`. O
  expurgo apaga os **bytes no MinIO**; a **linha sobrevive**, anonimizada (§9). Uma rota de DELETE acrescentada por
  engano amanhã bate em `permission denied`.
- **`FileScan` sem UPDATE nem DELETE** — o **SHA-256 e o veredito são preservados PELO BANCO**, não pela boa vontade
  do código. Um incidente em que o runtime pudesse reescrever o hash do objeto infectado não teria trilha.
- **`bucketKey`, `orgId`, `resourceType`, `resourceId` sem UPDATE** — chave imutável e recurso não transferível,
  garantidos pelo banco.
- **`nomeOriginal` COM UPDATE** — é o que torna a anonimização LGPD (§9) executável sem DELETE.

**Provas exigidas (ACs 24 e 25):** fase vermelha da RLS (desligar o `WITH CHECK` ⇒ o teste falha) e escopo do GRANT
(conceder DELETE, ou UPDATE em `FileScan` ⇒ o teste falha). O teste de INSERT cruzado usa **`createMany`**, não
`create`: *"o `create` do Prisma emite `INSERT … RETURNING`, e o RETURNING esbarra na policy de SELECT"* — nesta base
isso já deixou um teste verde com o `WITH CHECK` desligado, **duas vezes** (CLAUDE.md).

> **O defeito que esta seção teve, e como apareceu.** A primeira versão da §2 tinha **uma** tabela, com
> `sha256`/`tamanhoBytes`/`mimeDetectado` **sem GRANT de UPDATE** — enquanto a §4 fixava que a linha nasce **antes**
> dos bytes. Os três eram desconhecidos no INSERT e inatingíveis depois: o veredito composto não computaria, o
> `Content-Type` da §8 seria NULL, a auditoria da §11 não teria hash. E o AC de escopo do GRANT **exigia** que
> `sha256` fosse não-gravável — implementar de forma funcional **reprovaria o próprio AC**. A causa foi copiar o
> molde de `Record` sem ver que a **ordem de escrita é invertida**: `Record` é inserido depois de validado, com tudo
> conhecido; `FileObject` nasce vazio por decisão explícita. Duas correções corretas colidiram, e nenhuma revisão
> anterior pegaria isso porque a §2 **não existia** antes.

### 3. Onde vive (AD-24/AD-4/AD-5)

Módulo de domínio **próprio**: `apps/api/src/files/`. **Não** no kernel — limites, quarentena e allowlist **são regra
de negócio**, e o AD-4 proíbe regra no kernel.

Duas **portas** (AD-24); o domínio nunca fala com SDK:

- **`StoragePort`** — `gravar`, `ler`, `promover`, `remover`. Adapter MinIO.
- **`ScannerPort`** — `escanear(stream) → Veredito`, `saude() → Apto|Inapto`. Adapter ClamAV.

> **Nota de fidelidade ao AD-24.** `ARCHITECTURE-SPINE.md:164` enumera as portas *"(envio de e-mail, recebimento de
> e-mail, execução de IA, storage)"* — **scanner não está na lista**. A `ScannerPort` é uma **extensão** dessa
> enumeração, no espírito do AD-24 (não acoplar o domínio ao SDK do clamd). Registrado como extensão, não como
> instanciação — pelo mesmo motivo da §0.

Consumidores (Card 3.8, Registro 3.8, E5, E6, avatar 3.10) chegam por **contrato explícito** (AD-5), fornecendo
`resourceType`/`resourceId` **pela camada autorizada** — a capacidade nunca importa `pipe-authz`/`database-authz`.

### 4. Upload — stream pela API (Opção A)

**Não há URL pré-assinada.** Os bytes atravessam a API. Isto é o que torna as validações abaixo possíveis, e o AC#2 da
epics 3.7 **já foi emendado** para descrever exatamente esta entrega (DIV-2, §0).

Ordem obrigatória — **cada passo só roda se o anterior passou**:

0. **Rate limit atômico** (§12) e **limite de concorrência de scan** (§12.1). **Antes de qualquer byte aceito.**
1. **Autorização** — `podeEditar(resourceType, resourceId)` injetado pelo consumidor; deny-by-default.
2. **Limite por recurso** (§9), **atômico** — ver §9.2.
3. **Stream para `quarentena`**, sem carregar tudo em memória. **A linha `FileObject` (`state=QUARANTINED`) é criada
   ANTES do primeiro byte**, na mesma transação lógica — nunca há objeto sem linha (ver §5 e §9.3).
4. **Contagem de bytes REAIS**, abortando acima de `FILE_MAX_BYTES`. **`Content-Length` não é confiável** — é um
   número que o cliente digita.
5. **Magic bytes + MIME permitido (allowlist §4.1) + SHA-256 (nº 1)**, sobre os bytes que chegaram. **Nunca a
   extensão**: é texto que o cliente escolhe. Allowlist **positiva** — denylist é uma corrida que o atacante escolhe
   quando termina.
6. **Só então o antivírus** (§6) — que **relê os bytes REAIS da quarentena** e computa o **SHA-256 (nº 2)**.
7. Promoção a `AVAILABLE` só com o **veredito composto** (§5). **Nunca disponível antes de `CLEAN`.**

> **Por que o passo 0 é passo 0.** A v3 tinha o rate limit numa seção separada, fora da "ordem obrigatória" — um
> implementador que seguisse a §4 ao pé da letra o aplicaria depois de já ter recebido e persistido 10 MiB por
> requisição negada, que é exatamente o custo que ele deveria evitar. O primitivo da 2.8 acerta isso e diz o porquê:
> *"Fail-closed: a checagem **precede qualquer escrita**"* (`public-rate-limit.ts:17`).

#### 4.1 Allowlist — enumerada (a v3 a invocava sem nunca listá-la)

T6 e T7 dependem **inteiramente** do conteúdo desta lista. Baseline técnico conservador:

| MIME | Magic bytes |
|---|---|
| `application/pdf` | `25 50 44 46` (`%PDF`) |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| `image/jpeg` | `FF D8 FF` |
| `image/gif` | `47 49 46 38` (`GIF8`) |
| `image/webp` | `52 49 46 46` … `57 45 42 50` (`RIFF`/`WEBP`) |

**`image/svg+xml` é REJEITADO na base.** É o tipo que todo mundo põe numa allowlist de imagens e é XSS executável;
`attachment`+`nosniff` cobrem a navegação direta, mas o consumidor 3.10 **precisa exibir** a imagem, e
`epics.md:1229` exige literalmente *"rejeitar SVG ativo e formatos com conteúdo executável"*.

**Tipos sem magic bytes (`text/plain`, `text/csv`, `application/json`) e documentos Office (ZIP/`PK`, risco de macro)
ficam FORA da allowlist inicial — decisão Q3 do dono (§0).** O gate de magic bytes **não é enfraquecido** para
acomodá-los; eles entram no futuro só com validação de UTF-8, parser específico, limites estruturais e testes próprios.
Fail-closed: o que não está na lista é negado.

### 5. Veredito de promoção — COMPOSTO

`CLEAN && scannerApto && magicBytesOk && mimeOk && tamanhoOk && sha256Ingest === sha256Releitura`

Dizer só "scan `CLEAN` → promove" faria do antivírus a única condição — foi o erro da v1. **`scannerApto` é novo na
v4** e é o que fecha o HIGH-4 (§6.1).

#### 5.1 Dois SHA-256 independentes (decisão do dono, 2026-07-17)

- **nº 1** — computado no **ingest**, sobre o stream que a API recebeu.
- **nº 2** — computado no **pipeline de scan**, relendo os **bytes reais do storage**.
- **Só promove se os dois coincidirem.**
- **Ambos são persistidos JUNTOS, uma única vez, em `FileScan`** (§2), ao fim do scan — que é síncrono no mesmo
  handler (§5.2), então os dois já são conhecidos no INSERT. É por isso que `FileScan` **não precisa de UPDATE**, e
  por isso o banco pode garantir a imutabilidade do par.

**Por que dois:** a v2 computava **um** hash e ainda assim listava `checksumOk` no veredito — um hash comparado
**consigo mesmo é sempre igual**. Aquele AC passava em **qualquer** sistema, inclusive num em que o objeto tivesse
sido corrompido ou substituído entre a gravação e a promoção.

**De brinde, fecha um caminho que a v3 não percebeu:** um `INSTREAM` truncado faria o clamd responder `OK` sobre
bytes parciais — e o SHA nº 2 divergiria.

A releitura **não é custo extra**: o scanner precisa dos bytes de qualquer forma (o stream de ingestão já foi
consumido pelo hash e pelos magic bytes). O segundo hash aproveita a passagem que já acontece.

#### 5.2 A janela scan → promoção

Os dois SHA cobrem **ingest → scan**. `promover` é uma **terceira** leitura dos bytes, depois do SHA nº 2. **Nada
verificaria que o objeto copiado para `liberados` é o objeto escaneado.**

Exploração é difícil (a chave é UUID gerado no servidor, §1.1; o cliente nunca fornece chave), então isto é **defesa
em profundidade** — mas é barata, e o design já paga por ela em todo lugar: `promover` é **server-side copy
condicional ao checksum** (`CopyObject` com `x-amz-copy-source-if-match`), de modo que a promoção **falha** se o
objeto mudou.

**Modelo de execução:** o scan é **síncrono na requisição** de upload (`CLAMAV_TIMEOUT_MS`). Não há worker, fila nem
callback — **e isso é a decisão, não uma omissão**. Um endpoint de veredito exposto (`POST /files/:id/verdict`) seria
promoção arbitrária: `{"CLEAN"}` num id adivinhado tira malware da quarentena. Assíncrono entra quando houver
consumidor que o exija (AD-11), com contexto de Organização propagado (AD-8) — não antes.

### 6. Antivírus — ClamAV, fail-closed

**Nomeado de propósito:** "verificação de arquivo malicioso" sem implementação nomeada é requisito que nenhum teste
reprova.

**Nenhum destes é `CLEAN`:** timeout · erro · indisponibilidade · **limite excedido** · resultado ambíguo ·
**base de assinaturas ausente/obsoleta**.

> **Ausência de veredito não é veredito limpo. Veredito limpo por limite excedido também não. E veredito limpo de um
> scanner cego, menos ainda.**

#### 6.1 O scanner CEGO — o caminho que a v3 não cobria (HIGH-4)

Um clamd que subiu com `/var/lib/clamav` vazio, ou cuja base tem 8 meses, **não erra, não estoura limite e não dá
timeout**: ele responde `stream: OK`, com confiança, para malware conhecido. **Não cai em nenhuma das cinco condições
anteriores** — é fail-**open** silencioso, a classe exata que esta seção diz combater. É comum: container que sobe
antes do primeiro `freshclam`, ou `freshclam` quebrado por 30 dias (o rate limit do CDN da ClamAV é causa real e
frequente). O veredito composto da v3 estaria satisfeito e o malware iria a `AVAILABLE`. **Os ACs 7 e 8 ficariam
verdes** — eles testam erro/timeout e zip bomb, não a base.

**Controles:**

- **Canário EICAR no boot e periódico:** o adapter escaneia a string EICAR e **exige `INFECTED`**. Qualquer outro
  resultado ⇒ `scannerApto = false` ⇒ **nega upload** (é o T4 já desenhado).
- **Idade da base** via `VERSION`/`nSTATS` do clamd contra `CLAMAV_DB_MAX_AGE_HOURS` (fail-closed como os demais).

#### 6.2 `AlertExceedsMax` — o veredito por desistência

**`AlertExceedsMax yes`**, com a configuração validada contra a versão instalada no boot.

Ao estourar `MaxScanSize`/`MaxRecursion`/`MaxFiles`/`MaxScanTime`, o clamd **não** erra — ele **para de escanear e
responde `OK`**. Uma zip bomb de 8 MiB (dentro do `FILE_MAX_BYTES`) que descomprime para dezenas de GB seria
promovida com veredito limpo **na auditoria**, contornando o fail-closed **sem derrubar o scanner**.
`Heuristics.Limits.Exceeded` ⇒ **`INFECTED`**, nunca `CLEAN`.

#### 6.3 Coerência de limites — o auto-DoS silencioso

Com `AlertExceedsMax yes`, se `MaxFileSize`/`MaxScanSize`/`StreamMaxLength` do clamd forem **menores** que
`FILE_MAX_BYTES`, **todo** arquivo grande estoura os limites ⇒ `Heuristics.Limits.Exceeded` ⇒ **`INFECTED`**. E
`INFECTED` é **terminal**: seria **perda de dado do titular por má configuração**, com o veredito falso registrado na
auditoria. Os defaults do clamd são apertados e variam por imagem/distro.

**O boot valida `MaxFileSize ≥ FILE_MAX_BYTES`, `MaxScanSize ≥ FILE_MAX_BYTES` e `StreamMaxLength ≥ FILE_MAX_BYTES`,
e falha alto** — no espírito do fail-fast do `main.ts`.

### 7. Estados

```
  rate limit + autorização + limite por recurso  (ANTES de qualquer byte)
        │
        ▼
  linha criada (QUARANTINED) ──▶ stream ──▶ bytes contados ──▶ magic+MIME+SHA nº1 ──▶ scan (SHA nº2)
        │
        ▼
  ┌─────────────┐  veredito composto OK   ┌───────────┐  soft-delete  ┌─────────┐  expurgo ≤24h
  │ QUARANTINED │ ──────────────────────▶ │ AVAILABLE │ ────────────▶ │ DELETED │ ──────────▶ (bytes fora,
  └─────────────┘   (CopyObject if-match) └───────────┘               └─────────┘        nome anonimizado)
    │        │                                  │
    │        └── timeout/erro/limite/ambíguo/scanner cego ──▶ permanece QUARANTINED ──▶ expurgo por expiração
    │
    └── INFECTED ──▶ terminal: sem chave em `liberados` ──▶ expurgo dos BYTES por política;
                     SHA-256 + veredito retidos (forense) por FILE_FORENSIC_RETENTION_DAYS;
                     nome ANONIMIZADO no ato do expurgo dos bytes (§9)
```

- **`INFECTED` é impossível de baixar, não "negado"** — não existe chave em `liberados` para ler. Segurança por
  **ausência de caminho** é mais forte que checagem que precisa lembrar de existir.
- **`QUARANTINED` e `INFECTED` têm saída de expurgo** (`FILE_QUARANTINE_MAX_HOURS`).
- **Substituição** (AD-27, escopo da 3.7): novo objeto entra `QUARANTINED`; o anterior só recebe soft-delete **após**
  o novo virar `AVAILABLE`. Nunca antes — senão uma falha de scan perde os dois.

> **A linha precede o objeto** (§4, passo 3). A v3 dizia "estado inicial `QUARANTINED`" **depois** do scan, enquanto o
> diagrama o punha antes: na leitura literal, existiria objeto **sem linha** durante todo o scan — e o reconciliador
> da §9 (*"o objeto sem linha é órfão e também sai"*) o apagaria **em pleno voo**. Por isso o expurgo de órfãos tem
> **guarda de idade** (§9.3).

### 8. Download — stream pela API (Opção A)

**Sem redirect, sem URL bearer, sem acesso público ao storage.** Ver **DIV-2**. A cada solicitação:

1. **Revalida tenant, usuário, recurso, finalidade e autorização.** A permissão de ontem não autoriza o byte de hoje.
2. **Só `AVAILABLE`.**
3. **Stream** sob a sessão ativa.

Headers obrigatórios:

- `Content-Disposition: attachment` — com o nome **sanitizado** e `filename*=UTF-8''<pct-encoded>` (RFC 5987/6266). O
  nome vem do cliente; CR/LF ou `"` crus nele quebram o header e fazem o navegador cair para **inline**, desfazendo a
  proteção pelo caminho mais bobo possível.
- `Content-Type` = **o tipo DETECTADO pelos magic bytes na ingestão** (`mimeDetectado`), **nunca o declarado pelo
  cliente**.
- `X-Content-Type-Options: nosniff` — **entregável agora**; por URL pré-assinada seria impossível (o S3 só aceita
  override de `response-content-*`), e o AC teria passado verde num header que o navegador nunca receberia.
- `Content-Security-Policy: default-src 'none'; sandbox` — defesa em profundidade para conteúdo de usuário
  (`security-check.md` lista CSP como header exigido).
- `Cache-Control: private, no-store`.

**Matriz de resposta** (herda o padrão da base, não inventa):

| Situação | Código |
|---|---|
| Sem acesso (outro tenant, ou sem acesso ao recurso dono) | **404 uniforme**, indistinguível de inexistente |
| Com acesso, estado ≠ `AVAILABLE` | **409** `{ motivo: 'ARQUIVO_INDISPONIVEL' }` — **motivo único** |

O motivo é **único de propósito**: distinguir "em quarentena" de "infectado" daria a um uploader malicioso um
**oráculo de evasão de antivírus**, de graça. E 403-vs-404 seria oráculo de existência cross-tenant.

### 9. Limites, exclusão, expurgo e LGPD

| Limite | Valor recomendado no `.env.example` | Variável |
|---|---|---|
| Tamanho por arquivo | 10 MiB (`10485760`) | `FILE_MAX_BYTES` |
| Arquivos **por recurso** | 10 | **`FILE_MAX_PER_RESOURCE`** |

**`FILE_MAX_PER_RESOURCE` = CONTAGEM de arquivos, não bytes, não "por Registro" — decisão Q1 do dono (§0).**
`epics.md:1175` é explícito: *"desacoplada de Card e Registro (ajuste 6)"*. "Por Registro" acoplaria a capacidade a um
consumidor da 3.8, excluiria Card/Tarefa/e-mail/avatar — que esta ADR lista como consumidores — e o AC seria
**intestável na 3.7**. Recurso = par opaco `(resourceType, resourceId)`. **Não há `FILE_MAX_BYTES_PER_RESOURCE` na
Fase 1** (o dono decidiu "contagem"); a cota agregada por bytes segue como o débito DEB-1 (§9.1).

#### 9.1 Cota por tenant NÃO entra na Fase 1 (decisão do dono, 2026-07-17)

A v1 e a v2 traziam `FILE_MAX_TENANT_BYTES` (1 GiB/tenant). **Removido.** `epics.md:1185` diz, no seu próprio
"Fora do escopo": *"limites por Org/Formulário (**fora da Fase 1**)"* — e tenant **é** a Organização (AD-6/AD-10).
Mantê-lo seria ampliar o escopo da Fase 1, que a Constitution II proíbe. **A epics não foi emendada para acomodar a
baseline anterior** — a baseline é que cedeu ao artefato autoritativo.

Com isso cai também a **reserva na admissão**, que era internamente contraditória: só se pode reservar o
`Content-Length`, que a §4 declara mentiroso.

O que **fica** protegendo o mesmo risco na Fase 1: `FILE_MAX_BYTES`, `FILE_MAX_PER_RESOURCE` (**atômico**, §9.2),
**rate limit atômico por Org** (§12), **limite de concorrência do scanner** (§12.1), **quarentena e expurgo**, e
**fail-closed** quando storage ou scanner estiverem indisponíveis.

**Monitoramento de bytes físicos com alerta permanece — mas como DETECÇÃO, não proteção.** Alerta não impede; a v3 o
listava como se protegesse.

**Débito DEB-1 (pós-MVP):**

| Campo | Valor |
|---|---|
| **Débito** | Cota de armazenamento por tenant (`FILE_MAX_TENANT_BYTES`) |
| **Impacto** | Abuso de armazenamento e custo — um tenant pode crescer sem teto agregado |
| **Mitigação atual** | Limites por arquivo e por recurso; rate limit atômico **por Org**; expurgo ≤ 24 h; monitoramento de bytes físicos com alerta (detecta) |
| **Story-alvo** | Fase 2 — Story de cota/billing de armazenamento (a criar) |
| **Responsável** | Dono do produto (escopo) + Arquitetura (contabilização) |
| **Gatilho** | **Antes de self-service ou cobrança por uso** — enquanto o provisionamento for controlado, o abuso tem dono conhecido |
| **Gate** | Teste de **concorrência** e **contabilização de bytes físicos** (`QUARANTINED` + `AVAILABLE` + `DELETED`-não-expurgado + `INFECTED`; só o expurgo confirmado devolve cota — contar apenas `AVAILABLE` daria ~24× o limite/dia via soft-delete em loop) |

#### 9.2 `FILE_MAX_PER_RESOURCE` é um CONTADOR — e contador é racy (HIGH-3)

A v3 afirmou: *"sem cota por tenant, não há contador a reservar, e o TOCTOU some junto com o limite que o exigia."*
**Falso.** `FILE_MAX_PER_RESOURCE` é, por definição, um contador: conte os arquivos do recurso, compare com 10,
insira. Read-modify-write.

**Ataque:** recurso com 9 arquivos, **10 uploads concorrentes**. Todos leem `count=9`, todos passam, todos inserem ⇒
**19 arquivos** num limite de 10. Um AC sequencial ("o 11º é negado") fica **verde**.

**Mecanismo:** contagem e INSERT na **mesma transação interativa** (client raiz + `definirContextoOrg` — precedente
AD-13/2.6/2.7), sob **`pg_advisory_xact_lock`** do par `(orgId, resourceType, resourceId)`. Alternativa aceitável:
contador com guarda otimista (`UPDATE … WHERE count < :limite RETURNING`), o padrão que a memória do projeto registra
em `guarda-otimista-json-read-modify-write` e que a 2.8 já usa. **O AC-15 é o caso concorrente, com mutação.**

#### 9.3 Exclusão, expurgo e o nome que é PII (HIGH-6)

- **Soft-delete imediato** (some da superfície na hora) — `state=DELETED`, **sem DELETE de linha** (§2).
- **Expurgo físico idempotente ≤ 24 h** — idempotente porque um expurgo interrompido precisa rodar de novo sem estado
  inconsistente, e "apagar de novo" deve ser no-op.
- **No ato do expurgo dos bytes, `nomeOriginal` é ANONIMIZADO.** A §1.1 classifica o nome como PII. Reter
  `laudo-psiquiatrico-mariana-silva.pdf` para sempre numa linha `INFECTED` — por um falso positivo do ClamAV — é
  retenção indefinida de dado pessoal, **exatamente o que a v1 fez e esta ADR a acusou de fazer**. Para a forense,
  **o SHA-256 e o veredito bastam; o nome não**.
- **Retenção forense** (`FILE_FORENSIC_RETENTION_DAYS`, recomendado 90) para SHA-256 + veredito de `INFECTED`.
- **Banco e MinIO não têm snapshot atômico.** O expurgo é reconciliador: varre linhas `DELETED` e apaga o objeto; o
  objeto sem linha é órfão e também sai — **com guarda de idade** (> `CLAMAV_TIMEOUT_MS` + margem), senão apagaria um
  upload em pleno voo (§7).
- **Backup expira naturalmente** conforme a política do bucket; **retenção legal excepcional é flag auditada que
  bloqueia o expurgo** (epics 3.7 AC#4).

**Jobs de expurgo/limpeza** iteram **Org a Org sob `withTenantContext`** (AD-8), com principal próprio de capacidade
única (AD-9) e **GRANT column-scoped** — nunca um papel "que vê tudo", que seria `BYPASSRLS` com outro nome (AD-6).

**`lgpd-check` é obrigatório** nesta Story (Constitution IX — há dado pessoal).

### 10. Gate — `FILE_UPLOAD_ENABLED`, o que JÁ EXISTE

**Gate único: `FILE_UPLOAD_ENABLED`.** A v3 inventou `FILES_ENABLED` e **nunca mencionou** a flag existente.

Verificado: `env.ts:169-172` (Zod, `.optional()`, `v === 'true'`, default falso), consumida por `forms.service.ts:258`,
`publication.service.ts:121` e `file-gate.ts`. `.env.example:90` diz *"Deixe vazio até o E3"* — **aponta para esta
Story**. E `ARCHITECTURE-SPINE.md:186` nomeia **a existente**.

**Dois gates para uma capacidade é uma pergunta — "qual deles vale?" — que se responde errado em produção:**
`FILES_ENABLED=true` + `FILE_UPLOAD_ENABLED=false` ⇒ rotas de arquivo aceitando upload enquanto a publicação de Campo
Arquivo segue barrada; o inverso ⇒ Formulário publicável com Campo funcionalmente morto. Nenhum AC cobriria isso.

### 11. Observabilidade e LGPD

Auditoria **sem nome, conteúdo, token ou PII**, com `correlationId` (AD-29/AD-30) propagado do upload ao expurgo —
num fluxo multi-hop, sem ele ligar "promoveu" a "quem subiu" é trabalho manual sobre timestamps.

Registra: `fileId`, tenant, ator, ação, resultado, tamanho, **SHA-256**, veredito.

**A sanitização é CENTRAL (AD-29), não "na API".** Vale para o **audit log do MinIO**, o proxy reverso, o Sentry e o
clamd. A v1 sanitizava um lado da porta.

### 12. Antiabuso — extração do primitivo da 2.8 (decisão do dono, 2026-07-17)

**"Reuso" era a palavra errada; a certa é EXTRAÇÃO — e ela é uma TECH STORY pré-requisito da 3.7 (Q2 do dono, §0).**
O primitivo existe e é bom — `public-rate-limit.ts:31-39`, `INSERT … ON CONFLICT DO UPDATE … RETURNING` num único
statement, atômico, fail-closed → 429 (verificado) — mas ele vive em `pipes/public-submissions/`, um **módulo de
domínio**. Importá-lo de `files/` violaria o **AD-5** (`ARCHITECTURE-SPINE.md:69`: *"nenhum módulo acessa
repositório/tabela interna de outro"*). Por isso a extração **não** é trabalho embutido na 3.7: é a **tech story
pré-requisito** que move o primitivo para o kernel; a 3.7 então consome o kernel já extraído, **sem tocar `pipes/`**.

- **Extrair** (na tech story) para `kernel/antiabuso/`, preservando o statement atômico.
- **A 2.8 continua igual**, por **adapter compatível**: sem mudança de comportamento nem de contrato.
- **O kernel expõe SÓ mecanismos, nunca política.** São **dois**, porque o rate limit e o semáforo **são mecanismos
  diferentes** (ver §12.1):
  - `contar(chave, janela) → contagem` — o primitivo da 2.8, extraído como está.
  - `adquirirSlot(chave, teto, ttl) → token | null` / `liberarSlot(chave, token)` — o semáforo.
- **Janela e teto são parâmetros do chamador**, residentes em `files/` e `pipes/public-submissions/`. Hoje são
  constantes dentro do arquivo (`public-rate-limit.ts:6-7`); movê-las para o kernel seria **regra de negócio no
  kernel** — violação do AD-4 pela ADR que invoca o AD-4 (a §3 usa esse mesmo argumento para manter `files/` fora do
  kernel). **`contar` não recebe `teto`**: no primitivo real o teto **não entra no SQL** — é comparado em TS
  (`public-rate-limit.ts:41-42`). Um `teto` na assinatura do kernel seria parâmetro morto **convidando a mover a
  decisão para o kernel**, que é o que esta bullet proíbe.
- **`RateLimit` é tabela GLOBAL, sem RLS** (`schema.prisma:263-273`: sem `orgId`, `key @unique`), acessada por
  `$queryRaw` no client **raiz**, fora de `withTenantContext`. **Isto é deliberado e precisa ser dito**: é infra de
  plataforma, como `Account` e `PublicFormRoute` (AD-10). Um implementador que tente envolvê-la em
  `withTenantContext` bate na recusa de `$transaction` (`tenant-context.ts`); um que lhe dê RLS **quebra a 2.8**.

**A chave BINDA em `<orgId>` — `files:<orgId>` (HIGH-2).** A §9.1 nomeia o rate limit como o controle que substitui a
cota removida; então ele **tem** que produzir um teto agregado por Org. A v3 dizia "tenant + ator/recurso", e:

- `tenant + ator` ⇒ o Admin convida K membros; o teto efetivo vira **K × TETO**, ajustável pelo próprio atacante.
- `tenant + recurso` ⇒ **pior**: cria-se um recurso novo a cada TETO uploads; com `FILE_MAX_PER_RESOURCE=10` e
  recursos ilimitados, o rate limit **nunca binda**.

Sub-chaves por ator são permitidas **apenas como limite adicional mais estreito**, nunca como o denominador.

#### 12.1 Limite de concorrência de scan — DISTRIBUÍDO

T11 exige **os dois**: rate limit conta *requisições*; a concorrência limita *carga*. 20 uploads de 10 MiB
simultâneos passam por qualquer contador e prendem o clamd.

**Um semáforo in-process não protege nada aqui:** o AD-32 é deploy conteinerizado; com N réplicas da API e **um**
clamd compartilhado, N semáforos in-process permitem **N × limite** scans simultâneos, e o T11 segue aberto. O
semáforo é **distribuído**, no banco.

**Mas NÃO é o mesmo statement do rate limit** — e esta distinção é o que faltava:

| | Rate limit | Semáforo de scan |
|---|---|---|
| Mecanismo | contador de **janela**, monotônico | **slots ocupados/liberados** |
| Libera por | expiração da janela | **`liberarSlot` ao fim do scan** (+ TTL como rede) |
| Primitivo | `contar(chave, janela)` | `adquirirSlot(chave, teto, ttl)` / `liberarSlot(chave, token)` |

`contar()` **só incrementa** — verificado: `public-rate-limit.ts:31-39` faz
`count = CASE WHEN lastRequest < inicioJanela THEN 1 ELSE count+1 END`, e **não há decremento**. Um semáforo
construído sobre ele **não teria como liberar o slot**: a única saída seria a expiração, e então um scan legítimo de
2 s prenderia o slot por `CLAMAV_TIMEOUT_MS` + margem (≥ 30 s). Com teto L, a vazão da Org desabaria para **L scans
por ~30 s** — o "semáforo" degradaria para um segundo rate limit, **muito mais apertado do que qualquer um pretendia**,
e viraria **self-DoS de Org legítima**: exatamente o risco que o parágrafo seguinte diz evitar.

**Persistência do slot — especificada (não é a `RateLimit`).** A `RateLimit` tem só `id/key/count/lastRequest`
(`schema.prisma:263-273`) — **não guarda `token` nem `expiraEm`**, então o semáforo **não** a reusa; usá-la seria a
mesma imprecisão que reprovou a v3 ("não especificou a persistência"). O slot vive numa tabela **global de plataforma
`ScanSlot`** (sem RLS, como `RateLimit`/`Account`/`PublicFormRoute` — AD-10; a chave carrega o `<orgId>`, não a linha):
colunas `key` (`scan:<orgId>`), `token` (uuid), `expiraEm` (timestamp). Vive em `kernel/antiabuso/`, ao lado do
contador. **GRANT `SELECT/INSERT/DELETE`** (o `liberarSlot` apaga a linha — é infra de antiabuso, como a `RateLimit`,
que o runtime já pode apagar: `migrations/20260713000000_auth_e_antiabuso/migration.sql:125`).

- `adquirirSlot(chave, teto, ttl)` — statement **atômico** que conta os slots ativos (`expiraEm > now`) da chave e
  insere um novo **só se** abaixo do teto, devolvendo o `token` ou `null` (fail-closed → 429). Sem read-then-write.
- `liberarSlot(chave, token)` — `DELETE WHERE key AND token`. **Roda em `finally`** — um `throw` no scanner não pode
  vazar slot.

**Slots expiram** (`ttl` = `CLAMAV_TIMEOUT_MS` + margem) **como REDE, não como caminho normal**: uma réplica que morre
no meio do scan vazaria o slot para sempre e **trancaria a Org fora da capacidade** — o fail-closed viraria self-DoS
permanente.

**Provas exigidas (AC-17):** teto **não ultrapassado** sob concorrência; **a vazão volta assim que o scan termina**
(não espera o TTL — é o que separa semáforo de rate limit); slot de réplica morta expira; fail-closed; **ausência de
regressão na 2.8**.

> **Escopo (Q2 — DECIDIDO pelo dono, §0).** A **proteção genérica contra saturação (rate limit + semáforo) pertence à
> 3.7** — "a capacidade nunca entra no ar desprotegida". A **extração do primitivo antiabuso da 2.8 é tech story
> pré-requisito da 3.7** (precedente `tech-d01-hop-web-api-autenticado.md`), não trabalho embutido — assim a 3.7 **não
> toca** `pipes/` diretamente (consome o kernel já extraído). A **3.8** acrescenta só limites do **consumidor/canal
> público** (`epics.md:1193`). Isto reconcilia a epics: o rate limit **base** é infraestrutura da 3.7 via a tech
> story; o rate limit **do canal público** é da 3.8.

### 13. Proibições

- **Sem bypass administrativo** — nem Admin da Org, nem Super Admin. É o caminho que se procura primeiro.
- **Sem armazenamento local** (efêmero, sem replicação, fora de backup).
- **Sem entrega antes do scan** — nenhuma exceção "só preview", "só imagem", "só o dono".

---

## Modelo de ameaça

**Regra: só entra aqui controle que EXISTIRÁ na Fase 1.** A v3 creditou a STS (adiada) e a cota por tenant (removida)
— o "AC que não pode reprovar", movido para a tabela que um revisor de segurança lê primeiro.

| # | Ameaça | Regra que a nega |
|---|---|---|
| T1 | Cross-tenant por chave do objeto | Chave opaca da linha + RLS (§2) + guarda de prefixo por segmento (§1.2, **AC-26**). **Sem imposição pelo storage na Fase 1** — credencial única; uma camada, não duas (§1.2) |
| T2 | Cross-**recurso** intra-tenant (mesmo tenant, outro Pipe) | `podeLer/podeEditar` do consumidor (§3/§8). **RLS é necessária e insuficiente**: dois usuários da mesma Org passam por ela |
| T3 | Malware distribuído pelo CRM | `QUARANTINED` inicial; veredito **composto** (§5); `INFECTED` sem chave em `liberados` |
| T4 | Scanner fora do ar vira porta aberta | Timeout/erro **mantém** quarentena |
| T5 | **Zip bomb / veredito por desistência** | `AlertExceedsMax` + limite excedido ⇒ `INFECTED` (§6.2). Acontece **sozinho**, como T4 |
| **T5b** | **Scanner CEGO — base ausente/obsoleta responde `OK` sem escanear** | **Canário EICAR + idade da base ⇒ `scannerApto=false` ⇒ nega** (§6.1). Pior que T4: **não dispara nada** |
| T6 | XSS armazenado (HTML/SVG inline na origem do CRM, com o cookie junto) | `attachment` + `nosniff` + CSP + `no-store` + allowlist enumerada **sem SVG** (§4.1) |
| T7 | Spoof de MIME/extensão | Magic bytes sobre os **bytes recebidos** (§4, passo 5); `Content-Type` da resposta = **detectado**, não declarado (§8) |
| T8 | Injeção de header via nome de arquivo | Sanitização + `filename*` RFC 5987 |
| T9 | Vazamento por log (assinatura/PII) | Chave opaca + sanitização **central** (§11). Sem presigned URL, não há assinatura a vazar |
| T10 | Exaustão de storage / DoS por custo | `FILE_MAX_BYTES` + `FILE_MAX_PER_RESOURCE` **atômico** (§9.2) + rate limit por Org (§12) + expurgo. **Cota agregada por tenant: risco ACEITO (DEB-1)** — monitoramento **detecta**, não nega |
| T11 | **Exaustão do scanner compartilhado** | Rate limit atômico **por Org** (§12) **+ semáforo DISTRIBUÍDO de scan** (§12.1). Sem os dois, saturar o ClamAV **nega arquivos a todos os tenants** — o fail-closed do T4 vira DoS da plataforma, **sem malware nenhum** |
| T12 | Retenção indevida (LGPD) | Soft-delete + expurgo ≤ 24 h idempotente, **inclusive de `QUARANTINED`/`INFECTED`**, + **anonimização do nome** (§9.3) |
| **T13** | **Corrupção/substituição do objeto entre gravação e promoção** | Dois SHA-256 independentes (§5.1) + `CopyObject` **if-match** na promoção (§5.2) |
| T14 | Bypass privilegiado (produto **e** operação) | §13 + credencial de storage de menor privilégio, do cofre (AD-31) |
| **T15** | **Auto-DoS: limites do clamd < `FILE_MAX_BYTES` ⇒ arquivo legítimo vira `INFECTED` terminal** | Validação de coerência no boot, falha alto (§6.3) |

## Alternativas consideradas

| Alternativa | Por que **não** |
|---|---|
| **URL pré-assinada (a v1)** | **Rejeitada pelo dono.** É *bearer*: vincula-se à chave e ao relógio, **nunca ao usuário**. Impede `nosniff`, impede validar bytes na emissão, e a chave mutável abre TOCTOU entre scan e promoção. A cláusula "URL temporária" que ela cumpria **deixou de ser exigida**: a epics 3.7 AC#2 e o AD-27 foram emendados para descrever a entrega sob sessão (DIV-1/DIV-2, §0) |
| Bytes no banco (`bytea`) | Infla backup/WAL; AD-27 já decidiu storage dedicado |
| Prefixos em vez de dois buckets | Prefixo é convenção; policy errada expõe tudo |
| Scan assíncrono com entrega otimista | Distribui malware na janela |
| Endpoint de veredito (`POST /verdict`) | Promoção arbitrária num id adivinhado |
| Denylist de tipos | Corrida que o atacante escolhe quando termina |
| Antivírus opcional / degradar sob falha | É o T4. "Opcional sob falha" = ausente quando importa |
| Semáforo de scan in-process | N réplicas ⇒ N × limite (§12.1) |
| Bypass para Admin | Reabre T3/T14 |
| Storage local | Sem replicação/versionamento; contra AD-27/AD-32 |

## Defaults

**Nenhum limite tem default no código.** Ausente ou ilegível ⇒ **nega**.

| Variável | Recomendado no `.env.example` | Se ausente/ilegível |
|---|---|---|
| `FILE_UPLOAD_ENABLED` | `false` (já existe — §10) | capacidade **desabilitada e oculta** (é o próprio fail-closed) |
| `FILE_MAX_BYTES` | `10485760` | nega upload |
| `FILE_MAX_PER_RESOURCE` | `10` | nega upload |
| `FILE_QUARANTINE_MAX_HOURS` | `24` | nega upload |
| `FILE_FORENSIC_RETENTION_DAYS` | `90` | expurgo forense não roda ⇒ **alerta** |
| `CLAMAV_URL` | — | **nega upload** |
| `CLAMAV_TIMEOUT_MS` | `30000` | mantém quarentena |
| `CLAMAV_DB_MAX_AGE_HOURS` | `48` | **nega upload** (§6.1) |
| `FILE_PURGE_MAX_HOURS` | `24` | expurgo não roda ⇒ **alerta**, nunca "pula" |

**Faixa validada no `getEnv()` (Zod), não só presença** — `main.ts` já faz fail-fast antes de o Nest subir. Teto de
segurança é constante de código, não variável: `FILE_MAX_BYTES` ≤ 10 MiB, `CLAMAV_TIMEOUT_MS` ≤ 60 s. Sem isso,
"ausente nega" não é acionado por um valor **presente e absurdo** (`FILE_MAX_BYTES=10737418240`), e o teto de
segurança vira ajustável sem deploy — exatamente o que a v1 permitia. **AC-27 prova o teto.**

## Rollback

**Gate: `FILE_UPLOAD_ENABLED`** (§10). **A 3.7 DECLARA a constante de motivo e a função de gate; a 3.8 CONSOME** — o
precedente exato de `podePublicarComArquivo` (2.4 declara, 2.6 consome).

- `FILE_UPLOAD_ENABLED=false` ⇒ **rotas não existem**; upload e download negados fail-closed. Rota que não existe não
  tem bug de autorização.
- **`FormVersion` é IMUTÁVEL** (runtime só tem `SELECT`/`INSERT`). Um Formulário publicado com Campo Arquivo
  **sobrevive** ao rollback. **Decisão:** a `FormVersion` conserva o Campo, e **seu uso retorna indisponibilidade
  explícita** (409 `{ motivo: 'CAPACIDADE_ARQUIVO_INDISPONIVEL' }`) — nunca erro opaco, nunca aceite silencioso.
  **Esse 409 é AC da 3.8** (ver AC-2 abaixo), porque só lá existe consumidor de Campo Arquivo.
- **Rollback de aplicação NÃO apaga objeto nem dado.**
- **Rollback de schema só após prova de ausência/migração dos dados.**

> **Escopo de `pipes/`:** a extração do antiabuso é a **tech story pré-requisito** (Q2 do dono, §12), então a 3.7
> **não toca** `pipes/` nem `databases/` — consome o `kernel/antiabuso/` já extraído. Suas dependências declaradas
> (`epics.md:1183`: 1.2/1.3/1.4/1.6) ficam intactas, somadas à dependência da tech story de extração.

## Critérios de aceite

Verdadeiros = podem **reprovar**. Cada AC crítico tem **mutação**: o código de proteção é quebrado de propósito e o
teste **precisa** ficar vermelho. Um AC sem mutação é uma afirmação, não uma prova.

1. `FILE_UPLOAD_ENABLED` ausente/`false` ⇒ rotas de arquivo **não existem** (404 de rota).
2. **[3.8, não 3.7]** `FILE_UPLOAD_ENABLED=false` + `FormVersion` publicada com Campo Arquivo ⇒ **409
   `CAPACIDADE_ARQUIVO_INDISPONIVEL`**. **Na 3.7 este AC é intestável** — não há consumidor de Campo Arquivo
   (`epics.md:1195` põe a ativação na 3.8) e ele passaria por vacuidade, **inclusive com a função de gate deletada**.
   **AC da 3.7 correspondente:** a constante e a função de gate existem, são **puras** e reprovam sob capacidade
   desabilitada — testável por unidade, como `forms-file-gate.test.ts` já faz para `podePublicarComArquivo`.
3. **Cross-tenant:** upload/download com `fileId` de outra Org ⇒ **404 uniforme**, negado pela **autorização** *e*
   pela **RLS** — provado com a autorização da aplicação **neutralizada**, para que a RLS seja o único controle em
   teste. *(A v3 dizia "negado pelo banco (RLS+FORCE) e pela RLS" — a mesma camada, duas vezes, sem mutação.)*
4. **Cross-recurso intra-tenant:** usuário com acesso ao recurso A e não ao B, mesma Org ⇒ **404**. Roda contra um
   **consumidor de teste** (a 3.7 não tem recursos próprios).
5. **`Content-Length` mentiroso:** declara 1 MiB, envia 50 MiB ⇒ **abortado ao cruzar `FILE_MAX_BYTES`**, medido por
   bytes reais. *(Mutação: trocar a contagem real pelo header ⇒ o teste falha.)*
6. **Spoof:** extensão/MIME de PDF, magic bytes de HTML ⇒ **rejeitado**. **Um caso por entrada da allowlist (§4.1) e
   um caso negativo por tipo perigoso** (SVG, HTML, `application/x-dosexec`).
7. **Scanner com erro/timeout** ⇒ permanece `QUARANTINED`. *(Mutação: mapear timeout→CLEAN ⇒ o teste falha.)*
8. **Zip bomb / `AlertExceedsMax`:** arquivo dentro de `FILE_MAX_BYTES` que estoura os limites do clamd ⇒
   **`INFECTED`**, nunca `CLEAN`. *(Mutação: sem `AlertExceedsMax`, o clamd responde `OK` e o teste falha.)*
9. **Scanner CEGO:** clamd com base de assinaturas vazia/obsoleta ⇒ upload **negado**; **nenhum** arquivo chega a
   `AVAILABLE`. *(Mutação: remover o canário EICAR ⇒ o EICAR é promovido como `CLEAN` e o teste fica vermelho.)*
10. **Coerência de limites:** clamd com `StreamMaxLength` < `FILE_MAX_BYTES` ⇒ **o boot falha**, em vez de marcar
    arquivos legítimos como `INFECTED` terminal.
11. **`INFECTED`** ⇒ download impossível em qualquer papel, **inclusive Admin**.
12. **Dois SHA-256 independentes:** corromper o objeto na `quarentena` **entre o ingest e o scan** ⇒ **não promove**.
    Costura: **`StoragePort` decorador de teste** que substitui os bytes no MinIO real após o ingest (a produção não
    ganha hook nenhum) — sem isso o AC é **inexecutável**, porque o scan é síncrono no mesmo handler (§5.2), e a
    "solução" natural seria comparar dois hashes do mesmo buffer, **que é o defeito da v2**. *(Mutação: comparar
    `sha256Ingest` consigo mesmo ⇒ verde ⇒ o teste falha.)*
13. **Promoção if-match:** corromper o objeto **entre o scan e a promoção** ⇒ a promoção falha (T13).
14. **Limites:** acima de `FILE_MAX_BYTES` e 11º no recurso (**genérico**, não Registro) ⇒ negados. **Não há AC de
    cota por tenant** — o limite não existe na Fase 1 (§9.1).
15. **Limite por recurso sob CONCORRÊNCIA:** recurso com 9 arquivos, 10 uploads simultâneos ⇒ **no máximo 10 no
    total**. *(Mutação: trocar a guarda atômica por read-then-insert ⇒ o teste fica vermelho.)*
16. **Rate limit atômico por Org:** N+1 uploads **da Org** na janela ⇒ **429**; outra Org segue aceita; **K membros da
    mesma Org não multiplicam o teto**. *(Mutação: trocar por read-modify-write não atômico ⇒ falha sob
    concorrência; chavear por ator ⇒ o caso dos K membros fica vermelho.)* E a **2.8 não regride**.
17. **Semáforo de scan distribuído:** M uploads concorrentes com teto L ⇒ **no máximo L scans em voo**; **assim que um
    scan termina, o slot é liberado e o próximo entra — sem esperar o TTL**; slot de réplica morta **expira** e a Org
    não fica trancada. *(Mutação A: construir o semáforo sobre `contar()` (só incrementa) ⇒ a vazão cai para L por
    TTL e o caso "o próximo entra" fica vermelho. Mutação B: tirar o `liberarSlot` do `finally` ⇒ um scanner que
    lança vaza o slot e o teste fica vermelho.)*
18. **Download:** `attachment` + `Content-Type` **detectado** + `nosniff` + CSP + `private, no-store`, verificados
    **na resposta real da API**.
19. **Nome hostil** (CRLF, aspas) ⇒ header íntegro, download preservado como `attachment`.
20. **Substituição:** o anterior só sai **após** o novo virar `AVAILABLE`.
21. **Expurgo** ≤ 24 h, **idempotente** (rodar duas vezes é no-op), inclusive de `QUARANTINED`/`INFECTED`; e **após o
    expurgo, nenhuma coluna contém o nome original**. *(Mutação: manter o nome ⇒ o teste fica vermelho.)*
22. **Órfão com guarda de idade:** objeto sem linha, recém-criado, **não** é expurgado em pleno voo.
23. **Logs** sem nome, conteúdo, token ou PII — **em todos os componentes do caminho**, incluindo o MinIO.
24. **RLS, fase vermelha:** INSERT cross-tenant via **`createMany`** (sem `RETURNING`) ⇒ negado. *(Mutação: desligar o
    `WITH CHECK` ⇒ o teste falha.)* Usa `createMany` porque *"o `create` do Prisma emite `INSERT … RETURNING`, e o
    RETURNING esbarra na policy de SELECT"* — nesta base isso já deixou um teste verde com o `WITH CHECK` desligado.
25. **GRANT, escopo:** `DELETE` em `FileObject` **ou** em `FileScan`; `UPDATE` de coluna fora do escopo em
    `FileObject` (`bucketKey`, `orgId`, `resourceId`); **qualquer `UPDATE` em `FileScan`** (append-only) ⇒
    **`permission denied`**. *(Mutação: conceder o privilégio ⇒ o teste falha.)* **Este AC não pode exigir que
    `sha256` seja não-gravável em `FileObject`:** o hash não mora lá — mora em `FileScan`, inserido uma vez já
    completo (§2). Uma versão anterior o exigia numa tabela única cuja linha nasce **antes** dos bytes, e assim
    **provava** o defeito em vez de preveni-lo: implementar de forma funcional reprovaria o AC.
26. **Guarda de prefixo — DIRETO no adapter, com spy:** chamar o adapter com `TenantContext` da Org A e chave
    `<orgB>/<uuid>` ⇒ **recusa antes de qualquer chamada ao cliente MinIO**, provado por **fake/spy com zero
    interação**. Inclui o caso **`<orgA>extra/<uuid>`** (um `startsWith` ingênuo passaria). *(Mutação: remover a
    guarda ⇒ o fake recebe a chamada e o teste fica vermelho.)* **Por que separado do AC-3:** na v2 este AC ia pela
    rota HTTP, e a **RLS matava a requisição antes de o adapter existir no caminho** — ele passava com a guarda
    **deletada**. A integração HTTP/RLS continua como defesa adicional, **não como prova desta guarda**.
27. **Teto de segurança:** `FILE_MAX_BYTES=10737418240` (presente e absurdo) ⇒ **o boot falha**.
28. **Testes contra MinIO e ClamAV REAIS** para 3, 5, 6, 7, 8, 9, 10, 12, 13, 18. Um mock de scanner não prova
    fail-closed pela mesma razão que um mock de banco não prova isolamento.

## Provisionamento (AD-32)

**MinIO e ClamAV NÃO entram na stack compartilhada com o Chatwoot** (decisão do dono, 2026-07-17).

| Ambiente | Onde | Fail-closed |
|---|---|---|
| **Dev / CI** | `docker-compose.override.yml` — que o **Coolify não carrega** (`docker-compose.override.yml:7`: ele invoca `-f docker-compose.yml`) | `CLAMAV_URL` ausente ⇒ nega upload |
| **Staging / Produção** | **capacidade externa ou dedicada**, nunca na stack coabitada — **AD-32/deploy** (**DEB-2**: provedor não decidido) | idem: sem storage ou scanner ⇒ **nega**, nunca degrada |

**Por que isto é uma regra e não uma preferência — o que a v2 quase causou.** A v2 mandava acrescentá-los ao
`docker-compose.yml`. Esse arquivo declara, no próprio comentário: *"Somados, os três serviços ficam sob **4 GB /
2 vCPU** — o orçamento acordado para o CRM neste host compartilhado"* (`docker-compose.yml:8`) — e ele **já está no
teto** (1.5 + 1.5 + 1 GB, verificado). O clamd carrega a base de assinaturas em memória (~1–2 GB), e o MinIO soma
mais. O mesmo arquivo é o de deploy no Coolify, num host que **coabita com o Chatwoot**. A instrução da v2 era, na
prática, um **OOM no sistema vizinho** que a ordem manda não tocar — causado pela ADR que deveria protegê-lo. Eu
escrevi aquilo sem ler o comentário do arquivo que estava mandando alterar.

O `.env.example` recebe as variáveis (documentação), mas **nenhum serviço novo** entra no compose base.

Sem o override, o AC-28 é **auto-inexequível** em dev/CI (`CLAMAV_URL` ausente ⇒ nega ⇒ a 3.7 nasce impossível de
rodar). Com ele, dev/CI têm MinIO e ClamAV **reais**, que é o que o AC-28 exige — e o host compartilhado não ganha
nada.

**Débito DEB-2:** *"externa ou dedicada"* é uma **disjunção, não uma decisão**. Não bloqueia a 3.7 (o gate default
`false` cobre), mas **bloqueia habilitar a capacidade em qualquer ambiente ≠ dev/CI**. Responsável: Arquitetura +
dono. Gatilho: antes do primeiro `FILE_UPLOAD_ENABLED=true` fora de dev/CI.

## O que esta ADR NÃO decide

E-mail outbound e IA seguem **gated** (AD-28; OQ-32, OQ-43..46).

**Fronteira que precisa ser dita:** o **E6 (e-mail inbound)** é um caminho de entrada de anexos **sem sessão de
usuário**, com tenant resolvido por callback de provedor e, dependendo do provedor, **bytes buscados por URL** — aí
SSRF vira vetor real, e nada nesta ADR o cobre. Hoje isso está protegido **por acidente**: o gate do AD-28 sobre
e-mail é a única coisa que o impede. Quando o e-mail destravar, o caminho de arquivo já estará aberto e ninguém
revisará esta ADR de novo. **E6 exige decisão própria antes do destravamento do e-mail.**

**Também não decide:** o provedor de storage/scanner de staging/produção (DEB-2) e a implementação em si (a 3.7 é
passo futuro, com seus gates de runtime). Q1/Q2/Q3 **já foram decididas** pelo dono (§0/DIV-3).
