# TECH-S1 — Evidência de execução

Coleta real, em `E:/curso.js/wt-s1-borda`, base `origin/main` `3032702`. Nenhum resultado abaixo é
inferido do código: todos vieram de execução.

## 1. Gates de qualidade

| Gate | Resultado |
|---|---|
| `pnpm --filter @giraffe/web typecheck` | limpo |
| `pnpm lint` (ESLint 9 flat, repositório inteiro) | limpo |
| `pnpm format:check` (Prettier 3) | `All matched files use Prettier code style!` |
| `pnpm --filter @giraffe/web test` | **19 arquivos, 122 testes, 122 passed** |
| `pnpm --filter @giraffe/web build` | `✓ Compiled successfully in 83s`, `ƒ Proxy (Middleware)` registrado |

Os 122 incluem os **23** casos novos de `test/cabecalhos-seguranca.test.ts` e a regressão inteira da
Web (casca, navegação, sessão, proxy, CSRF, hop interno, avatar, acessibilidade).

## 2. Fase vermelha — os testes falham quando a política é quebrada

Um teste que nunca falhou não é evidência. Duas quebras deliberadas, revertidas em seguida:

**Quebra 1 — `'unsafe-eval'` incondicional + `upgrade-insecure-requests` incondicional:**

```
× em PRODUÇÃO não contém `unsafe-eval` — a primitiva que a CSP existe para tirar
× `upgrade-insecure-requests` só existe quando a página já é HTTPS
× em produção, a CSP servida não carrega `unsafe-eval`
  Tests  3 failed | 19 passed (22)
```

**Quebra 2 — deslize de cookie sem o gate de rota protegida + HSTS incondicional:**

```
× NÃO emite HSTS em HTTP simples — a RFC 6797 manda o browser ignorá-lo
× rota PÚBLICA com cookie NÃO desliza — o alcance do deslize não mudou junto com o matcher
× /logout NÃO tem o cookie re-emitido pelo proxy — deslizar ali desfaria o logout
  Tests  3 failed | 19 passed (22)
```

A segunda quebra é a que justifica o teste do `/logout`: ampliar o `matcher` sem gatear o deslize
faria o proxy re-emitir o cookie que o handler de logout acabou de apagar — logout que não desloga.

**Fase vermelha do smoke** (servidor nu, 200 OK sem cabeçalho, emitindo `X-Powered-By`):

```
FAIL  WEB / cabeçalhos de segurança      -> corpo inválido: cabeçalho ausente: content-security-policy
FAIL  WEB /login cabeçalhos de segurança -> corpo inválido: cabeçalho ausente: content-security-policy
```

## 3. Aplicação SERVIDA — build de produção (`next start`, `NODE_ENV=production`)

`GET /login`, resposta real:

```
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
X-DNS-Prefetch-Control: off
content-security-policy: default-src 'self'; script-src 'self' 'nonce-qkL0pflq8sTF2O4yM5BTkw==' 'strict-dynamic'; style-src 'self' 'nonce-qkL0pflq8sTF2O4yM5BTkw=='; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

- **`Content-Security-Policy` — enforcing.** Não há `-Report-Only` na resposta.
  → **`S1_PARTIAL_REQUIRES_ENFORCING_CSP` não se aplica.**
- **Sem `'unsafe-eval'`** (build de produção) e **sem `'unsafe-inline'` em nenhuma diretiva**.
- **`X-Powered-By` ausente** em `/`, `/login` e `/healthz` — o item nomeado pelo finding.
- Cabeçalhos estáticos valem **também para asset** (`/_next/static/chunks/*.js` responde com
  `nosniff` e `DENY`).

**Nonce aplicado pelo framework** — o HTML servido traz o nonce em tudo que o Next injeta:

```html
<link rel="stylesheet" href="/_next/static/chunks/42rtdq-quc9__.css" nonce="qkL0pflq8sTF2O4yM5BTkw==" ...>
<script src="/_next/static/chunks/turbopack-....js" async nonce="qkL0pflq8sTF2O4yM5BTkw=="></script>
<script nonce="qkL0pflq8sTF2O4yM5BTkw==">(self.__next_f=self.__next_f||[]).push([0])</script>
link: <...woff2>; rel=preload; as="font"; nonce="qkL0pflq8sTF2O4yM5BTkw=="; type="font/woff2"
```

É isso que dispensou `'unsafe-inline'` em `style-src`: o `<style>`/`<link>` do Tailwind e do
`next/font` recebem o nonce. **`DEB-S1-CSP-STYLE-NONCE` não precisou ser aberto.**

**Esquema efetivo** (D-S1-5 / D-S1-6), mesma rota, mesma build:

| Requisição | `Strict-Transport-Security` | `upgrade-insecure-requests` |
|---|---|---|
| HTTP simples | **ausente** (RFC 6797 manda ignorar) | ausente |
| `x-forwarded-proto: https` | `max-age=63072000` | presente |

Sem `includeSubDomains`, sem `preload` (D-S1-4).

**Rota protegida sem sessão** (`GET /painel`): `307` para `/login` **com a CSP na resposta do
redirect** — não há resposta nua. Comportamento da Story 1.5 preservado.

> Nota honesta: a primeira tentativa de subir o servidor devolveu `500` no `/painel`. A causa foi
> **minha**, de ambiente — exportei `PUBLIC_ORIGIN` em vez de `WEB_PUBLIC_ORIGIN`, e
> `getPublicOrigin()` falha fail-fast, como deve. Corrigida a variável, `307`. Registrado aqui
> porque um `500` observado e não explicado é exatamente o tipo de coisa que não pode virar nota de
> rodapé.

## 4. Browser real — zero violação de CSP

Playwright, Chromium, contra a build de produção servida:

| Página | Erros de console |
|---|---|
| `/login` | 1 — `404 favicon.ico` (**preexistente**, a app não tem favicon; nada a ver com CSP) |
| `/` | 0 |

**Nenhuma violação de `Content-Security-Policy`** em nenhuma das páginas. A UI renderiza estilizada
(o `<link>` do Tailwind carrega com nonce).

Verificação complementar: `style="..."` inline (que nonce **não** cobre) — **0 ocorrências** em
`/`, `/login` e `/painel`, e 0 no código-fonte da app. Tailwind é classe, não estilo inline.

## 5. HSTS em HTTPS representativo — pendência honesta

O item 6 do gate exige validação de HSTS numa **resposta HTTPS representativa**. Localmente só há
HTTP, e o que está provado acima é: *dado esquema efetivo HTTPS, o HSTS é emitido com o valor
exato*. A validação ponta a ponta sobre TLS real acontece no **staging atrás do Traefik**, e o
`smoke.mjs` já a impõe: quando `WEB_URL` começa com `https://`, a **ausência** de
`Strict-Transport-Security` é falha do smoke. Isso fica como o passo de verificação de staging,
não como algo que esta Story possa declarar sozinha.

## 6. Veredito

`S1_RESOLVED` **no origin** — CSP enforcing comprovada em resposta HTTP real de runtime de
produção, `X-Powered-By` removido, demais cabeçalhos presentes, sem `unsafe-eval`, sem
`unsafe-inline`.

Ressalva de alcance, não de qualidade: o finding S1 nasceu de uma varredura de **borda de staging**.
Esta entrega resolve o que o **código** controla (o origin). Cabeçalho adicionado na camada
Traefik/Coolify, se Ops quiser defesa em profundidade, é decisão de infra — fora desta lane, como
R1 (segmentação L3) e M1 (backup periódico).
