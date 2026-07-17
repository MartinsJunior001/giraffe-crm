# ADR-001 — Capacidade compartilhada de arquivos (resolve OQ-47, destrava AD-28 para arquivos)

- **Status:** **PROPOSTA** — Opção A e as decisões de escopo são do dono (2026-07-17); a v3 aguarda revisão independente de Arquitetura e Segurança. **Não é "aprovada"**: aprovar antes do `security-check` inverteria o gate da Constitution.
- **Escopo:** **apenas arquivos.** E-mail outbound e IA **permanecem gated** pelo AD-28 (OQ-32, OQ-43..46 abertas).
- **Rastreabilidade:** OQ-47 (Produto) · AD-4/AD-5 (fronteiras) · AD-6 (isolamento) · AD-9 (principal) · AD-13
  (transação) · **AD-24 (portas)** · AD-27 (Storage) · AD-28 (fail-closed) · AD-29 (observabilidade) · AD-30
  (auditoria) · **AD-32 (ambientes)** · D3.5 · NFR-8 · Épico 3 Stories 3.7/3.8/3.10 · consumidores E5, E6.
- **Consome:** o **AD-27 já é autoritativo** (MinIO, buckets privados, validação, checksum, quarentena, malware, sem
  acesso cruzado por chave, ciclo de vida). Esta ADR **não o reescreve — o instancia** com o que faltava para sair do
  fail-closed: **números**, **antivírus nomeado**, **modelo de execução** e **fronteira de porta**.

## Histórico de revisão (o que estava errado na v1)

Registrado porque a v1 chegou a ser escrita e revisada, e o erro é instrutivo:

- **v1 prometia "negado pelo storage".** Inexequível: o MinIO não tem RLS e o backend tinha uma credencial única. O
  AC correspondente **não podia reprovar nada** — o defeito que esta base combate desde a Story 1.2.
- **v1 dizia "URL assinada" e "validação por magic bytes" no mesmo parágrafo.** Incompatíveis: com `PUT` direto o
  servidor nunca vê os bytes, só a *declaração*.
- **v1 alegava reuso de `podePublicarComArquivo` no rollback.** Falso: essa função decide **publicabilidade de
  Formulário** (2.4 declara, 2.6 consome) e não conhece rota, upload nem download.
- **v1 usava "10 por Registro".** Acoplava a capacidade a um consumidor da 3.8 e erodia `Card ≠ Registro`, contra o
  ajuste 6 da epics 3.7 (*"desacoplada de Card e Registro"*).

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
  que a §8 não controla (log do MinIO, proxy, Sentry, `mc ls`). Proibir o nome só no log da aplicação sanitizaria
  **um lado da porta**.
- **Sem colisão** — dois anexos de mesmo nome no mesmo recurso sobrescreveriam o primeiro, já escaneado: TOCTOU **sem
  ataque nenhum**, por caminho legítimo do produto. UUID elimina por construção, não por sanitização.
