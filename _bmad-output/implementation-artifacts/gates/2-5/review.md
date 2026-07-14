# Revisão independente — Story 2.5 (evolução segura de Campos)

> Revisão adversarial de **risco ALTO** (três revisores read-only em paralelo), conforme o directive da Story.
> CRITICAL/HIGH corrigidos com regressão **e** mutação; MEDIUM que afete aceitação/integridade/isolamento
> bloqueia merge (nenhum encontrado). Evidência de execução real (Constitution X); PostgreSQL real.

## Revisores e foco
- **Edge Case Hunter** — JSON `typeConfig`, concorrência, renomeação, dados históricos.
- **Acceptance Auditor** — critérios da Story 2.5 (SC-251..259) e não-objetivos.
- **Security Reviewer (focado)** — mass assignment, payload, XSS, isolamento.

## Achados e disposição

| # | Sev. | Achado | Disposição |
|---|------|--------|------------|
| **H1** | HIGH | Lost update silencioso: ler e regravar o `typeConfig` são passos separados (sem transação multi-statement); duas edições de opção concorrentes se sobrescreveriam sem aviso. | **CORRIGIDO.** Guarda otimista no `field.update` do ciclo de opções: `where` filtra por `typeConfig: { equals: <lido> }`; valor mudou desde a leitura → 0 linhas → **409** (`ConflictException`). Regressão determinística em `fields-rls` (token obsoleto → 0 linhas; **mutação** removendo a guarda → 1 linha, fase vermelha provada) + teste HTTP de concorrência em `fields-http` (cada resposta 200-ou-409, estado final conta exatamente as opções aplicadas). |
| **H2** | — | Faltava cobertura explícita de concorrência. | **CORRIGIDO.** Testes acima (HTTP + DB determinístico). |
| **M1** | MED | `reordenarOpcao` lançava `OpcaoNaoEncontradaError` quando a âncora era a própria opção ("depois de si mesmo"), virando 404 espúrio. | **CORRIGIDO.** Vira **no-op** (retorna a ordem inalterada, 200). Teste unitário em `option-config`. |
| **L3 / LOW-1** | LOW | `parseEditarCampo` usava só blocklist: uma chave benigna desconhecida (typo, campo futuro) era ignorada em silêncio. | **CORRIGIDO.** Allowlist estrita (`CHAVES_EDITAVEIS`): chave fora de `{label, help, defaultValue}` → 400. Teste HTTP. |
| **LOW-2** | LOW | Faltava asserção de que restaurar Campo volta ao **final** da ordem ativa (não à posição original). | **CORRIGIDO.** Teste HTTP: arquivar A de `[A,B,C]`, restaurar → ordem ativa `[B,C,A]`. |
| Security | LOW×2 | Sem CRITICAL/HIGH. Anti-mass-assignment, isolamento RLS, ausência de DELETE e limites de payload validados. | Aceitos (não bloqueantes); allowlist estrita (L3) endureceu a superfície de edição. |
| Acceptance | LOW×2 | Todos os SC-251..259 atendidos; não-objetivos respeitados (sem migration, sem tabela relacional, sem publicação/versionamento — 2.6). | Aceitos; LOW-2 coberto acima. |

## Veredito
Nenhum CRITICAL/HIGH residual; nenhum MEDIUM bloqueante. Correções acompanhadas de regressão e mutação.
Suíte cheia da API **39 arquivos / 372 testes** verde, em série, contra PostgreSQL real. Pronto para commit e PR.
