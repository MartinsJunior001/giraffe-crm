# TECH-S1 — Hardening de cabeçalhos de borda

- **Origem:** finding **S1** do `docs/04-operacao/veredito-staging-provisorio.md` (Revisor 1 — Segurança),
  registrado no veredito consolidado como **bloqueador de PRODUÇÃO**.
- **Tipo:** tech story (não pertence a nenhum Épico do `epics.md`; não altera `sprint-status.yaml`).
- **Base:** `origin/main` `3032702`.

## 1. Problema

Citação literal do finding: _"hardening de borda ausente — `X-Powered-By: Next.js` exposto e sem
HSTS/`X-Content-Type-Options`/`X-Frame-Options`/CSP"_.

O código confirma o finding: `apps/web/next.config.ts` em `3032702` declara **três** opções
(`output`, `outputFileTracingRoot`, `reactStrictMode`) — **nenhum** cabeçalho de segurança, e
`poweredByHeader` no default (`true`, isto é, `X-Powered-By` emitido). Não há CSP em lugar nenhum
do repositório (`git grep` por `content-security-policy` fora de documentação: zero ocorrências).

## 2. Objetivo

Emitir, na borda pública (a Web — única superfície que fala com o browser), o conjunto de
cabeçalhos de segurança que o veredito exige, com a **CSP em modo enforcing**, sem quebrar a casca
navegável (1.7/1.8), o login (1.4), o BFF (`/api/session`, `/logout`) nem os probes.

## 3. Escopo incluído

**Estáticos** (`apps/web/next.config.ts` — valem para toda resposta, inclusive `_next/static`):

| Cabeçalho | Valor | Por quê |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | impede MIME sniffing (upload/anexo servido como script) |
| `X-Frame-Options` | `DENY` | clickjacking; redundante com `frame-ancestors`, mantido para browser antigo |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | não vaza path (que pode conter id de recurso) cross-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | nega API sensível que o produto não usa |
| `Cross-Origin-Opener-Policy` | `same-origin` | isola o browsing context (XS-Leaks) |
| `X-DNS-Prefetch-Control` | `off` | não pré-resolve host de conteúdo de terceiro |
| `X-Powered-By` | **removido** (`poweredByHeader: false`) | o item nomeado pelo finding |

**Dinâmicos** (`apps/web/proxy.ts` — dependem da requisição):

| Cabeçalho | Regra |
|---|---|
| `Content-Security-Policy` | **enforcing**, com **nonce por requisição**, `'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=63072000` — **somente** quando o esquema efetivo é HTTPS |

## 4. Fora do escopo

- Cabeçalhos no **Traefik/Coolify** (a borda de infra): esta Story resolve **no origin**, que é onde
  o código alcança. R1 (segmentação L3) e M1 (backup periódico) seguem bloqueadores independentes.
- Cabeçalhos na **API** (`apps/api`): a API não é falada pelo browser diretamente (o BFF a
  intermedeia) e `apps/api` é lane da Writer A/E4 — **não tocada aqui**.
- CSP `report-uri`/`report-to` e coletor de violações (exige endpoint e decisão de Ops).
- Docker, PostgreSQL, volumes — **explicitamente proibidos** nesta lane.

## 5. Decisões (D)

- **D-S1-1 — CSP enforcing, não Report-Only.** `Content-Security-Policy-Report-Only` **não** fecha o
  finding: navegador nenhum bloqueia nada em Report-Only. Report-Only é etapa de investigação e, se
  fosse o estado final entregue, o veredito correto seria `S1_PARTIAL_REQUIRES_ENFORCING_CSP`.
  Entregamos **enforcing** e provamos em resposta HTTP real de runtime de produção.
- **D-S1-2 — nonce por requisição, não `unsafe-inline` em `script-src`.** O nonce é gerado no
  `proxy.ts` e propagado ao Next pelo header **de requisição** `Content-Security-Policy`, de onde o
  Next o aplica automaticamente aos scripts que ele mesmo injeta (padrão canônico do Next 16,
  confirmado no gate documental). Consequência: `script-src` **não** contém `'unsafe-inline'`.
- **D-S1-3 — `'unsafe-eval'` jamais em produção.** Entra **apenas** quando
  `NODE_ENV !== 'production'`, porque o servidor de desenvolvimento do Next depende de `eval`.
  A build de produção não.
