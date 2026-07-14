# Aceites independentes — Story 2.1 (ciclo de vida e catálogo de Pipes)

> Estes vereditos foram emitidos por revisores **independentes** de quem implementou a Story — o
> implementador não pode autoatestar os gates que exigem independência. Todos executaram contra o código
> real (commit `c91e321`) e o PostgreSQL de dev. As evidências completas estão resumidas abaixo; os
> vereditos alimentam a decisão de merge do PR #17.

Data: 2026-07-13 · Commit revisado: `c91e321` · PR: #17

---

## 1. Revisão adversarial independente — **APPROVED**

Nenhum achado CRITICAL, HIGH ou MEDIUM. O revisor tentou quebrar 11 vetores e **refutou todos por
execução**:

1. Query de Pipe fora de `withTenantContext` — inexistente; nenhum client cru.
2. Mover Pipe cross-tenant por `updateMany` — negado pelo `WITH CHECK` do UPDATE (provado **sem**
   RETURNING, o que descarta o falso-verde que já mordeu esta base).
3. `update`/`updateMany` cross-tenant por id alheio — `count: 0` → 404, sem vazar existência.
4. DELETE pelo runtime — `permission denied` (privilégio checado antes das linhas).
5. ADMIN da Org A agindo sobre Pipe da Org B — impossível: o `orgId` vem só de Membership ativa.
6. Mass assignment — parsers com whitelist; `state`/`orgId`/`archivedAt`/`id` do corpo são ignorados.
7. Regressão do C3 pela mudança do guard — `authz.test.ts` + contexto (28 testes) verdes; campo extra
   inerte para `Organizacao`.
8. Rollback derrubando algo além da 2.1 — só as 4 policies, a tabela e o type.
9. Escopo antecipado — nenhuma tabela/coluna de Card, Fase ou papel-por-Pipe.
10. Vazamento por erro — 400 sanitizado, 404 uniforme, 403 sem corpo.
11. Migration/GRANT mínimo — 4 policies, `WITH CHECK` no INSERT e no UPDATE, GRANT sem DELETE.

**Achados LOW (aceitos e rastreados):**
- **LOW-1** — `arquivar`/`restaurar`/`atualizar` são 3 transações (`obter → updateMany → obter`); sob
  concorrência **na mesma Org**, o corpo devolvido pode refletir modificação intercalada. Sem impacto de
  isolamento nem lost-update de segurança — inconsistência cosmética de resposta. Unir os passos exigiria
  transação-com-contexto (Story 1.3), que o `withTenantContext` recusa por design. **Aceito.**
- **LOW-2** — falso positivo de auditoria (idempotência → `denied`); já é o **R-1** conhecido. **Aceito.**
- **LOW-3** — `parseIncluirArquivados` compara `=== 'true'`; `?arquivados=1` cai em "só ativos". Só UX; o
  inverso (vazar arquivados) não ocorre. É o achado **M-1** do `code-review.md`. **Aceito.**
- **INFO** — `PATCH` edita um Pipe `ARCHIVED` (sem filtro de `state`); nenhum AC proíbe. Confirmado como
  intencional (editar um arquivado antes de restaurar é legítimo).
- **INFO** — os testes HTTP escrevem na Org A; seguro hoje (asserções por id, não por contagem). A
  convenção do CLAUDE.md pede Org C — anotado como fragilidade futura, não defeito.

Responsável pelos LOW: implementador da 2.1; rastreados aqui e no `analyze.md`.

---

## 2. Security-check final independente — **APPROVED**

Nenhum achado CRITICAL/HIGH/MEDIUM. Isolamento comprovado por **execução real** nas quatro frentes:

```
dono da tabela      : giraffe_migrator   (NÃO o runtime)
ENABLE / FORCE RLS  : t / t
policies            : pipe_select(USING) · pipe_insert(WITH CHECK) ·
                      pipe_update(USING+WITH CHECK) · pipe_delete(USING)
GRANT giraffe_app   : SELECT=t INSERT=t UPDATE=t DELETE=f TRUNCATE=f REFERENCES=f
leitura cross-tenant: 0 linhas (RLS filtra)
escrita cross-tenant: UPDATE 0 / INSERT e "mover" → violates RLS policy
sem contexto        : leitura 0 linhas, escrita negada  (falha fechada)
giraffe_app         : NOSUPERUSER + NOBYPASSRLS; DISABLE RLS → "must be owner";
                      SET ROLE migrator → "permission denied to set role"
MEMBER/GUEST        : 403 em ler e administrar (HTTP real)  ·  suíte 23/23
```

