# Tasks — Story 2.7

1. Schema: `Card` + `CardHistory`; back-relations em `Organization`/`Pipe`/`Phase`/`Form`/`FormVersion`. ✅
2. Migration `20260714140000_cards`: tabelas, UNIQUE idempotência, índices, FKs, RLS+FORCE+policies; GRANT
   `Card` SELECT/INSERT/UPDATE (sem DELETE), `CardHistory` SELECT/INSERT (append-only). ✅
3. `Card`/`CardHistory` em `MODELOS_AUDITADOS`; helper `definirContextoOrg` reusado. ✅
4. `pipe-authz`: `Poder += 'operar'`; `exigirOperarPipe` (403 só-leitura); MEMBER→operar. ✅
5. Núcleo puro `submission.ts`: `validarSubmissao` (allowlist/tipo/Seleção por id/limites), `indexarCampos`. ✅
6. `CardSubmissionService`: `submeter` (gate publicação, 1ª Fase ativa) + `criarAtomico` (Card+History, dedup). ✅
7. `cards.dto.ts` (`parseSubmissao`, `validarIdRota`) + `CardsController`; registro no `pipes.module.ts`. ✅
8. Testes: `submission` (unidade), `cards-http`, `cards-rls`, `cards-authz`. ✅
9. Mutações: allowlist; dedup de idempotência; imutabilidade de `CardHistory` (GRANT temporário → vermelho → revoke). ✅
10. Gates + revisão adversarial + commit-check + PR + CI + merge + closure.