- **Sem ambiguidade de parsing** — `%2F`, `\`, CR/LF e normalização Unicode quebram proxies e normalizadores.

Nome original vive **apenas** na linha de metadado, org-scoped, sob RLS.

#### 1.2 A fronteira de tenant no storage (o AD-6 não alcança o MinIO)

**O MinIO não tem RLS, e o backend tem uma credencial ÚNICA.** Esta é a frase honesta, e ela substitui a da v1
("negado pelo storage") e a da v2 ("só a STS torna aquilo verdadeiro, mas não há AC"). **Nenhuma das duas era
sustentável.** No banco há duas camadas (aplicação **e** banco). **No storage há uma: a aplicação.** Dizer o
contrário é o pior tipo de garantia — a que ninguém confere porque acha que já está conferida.

**O isolamento entre Organizações no storage é garantido por:**

1. **Autorização** — deny-by-default, antes de qualquer byte.
2. **RLS** — a linha do `fileId` só é legível sob o contexto da Org dona.
3. **Chave construída no servidor** (§1.1) — sai da linha, nunca de input; conhecê-la exige já ter passado pela RLS.
4. **Guarda de prefixo no adapter** — a porta recebe o `TenantContext` e **recusa** qualquer chave cujo prefixo ≠
   `<orgId>`, **antes** de tocar o cliente MinIO.

**Controles compensatórios:** storage privado (nenhum bucket ou URL público), credencial de **menor privilégio**
escopada aos dois buckets e vinda do cofre (AD-31 — a credencial da aplicação **não é** a raiz do MinIO), e nenhuma
chave fornecida pelo cliente.

**Hardening futuro, NÃO bloqueador da 3.7 (decisão do dono, 2026-07-17):** credenciais por prefixo via STS
`AssumeRole` (`s3:prefix=<orgId>/`). Enquanto não existir, **nenhum AC promete isolamento imposto pelo storage** —
porque nenhum componente pode reprovar esse teste, e um AC que não reprova nada é o defeito que esta base combate
desde a Story 1.2.

### 2. Onde vive (AD-24/AD-4/AD-5)

Módulo de domínio **próprio**: `apps/api/src/files/`. **Não** no kernel — limites, quarentena e allowlist **são regra
de negócio**, e o AD-4 proíbe regra no kernel.

Duas **portas** (AD-24); o domínio nunca fala com SDK:

- **`StoragePort`** — `gravar`, `ler`, `promover`, `remover`. Adapter MinIO.
- **`ScannerPort`** — `escanear(stream) → Veredito`. Adapter ClamAV.

Consumidores (Card 3.8, Registro 3.8, E5, E6, avatar 3.10) chegam por **contrato explícito** (AD-5), fornecendo
`resourceType`/`resourceId` **pela camada autorizada** — a capacidade nunca importa `pipe-authz`/`database-authz`.

### 3. Upload — stream pela API (Opção A)

**Não há URL pré-assinada.** Os bytes atravessam a API. Isto não é preferência: é o que torna as validações abaixo
possíveis, e o que cumpre a epics 3.7 AC#2 (vínculo a usuário/recurso/finalidade), impossível com bearer.

Ordem obrigatória — cada passo só roda se o anterior passou:

1. **Autorização** — `podeEditar(resourceType, resourceId)` injetado pelo consumidor; deny-by-default.
2. **Stream para `quarentena`**, sem carregar tudo em memória.
3. **Contagem de bytes REAIS**, abortando acima de `FILE_MAX_BYTES`. **`Content-Length` não é confiável** — é um
   número que o cliente digita.
4. **Magic bytes + MIME permitido (allowlist) + SHA-256 (nº 1)**, sobre os bytes que chegaram. **Nunca a extensão**: é
   texto que o cliente escolhe. Allowlist **positiva** — denylist é uma corrida que o atacante escolhe quando termina.
5. **Só então o antivírus** (§4) — que **relê os bytes REAIS da quarentena** e computa o **SHA-256 (nº 2)**.
6. Estado inicial **`QUARANTINED`**. **Nunca disponível antes de `CLEAN`.**

#### 3.1 Dois SHA-256 independentes (decisão do dono, 2026-07-17)

- **nº 1** — computado no **ingest**, sobre o stream que a API recebeu, e persistido.
- **nº 2** — computado no **pipeline de scan**, relendo os **bytes reais do storage**.
- **Só promove se os dois coincidirem.**

**Por que dois:** a v2 computava **um** hash e ainda assim listava `checksumOk` no veredito — um hash comparado
**consigo mesmo é sempre igual**. Aquele AC passava em **qualquer** sistema, inclusive num em que o objeto tivesse
sido corrompido ou substituído entre a gravação e a promoção. Era exatamente a classe de defeito pela qual a v2
reprovou a v1, reintroduzida por descuido.

A releitura **não é custo extra**: o scanner precisa dos bytes de qualquer forma (o stream de ingestão já foi
consumido pelo hash e pelos magic bytes). O segundo hash aproveita a passagem que já acontece.

**Veredito de promoção é COMPOSTO:** `CLEAN && magicBytesOk && mimeOk && tamanhoOk && sha256Ingest === sha256Releitura`.
Dizer só "scan `CLEAN` → promove" faria do antivírus a única condição — foi o erro da v1.

**Modelo de execução:** o scan é **síncrono na requisição** de upload (`CLAMAV_TIMEOUT_MS`). Não há worker, fila nem
callback — **e isso é a decisão, não uma omissão**. Um endpoint de veredito exposto (`POST /files/:id/verdict`) seria
promoção arbitrária: `{"CLEAN"}` num id adivinhado tira malware da quarentena. Assíncrono entra quando houver
consumidor que o exija (AD-11), com contexto de Organização propagado (AD-8) — não antes.

### 4. Antivírus — ClamAV, fail-closed

**Nomeado de propósito:** "verificação de arquivo malicioso" sem implementação nomeada é requisito que nenhum teste
reprova.

**`AlertExceedsMax yes`, com a configuração validada contra a versão instalada** no boot.

**Nenhum destes é `CLEAN`:** timeout · erro · indisponibilidade · **limite excedido** · resultado ambíguo.

> **Ausência de veredito não é veredito limpo — e veredito limpo por limite excedido também não é.**

A segunda metade dessa frase é a que a v1 não tinha, e é a mais perigosa: ao estourar `MaxScanSize`/`MaxRecursion`/
`MaxFiles`/`MaxScanTime`, o clamd **não** erra — ele **para de escanear e responde `OK`**. Uma zip bomb de 8 MiB
(dentro do `FILE_MAX_BYTES`) que descomprime para dezenas de GB seria promovida com veredito limpo **na auditoria**,
contornando o fail-closed **sem derrubar o scanner**. `Heuristics.Limits.Exceeded` ⇒ **`INFECTED`**, nunca `CLEAN`.

### 5. Estados

```
  upload (autorizado, stream, bytes contados, magic+MIME+SHA-256 OK)
        │
        ▼
  ┌─────────────┐  veredito composto OK   ┌───────────┐  soft-delete  ┌─────────┐  expurgo ≤24h
  │ QUARANTINED │ ──────────────────────▶ │ AVAILABLE │ ────────────▶ │ DELETED │ ──────────▶ (bytes fora)
  └─────────────┘                         └───────────┘               └─────────┘
    │        │                                  │
    │        └── timeout/erro/limite/ambíguo ──▶ permanece QUARANTINED ──▶ expurgo por expiração
    │
    └── INFECTED ──▶ terminal: sem chave em `liberados` ──▶ expurgo dos BYTES por política;
                     metadado + SHA-256 retidos (forense)
