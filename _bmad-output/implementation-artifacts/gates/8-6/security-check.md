# security-check — Story 8.6

**Status: APROVADO.**

## Autorização (deny-by-default, C3 congelado)
- Remoção: guard `administrar Organizacao` (só Admin na CASL 1.6) + defesa em profundidade no serviço
  (`contexto.papel !== 'ADMIN' → 403`). Saída: guard `ler Organizacao` (piso de toda Membership ativa),
  alvo = o próprio requisitante (derivado do contexto; **nenhum id do cliente**). `ability.ts`/
  `ability.factory.ts` **intocados**.
- Alvo cross-tenant/inexistente → **404 não-enumerante** (RLS invisível). Não-Admin em `remove` → 403.
  Sem sessão → 401. Id malformado → 400 (allowlist UUID).
- **Sem bloqueio de auto-alvo** por decisão (saída própria é o objetivo); o último Admin (409) é o que
  barra a autodestruição do acesso administrativo.

## Isolamento multi-tenant (invariante-mãe)
- Toda query por `withTenantContext`/tx com `definirContextoOrg`. Nenhuma rota aceita `orgId`. `orgId`
  fora da resposta (`RemocaoVisao`).
- **`REVOKE DELETE ON "Membership"` fecha DEB-MEMBERSHIP-EVENT-CASCADE:** elimina o caminho em que um
  DELETE físico (mesmo escopado à Org pela policy) cascatearia sobre `MembershipEvent` append-only via FK
  `ON DELETE CASCADE` (ações referenciais rodam com bypass de row security **e** como dono, ignorando o
  GRANT append-only). Provado por `membership-removal-rls` (permission denied) com fase vermelha.
- `MembershipEvent` segue append-only (GRANT SELECT+INSERT); o tipo novo `REMOVED` herda a imutabilidade
  — provado (UPDATE/DELETE → permission denied).

## Step-up (D-1) e concorrência (D-2)
- Remover e sair exigem janela de step-up válida (server-side, sessão do Better Auth) → 403
  STEP_UP_REQUIRED fora dela. Nada de senha/token/sessão em log ou resposta.
- Último Admin protegido atomicamente: lock na linha `Organization` + recount in-tx + guarda otimista;
  P2002/P2028 → 409, **nunca 500**. Teste concorrente prova `count` final = 1 (nunca 0).

## Sessão/acesso pós-encerramento (D-3)
- `AbilityCache.invalidar(alvoAccountId, orgId)` + limpeza de `AuthSession.activeOrganizationId` só na Org
  afetada. **Sem** revogação global da Account (outras Orgs intactas — provado). Deny-by-default por
  releitura de Membership ACTIVE (o contexto 1.3), sem coluna nova.

## Superfície de entrada
- Rotas sem corpo; anti-mass-assignment por construção (nada do cliente além do id de rota validado).

**Achados CRITICAL/HIGH: nenhum.**
