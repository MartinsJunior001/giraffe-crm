# observability-check — Story 8.4

## Trilha de auditoria (FR-214)
A tx interativa roda no client raiz (não passa pela extensão de auditoria), então a auditoria é MANUAL,
na mesma forma da extensão (`event: 'audit'`, `actor`, `orgId`, `action`, `resource`, `result`, `at`):
- `update`/`Membership` (a alteração de papel);
- `create`/`MembershipEvent` (o evento canônico);
- `update`/`DatabaseGrant` (só quando revoga concessão incompatível).
`MembershipEvent` também está em `MODELOS_AUDITADOS` — escritas fora da tx e uma inserção cruzada por engano
ficam cobertas pela extensão (inclusive a tentativa negada).

## Sanitização
Nenhum campo sensível em log/evento: sem senha/hash/token/cookie/sessionId/e-mail/corpo HTTP. Só metadados e
papéis. Coerente com a redaction global do Pino (`authorization`/`cookie`/`set-cookie`).

## Sinais de segurança
- `context.denied` (403 de contexto) e `rls.denied`/`rls.filtered` continuam valendo (extensão).
- Step-up: `auth.step_up.*` (1.12) no caminho de reautenticação.

## Recusas observáveis
403 STEP_UP_REQUIRED, 409 LAST_ADMIN_PROTECTED, 409 MEMBERSHIP_INATIVA, 404 não-enumerante — todas com corpo
tipado mínimo, sem vazar existência/PII.

**Conclusão: OK.** Sem novo sink; reusa a trilha estruturada existente.
