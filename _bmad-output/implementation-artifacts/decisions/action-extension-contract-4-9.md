# Decisão — Story 4.9: Contrato de extensão de Ações e referências de recursos

> Épico 4 (Automações), **última** Story. FR-21 · RN-104 · D4.1/D4.4 · NFR-14/17 · AD-18/20/28 · OQ-26.
> Fonte: epics.md §1455–1468. Artefatos Spec Kit: `specs/4-9-contrato-de-extensao-de-acoes-e-referencias/`.

## 1. Contexto e o RISCO central (abstração especulativa)

A 4.9 é o **contrato de extensão tipado e versionado de Ações** que **E5** (Tarefa/Solicitação/Notificação) e **E6**
(E-mail/Template/IA) consumirão (epics §1244/§1256). **E5 e E6 são Épicos FUTUROS — não existem.** O CLAUDE.md e
`apps/api/src/kernel/README.md` proíbem abstração especulativa sem consumidor concreto (módulo vazio, handler vazio,
event bus). Logo o desenho da 4.9 foi guiado por uma regra: **o consumidor concreto do contrato na Fase 1 são os 8
handlers de Ação que 4.5/4.6 JÁ implementam.** O contrato é **extraído/formalizado do existente**, nunca inventado para
um futuro hipotético.

## 2. RECORTE — o que é CÓDIGO (Fase 1) e o que é CONTRATO/DECISÃO (E6)

**Código entregue (consumidor concreto = os 8 handlers + o motor 4.6 + a validação de config):**
- `apps/api/src/pipes/automations/actions/action-extension-contract.ts` (puro): a interface `HandlerDeAcao` com as 11
  facetas do §1459; o **registro FECHADO** dos 8 handlers núcleo (`REGISTRO_ACOES_NUCLEO`, derivado de `ACOES_CATALOGO`
  — fonte única, sem duplicar `validar`/`dominio`/`exigeConfirmacaoHumana`); a declaração dos **pontos de extensão E5/E6**
  (`TIPOS_ACAO_EXTENSAO`/`REGISTRO_ACOES_EXTENSAO`, `origem='EXTENSION'`, sem executor); e o enforcement fail-closed
  (`exigirAcaoDisponivel`/`rejeitarAcoesDeExtensao`) que distingue "desconhecido" de "extensão indisponível".
- Enforcement aditivo nos 2 serviços de Automação: Ação de extensão na config → **400 `ACAO_DE_EXTENSAO_INDISPONIVEL`**
  (motivo DISTINTO); desconhecido segue **400 `ACAO_FORA_DO_CATALOGO`** (regressão da 4.5 preservada).
- **Consumo por construção:** o executor 4.6 (`action-executors.ts`) passou a IMPORTAR do contrato os identificadores dos
  Eventos que gera (`EVENTO_GERADO_ASSIGN_RESPONSIBLE`/`EVENTO_GERADO_RECORD_CREATE`) — o que o contrato DECLARA é o que o
  motor USA, sem possibilidade de drift. Valor idêntico ⇒ comportamento observável do motor inalterado (engine-e2e verde).

**NÃO entregue — registrado como contrato-futuro (AD-11; consumidor futuro E5/E6):**
- Entidade `Template`; handler de IA/E-mail/Tarefa/Solicitação/Notificação; máquina de estados de comando proposto da IA.
- **Sem migration, sem tabela, sem GRANT, sem RLS.** Um registro de handlers é **código**, não dado de tenant. `prisma
  generate` sem diff.
- **Sem reescrever o dispatch do motor** (§1463 — "usando o motor sem reimplementá-lo"). Sem motor paralelo.
- `TIPOS_DE_REFERENCIA` (4.1) **não** ganhou `TEMPLATE` (sem consumidor concreto).

## 3. As 11 facetas do §1459 — formalização do que já existia

