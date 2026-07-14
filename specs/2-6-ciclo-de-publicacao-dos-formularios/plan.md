# Plan — Story 2.6 (ciclo de publicação dos Formulários)

## Modelo de dados
- Nova tabela **`FormVersion`** (org-scoped): `id, orgId, formId, version Int, snapshot Jsonb, revision Text,
  publishedAt, actorId?`. `@@unique([orgId, formId, version])`, `@@index([orgId, formId])`.
- **`Form`** ganha `publishedVersion Int?` (null = rascunho/despublicado). É NÚMERO, não FK — evita o ciclo de FK
  `Form↔FormVersion` e não há risco de ponteiro pendente (versões nunca são deletadas; o ponteiro só é gravado
  para uma versão criada na MESMA transação).

## Migration (`20260714130000_form_versions`)
Replica o padrão de `..._forms`: RLS ENABLE+FORCE, 4 policies por `current_org_id()` (WITH CHECK em INSERT e
UPDATE), FKs org/form com CASCADE. **GRANT só SELECT, INSERT** em `FormVersion` — sem UPDATE, sem DELETE: a
IMUTABILIDADE é fronteira de banco, não confiança no código. `Form` já tem GRANT de UPDATE (para o ponteiro).
`FormVersion` entra em `MODELOS_AUDITADOS`.

## Núcleo puro (`snapshot.ts`)
`montarSnapshot(formId, camposAtivos, {fileUpload})` → valida e devolve o snapshot; falha fechada:
Formulário sem Campo ativo, `podePublicarComArquivo` (AD-28), Seleção sem opção ativa (reusa `option-config`),
`typeConfig` malformado. Só Campos **ativos** entram (arquivados não). NÃO inventa obrigatoriedade (não existe em
`Field`). `calcularRevisao` = SHA-256 do JSON canônico (ordem de chaves estável) — determinística.

## Serviço (`FormPublicationService`)
- `publicar`: `exigirGerenciarPipe` → localiza Form (404 se não materializado) → lê Campos ativos ordenados →
  `montarSnapshot` (400 em `PublicacaoInvalidaError`) → **publicação atômica**.
- `despublicar`: `exigirGerenciarPipe` → zera `publishedVersion` (idempotente sem `updateMany` no caminho já-nulo).
- `estado`/`versao`: `resolverPoderNoPipe` (leitura) → estado + histórico / snapshot de uma versão (404).

### Atomicidade (invariante-chave)
Publicar toca 2 escritas (INSERT `FormVersion` + UPDATE ponteiro). `withTenantContext` recusa `$transaction` no
client ESTENDIDO — mas o client RAIZ roda uma **transação interativa com contexto** (`set_config(..., true)`
transaction-local), o mesmo primitivo que a extensão usa por dentro. `version = max+1`; se duas publicações
concorrentes calcularem o mesmo, o `UNIQUE` barra a segunda → a transação inteira faz rollback → **409** (nunca
versão parcial/duplicada). Auditoria emitida à mão nesse caminho (não passa pela extensão); nunca loga o snapshot.

## Rotas (`FormPublicationController`, `@Requer('ler','Pipe')`; fina no serviço)
`POST forms/initial/publish` (201) · `POST .../unpublish` (200) · `GET .../publication` · `GET .../versions/:n`.
Espelhadas para Fase (`phases/:phaseId/form/...`), poder resolvido pelo Pipe dono da Fase.

## Sequência (red-green-mutação)
1. Unidade `snapshot.ts`: sem Campo ativo, Seleção sem opção, malformado, gate de Arquivo, revisão determinística.
2. HTTP real: 1ª/2ª publicação, snapshot ordenado, editar rascunho não muda versão anterior, despublicar,
   validações → 400, versão 404, concorrência (201-ou-409, numeração 1..n).
3. RLS: cross-tenant, sem contexto, WITH CHECK, IMUTABILIDADE pelo GRANT (UPDATE/DELETE → permission denied),
   UNIQUE (número duplicado).
4. Authz: gerenciar publica; MEMBER/VIEWER 403; sem concessão 404.
- **Mutações provadas:** trava Seleção-sem-opção (código); imutabilidade (GRANT UPDATE temporário → teste
  vermelho → revoke).

## Divergências registradas
- Atomicidade cross-tabela resolvida por transação interativa no client raiz (consumidor concreto da nota 1.3).
- Spine lista "ciclo de publicação" em Deferred, mas o PRD D3.2 já o resolve; autoridade = PRD (registrado).
- "Obrigatoriedade" no snapshot: `Field` não tem o atributo → não materializado (Constitution II).
