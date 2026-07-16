# Spec — Story 3.4: Ciclo de vida do Registro (+ Histórico write-side)

Baseline: `4e60ee4` · Épico 3 · Risco CRÍTICO · Depende de 3.3, 3.2 (e reusa 2.7, 2.11) — todas `done`.

## 1. Resumo

Materializa **`Record`** (o **Registro** — 1ª entidade de **dado do titular** do Database) e o **write-side** da
sua trilha (`RecordHistory`, append-only). **Reutiliza** a maquinaria de submissão de Card (2.7 — validação
contra snapshot da `FormVersion`, valores JSONB por `Field.id`, idempotência, evento na mesma transação) e o
ciclo de vida do Card (2.11 — núcleo puro + guarda otimista), aplicados ao **Formulário de Database publicado**
(3.3). **`Card ≠ Registro`**: o Registro pertence a **exatamente 1 Database** (RN-063, não transferível), não
percorre Fases, e tem ciclo de vida de **2 estados** (ATIVO/ARQUIVADO). Acorda o poder **dormente** de MEMBER do
Database (`exigirOperarDatabase`).

## 2. Fora de escopo (não antecipar — Constitution II)

- Visualização/tabela/navegação/filtros e a UI `Novo Registro` → **3.5** (INV-REPORT-01 é da 3.5).
- **Read-side** do Histórico (timeline/projeção/mascaramento/autorização por acesso atual) → **3.6**.
- Campo Arquivo funcional / anexo geral / eventos de arquivo → **3.7/3.8** (gate AD-28 mantido).
- Vínculo Card↔Registro e eventos de vínculo/`correlationId` → **3.9**.
- Ação de Automação `Criar Registro relacionado` → **E4** (consumidor futuro do endpoint de criação).

## 3. Requisitos funcionais

- **RF-1 (criação idempotente):** criar um Registro a partir do Formulário de Database **publicado**; usa a
  `FormVersion` publicada vigente no início da operação; valida `valores` contra o snapshot (reuso de
  `submission.ts` — allowlist, tipo por Campo, Seleção por `id`); grava JSONB por `Field.id`; evento `CREATED` na
  mesma transação. Idempotência por `@@unique([orgId, databaseId, idempotencyKey])` → devolve existente / 409,
  nunca 500. Formulário não publicado → criação recusada.
- **RF-2 (edição de valores):** revalida contra a `FormVersion` **do próprio Registro** (`formVersionId`
  congelado); grava `valores`; evento `VALUES_UPDATED`. Bloqueada sob Registro/Database arquivado (409).
- **RF-3 (ciclo de vida):** arquivar/restaurar idempotentes, atômicos e auditados (núcleo puro
  `record-lifecycle.transitions.ts`; guarda otimista `updateMany where lifecycleState=<lido>`→409); 2 estados;
  restaurar volta a ATIVO; eventos `ARCHIVED`/`RESTORED` na mesma transação; no-op não emite `updateMany`.
- **RF-4 (leitura básica):** `GET /records/:recordId` devolve estado + valores (para 3.5/3.6 consumirem), **sem**
  listagem/tabela/filtro (3.5) e sem projeção de Histórico (3.6).
- **RF-5 (autorização):** operar (criar/editar/arquivar/restaurar) exige **gerenciar** ou **operar** o Database
  (Admin da Org / Admin do Database / **MEMBER**); **VIEWER** → 403; sem acesso → 404 não-enumerante. Ler o
  Registro = `exigirLerDatabase`.

## 4. Requisitos não-funcionais / invariantes

- **`Card ≠ Registro` / `Database ≠ Pipe`:** entidade distinta (tabela/enum/subject/módulo próprios). Reusa
  lógica (platform-level), nunca as entidades de Card.
- **Isolamento (AD-6):** RLS ENABLE+FORCE + `WITH CHECK` no INSERT e UPDATE em `Record` e `RecordHistory`
  (simétrica a Card/Database); toda query por `withTenantContext`; `orgId`/`databaseId` do cliente nunca
  confiados.
- **Sem exclusão física (LGPD):** runtime com GRANT `SELECT/INSERT/UPDATE` **column-scoped** em `Record` e sem
  DELETE; `RecordHistory` só `SELECT/INSERT`. Arquivar é `state`.
- **Definição congelada (AD-12):** Registro referencia `formVersionId` publicada no ato; editar revalida contra
  ela; mudar o schema depois não corrompe Registros.
- **Idempotência (AD-11):** `@@unique([orgId, databaseId, idempotencyKey])`; P2002+P2028 → idempotente/409.
- **Não transferível (RN-063):** `databaseId` fora do GRANT column-scoped de UPDATE.
- **Write-side ≠ read-side:** grava eventos; não projeta (3.6). Correção = novo evento (imutável).
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso + guarda fina no serviço (DBT-AUTHZ-01).

## 5. Acceptance Criteria

Ver o story file (AC1–AC7). Resumo: criação idempotente ≤1 Registro contra versão publicada (AC1); idempotência
real, nunca 500 (AC2); arquivar reversível/não bloqueado por vínculos (AC3); restaurar preserva identidade (AC4);
write-side do Histórico por operação (AC5); sem exclusão física + isolamento (AC6); autorização por Database com
poder diferencial de MEMBER (AC7).

## 6. Decisões (ver clarify Q1–Q5 em `plan.md`)

- **Q1 — GRANT de edição:** um único GRANT column-scoped `UPDATE(lifecycleState, valores, updatedAt)`;
  `databaseId`/`formVersionId`/`orgId`/`origin`/`idempotencyKey` **sem** UPDATE (provado por teste).
- **Q2 — leitura da 3.4:** `GET /records/:recordId` cru (sem listagem — 3.5). Sem projeção de Histórico (3.6).
- **Q3 — `origin`:** enum `RecordOrigin` mínimo com **um** valor consumido agora (`NOVO_REGISTRO`); não antecipar
  `AUTOMACAO`/`PUBLIC` sem consumidor (AD-11).
- **Q4 — Database arquivado:** criar/editar/arquivar Registro sob Database ARCHIVED → 409 `DATABASE_ARQUIVADO`
  (defesa em profundidade), reusando o padrão da 3.1. Restaurar Registro sob Database arquivado: **permitido**
  apenas se coerente com a somente-leitura — decisão: **bloquear** (Database arquivado = somente-leitura integral).
- **Q5 — idempotencyKey obrigatória** na criação (400 se ausente), coerente com "uma ação lógica cria 0 ou 1".

## 7. Riscos

- **Reuso de `submission.ts` acoplar Card e Registro:** a função é pura e recebe snapshot+valores; mitigação —
  não alterar sua assinatura; regressão de Card (2.7/2.8) verde (T012).
- **GRANT column-scoped incompleto/excessivo:** editar valores precisa do GRANT certo; mitigação — teste que
  prova o escopo (UPDATE de `databaseId`/`formVersionId`/`orgId` → permission denied).
- **Transação interativa sob contexto:** só o client raiz aceita `$transaction` com `definirContextoOrg`
  (padrão 2.6/2.7); usar o mesmo primitivo.
- **Falso `denied` na auditoria por idempotência:** no-op de arquivar/restaurar não emite `updateMany` (padrão
  3.1); provado por teste.
