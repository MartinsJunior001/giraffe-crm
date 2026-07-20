# TECH-S1 — Evidência de execução

> **Nota de revisão (QA F1).** A evidência autenticada anterior fora colhida sobre `3032702`,
> **antes** da Story 1.9, e por isso não exercitava o seletor de Organização sob a CSP enforcing.
> Este documento a **substitui**: a passagem autenticada abaixo foi refeita sobre o HEAD realmente
> a ser mergeado, `e02d0f9`, que **já contém a Story 1.9** (seletor + endpoints de Organização
> ativa) e a TECH-S1 (CSP/proxy). Nenhum resultado é inferido do código — todos vieram de execução.

## 0. Contexto da coleta

| Item | Valor |
|---|---|
| HEAD testado | `e02d0f9355f418cce8100a12814680b13173caf0` |
| `origin/main` mesclado | `ef746f3` (Story 1.9) — confirmado ancestral de HEAD |
| Story 1.9 presente | **sim** — `apps/web/app/painel/_componentes/SeletorOrganizacao.tsx`, `apps/web/app/api/organizacao/route.ts`, `apps/api/src/kernel/context/organizacao-ativa.controller.ts` |
| TECH-S1 presente | **sim** — `apps/web/lib/cabecalhos-seguranca.ts`, `apps/web/proxy.ts` (usa `montarCsp`/`gerarNonce`) |
| Data/hora (UTC) | 2026-07-20T20:55–21:00Z |
| API | `http://localhost:3001` — `node dist/main.js`, `NODE_ENV=production`, `ALLOW_DIRECT_EXPOSURE=true` (sem Traefik local) |
| Web | `http://localhost:3000` — `next start`, `NODE_ENV=production` |
| Banco | container **isolado desta lane** `wt-s1-borda-db-1` (compose do próprio worktree, porta host 5439 — 5434 estava ocupada pela lane wt-1-9), migrado + semeado; derrubado com `down -v` ao fim |
| Conta | Eva (`eva@exemplo.test`), multi-org — ACTIVE nas Orgs A e B (fixture `seed.sql`) |
| Browser | Chromium (Playwright) |

> **Fronteira de lane.** O banco em `127.0.0.1:5434` pertence à lane wt-1-9 (Terminal 2) e **não foi
> usado nem tocado**. Subi um banco próprio (projeto compose `wt-s1-borda`, porta 5439), semeei e
> derrubei ao final. O `.env` recebeu ajustes efêmeros (porta 5439, `WEB_PUBLIC_ORIGIN`,
> `ALLOW_DIRECT_EXPOSURE`) e foi **restaurado ao original** (backup `.env.qa-s1.bak`). O override de
> compose (`docker-compose.qa-s1.yml`) foi descartável e removido. Nenhum arquivo versionado de
> ambiente mudou.

## 1. Gates de qualidade (sobre `e02d0f9`)

| Gate | Exit code | Resultado |
|---|---|---|
| `pnpm lint` | 0 | limpo |
| `pnpm format:check` | 0 | `All matched files use Prettier code style!` |
| `pnpm typecheck` (api + web) | 0 | `apps/api: Done` · `apps/web: Done` |
| `pnpm build` (api + web) | 0 | `ƒ Proxy (Middleware)`; rota `/api/organizacao` no manifesto |
| `pnpm --filter @giraffe/web test:ci` | 0 | **20 arquivos, 137 testes, 137 passed** |

Sobre `pnpm test:ci` **na raiz**: vermelho **localmente** por ambiente, não por código — ver os dois
débitos na seção 5. O gate autoritativo de teste é o CI (seção 6), verde no mesmo HEAD.

## 2. Passagem autenticada — os 17 passos

Fluxo real no browser, conta Eva, sobre a árvore mesclada. Credenciais não registradas (a senha de
dev é fictícia, `.test`, já pública no repositório por decisão do seed).

