# pre-implementation-check — Story 4.4

**Status:** APROVADO
**Risco:** ALTO (avaliação fail-closed + multi-tenant + gate de Arquitetura).

## Contexto verificado
- Dep done: 4.3 (`event-catalog.ts`, `event-envelope.ts`, `domain-event-emission.ts`, enforcement no serviço).
- Precedentes lidos: `record-query.core.ts` (3.5 — semântica de comparação), `card-health.core.ts` (2.13),
  `phase-milestones.core.ts` (2.12 — Marcos/Timestamptz), `automation-config.ts` (4.1 — Condicao estrutural),
  `automations.service.ts`/`automation-lifecycle.service.ts` (padrão de enforcement 4.3).
- Gate de Arquitetura (fuso oficial + semântica de comparação) resolvido por **DERIVAÇÃO** —
  `decisions/condition-evaluation-4-4.md`. Nenhuma escolha nova ⇒ sem `EXTERNAL_BLOCKER`.

## Verificação documental (context7-check)
- Prisma 6.19.3 (`/prisma/web`): filtragem de JSON por `path` e a ausência de `orderBy` sobre path JSON
  confirmadas — coerente com `record-query.core` (3.5). A 4.4 é **núcleo puro** e **não emite query nova**: o
  snapshot é montado em memória pelo motor (4.6). Sem nova superfície de API Prisma.
- NestJS 11: sem provider/módulo/controller novo — só edição aditiva de dois `validar` de serviços existentes
  (reuso de `BadRequestException`, já em uso). Sem superfície nova.

## Decisões-chave (menor mudança correta)
- Catálogo puro dos 7 tipos (5 domínios) + avaliador puro AND fail-closed; **sem motor** (4.6 é o consumidor).
- Reuso da semântica de 3.5 via `categoriaDeCampo` **exportada** (aditivo) — fonte única, honra o gate.
- Enforcement do catálogo de Condições no serviço (como 4.3), não no núcleo estrutural da 4.1.

## Impacto
- **Sem migration, sem GRANT, sem RLS nova.** Condições já vivem em `Automation.condicoes` (JSON).
- Novos: `conditions/condition-{catalog,snapshot,eval.core}.ts` + 2 testes puros.
- Aditivos: `record-query.core.ts` (export), `automations.service.ts` + `automation-lifecycle.service.ts`
  (`validar`), `automations-http.test.ts` (bloco CONDICAO_FORA_DO_CATALOGO).
- Guard/`ability.ts` intocado (C3 congelado). Testes de LOG (Prisma direto) e HTTP (`condicoes: []`) não afetados.

## Veredito
APROVADO para implementação com os gates de risco ALTO (security/observability + integração real da config-time;
migration-check N/A registrado).
