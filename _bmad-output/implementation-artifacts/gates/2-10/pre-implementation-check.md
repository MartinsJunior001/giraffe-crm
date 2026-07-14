# Pre-Implementation Check — Story 2.10 (acesso, Responsável e concessões de Card)

> Gate obrigatório antes de código (Constitution). Status: **APROVADO**.

## Escopo
Fecha o **DBT-2.2-ROLE-DORMENTE** (operação de Card por concessão). Três dados novos de autorização, todos
org-owned: `CardGrant` (concessão direta a UM Card), `CardResponsavel` (atribuição de Responsável por Card) e
`PipeGrant.restritoAoProprio` (modificador do Membro). Resolução de acesso NO NÍVEL DO CARD estendendo
`pipe-authz`. Taxonomia nova de `CardHistory` (RESPONSAVEL_*, ACCESS_*). Função-contrato pura de Membership (E8),
sem chamador.

## Decisões de arquitetura (travadas pelo dono, 2026-07-14)
- **D-OA1 = nova tabela `CardGrant`** (org-scoped, RLS ENABLE+FORCE, WITH CHECK, GRANT sem DELETE), capacidades
  explícitas. NÃO reusar `PipeGrant`; NÃO JSON em `Card`.
- **D-OA2 = tabela `CardResponsavel`** (org-scoped, RLS). Mantém `Card` **append-only** (SELECT/INSERT) — **NÃO
  abre GRANT de UPDATE em `Card`** (o 1º UPDATE de Card segue reservado à movimentação, 2.14; invariante preservado).
  `creator` = actor do evento `CREATED` (2.7), sem coluna nova.
- **D-OA3 = materializar a função-contrato pura de Membership AGORA** (preflight + handler pós-alteração), pura e
  testável, consumida pelo E8 depois. NÃO implementa o ciclo E8. Se a Fase 1 não tiver regra "Card exige
  Responsável ativo", o preflight nasce vacuamente verdadeiro — **não inventar a regra** (DIV-3).

## context7-check
- **Prisma 6.19.3** (versão do projeto): índice PARCIAL de unicidade (`WHERE state='ACTIVE'`) só existe em SQL de
  migration, não no schema — mesmo padrão já usado em `PipeGrant`/`CardResponsavel`. Transação interativa
  (`$transaction(async tx => …)`) no client raiz com `set_config(..., true)` — padrão consolidado 2.6/2.7. Sem
  API nova; nada a confirmar além do já validado nas Stories anteriores.

## Verificações
- **Sem antecipar escopo:** `podeMover` é só o DADO da capacidade; a OPERAÇÃO de mover é a 2.14. A trava "Card
  exige Responsável ativo" NÃO é materializada (regra inexistente). A função-contrato não tem chamador (E8 futuro),
  mas é PURA e testável — coerente com a 2.7 (travas como contrato futuro).
- **C3 congelado:** autorização fina no serviço (`pipe-authz`), guard/`ability.ts` intocados (DBT-AUTHZ-01).
- **Invariante-mãe:** `CardGrant`/`CardResponsavel` replicam o padrão RLS+FORCE+WITH CHECK; GRANT sem DELETE.

**Veredito: APROVADO.**
