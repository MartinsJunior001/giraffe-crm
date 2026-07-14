# Tasks — Story 2.8

1. Schema: enums `PublicFormMode`/`CardOrigin`/`SubmissaoPublicaState`; `SubmissaoPublica` (org-scoped);
   `PublicFormRoute` (global); colunas em `Form` (`publicEnabled`/`publicMode`), `Card` (`origin`), `PipeGrant`
   (`reviewPublicSubmissions`) + back-relations. ✅
2. Migration `20260714150000_public_submissions`: tipos, colunas + CHECK `Form_public_only_initial`, tabelas, UNIQUE/
   índices, FKs; `SubmissaoPublica` RLS+FORCE+4 policies (WITH CHECK) e GRANT SELECT/INSERT/UPDATE (sem DELETE);
   `PublicFormRoute` sem RLS, GRANT SELECT/INSERT/UPDATE (sem DELETE). ✅
3. `SubmissaoPublica`/`PublicFormRoute` em `MODELOS_AUDITADOS`. ✅
4. `pipe-authz`: `exigirRevisarSubmissoesPublicas` (Admin implícito; concessão com capacidade; 403/404). ✅
5. `grants` (`service`/`dto`/`controller`): conceder/alterar a capacidade `reviewPublicSubmissions` (default falso). ✅
6. Subdomínio `public-submissions/`:
   - `public-route.resolver` (resolve `publicId` no client raiz, pré-contexto); ✅
   - `public-rate-limit` (INSERT…ON CONFLICT atômico na tabela `RateLimit`, fail-closed, 429); ✅
   - `public-submissions.dto` (valida `publicId`/modo/valores; 404 uniforme para formato inválido); ✅
   - `public-submission.service`+`controller` (rota pública `@SemContextoOrganizacional`, releitura sob RLS, gate de
     Arquivo, dedup P2002/P2028, DIRECT→conversão); ✅
   - `converter-submissao` (Card+CardHistory+CONVERTED numa tx raiz; P2002/P2028→idempotente/409; auditoria manual); ✅
   - `triage.service`+`controller` (listar/aprovar/rejeitar, capacidade exigida); ✅
   - `public-config.service`+`controller` (habilitar/revogar/rotacionar/estado, exige gerenciar o Pipe). ✅
7. Registro no `pipes.module.ts`. ✅
8. Testes: `public-submissions-http` (fluxo, 404 uniforme, TRIAGE/DIRECT, idempotência, Arquivo, triagem,
   concorrência, rotação, 429), `triage-authz` (capacidade deny-by-default), `public-submissions-rls` (isolamento,
   WITH CHECK, sem DELETE, `PublicFormRoute` global). ✅
9. Revisão adversarial de 4 lentes (risco ALTO) → correções: converter (P2002/P2028 + auditoria), logger real, dedup
   P2028; + testes de concorrência/rotação/429. ✅
10. Gates + fase vermelha do portão de capacidade + commit-check + PR + CI + merge + closure.
