# Checklist — Story 8.8

## Autorização
- [x] `@Requer('administrar','Organizacao')` na rota (Admin-only; guard grosso 1.6).
- [x] Defesa em profundidade no serviço (`contexto.papel === 'ADMIN'` → 403).
- [x] Super Admin (sem Membership) e MEMBER/GUEST → 403; sem principal → 401.
- [x] `ability.ts`/`ability.factory.ts` intocados (C3 congelado).

## Isolamento multi-tenant
- [x] Toda query por `withTenantContext()`; nenhum `where orgId` manual.
- [x] Nenhum `orgId` aceito do cliente.
- [x] Evento de outra Org invisível (RLS) — provado no teste HTTP (cross-tenant).

## Projeção / minimização (AD-30, LGPD D-4)
- [x] Allowlist explícita (`SELECT_EVENTO_AUDITORIA` + `projetarEvento`).
- [x] `orgId` e `id` (PK/cursor) fora da fronteira.
- [x] `payload`: só `fromState`/`toState`; demais chaves descartadas (fail-closed).
- [x] Nenhum segredo/token/sessão/cookie/e-mail/corpo HTTP exposto (não existem na tabela; allowlist blinda).

## Filtros / paginação
- [x] Filtros fail-closed (allowlist → 400): categoria/operacao/resultado/tipoAlvo; UUID em ator/alvo/cursor.
- [x] Intervalo `de`/`ate` validado; `de > ate` → 400.
- [x] Ordem determinística `[occurredAt DESC, id DESC]`; teto `limite ≤ 100`; cursor estável.

## Auditar o acesso
- [x] `AUDIT_LOG_VIEWED` emitido (Pino) sanitizado; só metadados + contagem; sem copiar resultados.

## Sem exclusão / imutabilidade
- [x] Read-side; nenhuma rota de edição/exclusão de auditoria.
- [x] Sem migration; sem GRANT novo; `MembershipEvent` segue append-only (SELECT/INSERT).

## Testes (integração real, PostgreSQL no ar)
- [x] (a) cross-tenant — evento de outra Org não vaza.
- [x] (b) Admin-only — MEMBER→403, sem principal→401, Admin→200.
- [x] (c) projeção allowlist — chaves exatas; sem PII/segredo/orgId/payload.
- [x] (d) `AUDIT_LOG_VIEWED` sanitizado sem copiar resultados (teste puro `montarLogAuditoria`).
- [x] (e) paginação/ordem/filtros determinísticos.
- [x] Conta descartável (`randomUUID`) na Org C; sem reusar Ana/Bruno/Carla/Eva (TEST-ISO-01).

## Gates
- [x] context7-check (Prisma 6.19.3 cursor; NestJS 11) — registrado no plan.
- [x] pre-implementation-check · security-check · observability-check · lgpd-check — em `gates/8-8/`.
- [x] migration-check — N/A (sem migration).
