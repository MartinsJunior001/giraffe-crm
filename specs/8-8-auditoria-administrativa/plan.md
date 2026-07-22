# Plan — Story 8.8: Auditoria administrativa (read-side)

## Classificação de risco: **ALTO**

Toca autorização (Admin-only), isolamento multi-tenant/RLS e projeção de dados potencialmente sensíveis.
Gates: testes da área crítica, integração real (PostgreSQL de verdade), regressão de segurança/isolamento,
typecheck/lint/build, QA cruzada, CI no SHA exato. **Sem migration** (ver abaixo) → sem migration drill.

## Decisões (AD-11, menor mudança correta)

### D-1 — Projeção sobre `MembershipEvent`, NÃO um schema de auditoria novo
`MembershipEvent` já é a trilha canônica administrativa materializada (8.4/8.5/8.6), append-only e imutável
pelo banco. O catálogo mais amplo do épico (Pipe/Database/Card/Form/Template/Automação) **não tem produtor
com tabela própria** hoje — criá-lo agora seria abstração especulativa sem consumidor (AD-11). **Projetar**
é a menor mudança correta e reversível. Débito: **DEB-8-8-AUDIT-SUBSTRATE-AMPLO** (materializar um
substrato canônico unificado quando os produtores de E2/E3/E4 existirem e precisarem de consulta única).

```
AUTONOMOUS_DECISION
CONTEXT: schema de auditoria canônico novo vs. projeção sobre MembershipEvent
SELECTED: projeção sobre MembershipEvent (read-side puro, sem migration/GRANT)
RATIONALE: única trilha administrativa materializada; demais produtores sem tabela própria (AD-11); reversível
SCOPE_IMPACT: NONE
REVERSIBILITY: HIGH
NEXT_ACTION: implementar audit/ (projection + dto + service + controller)
```

### D-2 — `AUDIT_LOG_VIEWED` como LOG estruturado (Pino), não tabela
O AC **não exige consultabilidade** do próprio acesso à auditoria. Persistir numa tabela append-only seria
sobre-construir (migration + GRANT + RLS sem consumidor de leitura). Um log Pino sanitizado atende D-4:
registra QUE alguém consultou (ator, Org, filtros, paginação, **contagem**), nunca o conteúdo. Se um
requisito futuro exigir consultar os acessos, materializa-se então (débito **DEB-8-8-AUDIT-LOG-VIEWED-PERSIST**).

```
AUTONOMOUS_DECISION
CONTEXT: AUDIT_LOG_VIEWED como log estruturado vs. tabela persistida
SELECTED: log estruturado (Pino) sanitizado
RATIONALE: AC não pede consultabilidade do acesso; evita migration/GRANT sem consumidor (AD-11)
SCOPE_IMPACT: NONE
REVERSIBILITY: HIGH
NEXT_ACTION: emitir montarLogAuditoria() no serviço
```

### D-3 — Ordem `[occurredAt DESC, id DESC]`, cursor por `id`
Auditoria mostra o mais recente primeiro; determinismo garantido pelo `id` único como desempate (Context7
Prisma: incluir campo único como tiebreaker no sort e no cursor). Espelha o padrão provado do Histórico do
Registro (3.6), com direção descendente.

## Migration: **NÃO**
`MembershipEvent` já existe com RLS ENABLE+FORCE e GRANT `SELECT`/`INSERT`. O read-side usa `SELECT`.
Nenhuma coluna, tabela, índice ou GRANT novo. (Débito de performance: **DEB-8-8-AUDIT-INDEX** — um
`@@index([orgId, occurredAt, id])` acelera a listagem org-wide ordenada por tempo quando o volume crescer;
hoje o `@@index([orgId, membershipId, occurredAt])` cobre orgId e o volume da Fase 1 é baixo; alinhado a
3.5/3.6 que também não adicionaram índice.)

## Context7 (gate documental)
- **Prisma 6.19.3** (`/prisma/web`) — paginação por cursor: `findMany({ take, skip: 1, cursor: { id },
  orderBy: [{occurredAt:'desc'},{id:'desc'}] })`; best practice: campo único como tiebreaker no sort e no
  cursor. **Confere** com o desenho. Fonte: docs de reading-data/pagination.
- **NestJS 11** — `@Requer` decorator + `AuthzGuard` (padrão já em `members.controller`); `@Query()` para o
  objeto de query. Sem API nova; reuso de padrões in-repo já validados.

## Arquivos
- `apps/api/src/organizations/audit/audit-projection.ts` — PURO: `projetarEvento` (allowlist AD-30),
  `montarLogAuditoria` (log sanitizado), `SELECT_EVENTO_AUDITORIA`.
- `apps/api/src/organizations/audit/audit.dto.ts` — validação manual fail-closed dos filtros/paginação.
- `apps/api/src/organizations/audit/audit-read.service.ts` — autz (defesa em profundidade), query sob RLS,
  projeção, `AUDIT_LOG_VIEWED`.
- `apps/api/src/organizations/audit/audit.controller.ts` — `GET /organizations/audit`,
  `@Requer('administrar','Organizacao')`.
- `apps/api/src/organizations/organizations.module.ts` — registra controller + service.
- Testes: `test/audit-projection-core.test.ts` (puro), `test/audit-http.test.ts` (integração real).

## Gate de PRODUÇÃO (registrar, NÃO implementar/bloquear)
Retenção 24 meses (baseline de Produto), descarte, anonimização/exclusão de Account (preservar ref
pseudonimizada do ator), legal hold (suspende expiração), backups (política de ciclo de vida). Processo de
retenção controlado (idempotente/observável/auditado, fora do caminho de app). Detalhe em
`gates/8-8/lgpd-check.md`. **Não bloqueia a impl/testes desta Story.**