```

- **`INFECTED` é impossível de baixar, não "negado"** — não existe chave em `liberados` para ler. Segurança por
  **ausência de caminho** é mais forte que checagem que precisa lembrar de existir.
- **`QUARANTINED` e `INFECTED` têm saída de expurgo** (`FILE_QUARANTINE_MAX_HOURS`). A v1 os deixava terminais e
  prometia LGPD na prosa: retenção indefinida contradizendo o próprio T9.
- **Substituição** (AD-27, escopo da 3.7): novo objeto entra `QUARANTINED`; o anterior só recebe soft-delete **após**
  o novo virar `AVAILABLE`. Nunca antes — senão uma falha de scan perde os dois.

### 6. Limites (configuráveis, fail-closed)

| Limite | Valor recomendado no `.env.example` | Variável |
|---|---|---|
| Tamanho por arquivo | 10 MiB (`10485760`) | `FILE_MAX_BYTES` |
| Arquivos **por recurso** | 10 | **`FILE_MAX_PER_RESOURCE`** |

**Estes dois, e só estes.** A epics 3.7 autoriza literalmente *"tamanho máx por arquivo e limite total por recurso"*.

**`FILE_MAX_PER_RESOURCE`, não "por Registro".** A epics 3.7 é explícita: *"desacoplada de Card e Registro (ajuste
6)"*. "Registro" nesta base é a entidade `Record`, e `Card ≠ Registro` é invariante. "Por Registro" acoplaria a
capacidade a um consumidor da 3.8, excluiria Card/Tarefa/e-mail/avatar — que esta ADR lista como consumidores — e o
AC seria **intestável na 3.7**, porque anexo de Registro só existe na 3.8. Recurso = par opaco
`(resourceType, resourceId)`.

#### 6.1 Cota por tenant NÃO entra na Fase 1 (decisão do dono, 2026-07-17)

A v1 e a v2 traziam `FILE_MAX_TENANT_BYTES` (1 GiB/tenant). **Removido.** A epics 3.7 diz, no seu próprio
"Fora do escopo": *"limites por Org/Formulário (**fora da Fase 1**)"* — e tenant **é** a Organização (AD-6/AD-10).
Mantê-lo seria ampliar o escopo da Fase 1, que a Constitution II proíbe. **A epics não foi emendada para acomodar a
baseline anterior** — a baseline é que cedeu ao artefato autoritativo.

Com isso **caem também** os ACs que dependiam dele e a discussão de **reserva na admissão** — que, como as revisões
apontaram, era internamente contraditória: só se pode reservar o `Content-Length`, que a §3.3 declara mentiroso.
Sem cota por tenant, não há contador a reservar, e o TOCTOU some junto com o limite que o exigia.

O que **fica** protegendo o mesmo risco na Fase 1: `FILE_MAX_BYTES`, `FILE_MAX_PER_RESOURCE`, **rate limit atômico**,
**limite de concorrência do scanner**, **quarentena e expurgo**, **monitoramento dos bytes físicos com alertas
operacionais**, e **fail-closed** quando storage ou scanner estiverem indisponíveis.

**Débito registrado (pós-MVP):**

| Campo | Valor |
|---|---|
| **Débito** | Cota de armazenamento por tenant (`FILE_MAX_TENANT_BYTES`) |
| **Impacto** | Abuso de armazenamento e custo — um tenant pode crescer sem teto agregado |
| **Mitigação atual** | Limites por arquivo e por recurso; rate limit atômico; expurgo ≤ 24 h; monitoramento de bytes físicos com alerta |
| **Story-alvo** | Fase 2 — Story de cota/billing de armazenamento (a criar; não existe Story de Fase 1 que a comporte) |
| **Responsável** | Dono do produto (escopo) + Arquitetura (contabilização) |
| **Gatilho** | **Antes de self-service ou cobrança por uso** — enquanto o provisionamento for controlado, o abuso tem dono conhecido |
| **Gate** | Teste de **concorrência** e **contabilização de bytes físicos** (`QUARANTINED` + `AVAILABLE` + `DELETED`-não-expurgado + `INFECTED`; só o expurgo confirmado devolve cota — contar apenas `AVAILABLE` daria ~24× o limite/dia via soft-delete em loop) |

### 7. Download — stream pela API (Opção A)

**Sem redirect, sem URL bearer, sem acesso público ao storage.** A cada solicitação:

1. **Revalida tenant, usuário, recurso, finalidade e autorização.** A permissão de ontem não autoriza o byte de hoje.
2. **Só `AVAILABLE`.**
3. **Stream** sob a sessão ativa.

Headers obrigatórios:

- `Content-Disposition: attachment` — com o nome **sanitizado** e `filename*=UTF-8''<pct-encoded>` (RFC 5987/6266). O
  nome vem do cliente; CR/LF ou `"` crus nele quebram o header e fazem o navegador cair para **inline**, desfazendo a
  proteção pelo caminho mais bobo possível.