| # | Passo | Resultado observado |
|---|---|---|
| 1 | Subir API e Web | API `/ready` → **200** (banco conectado); Web `/login` → **200** |
| 2 | Autenticar como Eva | `POST /api/session` → **303** para `/painel`; cookie de sessão emitido |
| 3 | Abrir `/painel` | **200**, renderizado |
| 4 | Topbar renderizada | sim — `navigation "Navegação principal"` + `banner` com o seletor |
| 5 | Seletor de Organização visível | sim — `combobox "Organização:"` com opções **Organização A** e **Organização B** |
| 6 | Abrir o seletor | opções acessíveis; estado inicial honesto: "Selecione uma Organização" / "Nenhuma Organização ativa" |
| 7 | Trocar de Organização | selecionada **Organização A** |
| 8 | Requisição de troca | **`POST /api/organizacao` → 200 `ok:true`** (capturado por instrumentação do `fetch`) |
| 9 | `router.refresh()` executado | sim — o Server Component re-renderizou (ver passo 10) sem navegação de URL |
| 10 | Nova Organização exibida | combobox passa a "Organização A" **selecionada**; `main` muda para "Você está em Organização A…" |
| 11 | Contexto anterior não permanece | o texto "Nenhuma Organização ativa" e o placeholder "Selecione uma Organização" **desaparecem** |
| 12 | Hard refresh | recarga completa de `/painel` |
| 13 | Persistência da Organização | após a recarga, "Organização A" continua selecionada e o Server Component ainda diz "Você está em Organização A" — persistido via sessão |
| 14 | Logout | clique em **Sair** → `POST /logout` → **303** para `/login` |
| 15 | Sessão/cookie removidos | `Set-Cookie` do `/logout` traz **só `Max-Age=0`** para `session_token`, `session_data`, `dont_remember` |
| 16 | Tentar voltar a `/painel` | `fetch('/painel')` pós-logout → `opaqueredirect`; navegação para de fato em `/login` |
| 17 | Redirecionamento seguro | `/painel` **sem** cookie → **307** para `/login` (proteção do proxy) |

## 3. CSP e console durante o fluxo (evidência real)

Coletado com um listener de `securitypolicyviolation` instalado na página e leitura direta dos
cabeçalhos das respostas.

| Verificação | Resultado |
|---|---|
| `Content-Security-Policy` enforcing presente | **sim**, em `/painel` e nas demais rotas |
| `Content-Security-Policy-Report-Only` usado como substituto | **não** (ausente) |
| Console sem violação de CSP | **sim** — 0 erros de CSP em `localhost:3000` (o único erro de console é `404 favicon.ico`, preexistente) |
| Eventos `securitypolicyviolation` | **0** — antes da troca, após a troca e após o hard refresh |
| Seletor com `style="..."` inline | **não** — é um `<select>` nativo sem `style`; o único `[style]` da página é o `next-route-announcer` do Next, que **não** gerou violação |
| Hidratação sem erro | **sim** — o seletor reage, a troca dispara `fetch` e o refresh re-renderiza (React interativo) |
| Chunks e Server Components carregados | **sim** — 17 `<script nonce>` executados; Server Component re-renderiza no `router.refresh()` |
| `fetch` da troca permitido por `connect-src 'self'` | **sim** — `POST /api/organizacao` (mesma origem) → 200, sem violação de `connect-src` |
| Scripts autorizados por nonce/`strict-dynamic` | **sim** — `script-src 'self' 'nonce-…' 'strict-dynamic'`; os 17 scripts executaram |
| Nonce da resposta compatível entre CSP e HTML | **sim** — os **17** scripts do documento compartilham **1** nonce; como todos executaram (hidratação ok), esse nonce casa com o do header `Content-Security-Policy` do mesmo documento |
| Nonce diferente em nova resposta | **sim** — documento com nonce `zyoYSZ…`; uma requisição subsequente veio com `QnJRRT…` (valores só por prefixo) |
| `unsafe-eval` no modo de produção | **ausente** na CSP servida por `next start`/`NODE_ENV=production` |
| Logout não reemite cookie pelo middleware | **confirmado** — com sessão real da Eva, `POST /logout` devolve **apenas** `Max-Age=0`; **nenhum** `session_token` com `Max-Age` fresco. A armadilha do matcher ampliado (proxy re-emitir no `/logout` o cookie que o handler apaga) está fechada |

Cabeçalhos complementares neste runtime (produção, com a 1.9 presente):

