# Revisão adversarial (3 lentes) — Story 2.10

> Revisão inline pelo implementador (contexto completo), com prova de fase vermelha nos invariantes de segurança.
> Risco: **ALTO** (autorização por concessão — superfície nova de acesso a dado operacional/PII).

## Lente Segurança
- **Deny-by-default na resolução de acesso:** `computeAcessoNaoAdmin` parte de tudo `false`; devolve `null` (→ 404)
  se nem `podeLer`. Admin da Org → total; não-Admin depende de `PipeGrant`/`CardGrant` ACTIVE. ✅
- **`pipeId` nunca do cliente:** as rotas ficam sob `cards/:cardId`; o Pipe dono é lido do Card sob RLS antes de
  resolver o poder no Pipe. ✅
- **Isolamento + GRANT sem DELETE:** provados em `card-access-rls` (WITH CHECK INSERT/UPDATE; DELETE → permission
  denied; UPDATE de `state` permitido). ✅
- **Fase vermelha do `restritoAoProprio`:** mutação (ignorar o modificador) torna o teste do **creator** vermelho —
  o teste não é vácuo. ✅
- **Ajuste aplicado na revisão:** `conceder` passou a exigir Membership alvo **ACTIVE** (não só existente),
  consistente com `pipe-grants` (2.2) — evita concessão dormente a vínculo suspenso/removido.

## Lente Edge
- **Idempotência:** reatribuir a mesma pessoa (no-op, sem evento), remover/revogar duas vezes (`removido/revogado:
  false`, sem evento), reconceder (UPDATE das capacidades, sem violar o índice parcial) — todos provados. ✅
- **Troca de Responsável:** remove o atual (`REMOVED`) + cria o novo (`ACTIVE`) + `RESPONSAVEL_CHANGED`, mantendo
  **um** ativo (índice parcial). Provado. ✅
- **Concorrência:** conflito no índice parcial → P2002/P2028 → 409 (`isConflito`), nunca 500 — mesmo padrão testado
  na 2.7. Caminho presente; não reexercido por HTTP concorrente (custo/valor: já coberto estruturalmente em 2.7).
- **`podeMover` sem `podeOperar` → 400** (DTO). ✅
- **Fixture:** Eva pertence a DUAS Orgs ativas → contexto ambíguo; usada só como **alvo** (membershipId), nunca como
  principal de requisição. Bruno (Org A única) é o principal não-Admin. Registrado no teste.

## Lente Acceptance (SC-21xx)
- **SC-2101** (alvo precisa de acesso operacional prévio) → 400 sem acesso. ✅
- **SC-2102** (atribuição não amplia acesso): estrutural — `CardResponsavel` é por Card; a resolução consulta por
  `cardId`. Coberto pela composição; não há caminho que vaze para outro Card.
- **SC-2103/2104** (escopo a UM Card): concessão no Card A não abre o Card B — provado.
- **SC-2105** (creator/histórico não concedem): provado (fase vermelha).
- **SC-2106/2107/2108** (contrato de Membership): unit puro — preflight vacuamente verdadeiro; handler revoga/remove
  ao encerrar/suspender, não restaura ao reativar, preserva `creator` por construção. ✅

## Boundary registrado (não é bug — fora do escopo 2.10)
A leitura do **Kanban/listagem** (2.9) autoriza por `resolverPoderNoPipe` (nível de Pipe); ela **não** filtra a
LISTA de Cards pelo `restritoAoProprio` nem honra `CardGrant` direto para exibir um Card a quem só tem concessão. A
2.10 escopa a autorização de **operação** no nível do Card (Responsável/concessões), não a re-filtragem da leitura
2.9 — isso depende de consumidor concreto (perfil operacional do Kanban restrito) e fica para trabalho futuro, sem
antecipar escopo. Não há vazamento cross-tenant (a RLS continua isolando por Org); é granularidade de leitura
intra-Org.

## Veredito
Sem defeito de correção aberto. Ressalva de revisão (ACTIVE no `conceder`) já aplicada. Gates verdes (2 vermelhos
ambientais pré-existentes, provados independentes). **Pronto para commit.**
