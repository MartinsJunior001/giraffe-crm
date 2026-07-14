# Plan — Story 2.8 (submissão pública controlada e triagem)

## Modelo de dados
- **`Form`** ganha o opt-in público: `publicEnabled Boolean @default(false)` (habilitado por Formulário; só faz
  sentido em `PIPE_INITIAL`) e `publicMode` (`TRIAGE` | `DIRECT`, default `TRIAGE`). Coerência "só inicial é
  público" imposta por CHECK na migration. Um identificador público estável para a rota é o próprio `Form.id`
  (UUID não adivinhável) — sem token separado (decisão baseline; link/token era a opção estrita, não escolhida).
- **`SubmissaoPublica`** (nova, org-scoped): `id, orgId, formId, formVersionId, valores Jsonb, estado
  (PENDING|APPROVED|REJECTED|CONVERTED), cardId String? (ponteiro do Card criado na conversão), idempotencyKey?,
  createdAt, updatedAt, decidedAt?, decidedBy?`. `@@index([orgId, formId, estado])`. Sem DELETE (preserva — LGPD).
- **Origem do Card:** `Card` ganha `origin` (`INTERNAL` | `PUBLIC`, default `INTERNAL`) — mínimo para "origem
  registrada" (AC5). Alternativa (metadado no evento) descartada: a origem é atributo do Card, consultável.

## Migration (`..._public_submissions`)
- `ALTER TABLE "Form"` + colunas de opt-in (CHECK: `publicEnabled` só com `context='PIPE_INITIAL'`).
- `ALTER TABLE "Card" ADD COLUMN "origin"`.
- `CREATE TABLE "SubmissaoPublica"`: RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH CHECK em
  INSERT/UPDATE), FKs org/form/formVersion (e cardId nulável) CASCADE. **GRANT `SELECT, INSERT, UPDATE` — sem
  DELETE** (cria a submissão; a triagem atualiza estado; preserva por LGPD). `SubmissaoPublica` em
  `MODELOS_AUDITADOS`.
- `Card` já tem GRANT SELECT+INSERT (2.7) — a conversão só INSERE Card; a origem é coluna no INSERT.

## Endpoint público (sem autenticação) — o ponto sensível
- Rota pública montada **fora** do `AuthzGuard`/sessão (é não autenticada) — decidir o mecanismo de exclusão do
  guard (rota marcada `@Public()` ou controller próprio sem o guard global). **Resolve a Org pelo `Form.id`
  público** (nunca por parâmetro do cliente): lê o Form com `publicEnabled=true` e `publishedVersion` não nulo;
  define o contexto de Org **no servidor** (via um caminho administrativo controlado que não vaza pool) antes de
  qualquer escrita — o contexto vem do recurso, não de sessão. Fail-closed: Form não público / não publicado /
  inexistente → **404 uniforme** (não enumera; não revela existência).
- **Antiabuso (baseline):** rate limit por **IP + `formId`** reusando a infra de rate limit existente (DB-backed,
  atômica). Excedido → 429 com mensagem neutra. Fail-closed.
- **Arquivo gated:** se o snapshot tem Campo `FILE`, o canal público **não aceita valor de arquivo** (AD-28);
  submeter arquivo pelo público → recusa neutra. `submission.ts` já trata `FILE` como string (referência) — no
  público, valor de `FILE` é rejeitado.
- **Resposta = só confirmação:** `{ ok: true }` (ou um id de protocolo opaco), **sem** dado interno, sem id de
  Card/Submissão que permita correlação, sem revelar se virou Card ou ficou pendente.
- **Modo:** `DIRECT` → cria Card (reusa a criação atômica da 2.7, `origin=PUBLIC`); `TRIAGE` → cria
  `SubmissaoPublica` PENDING. Idempotência opcional por `idempotencyKey` do cliente público (dedup de reenvio).

## Triagem (autenticada) — reusa a resolução de autorização
- Capacidade **"Revisar submissões públicas"** deny-by-default. Decisão de mecanismo (a registrar/validar): **não
  tocar `ability.ts`/guard (C3 congelado)** — implementar como guarda fina no serviço, análoga a `pipe-authz`:
  Admin da Org e Admin do Pipe têm; Membro do Pipe só com concessão explícita (nova flag na `PipeGrant` ou
  capacidade à parte — preferir o mínimo; **registrar a escolha aqui antes de codificar**). Viewer nunca revisa.
