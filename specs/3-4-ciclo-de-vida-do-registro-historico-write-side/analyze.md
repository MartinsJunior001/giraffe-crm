# Analyze — Story 3.4 (consistência cruzada)

Verificação de coerência entre story file, spec, data-model, contracts, plan, tasks e os artefatos autoritativos
(epics/Spine/CLAUDE.md), antes de codificar.

## Rastreabilidade AC ↔ RF ↔ Task ↔ Teste

| AC | RF | Task(s) | Teste |
|---|---|---|---|
| AC1 (criação ≤1, versão publicada) | RF-1 | T005, T008 | records-http (criar; não publicado→recusa) |
| AC2 (idempotência, nunca 500) | RF-1 | T005 | records-http (mesma chave→1); records-rls (P2002) |
| AC3 (arquivar reversível/não bloqueado) | RF-3 | T007, T008 | records-http (archive idempotente) |
| AC4 (restaurar preserva identidade) | RF-3 | T007, T008 | records-http (restore) |
| AC5 (write-side por operação) | RF-1/2/3 | T005/6/7 | records-http (evento verificável); records-rls (imutável) |
| AC6 (sem exclusão física; isolamento) | NFR | T002, T010 | records-rls (WITH CHECK, sem DELETE, cross-tenant) |
| AC7 (autz; não transferível) | RF-5 | T004, T008, T010 | records-http (MEMBER/VIEWER/404); records-rls (databaseId sem UPDATE) |

## Consistência de invariantes

- **`Card ≠ Registro`:** entidade/módulo/enum próprios (data-model, plan). ✔
- **RLS + WITH CHECK simétrica a Card/Database:** data-model §RLS; T002/T010. ✔
- **GRANT sem DELETE / RecordHistory imutável:** data-model §GRANT; T010. ✔ (coerente com CLAUDE.md — "revogar/
  arquivar é state", "append-only imutável").
- **AD-12 (definição congelada):** `formVersionId` sem UPDATE (data-model); editar revalida contra ela (RF-2). ✔
- **AD-13 (evento na mesma tx):** T005/6/7; padrão 2.7. ✔
- **AD-11 (não antecipar):** `origin` mínimo; sem listagem/read-side/arquivo/vínculo/Automação (spec §2). ✔
- **DBT-AUTHZ-01 + C3 congelado:** guarda fina no serviço; `@Requer('ler','Database')` grosso; guard não tocado
  (checklist). ✔
- **RN-063 (não transferível):** `databaseId` fora do GRANT de UPDATE (data-model, T010). ✔

## Lacunas/decisões fechadas

- Q1–Q5 fechadas em `plan.md` (GRANT column-scoped com `valores`; leitura só detalhe; `origin` mínimo; Database
  arquivado→409; idempotencyKey obrigatória).
- **Divergência potencial:** o épico cita "arquivos/Histórico/vínculos preservados na restauração" — em 3.4 ainda
  não há arquivo (3.7/3.8) nem vínculo (3.9); a preservação é **vacuamente verdadeira** agora (identidade/valores/
  Histórico existem; arquivos/vínculos entram com suas Stories, e o `id` estável garante a preservação futura por
  construção). Registrado — não inventar arquivo/vínculo agora.
- **Nenhuma contradição** com CLAUDE.md/Spine encontrada. `Record` é a 1ª entidade de dado do titular do E3;
  coerente com "3.1 não tem dado dependente, 3.4 o introduz".

## Veredito

**Coerente e pronto para implementação.** Sem ambiguidade bloqueante; reuso máximo de padrões verdes; escopo
congelado sem antecipação.
