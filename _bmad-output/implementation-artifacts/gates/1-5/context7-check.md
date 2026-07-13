# context7-check — Story 1.5 (Better Auth: sessão, cookie, logout)

**Data:** 2026-07-13 · **Fonte:** MCP Context7 (`/better-auth/better-auth`) · **Versão fixada:** 1.6.23
(`package.json`/lockfile). **Gate obrigatório** (CLAUDE.md): confere-se a API na fonte, não de memória.

## Perguntas feitas antes de codar

1. Como o Better Auth modela expiração por **inatividade** vs. **absoluta**? Existe teto absoluto?
2. `cookieCache` está habilitado por padrão? Por quanto tempo uma sessão **revogada** ainda é aceita
   com ele ligado? Como garantir revogação imediata?
3. `signOut` invalida **só a sessão corrente**? Como isso difere de `revokeSessions`/`revokeOtherSessions`?
4. Flags de cookie (`httpOnly`/`secure`/`sameSite`): quais são default e quando `Secure` é aplicado?

## Achados (na fonte)

### 1. Expiração — deslizante por inatividade, sem teto absoluto

```ts
session: {
  expiresIn: 60 * 60 * 24 * 7, // 7 days
  updateAge: 60 * 60 * 24,     // 1 day — a cada 1 dia a expiração é estendida
}
```

- `expiresIn` = duração da sessão; `updateAge` = de quanto em quanto tempo a expiração é **estendida**
  quando a sessão é usada. Logo, `expiresIn` funciona como **janela de inatividade**: usada, desliza;
  sem uso por mais que `expiresIn`, expira.
- **Não há teto absoluto no modelo default** — sessão usada regularmente renova indefinidamente. Isso
  atende "expiração somente por inatividade" **sem inventar** um limite de vida.
- `disableSessionRefresh: true` **desliga** o deslize (default `false`). → **Proibido** aqui (é a
  mutação M2: impedir renovação deve deixar o teste de renovação vermelho).

### 2. `cookieCache` — default `false`; desabilitado é o correto para revogação imediata

```ts
session: { cookieCache: { enabled: true, maxAge: 300 } } // default enabled: false
```

Citação da doc: *"When cookie caching is enabled, revoked sessions may remain active on other devices
until the cookie's `maxAge` expires... For critical immediate session revocation, consider disabling
`cookieCache`, setting a shorter `maxAge`, or using `disableCookieCache: true` for sensitive
operations."*

- **Estado atual do projeto:** `auth.factory.ts` **não** configura `cookieCache` → default `false`.
- **Decisão 1.5:** manter desabilitado e torná-lo **explícito** (`cookieCache: { enabled: false }`),
  porque revogação imediata (logout RN-012) é requisito. Coberto por TS-06 (getSession → null logo
  após sign-out). Mutação M4: habilitar cache com maxAge longo deve deixar TS-06/TS-05 vermelhos.

### 3. `signOut` / revogação

- `POST /api/auth/sign-out` (e `auth.api.signOut` no servidor) encerra **a sessão corrente** e limpa o
  cookie — RN-012 por padrão.
- `revokeSession({ token })` encerra **uma** sessão específica; `revokeSessions()` encerra **todas** as
  sessões do usuário; `revokeOtherSessions()` todas **exceto** a corrente. **Todas fora de escopo da
  1.5** (revogação global é 1.10/1.12/1.13).

### 4. Cookies

Citação: *"All cookies are httpOnly and secure when the server is running in production mode."* Cookies
padrão: `session_token` (sessão), `session_data` (cache de sessão — não usaremos), `dont_remember`.

- `httpOnly`: **sempre**. `secure`: **automático em produção** (não em dev/http → cookie continua usável
  localmente). `sameSite`: default `lax`.
- Controles finos disponíveis em `advanced`: `useSecureCookies`, `defaultCookieAttributes`
  (`httpOnly`/`secure`/`sameSite`), `cookies.session_token.attributes`, `crossSubDomainCookies`.
  **Baseline:** não forçar `useSecureCookies:false` (afrouxaria produção — mutação M3), não usar
  `sameSite=none` nem `crossSubDomainCookies` salvo se a topologia real de produção exigir (débito de
  staging D-01/CR-09).

## Conclusão

A baseline da Story (7d/1d, inatividade sem teto absoluto, sessão ativa renova, cookieCache off,
httpOnly sempre + secure em produção, sameSite lax) está **confirmada pela documentação oficial**.
Nenhuma divergência entre o plano e a doc. Nada a escalar. Prosseguir para implementação com valores
**explícitos** no `auth.factory.ts` (sem defaults silenciosos).
