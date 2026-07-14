# Analyze — Story 2.10

Análise de consistência cruzada (spec ↔ plan ↔ tasks ↔ epics/PRD) **antes** da implementação. Story em backlog; o
foco é garantir cobertura dos ACs e **expor** decisões/divergências, não afirmar execução.

## Cobertura dos critérios (SC-210x)
- **SC-2101** (Responsável exige acesso operacional prévio) — `plan §Serviços`/tasks 6, 8 (`responsavel-http`,
  fase vermelha "atribuir a sem-acesso"). Coberto (condicional a D-OA2). ✅-plano
- **SC-2102** (Responsável não amplia acesso) — tasks 6/8; resolução de acesso não deriva de ser Responsável em
  outro Card. Coberto. ✅-plano
- **SC-2103** (Observador só lê) — `plan §Autorização`/tasks 5,6,8 (`card-access-authz`). Coberto (condicional
  D-OA1). ✅-plano
- **SC-2104** (concessão direta limitada ao Card; `moverCard` opt-in) — idem; `moverCard` é capacidade-dado (2.14
  fora). Coberto. ✅-plano
- **SC-2105** ("restrito ao próprio"; creator/histórico não contam) — flag `restritoAoProprio` no `PipeGrant`;
  resolução nunca consulta `creator`/histórico; teste de mutação "aceita creator → falha". Coberto. ✅-plano
- **SC-2106/2107/2108** (contrato de Membership) — `membership-contract.ts` puro; tasks 6/8. Coberto **como
  contrato** (condicional D-OA3; possivelmente vacuamente verdadeiro hoje). ✅-plano-contrato
- **SC-2109** (isolamento/fronteira) — migration RLS+FORCE+WITH CHECK, GRANT sem DELETE, `MODELOS_AUDITADOS`,
  C3 congelado. Coberto. ✅-plano

## ⚠️ Divergências e riscos registrados (ESCALAR antes de implementar)

- **DIV-1 — `Card` UPDATE: CLAUDE.md diz "fica para 2.14", mas o Responsável pode exigir UPDATE já em 2.10.**
  O bloco de estado da CLAUDE.md e o comentário do schema afirmam que `Card` tem GRANT só SELECT/INSERT e que
  UPDATE/DELETE "ficam para a movimentação/ciclo de vida (2.14/2.11)". Atribuir Responsável (D-OA2=A) é um UPDATE de
  `Card` — **antes** de 2.14. Isso **não** é contradição fatal (o UPDATE seria **escopado** a
  `responsavelMembershipId`, não a `phaseId`), mas **muda a narrativa** da fronteira e **exige** decisão explícita +
  teste de escopo do GRANT. **Alternativa que evita o conflito:** D-OA2=B (`CardResponsavel`), mantendo `Card`
  append-only até 2.14. *Análogo ao achado D-A5 da 2.8 sobre o comentário legado "2.9/2.11" no schema de `Card` —
  atenção a não herdar/repetir uma redação de fronteira desatualizada.*

- **DIV-2 — Dependência para frente em um Épico inexistente (E8).** epics §914 lista "Dep.: 2.2, 2.9, **contrato de
  Membership (E8)**". O Épico 8 (Administração/Membros) **não foi implementado**. 2.10 pode entregar apenas a
  **função-contrato** (AD-11 — sem materializar caller/trava só para o futuro) ou o sprint pode **reordenar**. Além
  disso **2.9 está em implementação paralela** (não mergeada): 2.10 depende da superfície do Kanban/Card. Risco de
  sequenciamento — **escalar** (D-OA3).

- **DIV-3 — "Card que exige Responsável ativo" pode não existir na Fase 1.** A regra que faria o preflight bloquear
  encerramento existe para **Tarefa/Solicitação** (D5.2), **não** demonstravelmente para **Card** na Fase 1. Se
  ausente, o preflight de 2.10 é **vacuamente verdadeiro** (contrato pronto, nunca dispara). **Não inventar** a
  regra — registrar e escalar (D-OA3).

- **DIV-4 — `CardHistory.actorId` = accountId, Responsável = membershipId.** O write-side da 2.7 grava
  `actorId = accountId`. A elegibilidade/identidade do Responsável é por **Membership** (PRD §1065). A chave do
  Responsável (D-OA2) deve ser `membershipId`; os eventos de Responsável no `CardHistory` seguem com `actorId`
  (accountId do **ator** da ação, não do Responsável). Sem defeito, mas **precisa ser explícito** para não confundir
  ator × Responsável.

- **DIV-5 — Autorização de "quem concede/atribui" não fixada no PRD.** O PRD lista o **evento** de concessão/
  revogação (§928) mas não **quem** o executa. Proposta (reuso `gerenciar`/`operar` do `pipe-authz`) **precisa de
  confirmação** contra a matriz (OQ-1, aberta). Não decidir sozinho.

## Consistência de invariantes
- **Sem novos papéis de Card** (epics §908): respeitado — `CardGrant` carrega **capacidades**, `restritoAoProprio` é
  **modificador**; nenhum papel novo; CASL/guard intocados.
- **AD-11 / sem antecipar:** `moverCard` é dado, não operação; contrato de Membership é função pura sem caller;
  nenhuma trava materializada sem consumidor. Respeitado.
- **Deny-by-default / 404 não-enumerante / isolamento pelo banco:** replicados do padrão 2.2–2.8.

## Veredito
**PRONTO PARA REVISÃO DO DONO — NÃO PRONTO PARA IMPLEMENTAR.** Cobertura de ACs desenhada; 3 decisões bloqueantes
(D-OA1/2/3) e 5 divergências (DIV-1..5) escaladas. Implementação só após decisão registrada — e, idealmente, após
2.9 mergeada e a posição de E8 no sprint definida.