Verificados também: enumeração (404 uniforme), mass assignment (whitelist), `orgId` fora do payload,
erros sanitizados (id malformado → 400, não 500), `set_config(..., true)` transaction-local, ausência de
segredos no diff. O guard injetando `{ id: orgId, orgId }` **não** abre brecha (o CASL chaveia pelo tipo
do sujeito; o campo extra é inerte).

**Riscos residuais (aceitos):** LOW — sem rate limit por rota/tenant (consistente com a base; acesso
restrito a ADMIN autenticado). INFO — auditoria é evento de log; `AbilityCache` in-memory por processo
(contrato do Épico 8). Nenhum bloqueia.

---

## 3. Decisão de Arquitetura — D-1/C3 — **`C3 COMPATIBLE — APPROVED`**

O que o C3 congela (texto de `l1-contratos-congelados.md` §C3) é o **mecanismo**: CASL `AppAbility`, o
decorator `@Requer`, deny-by-default, o ponto de aplicação (2º guard global), papel efetivo vindo do banco,
e o cache por `(accountId, orgId)`. **Não** congela a lista de sujeitos nem a linha que monta o
`subject(...)`. AD-9 já declara "Pipe/Card/Database … são subjects", e o `ability.ts` original já dizia que
sujeitos de domínio "chegam com regra própria nos Épicos". Adicionar `Pipe` é o uso **projetado** do
substrato.

Justificativa registrada pelo Arquiteto:
1. **Aditiva e compatível** — o CASL avalia só as chaves declaradas na condition; o `orgId` extra é
   **inerte** para `Organizacao` (que casa por `id`). Provado por execução direta do `@casl/ability`.
2. **`Organizacao` preservada bit a bit** — as regras de `Organizacao` (`ability.factory.ts:26,31`) **não
   foram tocadas** e continuam casando exclusivamente por `id`; com `id` de outra Org, o `orgId` "certo"
   não salva (continua negado).
3. **Não amplia alcance** — o `orgId` do sujeito é **o mesmo** que já era o `id`, vindo do contexto
   resolvido no servidor (nunca do token/cliente). Nenhum novo grau de liberdade; deny-by-default intacto.
4. **Risco futuro = falha FECHADA** — uma regra futura por *id de recurso* nunca casaria no guard (403
   ruidoso no primeiro teste), jamais concessão indevida. Aceitável e desejável.
5. **Regressão** — `authz.test.ts` (suíte do C3, não modificada) + `pipes-authz.test.ts` = 18/18 verdes; o
   comportamento do guard está **pinado por teste** (`pipes-authz.test.ts:83-88`).

**Decisão:** manter a implementação como está; **sem** correção exigida; **sem** reabrir o C3 (o mecanismo
não mudou — mudou o catálogo de sujeitos, ponto de extensão previsto).

Duas ações de **governança** decorrem daqui (não editáveis pela implementação — ver `debitos-gerados.md`):
- registrar em `l1-contratos-congelados.md` §C3 uma **nota de esclarecimento** (não mudança de contrato);
- registrar o débito **DBT-AUTHZ-01** para a Story 2.2.

---

## Consolidação para a decisão de merge

| Gate independente | Veredito | Achados obrigatórios abertos |
|---|---|---|
| Revisão adversarial | **APPROVED** | nenhum (3 LOW aceitos) |
| Security-check final | **APPROVED** | nenhum (LOW/INFO aceitos) |
| Arquitetura (D-1/C3) | **C3 COMPATIBLE — APPROVED** | nenhum |

Nenhum achado CRITICAL, HIGH ou MEDIUM em aberto. Todos os LOW têm justificativa, responsável e
rastreabilidade. As condições de qualidade para o merge autorizado do PR #17 estão satisfeitas.
