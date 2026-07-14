# Analyze — Story 2.5: consistência cruzada dos artefatos

> Análise não-destrutiva de `spec.md` × `clarify.md` × `plan.md` × `tasks.md` × `checklist.md` × código 2.4.
> Sem edição de artefatos autoritativos.

## Cobertura dos critérios (SC → task → teste)
| SC | Critério | Task | Evidência de teste |
|---|---|---|---|
| SC-251 | editar persiste label/help/typeConfig/defaultValue; `type` não editável | T003/T004/T006 | `fields-http` editar + rejeição de `type` (400) |
| SC-252 | identidade estável (id do Campo e das opções) | T001/T004/T006 | `fields-http` renomear preserva id; `option-config` unidade |
| SC-253 | arquivar/restaurar idempotente sem falso denied | T004/T006 | `fields-http` archive/restore + repetição → 200 |
| SC-254 | travas futuras não consultam tabela; `type` imutável | T004 | `fields-http` (nada bloqueado; sem rota de type) — seam documentado |
| SC-255 | ciclo de opções mantém id estável; ordem determinística | T001/T004/T006 | `option-config` + `fields-http` add/rename/reorder/archive/remove |
| SC-256 | remover opção permitido (uso inexiste); UPDATE não DELETE | T004/T008 | `fields-http` remover + `fields-rls` GRANT sem DELETE |
| SC-257 | autorização de evolução reusa 2.4 (inclusive Fase por phase.pipeId) | T004/T007 | `fields-authz` (Admin Org/Pipe, MEMBER/VIEWER 403, SUSPENDED) |
| SC-258 | não-enumeração: sem acesso → 404 | T004/T007 | `fields-authz` 404 |
| SC-259 | isolamento e "sem exclusão"; nenhuma tabela nova | T004/T008 | `fields-rls` cross-org negado, UPDATE sem contexto negado, INV-FORM-01 |

## Consistência
- **Opção A (JSON)** coerente entre decisão do usuário, `clarify` (C1), `plan` (§Decisão) e `tasks`. Sem
  `FieldOption`, sem migration. ✅
- **`type` imutável** e **sem trava condicional** coerentes (C2/C3, SC-254) — seams sem materialização (AD-11). ✅
- **Autorização** reusa `pipe-authz` (DBT-AUTHZ-01), C3 intocado; Campo de Fase por `phase.pipeId` (como o
  `FormsService`). ✅
- **Sem migration** afirmado (C5) e verificado: nenhum arquivo em `apps/api/prisma/` alterado; `state`/`archivedAt`
  já existem. `migration-check` N/A. ✅
- **Escopo**: só adiciona (`option-config.ts`, `fields.dto.ts`, `fields.service.ts`, rotas, testes); `FormsService`
  e rotas da 2.4 intocados. Regressão 2.1-2.4 proibida. ✅

## Divergências / riscos residuais
- **D-R1 — atomicidade das opções:** cada operação é UM `field.update` do `typeConfig` inteiro; sem transação
  multi-statement (recusada). Ler e regravar são passos separados, então o ciclo de opções usa **guarda
  otimista** (`typeConfig: { equals: <lido> }` no `where`): se o valor mudou desde a leitura, o UPDATE atinge 0
  linhas e o serviço responde **409** — nunca sobrescreve às cegas uma alteração concorrente (invariante 12
  cumprido de fato, não em "last-write-wins observável"). Achado da revisão (Edge Case Hunter H1) e corrigido
  com regressão determinística (`fields-rls`: token obsoleto → 0 linhas; mutação da guarda → 1 linha) e teste
  HTTP de concorrência (200-ou-409, nada some). A Story não pede **merge** automático de edições concorrentes
  (isso é escopo de submissão/versionamento, 2.6+) — apenas que nada se perca em silêncio, o que a guarda garante.
- **D-R2 — opção legada sem `state`:** lida como ACTIVE; só materializa `state` ao regravar. Compatível com dados
  da 2.4; sem migração de dados.
- **D-R3 — Campo de Seleção sem opções ativas:** a 2.5 permite (remover/arquivar todas); a validação "Seleção
  precisa de ≥1 opção para publicar" é da 2.6 (seam documentado; não materializado).

## Veredito
Artefatos consistentes; critérios rastreados a testes; **sem migration**; sem conflito com a base 2.4 (já
`done` na `main`). Pronto para `pre-implementation-check` e implementação sob gates.
