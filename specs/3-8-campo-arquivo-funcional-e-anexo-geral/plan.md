# Plan — Story 3.8: Campo Arquivo funcional e anexo geral (Card/Registro)

Baseline **a definir** (sobre a **3.7 mergeada** — hoje `ready-for-dev`, em PR). **BLOQUEIO DURO:** o plano só
sai do papel com a 3.7 fechada; a **assinatura exata do `FileAuthzContract`** e o baseline se fixam nesse momento.
DOCS-ONLY (Planner n+1): este plano não autoriza código.

Governança: **ADR-001 v5** (ratificada) — o **AC-2 é desta Story** ("[3.8, não 3.7]"). Consumo puro da capacidade
da 3.7; ativa o tipo `FILE` e cria o anexo geral. Reusa Form Builder (2.4/2.5/2.6), submissão (2.7/2.8/3.4) e as
guardas `pipe-authz`/`database-authz` (2.10/3.4).

## Decisões do clarify (Q1–Q8 — defaults conservadores do planner, a VALIDAR na abertura; ver `spec.md §Clarifications`)

- **Q1** Valor `FILE` = `fileId`(s) `AVAILABLE` deste recurso/finalidade; `QUARANTINED`/cross-recurso → rejeita (400/409).
- **Q2** Modelagem **mínima** (AD-11): preferir vínculo por JSONB + finalidade sem GRANT novo; `resourceType`
  validado por allowlist no consumidor. **A fixar no data-model quando a 3.7 mergear** (a forma do `FileObject` é dela).
- **Q3** `FileAuthzContract` = o contrato que a 3.7 congelar (Q2 da 3.7); binding injetado pelo consumidor em `FilesModule`.
- **Q4** Limites do canal público = novas variáveis de ambiente com faixa validada no `getEnv()` (fail-closed).
- **Q5** Coluna `FILE` na tabela (3.5) = **exibível** (nome/estado + download), **não** filtrável/ordenável (segue gated).
- **Q6** Eventos `FILE_ATTACHED`/`FILE_REPLACED`/`FILE_REMOVED` (Card e Registro).
- **Q7** Pai (Pipe/Database) arquivado **também** bloqueia upload no filho.
- **Q8** Sem download público (submitter sem sessão; entrega sob sessão só interna).

## Estratégia: consumir, não reimplementar

A 3.7 entrega `files/` (StoragePort/ScannerPort, `FileObject`/`FileScan`, quarentena, veredito, rotas genéricas de
upload/download, porta `FileAuthzContract`) e `kernel/antiabuso/` (rate limit + `ScanSlot`). A 3.8 **liga** isso a
Card e Registro em quatro frentes, tocando o mínimo:

## Camadas e arquivos

### F1 — Binding de autorização por recurso (INV-FILE-03; AD-5, sem ciclo)
- **Card** (`apps/api/src/pipes/`): implementação de `FileAuthzContract` para `resourceType=CARD` — `podeLer` →
  `exigirLerCard`; `podeEditar` → `exigirOperarCard` (2.10). Registrada por `PipesModule`.
- **Registro** (`apps/api/src/databases/`): idem para `resourceType=RECORD` — `exigirLerDatabase`/
  `exigirOperarDatabase` (3.4). Registrada por `DatabasesModule`.
- **Injeção:** provider token exposto por `FilesModule`; os módulos consumidores fornecem a implementação (o
  `files/` não importa authz de domínio). Deny-by-default; 404 não-enumerante; T2 (cross-recurso).

### F2 — Valor do Campo `FILE` como referência (substitui o tratamento textual)
- **`pipes/cards/submission.ts`** (núcleo puro compartilhado por 2.7/2.8/3.4): remover `FILE` de `TIPOS_TEXTO`;
  novo ramo de validação de referência — `fileId` (único) ou `fileId[]` (múltiplo, por `typeConfig.multiplo`
  congelado no snapshot); cada `fileId` deve ser `FileObject` `AVAILABLE`, mesma Org, **vinculado a este
  recurso/finalidade** (não arbitrário). Allowlist anti-mass-assignment mantida; ausência OK quando não `required`.
- **Consumidores:** `pipes/cards` (interno 2.7), `pipes/public-submissions` (público 2.8), `databases/records`
  (3.4) passam a referenciar `fileId`. A validação da referência exige o binding de recurso (F1) para o vínculo.

### F3 — Gate de consumo (AC-2 da ADR)
- No ponto de submissão (mesmos três caminhos): se o snapshot da `FormVersion` tem Campo Arquivo **ativo** e
  `FILE_UPLOAD_ENABLED` ≠ `true` → **409 `CAPACIDADE_ARQUIVO_INDISPONIVEL`**. Reusa `tipoArquivoDisponivel`/
  `podePublicarComArquivo` (`file-gate.ts`) — **satisfaz**, não reescreve. Teste com **mutação** (deletar o gate → vermelho).

