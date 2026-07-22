# Plano de implementação — Story 8.7 (roster read-side)

## Abordagem
Read-side puro em `apps/api/src/organizations/members/` (subdomínio de leitura roster), **sem** tocar o
write-side de `invites/` nem as rotas de mutação de `members/`. Espelha `records-read.service` (3.5) e
`kanban-read.service` (2.9). Nenhuma dependência nova; nenhuma migration; nenhum GRANT.

## Componentes
1. `roster.core.ts` (PURO) — capacidades por linha (proteção do último Admin), clamp de paginação,
   `conviteExpirado`. Unit-testável sem DB.
2. `roster.dto.ts` — parse fail-closed da query (allowlist `state/role/busca/skip/take`).
3. `roster-read.service.ts` — `RosterReadService.listarMembros` (Admin plena / Membro reduzida /
   Convidado 403) e `.listarConvites` (Admin only). Toda query por `withTenantContext`; `Account`
   (global) lido por `id in [...]` filtrado pelas Memberships escopadas.
4. `roster.controller.ts` — `GET /organizations/members` (`ler Organizacao`), `GET /organizations/invites`
   (`administrar Organizacao`).
5. Wire em `organizations.module.ts` (controller + service).

## Verificação documental (context7-check)
- Prisma 6.19.3: `findMany` com `skip`/`take` (offset), `count`, `where` com `in`/`contains`/`mode:'insensitive'`
  — confirmado via Context7 (`/prisma/web`), coincide com o uso já consolidado em `records-read`.
- NestJS 11: `@Controller`/`@Get`/`@Query` — padrão já provado nos read controllers do projeto.

## Riscos e mitigação
- **PII (e-mail):** projetado só na visão do Admin; Membro reduzido não recebe. Token nunca projetado.
- **Cross-tenant:** RLS + join filtrado; teste dedicado prova que Org B não vaza para Admin de A.
- **`AccountAvatar` self-only:** não ampliar policy (HIGH, fora do escopo) → fallback por iniciais;
  débito `DEB-8-7-AVATAR-ROSTER-CROSS-MEMBER`.

## Gates aplicáveis (risco médio→sensível)
pre-implementation-check · context7-check · security-check · observability-check · testes de integração
real (isolamento) · typecheck/lint/build/CI. **migration-check:** N/A (sem migration).
