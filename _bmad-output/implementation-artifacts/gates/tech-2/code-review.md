# code-review — tech-2 (provisionamento de tenant) — REFORÇADO (risco crítico)

## Escopo revisado
Diff da branch `tech/2-provisionamento-de-tenant` sobre `main` (baseline `c46c866`):
`prisma/provision-tenant.mjs` (rotina + CLI), `test/provision-tenant.test.ts` (11 testes),
`package.json` (script `db:provision-tenant`). Revisão em **duas camadas**: inline (autor) + **agente
adversarial independente** de segurança, proporcional ao risco crítico.

## Revisão adversarial independente
Um agente de revisão read-only auditou a rotina contra as fontes de invariante (migration de RLS, GRANTs,
`seed.sql`/`seed-credentials.mjs`, `auth.factory.ts`, `tenant-context.ts`), cobrindo 7 ângulos: bypass de
RLS, vazamento de segredo, senha/credencial, idempotência, fail-closed, papel/superfície e
testes-não-tautológicos.

**Veredito do agente: nenhum bug CRITICAL/HIGH/MEDIUM.** Confirmações principais:
- **Sem bypass de RLS:** `set_config('app.current_org_id', orgId, true)` é a 1ª instrução da transação
  (transação-local; `true`, não `false` → não gruda no pool), antes dos INSERTs, na mesma conexão. Org
  cria com `id = orgId` (satisfaz `org_insert`), Membership com `orgId` (satisfaz `membership_insert`).
  Sem escrita cross-tenant possível (o contexto é sempre o próprio org). Papel migrator, sujeito a FORCE
  RLS. Usa `PrismaClient` cru (não o client estendido que recusaria `$transaction`) — como o `seed.sql`.
- **Sem vazamento de segredo:** senha nunca logada (a gerada só quando de fato aplicada, uma vez); hash e
  `MIGRATION_DATABASE_URL` nunca aparecem; e-mail mascarado; erro de validação cita só o comprimento.
- **Credencial:** hash pelo próprio Better Auth (fallback de `BETTER_AUTH_SECRET` inócuo — scrypt usa
  salt embutido, provado pelo teste que gera e verifica com secret diferente); **nunca sobrescreve**.
- **Fail-closed:** validação e hash rodam antes de abrir a transação; entrada inválida não escreve nada.
- **Testes provam o que dizem:** SC-T202 (contexto ausente → `rejects`) é prova genuína de não-bypass;
  a autenticação verifica o hash (senha certa→true, errada→false); idempotência checa `criou`, contagem
  e hash inalterado.

## Findings
Nenhum **CRITICAL/HIGH/MEDIUM**. Notas **LOW/informativas** (hardening, não bugs exploráveis):

- **LOW-1 — corrida concorrente:** duas execuções simultâneas do mesmo slug colidem no unique de
  `Organization`; a violação não é capturada e a transação faz **rollback** (fail-closed, sem escrita
  parcial). Idempotência vale para reexecuções **sequenciais** (o caso de ops manual). **Ação tomada:**
  docstring esclarecido (não é bug; não blindar contra concorrência sem consumidor — Constitution II).
- **INFO-1 — reuso de Account por e-mail:** se o e-mail casar com um Account global preexistente **sem**
  credencial, a rotina cria a credencial e concede ADMIN na nova Org. **Não é escalonamento real:** quem
  roda já detém a credencial `migrator` (poder total no banco) e o cenário é "primeiro tenant" (banco
  vazio). Registrado como **premissa do modelo de ameaça** no `security-check`.
- **INFO-2 — `mascararEmail`:** revela o domínio e, para local-part de 1 caractere, o local inteiro.
  Mascaramento padrão; sem impacto.

## Veredito
**APROVADO (reforçado)** — revisão dupla (autor + agente adversarial independente); sem CRITICAL/HIGH/
MEDIUM; caminho de RLS, isolamento por contexto transação-local, papel migrator e não-sobrescrita de
credencial corretos e provados por testes de integração reais. LOW-1 endereçado por clareza de docstring;
INFO-1 registrado como premissa.