### F4 — Anexo geral por recurso (Card e Registro)
- Modelagem mínima (Q2, a fixar): o anexo geral é uma linha `FileObject` com `(resourceType, resourceId)` do
  Card/Registro e finalidade "ATTACHMENT" (discriminador só se necessário). Rotas de adicionar/listar/remover
  lógico + download stream sob sessão, herança de permissão via F1. **Sem anexo geral público.**
- **Card:** subdomínio provável `pipes/cards/files/` (controller + service finos, delegando a `files/`).
- **Registro:** `databases/records/files/` (idem).

### F5 — Substituição sem perda silenciosa + eventos
- Substituir Campo Arquivo único: novo `QUARANTINED` → promoção `AVAILABLE` (máquina da 3.7) → soft-delete do
  anterior → evento `FILE_REPLACED` na **mesma transação** (`definirContextoOrg`, client raiz). Anexar/remover →
  `FILE_ATTACHED`/`FILE_REMOVED`. Escritos em `CardHistory`/`RecordHistory` (append-only), sem PII.

### F6 — Canal público
- `pipes/public-submissions`: ativar Campo Arquivo no `POST /public/forms/:publicId/submit`. Limites do canal
  (por arquivo/Campo/submissão/total) via novas variáveis de ambiente (F7); rate limit `kernel/antiabuso/` com
  chave em `<orgId>` compondo com IP+publicId (2.8); magic-bytes (INV-FILE-05); arquivo indisponível até verificar
  (não converte referenciando `QUARANTINED`); **sem anexo geral público, sem download público**.

### F7 — Ambiente / migration
- **Variáveis de ambiente** (novas, `getEnv()` Zod, faixa validada, fail-closed): limites do canal público
  (`PUBLIC_FILE_MAX_PER_FIELD`, `PUBLIC_FILE_MAX_PER_SUBMISSION`, `PUBLIC_FILE_TOTAL_PER_SUBMISSION` — nomes a
  confirmar). Documentadas no `.env.example`.
- **Migration:** idealmente **nenhuma** (a 3.7 já materializa `FileObject`/`FileScan` com `resourceType/resourceId`
  genérico e GRANT). Só entra migration aditiva se a modelagem do anexo geral (Q2) exigir coluna `purpose`/enum —
  então: fase vermelha de RLS/GRANT provada por mutação + rollback drill (`migration-check`). **Nenhum GRANT novo**
  como meta.

### F8 — Leitura (3.5) — coluna `FILE` exibível
- `databases/records/record-query.core.ts` + `records-read.service`: a coluna `FILE` passa a ser **exibida**
  (nome/estado + referência de download stream), mantendo-se **não-filtrável/ordenável** (o filtro `Arquivo
  possui/não possui` segue rejeitado — Q5). Regressão da 3.5 verde.

## Segurança / invariantes que o plano preserva

- **Cross-tenant + cross-recurso:** RLS (herdada da 3.7) + guarda fina do recurso (F1). Teste cross-recurso com a
  autz de aplicação **neutralizada** para provar a guarda fina (não só a RLS) — padrão AC-3/AC-4 da ADR.
- **Entrega sob sessão (Opção A):** sem URL pré-assinada; só `AVAILABLE`; revalida acesso a cada download.
- **Append-only:** `CardHistory`/`RecordHistory`/`FileScan` seguem GRANT `SELECT/INSERT`.
- **LGPD:** sem exclusão física (remoção lógica + expurgo da 3.7); `nomeOriginal` fora de log/evento crus.
- **Guard C3 congelado:** sem tocar `kernel/authz/ability.ts`.

## Ordem de execução (tasks) — ver `tasks.md`

T001 (gate pré-código: pre-implementation-check + context7-check; confirmar 3.7 mergeada; fixar baseline e
assinatura do contrato) → F1 binding → F2 valor referencial → F3 gate de consumo → F4 anexo geral → F5 substituição/
eventos → F6 canal público → F7 env/migration → F8 leitura → testes (RLS/HTTP/integração real MinIO+ClamAV) →
regressão E2/E3 → CLAUDE.md → gates finais (security/lgpd/observability/migration) → revisão adversarial →
commit-check → PR → CI → merge → closure.

## Riscos e mitigação

Ver `spec.md §7`. Principais: **R1** (valor `FILE` textual → referência: regressão E2/E3 verde); **R2**
(`fileId` cross-recurso: prova de vínculo + `AVAILABLE`); **R3** (download público: ausência de caminho, Opção A);
**R6** (dependência 3.7: baseline/contrato só se fixam com ela mergeada — o plano marca os pontos abertos).

## Pontos que só fecham com a 3.7 mergeada (NEEDS-3.7)

- Assinatura exata do `FileAuthzContract` (Q2 da 3.7) → fixa F1.
- Forma final de `FileObject` (colunas/estados/`resourceType`) → fixa F2/F4 e o data-model.
- Nome/semântica do gate consumível (constante de motivo) → fixa F3.
- Contrato do `kernel/antiabuso/` extraído → fixa a composição de rate limit em F6.
