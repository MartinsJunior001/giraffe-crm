# Gates — Story 2.5 (evolução segura de Campos)

> Consolidado dos checks pós-implementação. Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade (executados)
- **typecheck** (`src` + `test`): ✅ exit 0.
- **format:check** (Prettier): ✅ exit 0.
- **lint** (`eslint apps/api`): ✅ exit 0. (O `pnpm lint` da raiz falha só por `.claude/worktrees/` obsoletos — fora do escopo, invisível ao CI.)
- **build** (api + web): ✅ exit 0.
- **testes** (suíte cheia da API, série): ✅ **39 arquivos, 372 testes** — inclui 2.5 (option-config 18, fields-http 14, fields-authz 6, fields-rls 5) e regressão 2.1–2.4.

## migration-check — N/A (registrado)
Opção A (JSON): **nenhuma DDL**, nenhum arquivo em `apps/api/prisma/` alterado. `state`/`archivedAt` já existem
em `Field` desde a 2.4. **Rollback** = revert do código (nada a migrar); `typeConfig` legado (sem `state`) segue
legível (lido como ACTIVE). Sem `FieldOption`, sem policy/GRANT novo.

## security-check
- **Anti-mass-assignment:** editar recusa `type`/`options`/`typeConfig`/`id`/`orgId`/`formId`/`position`/`state`
  (400 — `CHAVES_PROIBIDAS_EDITAR`). Opções só por rotas dedicadas; **allowlist** de chaves da opção
  (`CHAVES_OPCAO`) recusa propriedade desconhecida. Provado por unidade e HTTP.
- **Isolamento:** toda query por `withTenantContext`; nenhum `where orgId` manual. `Field` FORCE RLS (2.4);
  `fields-rls` prova que UPDATE de `state`/`typeConfig` de outra Org ou sem contexto atinge **0 linhas**.
- **Sem exclusão:** runtime sem GRANT DELETE em `Field` (reprovado em `fields-rls`); remover opção é UPDATE do
  `typeConfig`, nunca DELETE de linha.
- **Autorização:** deny-by-default; guarda fina "config do Pipe" no serviço (reusa `pipe-authz`, reconfere
  `Membership.state`); MEMBER/VIEWER 403; sem acesso 404 não-enumerante; C3/CASL intocado.
- **Limites de payload:** `LABEL_MAX`, `OPCOES_MAX`, `TYPECONFIG_BYTES_MAX`, `DEFAULT_VALUE_BYTES_MAX` — travas
  defensivas contra abuso de tamanho.

## concorrência (invariante 12 — guarda otimista)
- O ciclo de opções lê e regrava o `typeConfig` em **passos separados** (sem transação multi-statement). O
  `field.update` carrega uma **guarda otimista**: `typeConfig: { equals: <lido> }` no `where`; se o valor mudou
  desde a leitura, atinge 0 linhas e o serviço responde **409** — nunca sobrescreve às cegas (sem lost update
  silencioso). Achado da revisão (Edge Case Hunter H1), corrigido com **regressão determinística** (`fields-rls`:
  token obsoleto → 0 linhas; **mutação** da guarda → 1 linha, provando a fase vermelha) e teste HTTP de
  concorrência (`fields-http`: cada resposta 200-ou-409, o estado final conta exatamente as opções aplicadas).

## observability-check
- Mutação de config auditada (`Field` já em `MODELOS_AUDITADOS`, 2.4), inclusive a tentativa negada
  (`updateMany count:0`); caminhos idempotentes (arquivar/restaurar já-no-estado) retornam SEM `updateMany`
  (evita falso `denied`).
- Logs sanitizados (Pino); nenhum segredo/PII. Erros de entrada devolvem 400/404 **sanitizados** (sem ecoar o
  valor recebido). Payload sem `orgId` e sem `position` do Campo.

## lgpd-check
- A definição do Campo (rótulo/ajuda/`typeConfig`/opções) é **metadado de configuração**, não valor submetido
  nem PII — o valor capturado só nasce com a submissão (2.7+). `defaultValue` é configuração do administrador,
  não dado de titular. `label` é conteúdo não confiável: sem sanitização destrutiva no back; a Web escapa
  (React). Nenhuma retenção/anonimização nova.

## performance-check
- Cada operação é **um único `update`/`updateMany`** de linha única, pelo índice existente
  `@@index([orgId, formId, state, position])`. Sem transação multi-statement, sem N+1. O ciclo de opções lê e
  regrava um JSON pequeno (limitado por `TYPECONFIG_BYTES_MAX`). Sem impacto de escala novo.

## Veredito
Todos os gates aplicáveis **verdes**; migration-check N/A; sem regressão. Pronto para revisão independente e commit.
