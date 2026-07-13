# Plan — Story 1.5

> Compacto. As decisões abaixo estão fundamentadas no `gates/1-5/context7-check.md` (Better Auth 1.6.23)
> e nas descobertas de arquitetura da Story. **Nenhuma migration.**

## P1 — Config de sessão explícita, sem default silencioso

Hoje `auth.factory.ts` define `session` só com `modelName` e `additionalFields` — `expiresIn`,
`updateAge` e `cookieCache` rodam nos defaults do Better Auth (7d/1d, cache off). O default **coincide**
com a baseline, mas um parâmetro de segurança não pode depender de um default invisível: se uma
atualização do Better Auth mudasse o default, a política mudaria em silêncio. **Decisão:** escrever os
valores explicitamente.

```ts
session: {
  modelName: 'AuthSession',
  expiresIn: 60 * 60 * 24 * 7, // 7 dias — janela de INATIVIDADE (desliza; sem teto absoluto)
  updateAge: 60 * 60 * 24,     // 1 dia — só reescreve a expiração após 1 dia de uso
  cookieCache: { enabled: false }, // revogação imediata (logout RN-012) — sem cache assinado
  additionalFields: { activeOrganizationId: { type: 'string', required: false, input: false } },
}
```

- **Sem `disableSessionRefresh`** (deixaria de deslizar → sessão ativa expiraria; é a mutação M2).
- **Sem teto absoluto inventado** — o épico pede expiração por inatividade; o modelo default já a entrega.
- `httpOnly` é default; `secure` é automático em produção (Better Auth); `sameSite=lax` default.
  **Não** setar `advanced.useSecureCookies:false` (afrouxaria produção → mutação M3), **não** setar
  `sameSite=none` (afrouxaria CSRF; e exigiria Secure sempre, quebrando dev) — a topologia de produção
  same-origin via proxy dispensa cross-site.

## P2 — Logout: endpoint nativo, sessão corrente, revogação imediata

`POST /api/auth/sign-out` já é exposto pelo Better Auth montado em `/api/auth/*` (1.4). Ele invalida a
sessão corrente e limpa o cookie — RN-012 por padrão. Com `cookieCache` off, a revogação é imediata:
`getSession` na sessão recém-encerrada devolve null sem janela. **Prova:** TS-06 + teste de duas sessões.
**Não** usar `revokeSessions`/`revokeOtherSessions` (fora de escopo).

## P3 — Testes de backend: banco real, tempo pelo banco, fase vermelha por mutação

A expiração e a renovação são propriedades do **registro** `AuthSession.expiresAt`. Em vez de esperar o
relógio, **envelhecer/adiantar `expiresAt` (e o marcador de última renovação) diretamente no banco** —
mesmo padrão dos contadores do G1 na 1.4. Escrever na **Org C** com conta de escrita própria (fixtures
A/B são leitura; a suíte roda em paralelo). Cada teste de segurança (TS-04/05/06/07) prova a fase
vermelha via mutação M1–M4 antes de ser declarado verde.

## P4 — Web: proteção de rota é UX; a negação real é do backend

- `middleware.ts` (Next.js 16): para rotas protegidas, checa **presença** do cookie de sessão e
  redireciona ao `/login` se ausente. **Não** decide autorização nem consulta dados — é só experiência.
- Página protegida confirma no **servidor** (chamada à API interna via `API_BASE_URL`, server-side) e
  degrada honestamente: 401/403 do backend é a verdade.
- `/login`: form mínimo → `POST {API}/api/auth/sign-in/email` com `credentials:'include'`. Estados
  honestos: credencial inválida → mensagem **neutra** (sem revelar existência de conta — herdado da 1.4);
  429 → aviso de limite. UI mínima (casca rica é 1.7).
- Controle de logout → `POST {API}/api/auth/sign-out` com `credentials:'include'` → redireciona `/login`.

## P5 — O que NÃO muda (fronteira)

`sessao-principal.provider.ts`, `org-context.resolver.ts`, `tenant-context.guard.ts`, schema Prisma,
regras G1/G2 da 1.4, artefatos autoritativos. A 1.5 **prova** o caminho de identidade/autorização; não o
reescreve. Um `activeOrganizationId` de sessão continua **pedido, não autoridade**.

## Rollback

Mudança de runtime (config) + testes + UI. Sem DDL, sem dado migrado. Rollback = reverter o commit.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Cookie cross-origin em produção (D-01/CR-09) | Baseline same-origin/`lax`; provar no container de produção; decisão de topologia fica no gate de staging. |
| Teste verde pelo motivo errado | Mutação M1–M4 (fase vermelha); banco real; tempo pelo banco. |
| Default silencioso | Valores explícitos (P1). |
| cookieCache aceitando sessão revogada | Desabilitado explícito + TS-06. |
| Concorrência de renovação | TS-10. |
