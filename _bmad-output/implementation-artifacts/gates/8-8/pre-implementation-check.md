# pre-implementation-check — Story 8.8

**Status: APROVADO.**

## Escopo e sequência
- BMAD/epics.md §717–733 é a fonte; Spec Kit consolidado em `specs/8-8-auditoria-administrativa/`
  (spec/plan/checklist/tasks/analyze). Decisão de escopo **D-4** (read-side agora; retenção/anonimização =
  gate de produção) aprovada — não reabrir.

## Reuso vs. novo (sem antecipar escopo — AD-11)
- **Reusa:** evento canônico `MembershipEvent` (8.4/8.5/8.6), `withTenantContext`/`PrismaService`,
  `RequestContext`, `@Requer('administrar','Organizacao')` (guard 1.6), padrão de projeção allowlist +
  cursor determinístico do Histórico do Registro (3.6), DTO manual sem class-validator (Constitution II),
  defesa em profundidade de papel do `MembershipStateService` (8.5).
- **Novo mínimo:** módulo `organizations/audit/` (projection puro + dto + service + controller). Uma rota
  `GET /organizations/audit`.
- **NÃO** cria substrato de eventos novo (projeta sobre o existente); **NÃO** toca guard/`ability.ts` (C3);
  **NÃO** adiciona migration/GRANT.

## Migration (etapa controlada)
- **Nenhuma.** `MembershipEvent` já existe (RLS ENABLE+FORCE, GRANT SELECT/INSERT). Read-side usa SELECT.
  `migration-check` = N/A. Débito de performance registrado (DEB-8-8-AUDIT-INDEX), sem bloquear.

## Verificação documental (context7-check)
- Prisma 6.19.3 (`/prisma/web`): cursor pagination `findMany({take, skip:1, cursor:{id}, orderBy:[{occurredAt:
  'desc'},{id:'desc'}]})` — campo único como tiebreaker (confere). NestJS 11: `@Requer`/`@Query` (padrão
  in-repo). Sem API inventada.

## Riscos e mitigação
- **Vazamento por projeção ampla:** allowlist explícita fail-closed no núcleo puro + teste que prova chaves
  exatas e ausência de `payload`/segredo/`orgId`.
- **Cross-tenant:** toda query sob RLS; teste HTTP semeia evento em outra Org e prova invisibilidade.
- **Filtro amplo silencioso:** DTO fail-closed → 400 para valor fora da allowlist.
- **Divergência épico × código:** o épico prevê contrato write-side mais rico (categorias/causationId) que
  não está materializado; resolvido a favor do estado real do código (projeção sobre `MembershipEvent`) +
  débito DEB-8-8-AUDIT-SUBSTRATE-AMPLO. Escalada não necessária (decisão interna, reversível).
