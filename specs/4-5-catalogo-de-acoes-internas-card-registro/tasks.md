# Tasks — Story 4.5

- [x] T1 — `action-catalog.ts`: 8 Ações fixas (Card+Registro), refs/params por Ação, confirmação humana, alvo
  determinístico de `RECORD_EDIT`, `exigirAcoesNoCatalogo` fail-closed + `AcaoForaDoCatalogoError`.
- [x] T2 — `automation-principal.ts`: `PrincipalAutomacao` (escopo restrito + capacidades explícitas), `Iniciador`,
  `TrilhaAtoria` (ator/iniciador/principal), `montarTrilhaAtoria`/`escopoAlcancaRecurso`/`temCapacidade`.
- [x] T3 — `action-revalidation.core.ts`: `ContextoEvento`/`AlvoAcaoSnapshot`, `resolverAlvoDeterministico`,
  `revalidarAcao` (fail-closed: capacidade → existência → Org → escopo → estado).
- [x] T4 — wiring: `exigirAcoesNoCatalogo` em `automations.service.ts` e `automation-lifecycle.service.ts`;
  `AcaoForaDoCatalogoError` → 400 `ACAO_FORA_DO_CATALOGO`.
- [x] T5 — testes puros (a–g): `action-catalog.core`, `automation-principal.core`, `action-revalidation.core`.
- [x] T6 — bloco HTTP `ACAO_FORA_DO_CATALOGO`; correção de fixtures HTTP para tipos válidos do catálogo.
- [x] T7 — gates: pre-implementation, security, observability, migration-check (N/A); decisão do principal.
- [ ] T8 — validação: `pnpm lint`, `typecheck`, `test` (API, banco real), `pnpm build`; PR.