- **D-S1-4 — HSTS sem `includeSubDomains` e sem `preload`.** Os dois têm alcance maior que este
  repositório: `includeSubDomains` afeta **todos** os subdomínios do domínio servido (inclusive os
  que não conhecemos e os que talvez não falem HTTPS), e `preload` é **praticamente irreversível**
  (remoção da lista leva meses). Nenhum inventário de domínios foi confirmado → emitimos só
  `max-age`. Débito **`DEB-S1-HSTS-SUBDOMAINS`**.
- **D-S1-5 — HSTS só sobre HTTPS.** A RFC 6797 manda o browser **ignorar** HSTS recebido sobre
  transporte não seguro; emitir sobre HTTP é ruído que ainda por cima faria um teste local "provar"
  algo que o browser descarta. O esquema efetivo vem do `x-forwarded-proto` do hop confiável
  (Traefik → Web, D-01) ou do protocolo da própria URL.
- **D-S1-6 — `upgrade-insecure-requests` só sobre HTTPS.** Numa página HTTP a diretiva não tem
  sentido e pode quebrar subrecurso; sobre HTTPS ela é a rede de segurança contra conteúdo misto.

## 6. Critérios de aceite

1. **Given** uma resposta de página da Web servida em runtime de produção **When** inspecionada
   **Then** contém `Content-Security-Policy` **enforcing** (não `-Report-Only`), com `nonce-…`,
   `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
2. **Given** a mesma resposta **When** inspecionada **Then** **não** contém `X-Powered-By` e contém
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` e
   `Permissions-Policy`.
3. **Given** a CSP de uma build de **produção** **When** inspecionada **Then** **não** contém
   `'unsafe-eval'`; `script-src` **não** contém `'unsafe-inline'`.
4. **Given** duas requisições distintas **When** comparadas **Then** os nonces são **diferentes**
   (um nonce fixo é equivalente a `unsafe-inline`).
5. **Given** uma requisição com esquema efetivo **HTTPS** **When** respondida **Then** emite
   `Strict-Transport-Security: max-age=63072000` — **sem** `includeSubDomains`/`preload`.
6. **Given** uma requisição HTTP simples **When** respondida **Then** **não** emite HSTS.
7. **Given** a casca navegável, o login e o painel **When** carregados com a CSP enforcing ativa
   **Then** funcionam sem violação de CSP que impeça render ou interação.
8. **Given** o comportamento de sessão de 1.5 **When** a Story é aplicada **Then** proteção de rota
   e deslize de cookie permanecem **inalterados** (regressão verde).

## 7. Estratégia de evidência

Um teste que apenas importasse `next.config.ts` provaria que um objeto literal tem as chaves que
escrevemos nele — não que o servidor emite os cabeçalhos. Por isso a prova é em três camadas:

1. **Unidade** (`apps/web/test/cabecalhos-seguranca.test.ts`) — o núcleo **puro** da política:
   diretivas, ausência de `'unsafe-eval'` em produção, unicidade do nonce, forma do HSTS.
2. **Proxy real** (mesmo arquivo) — invoca `proxy()` com um `NextRequest` real e afirma os
   cabeçalhos **da resposta**, incluindo o par requisição/resposta do nonce.
3. **Aplicação servida** (`scripts/smoke.mjs`) — `GET` real contra a Web **de pé** e afirmação dos
   cabeçalhos na resposta HTTP. No CI isso roda no job `containers`, contra a **imagem de
   produção** (`next start`, `NODE_ENV=production`) — o runtime semelhante à produção que o gate
   exige. Quando `WEB_URL` é `https://` (staging), o smoke **também** exige o HSTS.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| CSP quebra estilo (Tailwind 4 / `next/font` injetam `<style>`) | verificação empírica na aplicação servida antes do PR; se o nonce não alcançar o estilo, `'unsafe-inline'` fica **restrito a `style-src`**, com justificativa, débito `DEB-S1-CSP-STYLE-NONCE` e revisão de segurança |
| Ampliar o `matcher` do `proxy.ts` altera comportamento de sessão (1.5) | o deslize do cookie continua **condicionado à rota protegida**; regressão de `casca`/`navegacao`/`session` no gate |
| `'strict-dynamic'` invalida allowlist em browser antigo | aceito: o produto é interno e a alternativa (allowlist de host) é mais fraca |

## 9. Rollback

Reverter o commit. Não há migration, tabela, GRANT, dado, contrato de API nem estado persistido —
o rollback é textual e imediato, e o único efeito residual possível é o `max-age` de HSTS já
entregue a browsers (por isso `includeSubDomains`/`preload` ficaram de fora).
