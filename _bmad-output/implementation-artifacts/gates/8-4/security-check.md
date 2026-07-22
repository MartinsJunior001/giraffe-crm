# security-check — Story 8.4

## Autorização (deny-by-default)
- Guard grosso `@Requer('administrar','Organizacao')` = Admin-only (CASL, 1.6). MEMBER/GUEST → 403 antes do handler.
- Defesa em profundidade no serviço: `contexto.papel === 'ADMIN'` senão 403.
- Autoridade fina no serviço (não no guard/`ability.ts` — C3 congelado), como `pipe-authz`/`database-authz`.
- Alvo cross-tenant invisível sob RLS → 404 **não-enumerante** (não confirma existência).

## Isolamento multi-tenant (invariante-mãe)
- `MembershipEvent`: RLS ENABLE+FORCE + WITH CHECK no INSERT **e** UPDATE. GRANT só SELECT+INSERT (append-only).
- Toda query por `withTenantContext` ou tx com `definirContextoOrg`. Nenhum `where orgId` manual; nenhum `orgId` do cliente.
- **FASE VERMELHA provada** (evidência em `red-phase.md`): (a) `GRANT UPDATE/DELETE ON "MembershipEvent"`
  temporário faz os testes de imutabilidade FALHAREM (viram permitidos) → confirma que quem barra é o GRANT;
  (b) INSERT cross-tenant via `createMany` (sem RETURNING) barrado pelo WITH CHECK — remover o WITH CHECK o
  deixaria passar. Revertido após a prova.

## Step-up (D-1)
- Promover→Admin e rebaixar Admin exigem janela válida (10 min, 1.12). Sem sessão/janela → 403 STEP_UP_REQUIRED.
- Identidade e janela vêm SEMPRE da sessão validada no servidor (`StepUpService.sessaoAtual`), nunca do corpo.
- Janela NÃO consumida por alteração de papel (operações administrativas em sequência; sem re-auth por op).

## Atomicidade / concorrência (D-2)
- `SELECT … FOR UPDATE` na `Organization` serializa alterações da Org; reléitura in-tx + guarda otimista
  (`updateMany where role=<lido>, state=ACTIVE`); P2002/P2028 → 409, nunca 500. Teste concorrente prova: um 200,
  um 409, nunca 0 Admins.

## LGPD / minimização (D-4)
- Evento e auditoria só metadados: `orgId`, `membershipId`, `actorId`, `fromRole/toRole`, `correlationId`,
  `occurredAt`. NUNCA senha/hash/token/cookie/sessionId/e-mail/corpo HTTP/PII desnecessária.
- Não revoga a Account globalmente (outras Orgs intactas); nada de exclusão física (evento append-only).

**Conclusão: sem finding CRITICAL/HIGH.** Débito registrado: `DEB-PIPEGRANT-GUEST-CEILING` (pré-existente, não da 8.4).