- `X-Content-Type-Options: nosniff` — **entregável agora**; por URL pré-assinada seria impossível (o S3 só aceita
  override de `response-content-*`), e o AC teria passado verde num header que o navegador nunca receberia.
- `Cache-Control: private, no-store`.

**Matriz de resposta** (herda o padrão da base, não inventa):

| Situação | Código |
|---|---|
| Sem acesso (outro tenant, ou sem acesso ao recurso dono) | **404 uniforme**, indistinguível de inexistente |
| Com acesso, estado ≠ `AVAILABLE` | **409** `{ motivo: 'ARQUIVO_INDISPONIVEL' }` — **motivo único** |

O motivo é **único de propósito**: distinguir "em quarentena" de "infectado" daria a um uploader malicioso um
**oráculo de evasão de antivírus**, de graça. E 403-vs-404 seria oráculo de existência cross-tenant.

### 8. Exclusão, expurgo e backup

- **Soft-delete imediato** (some da superfície na hora).
- **Expurgo físico idempotente ≤ 24 h** — idempotente porque um expurgo interrompido precisa rodar de novo sem estado
  inconsistente, e "apagar de novo" deve ser no-op.
- **Banco e MinIO não têm snapshot atômico.** O expurgo é reconciliador: varre linhas `DELETED` e apaga o objeto; o
  objeto sem linha é órfão e também sai. Nunca assume que as duas metades caíram juntas.