| # | Faceta | Substrato | No contrato |
|---|---|---|---|
| 1 | identificador estável | `AcaoCatalogo.tipo` | `tipo` |
| 2 | versão do schema | `SCHEMA_VERSION_CONFIG` | `schemaVersion` (baseline 1) |
| 3/4 | schema + validador | `AcaoCatalogo.validar` | `validarConfig` (delega — mesma função) |
| 5 | gate de disponibilidade | `estadosAlvoValidos` + FormVersion publicada | `gatesDisponibilidade` |
| 6 | resolvedor de alvo | `resolverAlvoDeterministico` | `SUPERFICIE_HANDLER.resolverAlvo` (uniforme) |
| 7 | revalidação de autz | `revalidarAcao` | `SUPERFICIE_HANDLER.revalidar` (uniforme) |
| 8 | executor idempotente | `executarAcao` switch (3 executáveis; 5 confirmação-gated) | `executor: ExecutorKind` (enum FECHADO) |
| 9 | sanitização | `MotivoRecusa`/`ErrorCode` (AD-30) | `SUPERFICIE_HANDLER.sanitizacao` |
| 10 | Eventos produzidos | emissão nos executores 4.6 | `eventosProduzidos` (consumido por construção) |
| 11 | dados de trilha | `{type,summary,actorId}` em `CardHistory`/`RecordHistory` | `DADOS_DE_TRILHA_PERMITIDOS` |

## 4. Proibições da Fase 1 impossíveis POR CONSTRUÇÃO (§1459)

Plugins arbitrários, código do usuário, scripts, handlers externos, execução HTTP: o registro é um `Map` FECHADO montado
no load a partir de arrays FIXOS; **não há função pública de registro dinâmico**; `HandlerDeAcao` **não tem faceta de
endpoint/URL/comando/script**; `ExecutorKind` é um enum FECHADO (`ATRIBUIR_RESPONSAVEL`/`CRIAR_REGISTRO`/
`CONFIRMACAO_HUMANA`/`EXTENSAO`) — um handler nunca carrega referência de função vinda de fora. Tipos de extensão têm
`executor='EXTENSAO'`, são recusados na config (fail-closed) e não têm caminho de execução no motor.

## 5. DECISÃO — Semântica de versão Ação↔Template (§1460; Gate OQ-26; SPINE §305; B1-deferido)

**Estado atual:** `Template` não existe (E6). A Architecture Spine lista "versionamento Ação↔Template (versão
atual/fixa/snapshot)" como item **seed/implementação** (SPINE §305); o memlog o marca **B1-deferido** ("ID estável não
resolve alterações posteriores; decidir depois entre usar sempre a versão atual / fixar uma versão / armazenar snapshot no
momento da execução"). O Gate exige a semântica **fechada na Arquitetura ANTES de E6**.

**Recomendação (decisão interna, reversível — Fast Track "Decisão autônoma"): SNAPSHOT-NA-EXECUÇÃO.**
- **Racional:** é o padrão pervasivo desta base — `FormVersion` congela o schema do Formulário; `AutomationVersion` congela
  a definição da Automação (a Execução registra `automationVersionId`); `CardPhaseEntry.configSnapshot` congela a config da
  Fase. Snapshot-na-execução dá, de graça e por construção, as propriedades exigidas por §1460: **editar/arquivar Template
  NÃO altera uma Execução já iniciada** (o snapshot congelou a versão vigente no ato); **referência por ID estável** +
  **integridade referencial** + **mesma Organização** + **revalidação na execução** (o handler de E6 revalidaria a
  referência de Template pela faceta `SUPERFICIE_HANDLER.revalidar`/`gatesDisponibilidade`, fail-closed) + **Template
  arquivado/indisponível bloqueia ativação/execução** (novo gate de disponibilidade do handler de E-mail de E6) +
  **nenhuma Ação órfã** (a integridade referencial recusa a config).
- **Alternativas descartadas:** "usar sempre a versão atual" viola "não altera silenciosamente uma Execução já iniciada";
  "fixar uma versão" (pin) é um snapshot mais frágil (não captura o conteúdo, só o número) e diverge do padrão da base.
- **Como o contrato acomoda sem implementar:** quando E6 existir, `TIPOS_DE_REFERENCIA` ganha `TEMPLATE`; o handler
  `EMAIL_SEND` declara `gatesDisponibilidade` incluindo a disponibilidade do Template e revalida a referência na execução;
  o snapshot do Template segue o padrão `FormVersion`. **Nada disso é código na 4.9.**
