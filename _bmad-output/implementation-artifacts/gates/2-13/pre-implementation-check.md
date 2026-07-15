# Pre-Implementation Check — Story 2.13 (Saúde temporal derivada do Card)

> Gate obrigatório antes de código. Status: **APROVADO**.

## Escopo
Derivar o eixo de saúde temporal (`ok`/`atrasado`/`vencido`/`expirado`) dos marcos reais da 2.12 e expor o
indicador dominante (precedência `arquivado > finalizado > expirado > vencido > atrasado > ok`) — **sem** substituir
os dois eixos canônicos. **Fora:** config de marcos (2.12), movimentação (2.14), Dashboard (E7).

## Decisões resolvidas pelo dono/Arquitetura (2026-07-14, `AskUserQuestion`) — gate PRD D2.3/§907
- **Saúde = derivação PURA, sem persistir, sem evento (só leitura).** Sem coluna nova, sem GRANT, sem agendador
  (coerente com a decisão da 2.12) — o evento/persistência só entram com consumidor concreto (AD-11: 2.17/E5/2.14).
- **Indicador dominante = função pura em 2.13; consumo no E7.** Sem estado combinado persistido.

## context7-check
- **Não aplicável a biblioteca nova:** a Story é lógica de domínio pura + leitura Prisma já validada (findFirst,
  orderBy, select — mesmos padrões da 2.9/2.12). Nenhuma API nova de framework/SDK. `new Date()` (relógio do
  servidor) comparado a `Timestamptz` da 2.12 — sem ambiguidade de fuso. Sem consulta de doc externa necessária.

## Verificações
- **Sem antecipar escopo (AD-11):** nada de `healthState` persistido, evento de saúde ou badge de Dashboard sem
  consumidor. `Card` segue **append-only** (nenhum UPDATE novo) — invariante preservado.
- **C3 congelado:** autorização de leitura reusa `resolverPoderNoPipe` (2.9); guard/CASL intocados.
- **Invariantes:** `Fase ≠ Status do Card`; dois eixos canônicos nunca fundidos (o dominante é só apresentação);
  override por `Field.id` (AD-12, herdado 2.12); `orgId` fora da fronteira; `valores` só no detalhe (2.9).
- **Sem migration/GRANT:** leitura pura sobre `Card`/`CardPhaseEntry`/`Phase`; `CardPhaseEntry` já tem SELECT no
  runtime (2.12). `migration-check`/`backup-check` **não se aplicam**.

**Veredito: APROVADO.**
