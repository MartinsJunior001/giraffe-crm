# Decisão — Principal Automação + confirmação humana (Story 4.5)

**Gate:** "mecanismo do principal Automação e fluxo de confirmação separado = Arquitetura/Segurança" (epics §1392).
**Resolução:** por **DERIVAÇÃO** dos precedentes da Architecture Spine — **nenhuma escolha arquitetural nova**, logo
**sem `EXTERNAL_BLOCKER`**.

## O que a Spine já decide (não se reinventa)

- **AD-9** (`ARCHITECTURE-SPINE.md:89`) — "Principais: usuário autenticado, processo/job, **Automação**, serviço de
  Plataforma — cada um carrega **Organização, ator/origem e permissões**." A Automação é principal de primeira classe;
  autorização deny-by-default; Plataforma não concede acesso implícito a dados de Org.
- **AD-18** (`:134`) — "**Principal Automação tem capacidades explícitas deny-by-default; não herda indefinidamente as
  permissões do criador**; a definição é **versionada** e a execução **registra a versão usada**." E: "ao executar,
  revalidar no servidor Organização, Automação ativa, versão, **permissões do principal e existência dos recursos**
  (não confiar no payload)."
- **AD-13/AD-16** (`:109`/`:196`) — evento/trilha carregam Organização + **ator/origem** + correlação; a mudança
  original preserva **quem a iniciou**.

## O que a 4.5 materializa (contrato, não motor)

1. **Tipo `PrincipalAutomacao`** (`actions/automation-principal.ts`): `orgId`+`pipeId` (RN-100) + `automationId` +
   `automationVersionId` (AD-18 versionado) + `recursosAutorizados` (allowlist das referências configuradas + Pipe) +
   `capacidades` (allowlist dos tipos de Ação do `entao`). Ambas allowlists **deny-by-default**, derivadas da
   DEFINIÇÃO VERSIONADA — não das permissões da pessoa que criou. Encapsula "não herda do criador".
2. **Escopo RESTRITO** = função pura `escopoAlcancaRecurso` + a checagem de Pipe em `revalidarAcao`. O escopo é do
   principal; um recurso que o criador alcançaria mas fora da allowlist é recusado (não-ampliação, §1389).
3. **Revalidação** (`action-revalidation.core.ts`): capacidade → existência → Organização → escopo → estado, fail-closed.
   Espelha o "revalidar no servidor, não confiar no payload" do AD-18. Opera sobre snapshot montado pelo motor sob RLS.
4. **Três papéis na trilha** (`TrilhaAtoria`): **ator** (o principal Automação, quem executa agora), **iniciador** (quem
   iniciou a mudança original — preservado), **principal** (definição versionada). Deriva de AD-13/AD-16 (ator/origem +
   correlação) + §1384. Nenhum campo é fundido com outro.
5. **Confirmação humana** (§1383/§1388): `exigeConfirmacaoHumana` por Ação no catálogo, propagado no veredito da
   revalidação. A 4.5 REGISTRA o requisito; a **máquina de estados** (`aguardando confirmação`, fluxo separado
   rastreável, sem job aberto) é da 4.6 — o "fluxo separado" é a consequência do dado, construído pelo motor. Não há
   worker/estado persistido nesta Story (AD-11 — sem consumidor concreto do estado de confirmação antes da 4.6).

## Consequência

O motor (4.6) CONSTRÓI um `PrincipalAutomacao` concreto a partir da Automação ativa + versão + referências validadas,
sob `withTenantContext`, e CONSOME `resolverAlvoDeterministico`/`revalidarAcao`. A 4.5 não toca banco nem executa Ação.
