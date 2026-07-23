# Clarify — Story 4.9

Somente ambiguidade **material** (Fast Track). Cada item resolvido **pelas fontes**, registrado, sem escalar ao dono
(nenhum é decisão de Produto irreversível).

## C1 — O recorte Fase-1 × E6 é material. Quanto é CÓDIGO vs. CONTRATO/DECISÃO?
**Resolução (fontes):** epics §1459 ("semântica exata de versão... fechada na Arquitetura ANTES de E6"; "detalhamento em E6"),
§1468 (demonstração vertical **parcial**), §1256 (E4 entrega o **contrato tipado**, não a implementação de E5/E6). SPINE §305
lista o versionamento Ação↔Template como item **seed/implementação**; memlog o marca **B1-deferido**. ⇒ A 4.9 é **leve em
código novo (formalização pura do contrato a que os 8 handlers já se conformam + declaração dos pontos de extensão), pesada em
decisão registrada** (Ação↔Template, IA). **Sem** Template, **sem** handler de IA, **sem** migration. Consumidor concreto = os
8 handlers 4.5/4.6.

## C2 — Precisa de tabela/persistência nova?
**Resolução:** um registro de handlers é **código**, não dado de tenant (CLAUDE.md — "questione se precisa de tabela"). Sem
tabela ⇒ sem RLS/GRANT/migration. Confirmado por `prisma generate` sem diff nos gates.

## C3 — Reescrever o switch do motor para consultar o registro?
**Resolução:** **NÃO.** §1463 exige "usando o motor (4.6/4.7/4.8) **sem reimplementá-lo**"; CLAUDE.md exige "menor mudança
correta" e "regressão do motor não pode alterar comportamento observável". O contrato é **declarativo**; a conformação
motor↔registro é provada por **teste** (eventosProduzidos/dadosDeTrilha declarados ⊇ o que o motor real emite/grava). Sem motor
paralelo, sem novo dispatch.

## C4 — Nomear os tipos de Ação de extensão E5/E6 antecipa escopo?
**Resolução:** a 4.3 já criou precedente: `event-catalog.ts` declarou `EVENTOS_EXTENSAO` (TASK_CREATED/EMAIL_SENT...) como
**contrato NÃO selecionável**, e foi aceito. Os nomes das Ações de extensão derivam de epics §1256/§1382 e §5.7 (Criar
Tarefa/Criar Solicitação/Enviar Notificação; Enviar E-mail; IA como Ação) — **derivados, não inventados**. Declarados
`origem=EXTENSION`, sem executor, recusados fail-closed; **provisórios**, confirmados/refinados por E5/E6 (nota no código).

## C5 — Semântica de versão Ação↔Template: qual das três (atual/fixa/snapshot)?
**Resolução (decisão interna, reversível):** **snapshot-na-execução**, por coerência com todo o padrão da base
(`FormVersion`/`AutomationVersion`/`configSnapshot`). Registrada em `decisions/action-extension-contract-4-9.md`. Ratificação
formal pelo workflow de Arquitetura fica pendente **antes de E6** — não bloqueia agora (E6 inexistente). Não edito a
ARCHITECTURE-SPINE (artefato autoritativo).