- **Ratificação:** esta é uma recomendação de implementação registrada; a **ratificação formal pelo workflow de
  Arquitetura** (não edito a ARCHITECTURE-SPINE, artefato autoritativo) fica **pendente antes de E6**. Não bloqueia agora —
  E6 é distante e nada na Fase 1 depende disso. **Não é `EXTERNAL_BLOCKER`.**

## 6. DECISÃO — IA como Ação (§1461; AD-20; D4.4)

**Estado atual:** IA-as-Action não existe (E6; demonstração vertical da 4.9 é **parcial** — o contrato se verifica via
Ações núcleo). A 4.9 **registra** como o contrato acomoda AD-20, sem implementá-la:
- Nenhuma saída de IA gera efeito automático; classificação não grava Campo automaticamente; o efeito operacional vira
  **comando proposto** sob **aprovação humana**.
- **Aprovação exige usuário com permissão ATUAL e NÃO amplia poderes** — reusa a não-ampliação do `PrincipalAutomacao`
  (`revalidarAcao`: capacidade explícita deny-by-default + escopo do principal, não do criador).
- Antes do efeito, revalidar **aprovador/principal/contexto/alvo/regras** — reusa `SUPERFICIE_HANDLER.revalidar`.
- **A cadeia não contorna a aprovação** — a prevenção de ciclos (4.7) + a barreira de confirmação já modelam isso.
- Falha/timeout/indisponibilidade da IA **não produz comando nem efeito**; o **fluxo manual permanece**.
- **Embrião já existente:** o gate de confirmação humana (§1383) — `exigeConfirmacaoHumana=true` + estado
  `BLOCKED_CONFIRMATION` no motor — é o embrião do modelo de comando proposto. A máquina de estados completa (aguardando
  aprovação/aprovado/rejeitado/expirado/inválido por mudança de contexto) e a porta de IA (AD-24/26) são **E6**.

## 7. Débitos técnicos registrados (contrato-futuro, AD-11)

- **DEB-4-9-E5-E6-HANDLER-REGISTRO** — E5/E6 registram seus handlers concretos preenchendo `HandlerDeAcao` (executor,
  gates, eventos, validador) e habilitando o tipo (`origem` deixa de recusar). Consumidor futuro: as Stories de E5/E6.
- **DEB-4-9-TEMPLATE-VERSION-RATIFY** — ratificar formalmente pelo workflow de Arquitetura a semântica snapshot-na-execução
  Ação↔Template + adicionar `TEMPLATE` a `TIPOS_DE_REFERENCIA` — **antes de E6**.
- **DEB-4-9-IA-COMMAND-STATE** — máquina de estados de comando proposto da IA + porta de IA (AD-20/24/26) — E6.
- **DEB-4-9-CONFIRMACAO-EXECUTOR** — os 5 handlers sensíveis (confirmação humana) hoje viram `BLOCKED_CONFIRMATION`; o
  executor concreto ligado ao fluxo de confirmação (e os Eventos que produzirão: CARD_MOVED/CARD_FIELD_VALUE_CHANGED/
  CARD_FINALIZED/CARD_ARCHIVED/RECORD_FIELD_VALUE_CHANGED) é contrato futuro (herdado de 4.5/4.6, não desta Story).

## 8. Evidências

- `prisma generate` sem diff (nenhuma mudança de schema). Typecheck (`src`+`test`) verde. ESLint verde. Prettier verde.
  `nest build` verde.
- Testes: `action-extension-contract.core.test.ts` (13, puro) verde; **fase vermelha provada** (quebrar `eventosProduzidos`
  ⇒ teste falha); domínio automation/action completo **serial** (250 testes, `--no-file-parallelism`) verde, incluindo
  `automation-engine-e2e` (comportamento do motor inalterado) e o novo bloco `ACAO_DE_EXTENSAO_INDISPONIVEL` em
  `automations-http`. A suíte completa da API é o gate canônico do **CI** (integração serial).
- Regressão de segurança: `PrincipalAutomacao`/`revalidarAcao` intocados; guard/`ability.ts` (C3) congelado; sem GRANT/RLS
  nova.
