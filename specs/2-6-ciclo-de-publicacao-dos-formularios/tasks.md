# Tasks — Story 2.6

1. Schema: `FormVersion` + `Form.publishedVersion`; back-relation em `Organization`. ✅
2. Migration `20260714130000_form_versions`: tabela, UNIQUE, FKs, RLS+FORCE+policies, GRANT SELECT+INSERT. ✅
3. `FormVersion` em `MODELOS_AUDITADOS`. ✅
4. Núcleo puro `snapshot.ts`: `montarSnapshot` (validações), `calcularRevisao` (hash canônico). ✅
5. `FormPublicationService`: `publicar` (atômico, 409), `despublicar`, `estado`, `versao`. ✅
6. `FormPublicationController`: rotas inicial + Fase; registro no `pipes.module.ts`. ✅
7. Testes: `snapshot` (unidade), `publication-http`, `publication-rls`, `publication-authz`. ✅
8. Mutações: Seleção-sem-opção (código); imutabilidade (GRANT UPDATE temporário → vermelho → revoke). ✅
9. Gates + revisão adversarial + commit-check + PR + CI + merge + closure.
