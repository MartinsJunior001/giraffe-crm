# security-check — Story 8.8

**Status: APROVADO.**

## Autorização (deny-by-default)
- Rota `@Requer('administrar','Organizacao')` — ability concedida SÓ ao ADMIN ativo (1.6). MEMBER/GUEST e o
  **Super Admin da Plataforma** (sem Membership de Org) → 403 sem executar o handler. Sem principal → 401.
- Defesa em profundidade no serviço: `contexto.papel === 'ADMIN'` senão 403. Guard/`ability.ts` intocados (C3).
- Provado: `audit-http.test.ts` (MEMBER→403, sem principal→401, Admin→200).

## Isolamento multi-tenant (invariante-mãe)
- Toda query por `withTenantContext()`; nenhum `where orgId` manual como defesa única; nenhum `orgId` do
  cliente. RLS ENABLE+FORCE em `MembershipEvent` escopa por `orgId = current_org_id()`.
- Provado: evento semeado em outra Org (Org A) nunca aparece para o Admin da Org C (cross-tenant negativo).

## Superfície de escrita / imutabilidade
- Read-side puro. Nenhuma rota de edição/exclusão de auditoria. Sem migration, sem GRANT novo — o runtime
  segue **sem** UPDATE/DELETE em `MembershipEvent` (append-only garantido pelo banco no write-side). Correção
  = novo Evento (produtores 8.4/8.5/8.6).

## Injeção / entrada não confiável
- Sem SQL raw (Prisma model API). Filtros validados por allowlist fail-closed (categoria/operacao/resultado/
  tipoAlvo em conjuntos fechados; ator/alvo/cursor UUID; de/ate data válida; de>ate → 400). Valor fora →
  400, sem virar consulta ampla nem revelar vocabulário interno.

## Vazamento de dados / projeção
- Allowlist explícita (`SELECT_EVENTO_AUDITORIA` + `projetarEvento`): expõe só refs mínimas + metadados.
  `orgId`, `id` (PK/cursor) e chaves de `payload` fora da allowlist não cruzam a fronteira (fail-closed).
- Nenhum segredo/token/sessão/cookie/id de sessão/e-mail/corpo HTTP na tabela — a allowlist blinda por
  construção o que um produtor futuro colocar no `payload`. Provado: `not.toContain` de `payload`/segredo/
  `orgId` no corpo HTTP + chaves exatas no teste puro e no HTTP.

## Log
- `AUDIT_LOG_VIEWED` (Pino) registra só metadados + contagem; nunca o conteúdo listado nem PII de resultado.
  Redaction global de `authorization`/`cookie`/`set-cookie` já ativa no AppModule.

## Veredito
Nenhum finding CRITICAL/HIGH. Aprovado.
