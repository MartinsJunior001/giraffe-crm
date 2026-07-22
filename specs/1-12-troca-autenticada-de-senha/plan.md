# Plan — Story 1.12

## Decisões técnicas (context7-check: Better Auth 1.6.23, via MCP)

- **Reautenticação:** `auth.api.verifyPassword({ body: { password }, headers })` — API server-side
  canônica do Better Auth para confirmar a senha atual da própria sessão, **sem** criar sessão nova.
  Retorna `{ status: true }` no acerto e **lança** APIError no erro (convergem para um booleano).
- **Troca de senha sem re-coletar a senha atual** (o step-up já validou): hash pelo módulo do próprio
  Better Auth — `(await auth.$context).password.hash(novaSenha)` — e escrita direta em `AuthCredential`
  pelo runtime (GRANT UPDATE já existente). Não é segundo sistema: é o hasher do Better Auth.
- **Revogação das demais sessões:** `deleteMany AuthSession where userId=X and id<>sessaoAtual`
  (GRANT DELETE existente; `cookieCache` desabilitado → revogação imediata).
- **Invalidação de recuperação:** `deleteMany AuthVerification where identifier startsWith
  'reset-password:' and value=accountId` — convenção REAL do Better Auth 1.6.23 (verificada na fonte:
  `identifier = reset-password:<token>`, `value = user.id`).
- **Estado de step-up:** linha em `AuthVerification`, `identifier = step-up:<sessionId>`,
  `value = accountId`, `expiresAt = now+10min`. Namespacing isola dos tokens do Better Auth. Liga o
  step-up à sessão. **Sem migration** (tabela e GRANT já existem).
- **Rate limit:** `RateLimiter.contar` (primitivo canônico), chave `stepup:<accountId>:<ip>`, teto 5,
  janela 15 min — contando **falhas** (D-1). Sucesso não gasta orçamento.
- **Auditoria:** evento de log estruturado sanitizado (mecanismo vigente; a tabela persistente é 8.8),
  na forma de `auditar()` de `tenant-context.ts`.
- **Notificação:** porta `SECURITY_NOTIFICATION_PORT` + adapter de LOG (padrão sancionado da 8.3),
  enquanto E5/1.13 não existe.

## Por que SEM migration

Toda persistência necessária cabe em tabelas globais existentes (`AuthVerification`, `AuthSession`,
`AuthCredential`) com os GRANTs que o runtime já tem. Menor mudança correta e reversível (Constitution II).

## Arquivos

- `kernel/auth/password-policy.ts` (+ `senhas-comuns.ts`) — validador central puro.
- `kernel/auth/step-up.service.ts` — reautenticação + janela + rate limit.
- `kernel/auth/password-change.service.ts` — orquestração atômica da troca.
- `kernel/auth/password.dto.ts`, `password.controller.ts` — fronteira HTTP (`POST /me/step-up`,
  `PUT /me/password`), `@SemContextoOrganizacional()` + auth via sessão.
- `kernel/auth/security-notification.port.ts` (+ `log-...adapter.ts`) — notificação.
- Wiring em `auth.module.ts`.

## Autorização

Operações GLOBAIS do titular (AD-10): dispensadas de contexto de Organização, mas **autenticadas**
(401 sem sessão). Identidade só da sessão validada no servidor.
