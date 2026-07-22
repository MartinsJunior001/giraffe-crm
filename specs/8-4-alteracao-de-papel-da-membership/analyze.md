# Analyze — consistência cross-artefato (Story 8.4)

Verificação não-destrutiva spec ↔ plan ↔ tasks ↔ código ↔ decisões D-1..D-4.

| Requisito (spec) | Decisão | Código | Teste |
| --- | --- | --- | --- |
| RN-1 só ativa muda | — | `planejarAlteracaoPapel` → INATIVA | http "SUSPENSA → 409" |
| RN-2 só Admin da Org | AD-9 | guard `administrar Organizacao` + defesa no serviço | http "Membro → 403"; "outra Org → 404" |
| RN-3 no-op idempotente | — | decisão NOOP (sem escrita/evento) | http "no-op → 200, sem evento" |
| RN-4 step-up (D-1) | D-1 | `exigeStepUp` + `janelaValida` | http AC2 (exige/escopado); core |
| RN-5 último Admin atômico | D-2 | `FOR UPDATE` + reléitura in-tx + guarda otimista | http AC3 + **concorrente** |
| RN-6 revogação incompatível | AD-9 | `planejarRevogacaoIncompativel` + `databaseGrant.updateMany` in-tx | http AC4 |
| RN-7 abilities/sessão (D-3) | D-3 | `AbilityCache.invalidar` + contexto relê ACTIVE | http AC1 (403→200) |
| RN-8 evento + auditoria | D-2/D-4 | `membershipEvent.create` in-tx + `auditar` | http "evento"; events-rls append-only |

## Divergências resolvidas / registradas
- **DIV-3 (preflight de Card vacuamente verdadeiro):** a regra "Card exige Responsável ativo" não existe na
  Fase 1 (D5.2 é de Tarefa/Solicitação). Não inventada — o preflight de rebaixamento não bloqueia por Card,
  coerente com `membership-contract.ts` (2.10). Ativação futura sem tocar 8.4.
- **Teto GUEST de PipeGrant:** não materializado (`DEB-PIPEGRANT-GUEST-CEILING`, aberto desde a 4.1). 8.4
  revoga só o incompatível de `DatabaseGrant` (AD-9 materializado, 3.2). Registrado como débito, não inventado.
- **Versão de autorização:** o modelo não a suporta e o mecanismo D-3 já existe (cache + reléitura). Sem migration extra.

## Sem gate duplicado
Writer prova impl + testes afetados; CI roda os checks canônicos; QA reproduz os críticos (concorrência,
step-up, isolamento) sem repetir mecanicamente. Auditoria completa só se contrato/área crítica mudar.
