# security-check — Story 1.5 (sessão, logout, proteção de rota)

Gate obrigatório (Story CRITICAL-FOCUSED). Data: 2026-07-13. Verificado contra o código real.

## Superfície alterada

Config de sessão do Better Auth (`auth.factory.ts`), testes de sessão (`sessao.test.ts`), e a camada Web
(BFF): login/logout/proteção de rota. **Sem** migration, **sem** dependência nova, **sem** mudança no
schema/RLS/GRANTs.

## Verificações

| # | Controle | Estado | Evidência |
|---|---|---|---|
| S1 | **Revogação imediata** — `cookieCache` desabilitado explícito | ✅ | `auth.factory.ts` `cookieCache:{enabled:false}`; TS-06 prova getSession→null pós sign-out; mutação M4 (cache on) deixa TS-06 vermelho. |
| S2 | **Cookie `HttpOnly` sempre + `Secure` em produção** | ✅ | Default do Better Auth; TS-07 (baseURL https → Secure+HttpOnly), TS-08 (dev sem Secure, usável); mutação M3 (`useSecureCookies:false`) deixa TS-07 vermelho. |
| S3 | **Expiração por inatividade; falha fechada** | ✅ | expiresIn=7d/updateAge=1d; TS-04 (inatividade→401), TS-05 (adulterada→401); mutação M1 deixa ambos vermelhos. Sessão inválida = ausência (null→401), nunca 200 degradado. |
| S4 | **Logout = só a sessão corrente (RN-012)** | ✅ | endpoint nativo `sign-out`; TS-06 + teste de duas sessões (logout numa não derruba a outra). Sem `revokeSessions`/`revokeOtherSessions`. |
| S5 | **Sessão é identidade, não autorização; revalidação por requisição** | ✅ | Teste de Membership (ACTIVE→200; SUSPENDED/REMOVED→403 com a mesma sessão) e TS-09 (cross-tenant). Nada cacheia autorização entre requisições. |
| S6 | **Nenhum token/cookie em log** | ✅ | Redaction de `authorization`/`cookie`/`set-cookie` (herdada da 1.4); TS-11 captura o log e prova que o token não aparece. |
| S7 | **Enumeração — erro de login neutro** | ✅ | `loginNaApi` (Web) classifica qualquer não-OK ≠429 como `credenciais` (neutro); a neutralidade real é herdada da API (1.4). Sem "conta não existe". |
| S8 | **API interna não vaza para o browser (BFF)** | ✅ | Web fala só com a própria origem; `lib/auth.ts` chama `API_BASE_URL` **server-side** (sem `NEXT_PUBLIC_`); erros viram estados honestos (`indisponivel`), sem stack/URL interna. Relay de `Set-Cookie` verbatim (não reserializa flags/assinatura). |
| S9 | **Proteção de rota é UX; negação real no backend** | ✅ | `proxy.ts` só checa presença do cookie e redireciona; a página `/painel` confirma no servidor (401→Login, 403→sem-Organização). Deny-by-default do backend intacto. |
| S10 | **CSRF/Origin** | ✅ | `trustedOrigins` = allowlist de CORS (sem curinga, `env.ts`); o BFF manda o Origin da própria Web (na allowlist). Nenhuma origem nova confiável. |
| S11 | **Cookie `__Secure-` em produção reconhecido** | ✅ | `session.ts` reconhece `better-auth.session_token` e `__Secure-…`; sem isso o proxy mandaria todos ao Login em produção. Testado em `session.test.ts`. |
| S12 | **Sem bypass de RLS / sem alteração de GRANT** | ✅ | Nenhuma query nova fora de contexto; nenhuma migration; `AuthSession` sem RLS (chaveada por conta), com GRANT já existente da 1.4. |

## Débito registrado (não é falha de segurança)

**D-06** — o rate limiter em banco do Better Auth abre uma transação por requisição `/api/auth/*`; sob
rajada concorrente **direta** a esses endpoints, algumas requisições podem virar **500** (contenção de
transação) em vez de 429. Não concede acesso (não é vulnerabilidade); é robustez. Pré-existente da 1.4,
fora do escopo da 1.5. Detalhe em `gates/1-5/mutation-evidence.md`. Encaminhado ao gate de staging.

## Veredito

**APROVADO.** Todos os controles de segurança de sessão verificados no código e provados por teste, com
fase vermelha comprovada por mutação nos quatro invariantes críticos. Nenhum achado CRITICAL/HIGH.
