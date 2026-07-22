# Analyze — Story 4.6 (consistência cross-artefato)

Análise não-destrutiva de spec.md × plan.md × tasks.md × decisão de Arquitetura × código, antes/durante a
implementação. Sem inconsistências materiais bloqueantes; observações e decisões registradas abaixo.

## Cobertura dos critérios de aceite
| CA | Onde é satisfeito | Prova |
| --- | --- | --- |
| CA1 (pós-commit, outbox, ativas) | `enfileirarParaEvento` (só `state=ACTIVE`, gatilho casa) + `drenarOrg` | `automation-engine-fluxo` (integração) |
| CA2 (dedup Execução/Ação) | `@@unique` × 2 + `enfileirar`/`gravarResultado` idempotentes + `proximaAcaoPendente` | `automation-engine-core` (unit) + `-rls` (dedup) + `-dedup` (integração) |
| CA3 (efeitos parciais) | `execution-plan.core` + laço com `encerrou` | `automation-engine-core` + `-partial` |
| CA4 (esgotamento/concorrência) | `retry-policy` + `agendarRetry` + `FOR UPDATE SKIP LOCKED` | `-core` + `-recovery` |
| CA5 (M-1) | `snapshot-builder` (containment cross-Pipe/Database) | `-containment` |
| CA6 (não-ampliação) | `montarPrincipal` + `revalidarAcao` (4.5) | `-containment` |
| CA7 (SC-2101/2102) | `atribuirResponsavel` → `resolverAcessoDaMembership` | `-containment` |
| CA8 (fail-closed) | Condição não satisfeita ⇒ `SKIPPED_CONDITIONS`; recusa ⇒ `DENIED`; sem 500 | `-partial` |
| CA9 (isolamento) | RLS FORCE + GRANT; toda query por `withTenantContext`/`definirContextoOrg` | `-rls` |

## Decisões registradas (AUTONOMOUS_DECISION)
1. **Confirmação humana (L-1/§1383):** as 5 Ações sensíveis do catálogo (`CARD_MOVE`, `CARD_SET_FIELD_VALUE`,
   `CARD_FINALIZE`, `CARD_ARCHIVE`, `RECORD_EDIT`) têm `exigeConfirmacaoHumana=true` — o motor da Fase 1 as
   marca `BLOCKED_CONFIRMATION` e NÃO as executa (continuação por fluxo separado é contrato futuro). As Ações
   que EXECUTAM de fato são as sem confirmação: `CARD_ASSIGN_RESPONSIBLE`, `RECORD_CREATE`,
   `RECORD_CREATE_RELATED`. Isto satisfaz "Ação executada de verdade" (CA1) sem antecipar a máquina de
   confirmação. **Reversível:** quando o fluxo de confirmação existir, o executor troca `BLOCKED_CONFIRMATION`
   por execução real sem mudar a fronteira do motor.
2. **Driver contínuo deferido (AD-11):** o drain é um PRIMITIVO invocável; o loop `setInterval` multi-réplica
   com leader election e dead-letter administrativo é gate da 4.7/deployment (§1435). Não foram adicionadas
   env vars especulativas (`AUTOMATION_ENGINE_POLL_*`) sem o dispatcher — evita config morta.
3. **`.down.sql`:** o repo não usa arquivos `down.sql` (o rollback é `db:rollback`); a reversão é DOCUMENTADA no
   cabeçalho da migration (padrão de `domain_events`/`records`) e o drill é do gate `migration-check`.

## Divergências verificadas (sem ação)
- `Record.origin` não tem valor `AUTOMATION` (enum só `NOVO_REGISTRO`); a 3.4 previu a Automação como
  "consumidor futuro do mesmo endpoint de criação" — usar `NOVO_REGISTRO` é coerente (sem migration nova de enum).
- `DomainEvent` é append-only (sem coluna "processed"): o ledger `AutomationExecution` É o cursor. Consistente
  com a decisão §2 do doc de Arquitetura.

## Débitos declarados
- `DEB-4-6-DRIVER-CONTINUO` — o poller in-process + dead-letter é 4.7/deployment.
- `DEB-4-6-CONFIRMACAO-CONTINUACAO` — fluxo separado de continuação das Ações `BLOCKED_CONFIRMATION`.
- `DEB-4-5-EVENTO-ALVO-CONTAINMENT` e `DEB-4-5-MEMBERSHIP-REF` — **FECHADOS** por esta Story (M-1 no
  snapshot-builder; SC-2101 em `atribuirResponsavel`).
