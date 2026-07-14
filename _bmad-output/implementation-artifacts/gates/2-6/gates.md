# Gates — Story 2.6 (ciclo de publicação dos Formulários)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src` + `test`): ✅ exit 0.
- **format:check** (Prettier): ✅ exit 0.
- **lint** (`eslint apps/api`): ✅ exit 0.
- **build** (api): ✅ exit 0.
- **testes** (suíte cheia da API, série): ✅ **44 arquivos, 401 testes** — inclui 2.6 (snapshot 8,
  publication-conflict 3, publication-http 9, publication-rls 5, publication-authz 4) e regressão 2.1–2.5. Inclui
  as correções da revisão (audit do `Form`, helper `definirContextoOrg`, mapeamento P2028→409).

## migration-check
Migration versionada `20260714130000_form_versions`: nova tabela `FormVersion` + coluna `Form.publishedVersion`.
RLS ENABLE+FORCE, 4 policies por `current_org_id()`, WITH CHECK em INSERT/UPDATE, FKs org/form CASCADE. **GRANT só
SELECT+INSERT** (imutabilidade). Aplicada por `db:migrate` (não no boot). Rollback = revert + drop; nenhuma
alteração destrutiva de dados existentes (só adição). `db:status` limpo.

## security-check
- **Imutabilidade:** runtime sem GRANT UPDATE/DELETE em `FormVersion` — provado em `publication-rls` (permission
  denied) **e por mutação** (GRANT UPDATE temporário → teste vermelho → revoke).
- **Isolamento:** RLS ENABLE+FORCE; cross-tenant e sem-contexto atingem 0 linhas / negam; WITH CHECK barra INSERT
  com `orgId` alheio (`createMany`, sem RETURNING).
- **Autorização:** deny-by-default; publicar/despublicar exige gerenciar (config do Pipe, reusa `pipe-authz`);
  MEMBER/VIEWER 403; sem acesso 404; C3/CASL intocado.
- **Atomicidade sem bypass:** transação interativa com contexto no client raiz; RLS/WITH CHECK valem dentro dela.
- **Anti-mass-assignment:** nenhum campo do snapshot vem do corpo do cliente — o snapshot é montado do rascunho no
  servidor; `orgId`/`actorId` do contexto, nunca do cliente.
- **Concorrência:** numeração servida pelo banco (`@@unique`); 409 + rollback integral (sem versão parcial).

## observability-check
- `FormVersion` em `MODELOS_AUDITADOS`; a publicação emite evento de auditoria (ator/Org/ação/recurso/resultado/
  versão/revisão). Logs sanitizados (Pino); **o snapshot NUNCA é logado**. Sem PII.

## lgpd-check
- A definição publicada (snapshot) é **metadado de configuração**, não valor de titular — submissões (valores) só
  em 2.7+. `actorId` é referência de ator para auditoria, não PII sensível. Nenhuma retenção nova.

## performance-check
- Publicar: leitura dos Campos ativos (índice `@@index([orgId, formId, state, position])`) + 1 INSERT + 1 UPDATE
  numa transação curta. Ler versão/estado: por `@@unique`/`@@index([orgId, formId])`. Snapshot é JSON pequeno
  (limitado pelos limites de Campo/opção da 2.4/2.5). Sem N+1, sem varredura.

## Veredito
Todos os gates aplicáveis **verdes**; sem regressão. Pronto para revisão independente e commit.