- **Aprovar**: `SubmissaoPublica` PENDING → cria 1 Card (atômico, `origin=PUBLIC`, evento CREATED) e marca a
  submissão `CONVERTED` com `cardId` **na MESMA transação** (AD-13). Idempotência: uma submissão já `CONVERTED`
  não reconverte (guarda de estado + UNIQUE do ponteiro) → 409/no-op idempotente; nunca 2 Cards.
- **Rejeitar**: PENDING → `REJECTED` (sem Card; preserva). Idempotente.
- **Ler fila** de pendentes por Pipe (autorizado).

## Sequência (red-green-mutação)
1. Unidade: validação pública (Arquivo rejeitado no público; resposta sem dado interno; resolução de Org pelo Form).
2. HTTP público real: opt-in on/off, não publicado → 404 uniforme, triagem não cria Card, criação direta cria 1,
   confirmação sem vazamento, rate limit 429, Arquivo recusado.
3. Triagem HTTP: aprovar cria 1 Card (origem PUBLIC, evento), rejeitar preserva, idempotência de aprovação
   (concorrência → 1 Card), fila de pendentes.
4. Authz da triagem: capacidade deny-by-default (Admin Org/Pipe revisam; Membro sem concessão 403/404; Viewer não).
5. RLS: `SubmissaoPublica` isolamento, sem DELETE, WITH CHECK; conversão respeita contexto.
- **Mutações:** aprovar submissão já convertida cria 2º Card (deve falhar); resposta pública vaza id interno
  (deve falhar); endpoint público aceita Org do cliente (deve falhar).

## Decisões RESOLVIDAS pelo dono (2026-07-14)

### 1. Autorização de revisão — capacidade em `PipeGrant`
- Nova capacidade explícita **`reviewPublicSubmissions Boolean @default(false)`** na `PipeGrant` (não um novo
  papel, não um novo sistema de autorização).
- **Admin da Organização** possui a capacidade **implicitamente** (qualquer Pipe, sem concessão).
- Demais usuários só revisam com **concessão explícita** (`PipeGrant` ACTIVE com `reviewPublicSubmissions=true` e
  `Membership` ACTIVE). Viewer/sem concessão nunca revisam.
- **Reusa** o mecanismo existente: guarda GROSSA `@Requer('ler','Pipe')` (deny-by-default, guard/CASL intocados —
  C3 congelado) + guarda FINA no serviço via helper em `pipe-authz.ts` (`exigirRevisarSubmissoesPublicas`),
  irmão de `exigirGerenciarPipe`/`exigirOperarPipe`. Nenhum papel novo.

### 2. Resolução pública de tenant — `PublicFormRoute` GLOBAL (sem RLS)
- Novo registro **global** `PublicFormRoute` — **sem RLS por definição** (como `Account`, AD-10): mapa opaco
  `publicId → (orgId, formId)`. Colunas: `id, publicId (unique, opaco/aleatório), orgId, formId, active
  (revogação), createdAt, revokedAt?`. **Sem PII.**
- **Nunca** aceitar `orgId`/`pipeId`/`phaseId`/`formVersionId` do cliente. O cliente público só apresenta o
  `publicId` (da URL).
- Fluxo: resolver `PublicFormRoute` por `publicId` (global, pré-contexto) → obter `orgId`/`formId` →
  **entrar em `withTenantContext(orgId)`** → **reler o `Form` sob RLS** e validar (publicado, ativo/opt-in,
  versão publicada, contexto `PIPE_INITIAL`) **antes de qualquer escrita**.
- **404 uniforme** para link inválido, revogado (`active=false`) ou cross-tenant (o Form relido sob o contexto
  não bate) — nunca enumera nem revela existência.
- **Revogação/rotação** do identificador público: revogar = `active=false`; rotacionar = revogar o antigo +
  criar um `publicId` novo.
- GRANT: runtime **SELECT** (resolver) + **INSERT/UPDATE** (criar/revogar pela config autenticada) — **sem
  DELETE**. Sendo global sem RLS, a criação valida o `formId` sob o contexto do Admin (RLS no `Form`); o
  `publicId` opaco + 404 uniforme fecham a enumeração.

### 3. Origem do Card
- Coluna **`origin` (`INTERNAL`|`PUBLIC`, default `INTERNAL`)** em `Card` — mínimo para "origem registrada" (AC5).

### Baseline antiabuso (mantido)
- Rate limit atômico por **IP confiável + `publicId`** (infra existente); fail-closed; payload limitado; **upload
  público bloqueado** (Arquivo gated, AD-28); idempotência (chave do cliente público); consentimento (guardrail);
  **nenhuma PII em logs** (nunca logar `valores`).
