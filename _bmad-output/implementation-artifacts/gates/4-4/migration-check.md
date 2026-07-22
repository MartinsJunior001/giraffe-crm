# migration-check — Story 4.4

**Status:** NÃO APLICÁVEL (sem migration)

## Justificativa
A Story 4.4 **não introduz migration**:
- As Condições já vivem em `Automation.condicoes` (coluna JSON, desde a 4.1). A 4.4 valida o VOCABULÁRIO delas
  (catálogo) e as AVALIA (núcleo puro) — não muda o schema.
- O `SnapshotAvaliacao` é montado em memória pelo motor (4.6) sob RLS; a 4.4 entrega só o TIPO, não persiste nada.
- Nenhuma tabela nova, nenhum GRANT novo, nenhuma policy/RLS alterada, guard/`ability.ts` intocado (C3 congelado).

## Consequência
Nenhum migration drill / rollback a executar. A eventual persistência de snapshot/resultado da avaliação é
decisão da 4.6/4.8 (AD-11 — só com consumidor concreto), e será avaliada no seu próprio migration-check.

## Veredito
N/A registrado — sem impacto de banco.
