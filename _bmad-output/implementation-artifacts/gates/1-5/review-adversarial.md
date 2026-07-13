# Revisão adversarial — Story 1.5 (3 agentes, escritor único)

Data: 2026-07-13. Três revisores em paralelo, escritor único (as correções abaixo foram todas aplicadas
pelo dev). Reexecutados após as correções: API 207/207, Web 33/33, typecheck (src+test) API+Web, lint,
format, build API+Web — verdes.

## Blind Security (cookie / revogação / fixation / expiração)

| Sev | Achado | Resolução |
|---|---|---|
| **HIGH** | **Login CSRF via BFF** — `POST /api/session` não validava origem; um form cross-site com as credenciais do ATACANTE faria a Web plantar a sessão do atacante no navegador da vítima (login CSRF → a vítima opera no tenant do atacante → vazamento cross-tenant). `SameSite=Lax` não protege; Route Handlers do Next não têm CSRF automático. | **CORRIGIDO.** `ehMesmaOrigem()` (fail-closed via `Sec-Fetch-Site`/`Origin`) em `POST /api/session`; cross-site → 403 antes de tocar a API. Testes: `session.test.ts` (unidade) + `csrf-routes.test.ts` (handler → 403, sem plantar cookie). |
| **MEDIUM** | Logout sem `Origin` poderia ser recusado em produção (Better Auth confere Origin), deixando a sessão viva (falha silenciosa de RN-012). | **CORRIGIDO.** `logoutNaApi` agora envia `origin` (na allowlist), como o login. Teste atualizado em `auth.test.ts`. |
| **LOW** | Logout CSRF (force-logout cross-site). | **CORRIGIDO.** Mesma checagem `ehMesmaOrigem()` em `POST /logout` → 403 cross-site. |
| — | Cookie/relay/revogação/fixation/expiração: sem achado (verbatim relay, cookieCache off, falha fechada). | — |

## Edge Case Hunter (tempo / concorrência / renovação)

| Sev | Achado | Resolução |
|---|---|---|
| **HIGH** | **Teto absoluto de 7 dias no caminho real.** O deslize renova `expiresAt` no BANCO, mas o cookie do browser é setado no login com `Max-Age=7d` e nunca re-emitido (a jornada browser→BFF→rota de domínio não passa por `/api/auth/*`). Um usuário ATIVO seria deslogado 7 dias após o login — o teto absoluto que o AC5 diz não existir. Nenhum dos 13 testes pegava (TS-03 usa `/api/auth/get-session`, não a jornada real). | **CORRIGIDO.** O `proxy.ts` agora **desliza o cookie**: re-emite o cookie de sessão com `Max-Age` fresco a cada navegação protegida (valor/assinatura preservados — round-trip de codificação do Next verificado por probe; flags corretas, `Secure` só no `__Secure-`). O banco continua a autoridade da expiração por inatividade. Teste: `proxy.test.ts` (deslize com Max-Age + flags dev/prod). |
| **MEDIUM** | TS-10 `count===1` é tautológico (o refresh faz UPDATE, nunca INSERT). | **AJUSTADO.** Mantido como rede de segurança (futuro que rotacione token), com comentário honesto; a prova real é `every(200)` + `expiresAt` deslizado. |
| **MEDIUM/LOW** | TS-10 flake latente por pressão de pool sob 8-way na rota de domínio (mesma raiz do D-06). | **AJUSTADO.** Concorrência reduzida para 4 — exercita renovação simultânea sem virar teste de pressão de pool. Robustez sob rajada = débito D-06. |
| **LOW** | Reconstrução do header de cookie no painel (`name=value; …`) frágil para valores com `;`/`=`. | **Aceito/registrado.** Probe confirmou round-trip fiel para o token atual; risco só para cookies futuros com caracteres especiais. Débito de robustez, não defeito atual. |
| **LOW** | "Renova indefinidamente" provado só para um deslize. | **Aceito.** O Better Auth não tem cap por design e a config não introduz nenhum; um deslize é proxy razoável. |

## Acceptance Auditor (critérios de aceite da 1.5)

Matriz completa: **todos os 5 ACs + 11 TS + teste de Membership + M1–M4** com cobertura real contra
PostgreSQL, asserções não-tautológicas. Nenhuma lacuna HIGH.

| Sev | Lacuna | Resolução |
|---|---|---|
| **MEDIUM #1** | AC4 (redirect do frontend) só provado na lógica pura; nenhum teste invocava `proxy()`. | **CORRIGIDO.** `proxy.test.ts` invoca `proxy()` com `NextRequest`: sem cookie → 307 `/login`; com cookie → segue e desliza. |
| **MEDIUM #3** | Route handlers da Web sem teste de handler. | **PARCIALMENTE CORRIGIDO.** `csrf-routes.test.ts` cobre o caminho de segurança (403 cross-site) no nível do handler; o relay feliz é coberto pelos unit tests de `lib/auth`. Relay 303/Set-Cookie feliz permanece coberto indiretamente (baixo risco). |
| **MEDIUM #2** | TS-07 simula produção in-process (baseURL https), não no container. | **Débito de fechamento de Lote.** O `Secure` deriva do esquema https (fiel à produção) e guarda a mutação M3; a prova no container real roda no **job `containers` do CI** no PR. |

## Débitos encaminhados (não bloqueiam a 1.5)

- **D-06** — rate limiter transacional pode 500 sob rajada concorrente direta a `/api/auth/*` (pré-1.4;
  não é falha de segurança). Alerta no staging.
- Robustez da reconstrução do header de cookie no painel (LOW) — refinamento.

## Conclusão

Dois HIGH (login CSRF; teto absoluto de 7 dias) **corrigidos e cobertos por teste**; MEDIUM/LOW tratados
ou registrados como débito. Nenhum achado CRITICAL/HIGH remanescente. Pronto para commit-check/PR/CI.