- **Backup expira naturalmente** conforme a política do bucket; **retenção legal excepcional é flag auditada que
  bloqueia o expurgo** (epics 3.7 AC#4).
- Limpeza de **uploads órfãos** e **quarentenas expiradas**.

**Jobs de expurgo/limpeza** iteram **Org a Org sob `withTenantContext`** (AD-8), com principal próprio de capacidade
única (AD-9) e **GRANT column-scoped** — nunca um papel "que vê tudo", que seria `BYPASSRLS` com outro nome (AD-6).

### 9. Observabilidade e LGPD

Auditoria **sem nome, conteúdo, token ou PII**, com `correlationId` (AD-29/AD-30) propagado do upload ao expurgo —
num fluxo multi-hop, sem ele ligar "promoveu" a "quem subiu" é trabalho manual sobre timestamps.

Registra: `fileId`, tenant, ator, ação, resultado, tamanho, **SHA-256**, veredito.

**A sanitização é CENTRAL (AD-29), não "na API".** Vale para o **audit log do MinIO**, o proxy reverso, o Sentry e o
clamd. A v1 sanitizava um lado da porta.

### 10. Proibições

- **Sem bypass administrativo** — nem Admin da Org, nem Super Admin. É o caminho que se procura primeiro.
- **Sem armazenamento local** (efêmero, sem replicação, fora de backup).
- **Sem entrega antes do scan** — nenhuma exceção "só preview", "só imagem", "só o dono".

## Modelo de ameaça

| # | Ameaça | Regra que a nega |
|---|---|---|
| T1 | Cross-tenant por chave do objeto | Chave opaca da linha + guarda de prefixo + STS por prefixo (§1.1/1.2) |
| T2 | Cross-**recurso** intra-tenant (mesmo tenant, outro Pipe) | `podeLer/podeEditar` do consumidor (§2/§7). **RLS é necessária e insuficiente**: dois usuários da mesma Org passam por ela |
| T3 | Malware distribuído pelo CRM | `QUARANTINED` inicial; veredito **composto**; `INFECTED` sem chave em `liberados` |
| T4 | Scanner fora do ar vira porta aberta | Timeout/erro **mantém** quarentena |
| T5 | **Zip bomb / veredito por desistência** | `AlertExceedsMax` + limite excedido ⇒ `INFECTED`. Acontece **sozinho**, como T4 |
| T6 | XSS armazenado (HTML/SVG inline na origem do CRM, com o cookie junto) | `attachment` + `nosniff` + `no-store` + allowlist por magic bytes |
| T7 | Spoof de MIME/extensão | Magic bytes sobre os **bytes recebidos** (§3.4) |
| T8 | Injeção de header via nome de arquivo | Sanitização + `filename*` RFC 5987 |
| T9 | Vazamento por log (assinatura/PII) | Chave opaca + sanitização **central** (§9). Sem presigned URL, não há assinatura a vazar |
| T10 | Exaustão de storage / DoS por custo | Limites por arquivo/recurso/tenant contando **bytes físicos** |
| T11 | **Exaustão do scanner compartilhado** | Rate limit por Org na admissão, fail-closed → 429, reusando o primitivo atômico da 2.8. Sem ele, saturar o ClamAV **nega arquivos a todos os tenants** — o fail-closed do T4 vira DoS da plataforma |
| T12 | Retenção indevida (LGPD) | Soft-delete + expurgo ≤ 24 h idempotente, **inclusive de `QUARANTINED`/`INFECTED`** |
| T13 | Bypass privilegiado (produto **e** operação) | §10 + credencial de storage de menor privilégio, do cofre (AD-31) |

## Alternativas consideradas

| Alternativa | Por que **não** |
|---|---|
| **URL pré-assinada (a v1)** | **Rejeitada pelo dono.** É *bearer*: vincula-se à chave e ao relógio, **nunca ao usuário** — contradiz a epics 3.7 AC#2 (*"vinculada ao usuário, ao recurso e à finalidade"*). Impede `nosniff`, impede validar bytes na emissão, e a chave mutável abre TOCTOU entre scan e promoção |
| Bytes no banco (`bytea`) | Infla backup/WAL; AD-27 já decidiu storage dedicado |
| Prefixos em vez de dois buckets | Prefixo é convenção; policy errada expõe tudo |
| Scan assíncrono com entrega otimista | Distribui malware na janela |
| Endpoint de veredito (`POST /verdict`) | Promoção arbitrária num id adivinhado |
| Denylist de tipos | Corrida que o atacante escolhe quando termina |
| Antivírus opcional / degradar sob falha | É o T4. "Opcional sob falha" = ausente quando importa |
| Bypass para Admin | Reabre T3/T13 |
| Storage local | Sem replicação/versionamento; contra AD-27/AD-32 |

## Defaults

**Nenhum limite tem default no código.** Ausente ou ilegível ⇒ **nega** — as duas colunas da v1 ("Default" **e**
"ausente nega") eram contraditórias e gerariam schemas Zod opostos.

| Variável | Recomendado no `.env.example` | Se ausente/ilegível |
|---|---|---|
| `FILES_ENABLED` | `false` | capacidade **desabilitada e oculta** (é o próprio fail-closed) |
| `FILE_MAX_BYTES` | `10485760` | nega upload |
| `FILE_MAX_PER_RESOURCE` | `10` | nega upload |
| `FILE_QUARANTINE_MAX_HOURS` | `24` | nega upload |
| `CLAMAV_URL` | — | **nega upload** |
| `CLAMAV_TIMEOUT_MS` | `30000` | mantém quarentena |
| `FILE_PURGE_MAX_HOURS` | `24` | expurgo não roda ⇒ **alerta**, nunca "pula" |

**Faixa validada no `getEnv()` (Zod), não só presença** — `main.ts` já faz fail-fast antes de o Nest subir. Teto de
segurança é constante de código, não variável: `FILE_MAX_BYTES` ≤ 10 MiB, `CLAMAV_TIMEOUT_MS` ≤ 60 s. Sem isso,
"ausente nega" não é acionado por um valor **presente e absurdo** (`FILE_MAX_BYTES=10737418240`), e o teto de
segurança vira ajustável sem deploy — exatamente o que a v1 permitia.

## Rollback

**Gate PRÓPRIO da capacidade: `FILES_ENABLED`.** A v1 alegava reuso de `podePublicarComArquivo` — **falso**: aquela
função decide **publicabilidade de Formulário** (2.4 declara, 2.6 consome), não conhece rota/upload/download, e não
tem chamador nenhum no caminho de arquivo.

- `FILES_ENABLED=false` ⇒ **rotas não existem**; upload e download negados fail-closed. Rota que não existe não tem
  bug de autorização.
- **`FormVersion` é IMUTÁVEL** (runtime só tem `SELECT`/`INSERT`). Um Formulário publicado com Campo Arquivo
  **sobrevive** ao rollback — a v1 afirmava que "a capacidade some da UX", e isso era falso para toda publicação
  existente. **Decisão:** a `FormVersion` conserva o Campo, e **seu uso retorna indisponibilidade explícita**
  (409 `{ motivo: 'CAPACIDADE_ARQUIVO_INDISPONIVEL' }`) — nunca erro opaco, nunca aceite silencioso.
- **Rollback de aplicação NÃO apaga objeto nem dado.**
- **Rollback de schema só após prova de ausência/migração dos dados.**

## Critérios de aceite

Verdadeiros = podem **reprovar**. Os da v1 (2, 6, 7, 8) passariam verdes sobre um sistema vulnerável.

1. `FILES_ENABLED` ausente/`false` ⇒ rotas de arquivo **não existem** (404 de rota).
2. `FILES_ENABLED=false` + `FormVersion` publicada com Campo Arquivo ⇒ **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`**
   explícito (nunca 500, nunca aceite silencioso).
3. **Cross-tenant:** upload/download com `fileId` de outra Org ⇒ **404 uniforme**; negado pelo banco (RLS+FORCE) **e**
   pela RLS. **A guarda de prefixo tem AC PRÓPRIO (nº 19)** — este aqui prova a RLS, não a guarda.
4. **Cross-recurso intra-tenant:** usuário com acesso ao recurso A e não ao B, mesma Org ⇒ **404**.
5. **`Content-Length` mentiroso:** declara 1 MiB, envia 50 MiB ⇒ **abortado ao cruzar `FILE_MAX_BYTES`**, medido por
   bytes reais. *(Mutação: trocar a contagem real pelo header ⇒ o teste falha.)*
6. **Spoof:** extensão/MIME de PDF, magic bytes de HTML ⇒ **rejeitado**.
7. **Scanner com erro/timeout** ⇒ permanece `QUARANTINED`. *(Mutação: mapear timeout→CLEAN ⇒ o teste falha.)*
8. **Zip bomb / `AlertExceedsMax`:** arquivo dentro de `FILE_MAX_BYTES` que estoura os limites do clamd ⇒
   **`INFECTED`**, nunca `CLEAN`. *(Regressão + mutação: sem `AlertExceedsMax`, o clamd responde `OK` e o teste falha.)*
9. **`INFECTED`** ⇒ download impossível em qualquer papel, **inclusive Admin**.
10. **Dois SHA-256 independentes:** corromper o objeto na `quarentena` entre o ingest e o scan ⇒ **não promove**. *(Mutação: comparar o hash consigo mesmo ⇒ o teste falha — era assim na v2, e passava em qualquer sistema.)*
11. **Limites:** acima de `FILE_MAX_BYTES` e 11º no recurso (**genérico**, não Registro) ⇒ negados. **Não há AC de cota por tenant** — o limite não existe na Fase 1 (§6.1).
12. **Rate limit atômico:** N+1 uploads da Org na janela ⇒ **429**; outra Org segue aceita. *(Mutação: trocar por read-modify-write não atômico ⇒ o teste falha sob concorrência.)* E a **2.8 não regride**.
13. **Download:** `attachment` + `nosniff` + `private, no-store`, verificados **na resposta real da API**.
14. **Nome hostil** (CRLF, aspas) ⇒ header íntegro, download preservado como `attachment`.
15. **Substituição:** o anterior só sai **após** o novo virar `AVAILABLE`.
16. **Expurgo** ≤ 24 h, **idempotente** (rodar duas vezes é no-op), inclusive de `QUARANTINED`/`INFECTED`.
17. **Logs** sem nome, conteúdo, token ou PII — **em todos os componentes do caminho**, incluindo o MinIO.
18. **Testes contra MinIO e ClamAV REAIS** para 3, 5, 6, 7, 8, 10, 13. Um mock de scanner não prova fail-closed pela
    mesma razão que um mock de banco não prova isolamento.

## Provisionamento (AD-32)

A 3.7 **deve** acrescentar `minio` e `clamav` ao **`docker-compose.yml`** — fonte única de provisionamento, pelo mesmo
motivo pelo qual o banco do CI sobe por lá: reescrever no YAML do workflow criaria uma segunda verdade, e a que vale em
produção seria a que ninguém testa. As 8 variáveis entram no `.env.example`.

Sem isso o AC-18 é **auto-inexequível** (`CLAMAV_URL` ausente ⇒ nega ⇒ a 3.7 nasce impossível de rodar).

Provedor gerenciado, buckets por ambiente e topologia de produção são **AD-32/deploy** — não desta ADR. *(A v1 citava
AD-11 aqui; errado: AD-11 é sobre referência entre entidades, não sobre provedor ou ambiente.)*

## O que esta ADR NÃO decide

E-mail outbound e IA seguem **gated** (AD-28; OQ-32, OQ-43..46).

**Fronteira que precisa ser dita:** o **E6 (e-mail inbound)** é um caminho de entrada de anexos **sem sessão de
usuário**, com tenant resolvido por callback de provedor e, dependendo do provedor, **bytes buscados por URL** — aí
SSRF vira vetor real, e nada nesta ADR o cobre. Hoje isso está protegido **por acidente**: o gate do AD-28 sobre
e-mail é a única coisa que o impede. Quando o e-mail destravar, o caminho de arquivo já estará aberto e ninguém
revisará esta ADR de novo. **E6 exige decisão própria antes do destravamento do e-mail.**

19. **Guarda de prefixo — testada DIRETO no adapter, com spy (decisão do dono, 2026-07-17):** chamar o adapter com
    `TenantContext` da Org A e chave `<orgB>/<uuid>` ⇒ **recusa antes de qualquer chamada ao cliente MinIO**, provado
    por **fake/spy com zero interação**. *(Mutação: remover a guarda ⇒ o fake recebe a chamada e o teste fica
    vermelho.)* **Por que separado do AC-3:** na v2 este AC ia pela rota HTTP, e a **RLS matava a requisição antes de
    o adapter existir no caminho** — ele passava com a guarda **deletada**. A integração HTTP/RLS continua como defesa
    adicional, **não como prova desta guarda**.
