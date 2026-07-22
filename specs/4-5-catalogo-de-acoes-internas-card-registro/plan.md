# Plan — Story 4.5: Catálogo de Ações internas (Card/Registro)

Risco: **ALTO**. Menor mudança correta; espelha o padrão de 4.3/4.4 (catálogo puro + enforcement no serviço).

## Arquivos

**Novos (`apps/api/src/pipes/automations/actions/`):**
- `action-catalog.ts` — 8 Ações fixas (Card+Registro), `exigirAcoesNoCatalogo` fail-closed, confirmação humana por
  Ação, validação de alvo determinístico em config-time. Espelha `conditions/condition-catalog.ts`.
- `automation-principal.ts` — `PrincipalAutomacao` (escopo restrito + capacidades explícitas, deny-by-default) +
  `TrilhaAtoria` (ator/iniciador/principal) + `escopoAlcancaRecurso`/`temCapacidade`/`montarTrilhaAtoria`. Puro.
- `action-revalidation.core.ts` — `resolverAlvoDeterministico` + `revalidarAcao` (fail-closed sob o principal).
  Espelha `conditions/condition-eval.core.ts` (opera sobre snapshot montado pelo motor sob RLS; nunca toca banco).

**Novos testes (`apps/api/test/`):**
- `action-catalog.core.test.ts`, `automation-principal.core.test.ts`, `action-revalidation.core.test.ts` (puros).
- Bloco `ACAO_FORA_DO_CATALOGO` em `automations-http.test.ts` (integração real da config-time).

**Aditivos:**
- `automations.service.ts` + `automation-lifecycle.service.ts`: `validar` chama `exigirAcoesNoCatalogo(validada.entao)`
  e mapeia `AcaoForaDoCatalogoError` → 400 `ACAO_FORA_DO_CATALOGO`.
- Ajuste de fixtures nos testes HTTP (placeholders `MOVER_CARD`/`A`/`FINALIZAR_CARD` → tipos válidos do catálogo).

## Não-alvos

- Sem migration, sem GRANT, sem RLS nova (Ações já em `Automation.entao`).
- Guard/`ability.ts` intocado (C3 congelado).
- `automation-config.ts` (4.1) intocado — o vocabulário de refs (PHASE/FIELD/DATABASE/RECORD) já cobre as Ações.
- Sem motor/execução/confirmação-máquina-de-estados (4.6).

## Ordem das checagens no serviço (preservada)

`validarConfiguracao` (estrutura, 4.1) → `exigirEventoNoCatalogo` (4.3) → `exigirCondicoesNoCatalogo` (4.4) →
`exigirAcoesNoCatalogo` (4.5) → `revalidarReferencias` (sob RLS). Autorização (`exigirGerenciarPipe`) precede tudo.
