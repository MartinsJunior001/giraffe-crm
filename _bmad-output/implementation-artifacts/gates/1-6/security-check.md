# security-check — Story 1.6 (substrato de autorização)

## Superfície
Camada de autorização (`AuthZ`) do kernel: factory de abilities por papel efetivo, guard de aplicação
deny-by-default, cache com invalidação. Superfície de segurança **direta** (decide o que cada principal
pode fazer). Sem migration, sem novo dado pessoal.

## Verificações

### Deny-by-default (a propriedade central)
- CASL nega quando nenhuma rule casa; o factory **nunca** escreve `manage`/`all`. Esquecer uma
  permissão **nega**, não libera. Provado (fase vermelha) em `authz.test.ts` + `mutation-evidence.md`.
- O `AuthzGuard` só concede quando `ability.can(...)` é verdadeiro; caso contrário **403**.

### Isolamento por Organização (AD-6 estendido a ações)
- Toda ability tem `conditions` `{ id: orgId }` amarradas ao `orgId` **resolvido no servidor** (Story
  1.3), não ao que o cliente pediu. ADMIN na Org C não administra a Org A (provado). Sem herança
  cross-tenant — simétrico à RLS.
- O papel efetivo vem da **Membership no banco** (via `OrgContextResolver`, dentro do contexto da
  transação), **nunca** de token/cookie (AD-9). Não há permissão duradoura em sessão.

### Ausência de bypass (simétrico ao AD-6)
- Não existe caminho de bypass de ability: o guard não tem flag de "pular autorização"; a única saída é
  não declarar `@Requer` (e aí não há ação a autorizar), com o contexto de Org ainda barrando o acesso.
- `PapelEfetivo = MembershipRole` (ADMIN/MEMBER/GUEST): **não há** ramo de Plataforma que injete
  abilities de Organização (INV-ADMIN-01(c)) — garantido pelo tipo (não compila) e por teste.

### Membership não-ativa
- SUSPENDED/REMOVED nunca obtêm contexto (o resolvedor nega antes — org-context.test.ts, PostgreSQL
  real). Defesa em profundidade: mesmo que alcançassem o factory, o papel isolado não concede nada fora
  do escopo.

### Negação sanitizada (INV-REPORT-01)
- O log `authz.denied` carrega ação/sujeito/orgId/accountId/papel — **sem** id de recurso concreto
  além do orgId (que o principal já conhece) e **sem** PII. Provado em `authz.test.ts` (asserção de que
  o e-mail e termos sensíveis não aparecem no log). O corpo da resposta é o 403 padrão, sem motivo.

## Dependência
`@casl/ability` 7.0.1 — verificada no `context7-check`. Sem CVE conhecido relevante introduzido (Trivy
no CI cobre). O `paths` do tsconfig é só resolução de tipos; não altera o runtime.

## Veredito
**APROVADO** — deny-by-default provado (inclusive fase vermelha), isolamento por Organização preservado,
sem bypass, sem permissão em token, negação sanitizada. Nenhum finding CRITICAL/HIGH.