- **`X-Powered-By` ausente** em `/`, `/login`, `/painel`, `/api/session`, `/healthz` **e `/api/organizacao`** (rota nova da 1.9).
- **HSTS por esquema:** HTTP simples → **ausente**; `x-forwarded-proto: https` → `max-age=63072000` (sem `includeSubDomains`/`preload`).
- **CSP presente na rota nova da 1.9** (`/api/organizacao`), com nonce.

## 4. Provado localmente × dependente de staging

**Provado localmente (runtime de produção, HTTP):** CSP enforcing com nonce por requisição; ausência
de `unsafe-eval`/`unsafe-inline`; `X-Powered-By` removido; demais cabeçalhos estáticos; o fluxo
autenticado completo da 1.9 sob a CSP, sem uma única violação; não-reemissão de cookie no logout.

**Dependente de staging (não declarável aqui):** HSTS numa **resposta HTTPS representativa**. Local
só há HTTP; o provado é *dado esquema efetivo HTTPS, o HSTS sai com o valor exato*. A validação sobre
TLS real é do staging atrás do Traefik, e o `smoke.mjs` já a impõe — com `WEB_URL` em `https://`, a
ausência de `Strict-Transport-Security` **reprova** o smoke. Por isso `S1_RESOLVED` vale **no
origin**, não de ponta a ponta.

## 5. Débitos registrados (não corrigidos neste PR)

### `DEB-TEST-CI-LOCAL-ORQUESTRACAO`

- **Sintoma:** `pnpm test:ci` na **raiz** falha localmente; a Web isolada
  (`pnpm --filter @giraffe/web test:ci`) passa **20/20 arquivos, 137/137 testes**.
- **Causa:** o `pnpm -r` executa as suítes da **API e da Web concorrentemente**; sob essa carga, os
  workers de fork em jsdom da Web estouram o timeout de inicialização (`Failed to start forks worker`
  / `Timeout waiting for worker to respond`) — **antes** de qualquer asserção. Não é falha de teste.
- **Correção futura:** orquestração determinística/serial entre pacotes, ou limite explícito de
  workers/concorrência por pacote.
- **Condição de fechamento:** a raiz e as suítes isoladas produzirem resultado **equivalente e
  reproduzível**.

### `DEB-ENV-TEST-REPRODUZIVEL`

- **Sintoma:** a suíte da API acusou massa de falhas contra o PostgreSQL local numa rodada anterior.
- **Causa:** as credenciais do `.env` local podem **não corresponder** ao PostgreSQL que está no ar
  (ex.: um banco provisionado por outra lane, com credenciais efêmeras próprias) → **P1000
  Authentication failed**, e não migration faltando.
- **Regra imediata:** `db:status` deve ser **preflight**; um `P1000` explica a suíte inteira. **Não
  registrar contagem de testes quando o banco rejeita autenticação** — a contagem seria de um
  ambiente quebrado, não do código.
- **Correção futura:** `.env.test` versionado **sem segredos** e banco descartável provisionado pelo
  próprio comando de teste.
- **Condição de fechamento:** suíte local e CI usarem **configuração equivalente**.

## 6. CI (gate autoritativo)

CI **5/5 SUCCESS** no HEAD `e02d0f9`, `mergeStateStatus: CLEAN`: Qualidade · Testes (PostgreSQL
real) · Containers · Arquivos · Segurança. O job `Containers` roda `pnpm smoke` contra a **imagem
conteinerizada de produção**, com os dois checks novos:

```
PASS  WEB / cabeçalhos de segurança      (http://localhost:3000/)      -> HTTP 200
PASS  WEB /login cabeçalhos de segurança (http://localhost:3000/login) -> HTTP 200
Smoke: OK (6/6)
```

## 7. Veredito

`S1_RESOLVED` **no origin** — CSP enforcing comprovada em resposta HTTP real de runtime de produção,
com a Story 1.9 presente e o seletor de Organização exercitado ponta a ponta sob a CSP, sem uma
única violação. HSTS sobre HTTPS real permanece pendência **de staging**, declarada e imposta pelo
smoke. Cabeçalhos na camada Traefik, coletor de violações de CSP, `DEB-S1-HSTS-SUBDOMAINS`, R1 e M1
seguem com dono fora desta lane.
