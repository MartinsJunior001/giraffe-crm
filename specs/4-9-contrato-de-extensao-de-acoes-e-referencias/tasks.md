# Tasks — Story 4.9

1. **T1 — Contrato puro** `actions/action-extension-contract.ts`: `HandlerDeAcao`, `GateDisponibilidade`, `ExecutorKind`
   (enum fechado), `SUPERFICIE_HANDLER` (resolver/revalidar/sanitização/`DADOS_DE_TRILHA_PERMITIDOS` uniformes),
   `REGISTRO_ACOES_NUCLEO` (8, derivado de `ACOES_CATALOGO`), `ACOES_EXTENSAO` (E5/E6), acessores + `exigirAcaoDisponivel`
   (fail-closed). Comentários pt-BR densos, no padrão da base.
2. **T2 — Enforcement de config**: `automations.service.ts` e `automation-lifecycle.service.ts` chamam `exigirAcaoDisponivel`
   por Ação antes de `exigirAcoesNoCatalogo`; traduzem `AcaoDeExtensaoIndisponivelError` → 400 `ACAO_DE_EXTENSAO_INDISPONIVEL`
   (sem eco do payload). Sem ciclo de import.
3. **T3 — Testes de contrato** `test/action-extension-contract.core.test.ts`: bijeção; enum fechado; extensão não executável;
   fail-closed; `dadosDeTrilha` allowlist; totalidade de resolver/revalidar.
4. **T4 — Conformação motor↔contrato** (reforço em teste E2E existente ou novo bloco): `eventosProduzidos` declarados ⊇ emissão
   real do motor para os 3 executáveis; `[]` para os gated. Fase vermelha demonstrada.
5. **T5 — HTTP**: bloco em `automations-http.test.ts` — criar/editar Automação com Ação de extensão → 400
   `ACAO_DE_EXTENSAO_INDISPONIVEL`; Ação desconhecida segue `ACAO_FORA_DO_CATALOGO`.
6. **T6 — Decisão durável** `decisions/action-extension-contract-4-9.md` (recorte, Ação↔Template, IA, débitos).
7. **T7 — Gates** risco ALTO: prettier/lint/typecheck/build + suíte API (PG real) + `prisma generate` sem diff. Corrigir
   BLOCKER/HIGH.
8. **T8 — commit-check → commit → push → PR** (aguardando QA + Security independentes da Lane 0).

## Dependências
T1 → {T2,T3,T4}; T2 → T5; {T3,T4,T5,T6} → T7 → T8.
