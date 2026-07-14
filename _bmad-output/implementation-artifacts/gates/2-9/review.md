# Revisão independente — Story 2.9 (Kanban e espaço operacional do Card)

> Revisão de **risco MÉDIO** (fatia somente leitura, sem migration/GRANT): três revisores read-only em paralelo
> (Security, Edge, Acceptance). Evidência real; PostgreSQL real. Nenhum CRITICAL/HIGH/MEDIUM de correção.

## Revisores e veredito
- **Blind Security** — **APROVA**, sem CRITICAL/HIGH/MEDIUM. Confirmou: isolamento (as 3 leituras — incl. `groupBy` —
  por `withTenantContext`; cross-tenant/sem-contexto = 0); autorização (`resolverPoderNoPipe` antes de toda leitura;
  404 não-enumerante; VIEWER lê sem flags operacionais); sem vazamento (`orgId` fora da fronteira; lista sem
  `valores`); **read-only de fato** (`Card` sem GRANT UPDATE — `permission denied`); paginação com teto e entrada
  validada. Notas LOW/INFO inócuas (o `PinoLogger` é usado no `withTenantContext`; `groupBy` conta Fase arquivada mas
  ela nunca vira coluna).
- **Acceptance Auditor** — **APROVA COM RESSALVAS**. SC-291..295 e o escopo do dono COBERTOS; leitura-apenas
  confirmada (no-UPDATE provado em banco real); **sem escopo antecipado** (sem coluna de estado, sem `CardHistory`,
  sem executor de movimentação). Ressalvas = lacunas de teste (R1 caminho 400 do DTO; R2 capacidades do Viewer no
  detalhe) + R3 (flag `gerenciar` no detalhe — shape do dono, Q5).
- **Edge Case Hunter** — **APROVA COM RESSALVAS**, nenhum bug de correção. Paginação por cursor (`[createdAt, id]` +
  cursor por `id` + `skip:1`), matemática de `temMais`/`proximoCursor` nas bordas, determinismo (`position` é
  `Decimal`, ordenação numérica) e ausência de N+1 (groupBy único; Fase 1 query fixa) — todos CONFIRMED corretos.
  Ressalvas = lacunas de teste (R1 empate de `createdAt`; R2 borda de página exata; R3 entradas inválidas; R5 cursor
  cross-org; R6 Kanban vazio) + P1 (índice não cobre o `ORDER BY`).

## Achados e disposição

| # | Sev. | Achado | Disposição |
|---|------|--------|------------|
| Edge-R1 | MED | Empate de `createdAt` (o cenário adversarial do desempate por `id`) não era testado — correto por design, sem prova de fase-vermelha. | **CORRIGIDO.** Teste injeta 2 Cards com o MESMO `createdAt` (via migrator) e pagina `limite=1`: 2 ids distintos, sem sobreposição — prova o desempate estável por `id`. |
| Edge-R2 | MED | Borda de página EXATA (`total == limite` → uma página, cursor null) não testada — um regresso `===`→`>=` em `temMais` passaria como página-fantasma. | **CORRIGIDO.** Teste com 2 Cards e `limite=2` afirma 1 página e `proximoCursor === null`. |
| Edge-R3 / Acc-R1 | MED | `parseLimite`/`parseCursor` (400 em lixo) sem teste HTTP — o estado "erro" só provado por inspeção. | **CORRIGIDO.** Teste HTTP: `limite=0/-1/abc` e `cursor=lixo` → **400**. |
| Acc-R2 | MED | Capacidades do Viewer no endpoint de **detalhe** não asseridas diretamente (só no kanban). | **CORRIGIDO.** Teste: VIEWER concedido abre o detalhe de um Card real → `{ ler:true, operar:false, gerenciar:false }`. |
| Edge-R5 | LOW | Cursor de Card de OUTRA Org como cursor (fail-closed) sem teste. | **CORRIGIDO.** Teste em `kanban-rls`: Org A pagina o Pipe da Org C usando o `id` do Card alheio como cursor → **não** devolve o Card alheio (RLS filtra o cursor). |
| Edge-R6 | LOW | Kanban de Pipe sem Card (200 com `totalCards:0`) não testado explicitamente. | **CORRIGIDO.** Teste: Pipe sem Card → 200, todas as colunas com `totalCards === 0`. |
| Edge-R4 | LOW | O teto `LIMITE_MAX` (100) não tem teste dedicado. | **ACEITO.** O teto é reaplicado no serviço (`Math.min(..., 100)`), visível no código e coberto pela leitura; observá-lo exigiria >100 Cards por Fase. O teste de entrada inválida já trava o parse. Registrado. |
| Acc-R3 | LOW | O detalhe expõe `gerenciar:true`; o `plan.md` sugeria não expor config no espaço do Card. | **ACEITO (shape do dono — Q5).** A flag só é `true` para quem JÁ tem o poder (não revela ação a terceiros); é a capacidade do próprio principal, não uma ação administrativa enumerada. Não viola SC-293. |
| Edge-P1 | LOW (perf) | O índice `@@index([orgId, pipeId, phaseId])` não cobre o `ORDER BY (createdAt, id)` da paginação → sort por página numa Fase com muitos Cards. | **ACEITO / DEFERIDO.** A 2.9 é **sem migration** por decisão do dono (Q1); um índice de cobertura é otimização não-destrutiva a avaliar quando o `performance-check` sinalizar em escala (candidato: `@@index([orgId, pipeId, phaseId, createdAt, id])`), ou junto da 2.14 (que já toca o schema de `Card`). Registrado. |
| Sec-INFO | INFO | `groupBy` conta Cards de Fases arquivadas. | **ACEITO.** Só Fases ACTIVE viram coluna — a contagem de uma Fase arquivada nunca é exibida. Sem correção. |

## Veredito
Nenhum CRITICAL/HIGH/MEDIUM de correção. Todas as lacunas de teste de MÉDIA severidade (empate de `createdAt`,
página exata, entradas inválidas, capacidades do Viewer no detalhe) **fechadas com prova de fase-vermelha**; as LOW,
fechadas ou aceitas com justificativa; a nota de performance (P1) deferida por respeitar o "sem migration" do dono.
Suíte 2.9: **17 testes** (http 9, authz 4, rls 4); suíte cheia **466 testes, verde**. Fase vermelha do portão de
acesso provada. Pronto para commit e PR.
