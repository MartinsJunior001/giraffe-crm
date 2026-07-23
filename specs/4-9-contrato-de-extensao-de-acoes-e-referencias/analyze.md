# Analyze — Story 4.9 (consistência cross-artefato)

## Cobertura AC (§1463–1466)
| AC | Fonte | Coberto por | Status |
|---|---|---|---|
| §1463 handler declara as 11 facetas, usa o motor sem reimplementar; sem plugins/HTTP | spec §3/§4 | T1 + `action-extension-contract.core` + regressão motor | ✔ |
| §1464 Ação↔Template fail-closed, revalidação na execução, versão fechada antes de E6 | spec §5 | T6 decisão + hook `revalidar` | ✔ (contrato/decisão; sem Template em Fase 1) |
| §1465 IA como Ação: comando proposto, aprovação com permissão atual, não amplia; fluxo manual | spec §6 | T6 decisão + embrião `exigeConfirmacaoHumana` | ✔ (contrato/decisão; sem handler IA) |
| §1466 cadeia não contorna aprovação; revalida aprovador/principal/contexto/alvo/regras | spec §6 | regressão 4.7 + `revalidarAcao` | ✔ |

## Consistência com invariantes
- **Sem antecipar escopo:** nenhum handler/entidade E5/E6; sem migration; `TEMPLATE` fora de `TIPOS_DE_REFERENCIA`. ✔
- **Sem motor paralelo:** dispatch 4.6 intocado; conformação por teste. ✔
- **Isolamento:** núcleo puro, sem I/O; RLS/GRANT inalterados. ✔
- **C3 congelado:** `ability.ts` não tocado. ✔
- **Fail-closed / não-ampliação:** preservados (`revalidarAcao`/`PrincipalAutomacao`). ✔

## Riscos e mitigação
- **R1 — over-engineering / abstração especulativa** (o risco central). Mitigado pelo recorte: só facetas com consumidor
  concreto (os 8 handlers); IA/Template ficam em DECISÃO, não em código. Auditável pela Lane 0.
- **R2 — ciclo de import** (contract↔catalog↔service). Mitigado: contrato importa catalog/revalidação (unidirecional); o
  serviço chama `exigirAcaoDisponivel`; `action-catalog.ts` não importa o contrato.
- **R3 — regressão do motor** por mudança de mensagem de config. Mitigado: núcleo segue rejeitando; só o motivo do tipo de
  extensão fica mais específico; testes de tipo desconhecido inalterados.
- **R4 — drift declarado×real** (eventosProduzidos). Mitigado: teste de conformação contra o motor E2E + fase vermelha.

## Divergências de fonte
- SPINE §305 trata versionamento Ação↔Template como seed/implementação (B1-deferido) e o Gate OQ-26 exige fechamento na
  Arquitetura antes de E6. A 4.9 registra a **recomendação** (snapshot-na-execução); ratificação pelo workflow de Arquitetura
  fica pendente antes de E6. **Não** é bloqueio agora (E6 inexistente). Sem editar a SPINE (autoritativa).

## Veredito
Pronto para `pre-implementation-check` → implementação. Recorte anti-especulação explícito e derivado das fontes.
