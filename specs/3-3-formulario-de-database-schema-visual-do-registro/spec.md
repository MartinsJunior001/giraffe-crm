# Spec — Story 3.3: Formulário de Database (schema visual do Registro)

Baseline: `53ad4b8` · Épico 3 · Risco CRÍTICO · Depende de 3.1, 3.2, 2.4, 2.5, 2.6, 2.15 (todas `done`).

## 1. Resumo

Ativa o **contexto `DATABASE`** do `Form` (stub desde 2.4) **reutilizando o Form Builder canônico de E2** —
montagem (2.4), evolução segura de Campos (2.5) e publicação por `FormVersion` imutável (2.6). O Formulário de
Database é o **terceiro Formulário independente** (inicial, de Fase, de Database — INV-FORM-01). A única novidade
estrutural é o **owner `Form.databaseId`** e o **roteamento de autorização por contexto** (DATABASE →
`database-authz` de 3.2). **Sem segundo builder, sem segundo catálogo de tipos.**

## 2. Fora de escopo (não antecipar — Constitution II)

- Criação de Registro, ação `Novo Registro`, submissão do Formulário de Database → **3.4**.
- Histórico do Registro, navegação de tabelas, vínculo Card↔Registro → 3.4/3.5/3.6/3.9.
- Campo Arquivo **funcional**/anexos → 3.7/3.8 (gate AD-28 mantido; montar o Campo é permitido, publicar é gated).
- Permissões por Campo (fora da Fase 1).

## 3. Requisitos funcionais

- **RF-1 (montagem):** obter o Formulário de Database (ler não cria); adicionar Campo (getOrCreate lazy —
  materializa o `Form` no 1º Campo); reordenar Campo. Catálogo canônico dos 12 tipos; `typeConfig` sob allowlist.
- **RF-2 (evolução, 2.5):** editar rótulo/ajuda/valor padrão (não `type`); arquivar/restaurar Campo (restaura ao
  fim da ordem ativa); ciclo de opções de Seleção (adicionar/renomear/reordenar/arquivar/remover), com guarda
  otimista no `typeConfig`.
- **RF-3 (publicação, 2.6):** publicar (snapshot imutável validado), despublicar (zera ponteiro, preserva
  histórico), ler estado e versão. Gate de Arquivo na publicação (`podePublicarComArquivo`, AD-28).
- **RF-4 (autorização):** montar/evoluir/publicar exige **gerenciar o Database** (Admin da Org / Admin do
  Database); ler o schema exige **qualquer poder** no Database (ADMIN/MEMBER/VIEWER concedido); sem acesso → 404.

## 4. Requisitos não-funcionais / invariantes

- **INV-FORM-01:** contexto DATABASE isolado dos contextos de Pipe (Campos nunca cruzam contextos).
- **Isolamento (AD-6):** RLS ENABLE+FORCE já vigente em `Form`/`Field`/`FormVersion`; toda query por
  `withTenantContext`; `orgId`/`databaseId` do cliente nunca confiados (Database relido sob RLS).
- **Imutabilidade (2.6/AD-12):** `FormVersion` sem UPDATE/DELETE no runtime — schema não corrompe Registros já
  criados (contrato consumido por 3.4).
- **Sem exclusão física:** `Form`/`Field`/`FormVersion` sem GRANT de DELETE.
- **Segurança do schema:** só os 12 tipos canônicos; nenhuma entrada do cliente vira DDL/coluna/tipo; allowlist
  de `typeConfig` (fail-closed).
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso + guarda fina no serviço (DBT-AUTHZ-01).
- **Teto/hierarquia da 3.2 preservados:** MEMBER/VIEWER do Database só leem o schema.

## 5. Acceptance Criteria

Ver o story file (AC1–AC7). Resumo: builder canônico sem segundo builder (AC1); contexto identificado, ler não
cria (AC2); evolução segura (AC3); publicação + imutabilidade (AC4); autorização por Database, 404 não-enumerante
(AC5); isolamento por Org/Database (AC6); sem antecipar 3.4, Arquivo gated (AC7).

## 6. Decisões (clarify Q1–Q4)

- **Q1 — fiação:** builder permanece em `pipes/forms/`; `PipesModule` exporta `FormsService`/`FieldsService`/
  `FormPublicationService`; `DatabasesModule` importa `PipesModule`; controllers novos em `databases/forms/`.
  `database-authz` é função pura (sem ciclo de DI).
- **Q2 — CHECK:** DROP+ADD do `Form_context_owner_ck` com as 3 cláusulas (PIPE_INITIAL/PHASE/DATABASE, cada uma
  com exatamente seu owner e os demais NULL) + coluna `databaseId` + FK Cascade + índice único parcial
  `Form_database_uq WHERE context='DATABASE'` + `@@index([orgId, databaseId])`.
- **Q3 — corte 3.3/3.4:** 3.3 entrega montar/evoluir/publicar + `estado`/`versão`. Nenhuma rota de submissão/
  Registro.
- **Q4 — Campo Arquivo:** paridade com E2 — montar permitido; gate AD-28 na publicação (`snapshot.ts`).

## 7. Riscos

- **Regressão do builder de E2:** a generalização do alvo/autz pode quebrar os Formulários inicial/de Fase.
  Mitigação: roteamento por contexto **aditivo** (default = pipe-authz), suíte de 2.4/2.5/2.6/2.15 verde (T011).
- **Ciclo de módulo:** mitigado por `database-authz` puro e por Databases→Pipes (unidirecional).
- **CHECK/owner incoerente:** provado por fase vermelha no RLS test (inserir DATABASE sem databaseId falha).
