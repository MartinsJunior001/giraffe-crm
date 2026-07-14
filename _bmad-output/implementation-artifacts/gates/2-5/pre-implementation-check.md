# Pre-Implementation Check Report

## Identificacao da tarefa
Story 2.5 — Ciclo de vida e evolução segura de Campos (editar/arquivar/restaurar + ciclo de opções de Seleção).

## Fase e etapa atual
Fase 1, Épico 2 (Pipes/Fases/Formulários/Cards). Etapa: bloco 2.4–2.6 (Sprint S5). Empilha sobre a 2.4
(`done` na `main`). Liberada: BMAD (story file) + Spec Kit (`specify → clarify → plan → checklist → tasks →
analyze`) concluídos. **Não** antecipa Fase 2 nem depende de recurso dela.

## Objetivo
Fechar o ciclo de vida do Campo criado na 2.4: editar (label/help/typeConfig/defaultValue), arquivar/restaurar
(reversível), e o ciclo de opções de Seleção (add/rename/reorder/archive/remove) — **sem perda silenciosa de
dados** e **preservando a identidade estável** (AD-12).

## Escopo incluido
`option-config.ts` (funções puras de validação/serialização do `typeConfig` com os 12 invariantes),
`fields.dto.ts` (DTO manual), `fields.service.ts` (`FieldsService`), rotas PATCH/POST no módulo `forms/`,
testes (option-config unidade, fields-http, fields-authz, fields-rls). Opções permanecem em JSON (Opção A).

## Fora do escopo
Mudança de `type`; travas "obrigatório em publicado/requisito de Fase/marco" e "após uso só arquivar";
publicação/versionamento (2.6); submissão/valores/Card (2.7+); Database (E3); exclusão definitiva; validação
programável. Nenhum materializa tabela/coluna (AD-11).

## Documentacao consultada
`spec.md`/`clarify.md`/`plan.md`/`analyze.md` da 2.5; `epics.md` Story 2.5; `prd.md` D3.1/D3.4;
`regras-negocio-fase-1.md` RN-050..054 (INV-FORM-01); `ARCHITECTURE-SPINE.md` AD-11/AD-12; **context7-check**:
Prisma 6.19.3 (update de coluna Json — read-modify-write; `Prisma.DbNull` para `Json?` nulo). Fonte registrada.

## Story e criterios de aceite
AC1-6 → SC-251..259 (ver `analyze.md`, mapeados a testes). Critérios verificáveis com PostgreSQL real.

## Regras de negocio afetadas
RN-050..054 (evolução de Campo/opção, INV-FORM-01), D3.4 (edge behaviors — parte aplica, parte é contrato
futuro), AD-12 (identidade estável), AD-11 (não materializar futuro).

## Permissoes afetadas
PERMISSÃO = AÇÃO + ESCOPO. Evoluir Campo/opção = **config do Pipe** (D3.2): **Admin da Org** (qualquer Pipe)
ou **Admin do Pipe** (`PipeGrant.role=ADMIN` ACTIVE + `Membership.state=ACTIVE`) via `exigirGerenciarPipe`.
MEMBER/VIEWER → 403 (leem). Sem acesso → 404 não-enumerante. Deny-by-default. C3/CASL **intocado** (fina no serviço).

## Dados e entidades afetados
`Field` (2.4) — fonte de verdade da definição do Campo. Campos alterados: `label`/`help`/`typeConfig`/
`defaultValue`/`state`/`archivedAt`. `id`/`type`/`orgId` **imutáveis**. Opções no `typeConfig.options[]`
`{id,label,position,state}`. Isolamento org por FORCE RLS (herdado). **Sem migration** (colunas já existem).
Sem exclusão definitiva (runtime sem GRANT DELETE).

## Arquitetura e modulos afetados
`apps/api/src/pipes/forms/` — novo `option-config.ts`, `fields.dto.ts`, `fields.service.ts`; rotas no controller;
registro no módulo. `FormsService`/rotas da 2.4 **intocados**. `pipe-authz` reusado. Nenhuma mudança arquitetural.

## Dependencias tecnicas
Prisma 6.19.3 (JSON update), NestJS 11 (controller). Ambos já na stack — **nenhuma dependência nova**.

## Skills obrigatorias para esta tarefa
security-check (mass-assignment/isolamento), observability-check (auditoria/log sanitizado), lgpd-check (leve —
rótulo/ajuda = metadado de config, não PII submetida), performance-check (leve — update de linha única, índice
existente). **migration-check: N/A** (sem DDL) — registrar. backup-check: N/A. ai-guardrails/cost: N/A.

## Riscos identificados
R1 mass-assignment via `typeConfig`/`type` → editar não aceita `type`/array cru; allowlist de chaves; opções por
rotas dedicadas. R2 perda de identidade da opção → operações dedicadas; renomear preserva id. R3 falso `denied`
em idempotência → arquivar/restaurar já-no-estado sem `updateMany`. R4 escopo antecipado → seams sem
materialização (AD-11). R5 regressão 2.4 → só adiciona; suíte 2.4 re-executada. Todos com mitigação e prova por
mutação.

## Plano minimo de implementacao
Ordem: (1) `option-config.ts` + unidade (red→green); (2) `fields.dto.ts`; (3) `fields.service.ts` + rotas;
(4) fields-http/authz/rls; (5) mutações; (6) gates. **Não alterar:** `schema.prisma`, migrations, `FormsService`,
rotas da 2.4, C3/`ability.ts`, `pipe-authz` (só reuso).

## Estrategia de testes
Unidade pura (`option-config`) + integração HTTP real com PostgreSQL (fields-http/authz/rls); Org C para escrita;
fase vermelha provada + 4 mutações (id duplicado / label no lugar do id / validação removida / chave extra).

## Estrategia de rollback
**Sem migration** → rollback é reverter o código (revert do PR). Nenhum dado migrado; `typeConfig` legado (sem
`state`) segue legível (lido como ACTIVE). Nenhuma coluna/tabela criada para reverter.

## Decisoes pendentes
Nenhuma. Opção A (JSON, sem migration) ratificada pelo usuário; demais clarifications resolvidas em `clarify.md`.

## Status final
APROVADO
