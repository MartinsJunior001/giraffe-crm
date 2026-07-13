# Code Review — Story 1.6 (substrato de autorização)

> Revisão adversarial do diff `main...HEAD` (8 ângulos inline: linha-a-linha, comportamento removido,
> rastreio cross-file, reuso, simplificação, eficiência, altitude, convenções). CI do PR #7 verde nos
> 4 jobs antes da revisão.

## Findings

### [MEDIO] `AbilityCache` crescia sem teto — CORRIGIDO
**Arquivo:** `apps/api/src/kernel/authz/ability.cache.ts`
**Problema:** o `Map` só removia entradas via `invalidar`. Cada par `(accountId, orgId)` que já
autenticou permanecia para sempre — vazamento de memória lento num processo de longa duração (não é
bypass de segurança; falha, se houvesse, seria de disponibilidade).
**Correção:** teto `MAX_ENTRADAS = 10_000` com evicção FIFO da entrada mais antiga. Evictar é **seguro**
— a ability é função determinística de `(papel, orgId)`, frescos do contexto; a próxima checagem só a
reconstrói, sem afetar deny-by-default nem escopo. A invalidação continua sendo a fonte da verdade de
correção; o teto trata apenas de memória.
**Regressão:** teste `authz.test.ts` — enche 10.050 entradas e prova que, após passar pelo cache cheio,
uma ability ADMIN reconstruída continua deny-by-default e escopada (`administrar` só na própria Org).

## Verificados e OK (sem finding)

- **Ordem dos guards** (AuthzGuard após TenantContextGuard): provada pelos testes de integração reais —
  `/organizations/current` responde 200 a membro ativo e 403 a não-membro; se o authz rodasse antes do
  contexto, `obter()` lançaria 500. Verde ⇒ ordem correta.
- **`some` → `find`** no `OrgContextResolver`: a lógica de negação é idêntica; o `find` só adiciona a
  extração do papel. Narrowing após `negar(): never` correto.
- **Propagação de `papel`**: todos os construtores de `ContextoOrganizacional` atualizados;
  `withTenantContext(prisma, contexto)` aceita o campo extra (estrutural). Consumidores de `obter()`
  inalterados. 219/219 verdes.
- **Chave de cache por `(accountId, orgId)` sem papel**: intencional e faithful ao AD-9 (invalidação
  load-bearing). Keying por papel tornaria a invalidação decorativa e contradiria o AC4.
- **Guard fixa `subject('Organizacao', { id: orgId })`**: correto para o único sujeito do substrato;
  sujeitos de domínio (com resource id próprio) chegam com o Épico que os introduzir — extensão, não
  bandaid.

## Veredito
**APROVADO** — 1 finding MEDIO corrigido com regressão; nenhum CRITICAL/HIGH; nenhum bypass de
autorização; deny-by-default, isolamento por Org e ausência de permissão em token preservados.
Gates reverdes: typecheck, format, lint, **API 219/219**, Web 33/33, build.
