# Gate — security-check + observability-check — Story 8.7

**Status: APROVADO** — evidência real de execução:
- `typecheck` (src + test) → exit 0.
- `build` (nest build) → exit 0.
- ESLint dos arquivos da Story → exit 0; Prettier → OK.
- `roster-core.test.ts` (unidade pura) → 19/19.
- `roster-http.test.ts` (integração real, PostgreSQL + Better Auth) → 12/12, incluindo as 4 provas:
  (a) isolamento cross-tenant (membros + Convites), (b) autz (GUEST→403 membros; MEMBER→403 Convites;
  sem sessão→401; visão reduzida do Membro), (c) projeção sem token/segredo, (d) paginação/ordem/allowlist.
- Regressão da área `organizations` (membros/estado/remoção/convites/admin-scope + roster), serial → 106/106.

## security-check
- **Deny-by-default:** `members` piso `ler Organizacao` + autoridade fina (Convidado→403);
  `invites` `administrar Organizacao` (só Admin). `ability.ts` intocado (C3).
- **Sem `orgId` do cliente:** nenhuma rota/serviço aceita identificador de Organização; contexto do servidor.
- **Isolamento multi-tenant:** toda query por `withTenantContext`; `Account` (global) lido só por
  `id in [...]` derivado das Memberships escopadas por RLS. Teste cross-tenant prova não-vazamento.
- **Segredos:** `tokenHash`/token de Convite **nunca** projetados (`SELECT_CONVITE` sem token; teste
  afirma ausência de qualquer chave `token`/`hash`). `normalizedEmail`/`orgId` fora da resposta.
- **Mass-assignment/entrada:** query allowlist fail-closed (chave desconhecida → 400).
- **Injeção:** sem SQL raw nesta Story; filtros via Prisma (`contains`, `in`) parametrizados.

## observability-check
- **Sanitização:** caminho de leitura não loga PII (e-mail/nome) nem token; segue o padrão Pino do projeto.
- **Estados honestos:** 401/403/200 distintos; corpo de 403 sem motivo sensível.
- **Sem novo canal de log** que exponha payload; nada de PII em nível info.

## LGPD (aplicável — projeta e-mail/nome)
- **Finalidade legítima:** roster administrativo exibe e-mail/nome do membro (gestão da composição).
- **Minimização:** Membro comum não recebe e-mail; Convidado não acessa; token jamais exposto.
- **Sem exclusão/exportação:** read-side puro; sem exportação de membros (fora da Fase 1).

## migration-check: N/A — não há migration nesta Story.
