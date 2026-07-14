# Checklist — Story 2.6

- [x] Modelo de versionamento decidido por artefato (Architecture Agent) e registrado.
- [x] `FormVersion` org-scoped; RLS ENABLE+FORCE; policies por `current_org_id()`; WITH CHECK.
- [x] Imutabilidade pelo GRANT (runtime só SELECT+INSERT; sem UPDATE/DELETE) — provada em `publication-rls`.
- [x] Numeração monotônica `@@unique([orgId, formId, version])`; concorrência → 409 (rollback integral).
- [x] Publicação atômica (INSERT versão + UPDATE ponteiro) em transação com contexto no client raiz.
- [x] Validações determinísticas (sem Campo ativo, Seleção sem opção, gate de Arquivo, malformado) → 400.
- [x] Snapshot só de Campos ativos, ordenado, com identidade estável; revisão determinística (hash canônico).
- [x] Imutabilidade do histórico: editar rascunho não muda versão anterior — provado por HTTP.
- [x] Autorização "config do Pipe" (gerenciar publica; MEMBER/VIEWER 403; sem acesso 404).
- [x] `FormVersion` em `MODELOS_AUDITADOS`; auditoria da publicação emitida; sem PII/snapshot em log.
- [x] Sem inventar obrigatoriedade (não existe em `Field`); sem materializar submissão/Card (2.7+).
- [x] Gates verdes (typecheck/format/lint/build/testes); mutações provadas (Seleção-sem-opção; imutabilidade).
