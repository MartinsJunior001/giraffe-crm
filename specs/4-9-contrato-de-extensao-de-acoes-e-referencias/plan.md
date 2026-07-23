# Plan — Story 4.9

> Risco **ALTO** (área crítica: catálogo de Ações consumido pela validação de config e adjacente ao motor). Gates: testes da
> área + integração real (PG) + regressão de segurança/motor + typecheck/lint/build + `prisma generate` sem diff + fase vermelha.

## Estratégia — a MENOR mudança correta

Formalizar o contrato **por extração/composição** do que já existe, sem tocar o dispatch do motor. Um arquivo puro novo + uma
extensão aditiva ao enforcement de config + testes + a decisão durável. Nenhuma migration, nenhum GRANT, nenhum handler novo.

## Arquivos

**Novo — `apps/api/src/pipes/automations/actions/action-extension-contract.ts` (puro):**
- `HandlerDeAcao` — interface com os facetas variáveis do §1459: `tipo`, `origem`, `schemaVersion`, `dominio`,
  `gatesDisponibilidade`, `executor` (enum fechado), `eventosProduzidos`, `exigeConfirmacaoHumana`. As facetas uniformes
  (`resolverAlvo`=`resolverAlvoDeterministico`, `revalidar`=`revalidarAcao`, `sanitizacao`, `dadosDeTrilha`) são expostas como
  constantes/bindings do módulo (`SUPERFICIE_HANDLER`) — uma superfície única, não repetida por tipo.
- `GateDisponibilidade` — enum: `ESTADO_ALVO` | `FORMVERSION_PUBLICADA` | `ARQUIVO_HABILITADO` (AD-28). Declarado por tipo.
- `ExecutorKind` — enum FECHADO: `ATRIBUIR_RESPONSAVEL` | `CRIAR_REGISTRO` | `CONFIRMACAO_HUMANA` | `EXTENSAO`. Sem função externa.
- `REGISTRO_ACOES_NUCLEO` — os 8 handlers núcleo, derivados de `ACOES_CATALOGO` (uma fonte, sem duplicar `validar`/estado).
- `ACOES_EXTENSAO` — E5: `TASK_CREATE`/`REQUEST_CREATE`/`NOTIFICATION_SEND`; E6: `EMAIL_SEND`/`AI_ACTION`. `origem=EXTENSION`,
  `executor='EXTENSAO'`, provisórios (nota).
- `DADOS_DE_TRILHA_PERMITIDOS` — allowlist uniforme: `['type','summary','actorId']` (sem `valores`/PII — AD-30/AD-15).
- Acessores: `obterHandler(tipo)`, `handlerEhExecutavelNaFase1(tipo)`, `exigirAcaoDisponivel(tipo)` (fail-closed: desconhecido ⇒
  `ACAO_FORA_DO_CATALOGO`; extensão ⇒ `ACAO_DE_EXTENSAO_INDISPONIVEL`). Espelha `exigirEventoNoCatalogo` (4.3).

**Alterado (aditivo) — `actions/action-catalog.ts`:** `exigirAcoesNoCatalogo` passa a distinguir extensão de desconhecido,
delegando ao contrato (import unidirecional contract→catalog; para evitar ciclo, o enforcement de extensão vive no contrato e
`exigirAcoesNoCatalogo` o chama, ou o serviço chama `exigirAcaoDisponivel`). **Decisão de fiação:** manter `action-catalog.ts`
sem importar o contrato (evita ciclo); o **serviço** (`automations.service`/`automation-lifecycle.service`) chama
`exigirAcaoDisponivel` por Ação **antes** de `exigirAcoesNoCatalogo`, traduzindo o novo motivo. Menor acoplamento, sem ciclo.

**Alterado (aditivo) — `automations.service.ts` + `automation-lifecycle.service.ts`:** ao validar `entao`, recusar tipos de
extensão com `400 ACAO_DE_EXTENSAO_INDISPONIVEL` (antes do enforcement estrutural do catálogo). Regressão: tipos núcleo
seguem idênticos; tipos antes "desconhecidos" que agora são "extensão" passam a ter motivo mais honesto.

**Novo — testes** (`apps/api/test/action-extension-contract.core.test.ts` puro; bloco em `automations-http.test.ts`).

**Novo — decisão durável** `_bmad-output/implementation-artifacts/decisions/action-extension-contract-4-9.md`.

## Conformação provada (o que os testes fecham)
1. **Bijeção:** todo `tipo` de `ACOES_CATALOGO` tem exatamente um `HandlerDeAcao` núcleo e vice-versa; nenhum tipo órfão.
2. **Totalidade:** `resolverAlvoDeterministico` e `revalidarAcao` são totais sobre os 8 tipos (já cobertos por 4.5, reforço).
3. **eventosProduzidos ⊇ real:** para os 3 executáveis, o motor E2E (4.6) emite exatamente o declarado
   (`CARD_ASSIGN_RESPONSIBLE→[CARD_RESPONSIBLE_CHANGED]`; `RECORD_CREATE`/`RECORD_CREATE_RELATED→[RECORD_CREATED]`); os 5
   confirmação-gated declaram `[]` (não executam na Fase 1).
4. **dadosDeTrilha:** os executores gravam só `{type,summary,actorId}` — nenhuma chave fora da allowlist (regressão de log/trilha).
5. **Proibições por construção:** `ExecutorKind` é um enum fechado (sem função externa); não existe registro dinâmico;
   `ACOES_EXTENSAO` não têm caminho de execução.
6. **Fail-closed de config:** extensão ⇒ `ACAO_DE_EXTENSAO_INDISPONIVEL`; desconhecido ⇒ `ACAO_FORA_DO_CATALOGO`.

## Fase vermelha (prova de que o teste pega o erro)
- Quebrar `eventosProduzidos` de `RECORD_CREATE` (remover `RECORD_CREATED`) ⇒ o teste de conformação contra o motor E2E fica
  vermelho. Restaurar ⇒ verde.
- Registrar um tipo de extensão como `origem=CORE` ⇒ o teste de "extensão não executável / config recusa" fica vermelho.

## Gates (risco ALTO)
`prettier --check` · `pnpm lint` · `pnpm typecheck` · `pnpm build` · `pnpm --filter @giraffe/api test` (PG real: contrato +
regressão do motor 4.5/4.6/4.7/4.8 + trilha 4.8 + http) · `prisma generate` sem diff. Corrigir todos BLOCKER/HIGH antes do PR.

## Fora de escopo (reafirmado)
Reescrita do dispatch do motor; entidade Template; handler de IA/E-mail/Tarefa; máquina de comando proposto; `TEMPLATE` em
`TIPOS_DE_REFERENCIA`; qualquer persistência.
