# pre-implementation-check — Story 4.5

**Status:** APROVADO
**Risco:** ALTO (modelo de autorização do principal Automação + multi-tenant + gate de Arquitetura/Segurança).

## Contexto verificado
- Deps done: 4.4 (`condition-catalog.ts`/`condition-eval.core.ts`/`condition-snapshot.ts` + enforcement nos serviços),
  2.14/2.15/2.16/2.17 (movimentação/preflight/evento canônico/Histórico do Card), 3.4/3.6/3.9 (Registro/Histórico/vínculo).
- Precedentes lidos: `condition-catalog.ts` + `condition-eval.core.ts` + `condition-snapshot.ts` (4.4 — padrão exato),
  `event-catalog.ts` (4.3), `automation-config.ts` + `automation-references.ts` (4.1 — estrutura/refs),
  `automations.service.ts` + `automation-lifecycle.service.ts` (padrão de enforcement dos catálogos).
- Gate de Arquitetura/Segurança (principal Automação + confirmação) resolvido por **DERIVAÇÃO** de AD-9/AD-18/AD-13 —
  `decisions/automation-principal-4-5.md`. Nenhuma escolha nova ⇒ **sem `EXTERNAL_BLOCKER`**.

## Verificação documental (context7-check)
- **Prisma 6.19.3** / **NestJS 11**: a 4.5 é **núcleo puro** + edição aditiva do `validar` de dois serviços
  existentes (reuso de `BadRequestException`, já em uso). **Não emite query nova, não abre provider/módulo/controller,
  não toca schema.** Nenhuma superfície de API nova de biblioteca ⇒ context7-check N/A material (baseline registrado:
  as Ações já vivem em `Automation.entao` JSON desde 4.1; o snapshot/principal são montados em memória pelo motor 4.6).

## Decisões-chave (menor mudança correta)
- Catálogo puro das 8 Ações (Card+Registro) + contrato do principal + revalidação pura; **sem motor** (4.6 é o consumidor).
- Vocabulário de refs da 4.1 (PHASE/FIELD/DATABASE/RECORD) já cobre as Ações ⇒ **`automation-config.ts` intocado**.
- Enforcement do catálogo de Ações nos dois serviços (como 4.3/4.4), não no núcleo estrutural da 4.1.

## Impacto
- **Sem migration, sem GRANT, sem RLS nova.** Ações já em `Automation.entao` (JSON).
- Novos: `actions/action-catalog.ts` + `actions/automation-principal.ts` + `actions/action-revalidation.core.ts` + 3
  testes puros + bloco HTTP `ACAO_FORA_DO_CATALOGO`.
- Aditivos: `automations.service.ts` + `automation-lifecycle.service.ts` (`validar`); correção de fixtures HTTP
  (placeholders → tipos válidos do catálogo).
- Guard/`ability.ts` intocado (C3 congelado). Testes de LOG/RLS/SNAPSHOT (Prisma direto) não afetados.

## Veredito
APROVADO para implementação com os gates de risco ALTO (security/observability + integração real da config-time;
migration-check N/A registrado).
