# Spec — Story 4.9: Contrato de extensão de Ações e referências de recursos

> Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md` §"### Story 4.9 — Contrato de extensão de Ações e referências de recursos" (§1455–1468).
> FR-21 · RN-104 · D4.1/D4.4 · NFR-14/17 · AD-20/28. Deps: 4.5, 4.6, 4.7, 4.8 (todas done). **Última Story do Épico 4.**
> Risco: **ALTO** (toca a fronteira de autorização/motor: catálogo de Ações consumido pela validação de config e pelo motor 4.6).

## 1. Objetivo

Formalizar o **contrato de extensão tipado e versionado de handlers de Ação** — a interface a que os **8 handlers núcleo
(4.5/4.6) já se conformam** — declarando explicitamente, por tipo de Ação, os facetas do §1459, e **declarar os pontos de
extensão de E5/E6** (Tarefa/Solicitação/Notificação; E-mail/IA) como **contrato NÃO executável na Fase 1**, exatamente como
a 4.3 fez com `event-catalog.ts` (CORE × EXTENSION). Fechar, como **decisão de Arquitetura registrada** (não como código),
a **semântica de versão Ação↔Template** (OQ-26 / B1-deferido) e a **IA como Ação** (AD-20/D4.4), que só se **implementam em
E6**.

## 2. RECORTE Fase-1 × contrato-futuro-E6 (o ponto mais importante desta Story)

**E5 e E6 são Épicos FUTUROS — não existem.** O CLAUDE.md e `kernel/README.md` proíbem abstração especulativa sem consumidor
concreto. O **consumidor concreto do contrato na Fase 1 são os 8 handlers de Ação que 4.5/4.6 JÁ implementam.** Portanto o
contrato é **extraído/formalizado do que existe**, nunca inventado para um futuro hipotético.

**ENTREGA (código, Fase 1 — consumidor concreto = os 8 handlers + o motor + a validação de config):**
- Núcleo **puro** `actions/action-extension-contract.ts`: a interface `HandlerDeAcao` com os facetas do §1459; o **registro
  FECHADO** dos 8 handlers núcleo (`REGISTRO_ACOES_NUCLEO`, derivado de `ACOES_CATALOGO`); a declaração dos **pontos de
  extensão E5/E6** (`ACOES_EXTENSAO`) como contrato **origem=EXTENSION**, sem executor; e o enforcement fail-closed que
  distingue "desconhecido" de "extensão ainda não disponível" (espelho de `exigirEventoNoCatalogo`, 4.3).
- Extensão **aditiva** ao enforcement de configuração (`exigirAcoesNoCatalogo`) para recusar tipos de extensão com **motivo
  distinto** (`ACAO_DE_EXTENSAO_INDISPONIVEL`), preservando `ACAO_FORA_DO_CATALOGO` para o verdadeiramente desconhecido.
- **Prova de conformação (testes):** bijeção catálogo↔registro núcleo; `eventosProduzidos`/`dadosDeTrilha` declarados batem
  com o que os executores reais (4.6) emitem/gravam (regressão contra o motor); tipos de extensão declarados-mas-não-executáveis
  (fail-closed); **plugins/código/scripts/handlers externos/HTTP impossíveis por construção** (registro fechado, sem registro
  dinâmico, sem faceta de handler externo no tipo).

**NÃO ENTREGA — registrado como contrato-futuro/decisão (AD-11; consumidor futuro E5/E6):**
- Entidade **`Template`** — não existe (E6). Sem tabela, sem migration, sem GRANT.
- **Handler de IA como Ação** e o handler de E-mail/Tarefa/Solicitação/Notificação — são de E5/E6. **Nenhum handler vazio.**
- **Máquina de estados de comando proposto da IA** (aguardando aprovação/aprovado/rejeitado/expirado/inválido) — E6.
- A **semântica exata de versão Ação↔Template** — o §1459 e o Gate (OQ-26) dizem explicitamente "**fechada na Arquitetura
  ANTES da implementação de E6**". A 4.9 **REGISTRA a recomendação durável** (snapshot-na-execução, alinhado a
  `FormVersion`/`AutomationVersion`/`configSnapshot`) e a forma do hook no contrato; **não implementa** Template nem a
  resolução de versão. Ratificação formal pelo workflow de Arquitetura fica pendente e **não bloqueia nada agora** (E6 é
  distante) — sem `EXTERNAL_BLOCKER`.

## 3. Os 11 facetas do contrato (§1459) — mapeados ao substrato EXISTENTE

| # | Faceta (§1459) | Onde vive hoje | Representação no contrato |
|---|---|---|---|
| 1 | identificador estável do tipo | `AcaoCatalogo.tipo` (4.5) | `tipo` |
| 2 | versão do schema | `SCHEMA_VERSION_CONFIG` (4.1) | `schemaVersion` (baseline = 1; slot para E5/E6 evoluírem) |
| 3 | schema de configuração | `AcaoCatalogo.validar` (estrutural) | `validarConfig` (bound ao catálogo) |
| 4 | validador de configuração | `AcaoCatalogo.validar` | `validarConfig` |
| 5 | verificação de disponibilidade/gate | `estadosAlvoValidos` + gate FormVersion publicada (4.6) + AD-28 FILE | `gatesDisponibilidade` (conjunto declarado) |
| 6 | resolvedor determinístico de alvo | `resolverAlvoDeterministico` (4.5) | `resolverAlvo` (bound — dispatcher único, total sobre o catálogo) |
| 7 | revalidação de autorização | `revalidarAcao` (4.5) | `revalidar` (bound — uniforme, fail-closed) |
| 8 | executor idempotente | `executarAcao` switch → `atribuirResponsavel`/`criarRegistro` (4.6) | `executor` (descritor: qual caminho; ou `CONFIRMACAO_HUMANA`/`EXTENSAO`) |
| 9 | política de sanitização | `MotivoRecusa`/`ErrorCode` (enums, AD-30) | `sanitizacao` (política uniforme referenciada) |
| 10 | Eventos que pode produzir | emissão nos executores (4.6) | `eventosProduzidos` (conjunto acurado, provado contra o motor) |
| 11 | dados permitidos na trilha | escrita em `CardHistory`/`RecordHistory` (só `{type,summary,actorId}`) | `dadosDeTrilha` (allowlist uniforme, sem `valores`/PII) |

Facetas **6/7/9/11 são UNIFORMES** (mesmo resolvedor/revalidador/sanitização/allowlist para todos) — representadas por
binding/constante do módulo, não por N campos redundantes. **1/2/5/8/10** variam por tipo. Nada é reimplementado: o contrato
**agrupa e torna explícito** o que já existe.

## 4. Proibições da Fase 1 impossíveis POR CONSTRUÇÃO (§1459)

Plugins arbitrários, código do usuário, scripts, handlers externos, execução HTTP — **o contrato os torna impossíveis**, não
apenas "não os oferece":
- O registro é um `Map` **FECHADO**, construído no load a partir de **arrays fixos** (`ACOES_CATALOGO`/`ACOES_EXTENSAO`). Não
  há função pública `register(handlerExterno)`, nem faceta "endpoint/URL/comando/script" no tipo `HandlerDeAcao`.
- Um `executor` só assume um valor de um **enum fechado** (`ATRIBUIR_RESPONSAVEL`/`CRIAR_REGISTRO`/`CONFIRMACAO_HUMANA`/
  `EXTENSAO`) — nunca uma referência de função arbitrária vinda de fora.
- Tipos de extensão têm `executor='EXTENSAO'` e são **recusados** tanto na config (fail-closed) quanto na execução (não têm
  caminho no switch do motor — cairiam em `DENIED`/`ACAO_DESCONHECIDA`).
- **Regressão preservada:** o motor 4.6 continua com o switch provado; a 4.9 **não reescreve o dispatch** (não há motor
  paralelo — §1463). O contrato é a **formalização declarativa**; a conformação motor↔registro é provada por teste.

## 5. Ação↔Template (§1460) — DECISÃO registrada, não implementada

`Template` não existe (E6). A Architecture Spine lista "versionamento Ação↔Template (versão atual/fixa/snapshot)" como item
**seed/implementação** (SPINE §305) e a memlog o marca **B1-deferido**. O Gate OQ-26 exige a semântica **fechada na
Arquitetura antes de E6**. A 4.9:
- **Recomenda SNAPSHOT-NA-EXECUÇÃO** — coerente com todo o padrão desta base (`FormVersion` congela o schema; `AutomationVersion`
  congela a definição; `CardPhaseEntry.configSnapshot` congela a config da Fase; a Execução registra `automationVersionId`).
  Editar/arquivar Template **não altera** uma Execução já iniciada (cai por construção, como a `FormVersion`). Referência por
  **ID estável** + **integridade referencial** + **mesma Organização** + **revalidação na execução** + **fail-closed**
  (Template arquivado/indisponível bloqueia ativação/execução; nenhuma Ação órfã).
- **Modela a forma do hook** no contrato (a faceta `revalidar`/`gatesDisponibilidade` já é o lugar onde um handler de E6
  revalidaria a referência de Template na execução; o vocabulário de referência `TIPOS_DE_REFERENCIA` da 4.1 ganharia
  `TEMPLATE` quando E6 chegar — **não** agora, sem consumidor).
- **Não** cria entidade/tabela/migration; ratificação formal pelo workflow de Arquitetura fica **pendente antes de E6**.

## 6. IA como Ação (§1461; AD-20/D4.4) — DECISÃO registrada, não implementada

IA-as-Action não existe (E6; demonstração vertical da 4.9 é **parcial** — o contrato se verifica via Ações núcleo, §10). A 4.9
registra como o contrato **acomoda** a semântica AD-20 sem implementá-la: nenhuma saída de IA gera efeito automático; o efeito
operacional vira **comando proposto** sob **aprovação humana** (usuário com permissão atual, **não amplia poderes** — reusa a
não-ampliação do `PrincipalAutomacao`); antes do efeito, revalida-se **aprovador/principal/contexto/alvo/regras** (reusa
`revalidarAcao`); a **cadeia não contorna a aprovação** (a prevenção de ciclos 4.7 + a barreira de confirmação já modelam
isso); falha/timeout da IA **não produz comando**; o **fluxo manual permanece**. O gate de confirmação humana (§1383,
`exigeConfirmacaoHumana` + estado `BLOCKED_CONFIRMATION`) **já é o embrião** do modelo de comando proposto — a máquina de
estados completa é E6.

## 7. Isolamento multi-tenant (invariante-mãe)

A 4.9 é **núcleo puro** — não lê estado nem muta. **Não há tabela nova, migration, GRANT ou RLS** (o contrato é código/tipos).
O isolamento segue garantido por quem já o garante: `revalidarReferencias` (sob RLS, 4.1/4.2), o motor 4.6 (snapshot sob
`withTenantContext`) e `revalidarAcao` (fail-closed sobre Org/escopo/estado). `orgId` nunca é aceito do cliente. **Questão
respondida:** um registro de handlers é **código**, não dado de tenant — não precisa de tabela.

## 8. Migration

**Não há.** `prisma generate` sem diff. Confirmação obrigatória nos gates.

## 9. Gate de Arquitetura/Segurança — DERIVADO, não inventado

- **AD-18** — principal com capacidades explícitas deny-by-default; definição versionada; revalidação na execução. Preservado.
- **AD-20** — IA nunca produz efeito direto; comando separado, autorizado, auditável. **Registrado** (não implementado).
- **AD-28** — fail-closed para Ações de E-mail/IA; Campo Arquivo gated. Declarado em `gatesDisponibilidade`.
- **OQ-26** — mecanismo Ação↔Template + prevenção de ciclos = Arquitetura. Prevenção de ciclos JÁ entregue (4.7); Ação↔Template
  **recomendação registrada**, ratificação pendente antes de E6. Sem escolha arquitetural nova não-derivável ⇒ sem `EXTERNAL_BLOCKER`.

## 10. Critérios de aceite (mapeados aos testes — §1463–1466)

- **(§1463)** cada handler declara tipo/versão/schema/validador/gate/resolvedor/revalidação/executor/sanitização/eventos/trilha,
  usando o motor (4.6/4.7/4.8) sem reimplementá-lo; plugins/código/scripts/externos/HTTP não permitidos. →
  `action-extension-contract.core.test.ts` (bijeção catálogo↔registro; toda faceta declarada e total; sem faceta de handler
  externo; `executor` de enum fechado) + `automation-engine-e2e` (regressão do motor verde).
- **(§1464)** Ação↔Template: Template arquivado/indisponível bloqueia ativação/execução (fail-closed), sem órfã; revalidação na
  execução; semântica de versão fechada na Arquitetura antes de E6. → **decisão registrada** (`decisions/action-extension-contract-4-9.md`);
  o hook de revalidação-na-execução é `revalidar` (provado uniforme para os handlers núcleo). Sem Template em Fase 1.
- **(§1465)** IA como Ação: nenhum efeito automático; comando proposto (aguardando/aprovado/rejeitado/expirado/inválido);
  aprovação exige permissão atual e não amplia; falha/timeout não produz comando; fluxo manual permanece. → **decisão
  registrada**; embrião = `exigeConfirmacaoHumana`/`BLOCKED_CONFIRMATION` (provado no contrato). Sem handler de IA em Fase 1.
- **(§1466 / And)** a cadeia não contorna a aprovação; antes do efeito, aprovador/principal/contexto/alvo/regras revalidados. →
  prevenção de ciclos 4.7 (regressão `automation-chaining-*` verde) + `revalidarAcao` (não-ampliação, `automation-principal.core`).
- **Enforcement de config:** tipo de extensão na config → 400 `ACAO_DE_EXTENSAO_INDISPONIVEL`; desconhecido → 400
  `ACAO_FORA_DO_CATALOGO`. → `action-extension-contract.core.test.ts` + `automations-http` (novo bloco de extensão).
