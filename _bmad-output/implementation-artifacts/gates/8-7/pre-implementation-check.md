# Gate — pre-implementation-check — Story 8.7 (roster read-side)

**Status: APROVADO**

## Escopo confirmado
Read-side puro (2 rotas GET) sobre `Membership`/`Invite` existentes. Sem migration, sem GRANT, sem
mudança de RLS/guard. Subdomínio `organizations/members/` (leitura roster). Write-side de `invites/`
intocado.

## Verificações
- **Sequência oficial:** BMAD/epics.md §700 define a Story; Spec Kit consolidado em `specs/8-7-…/`.
- **Documentação (context7-check):** Prisma 6.19.3 (`findMany` skip/take, `count`, `where in/contains`)
  e NestJS 11 (`@Controller/@Get/@Query`) confirmados via Context7 `/prisma/web` + padrão já consolidado
  no repo. Sem assinatura inventada.
- **Sem antecipar escopo:** capacidades têm consumidor concreto (UI do roster + ações 8.4/8.5/8.6);
  nenhuma abstração especulativa.
- **Artefatos autoritativos:** não editados (PRD/Spine/epics/sprint-status).
- **Reuso:** núcleos puros de 8.4/8.5 (regra do último Admin) refletidos, não duplicados.

## Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Vazamento cross-tenant | `withTenantContext` + join `Account` filtrado; teste dedicado |
| PII (e-mail) | só na visão do Admin; token nunca projetado |
| RLS self-only de AccountAvatar | não ampliar; fallback iniciais; débito registrado |

## Classificação de risco: MÉDIO (sensível por tocar autz/multi-tenant, mas sem DDL/GRANT).
Gates exigidos: context7-check ✔, security-check, observability-check, integração real. migration-check: N/A.
