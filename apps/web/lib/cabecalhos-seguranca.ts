/**
 * Política de cabeçalhos de segurança da borda pública (finding **S1** do veredito de staging,
 * `docs/04-operacao/veredito-staging-provisorio.md` — bloqueador de PRODUÇÃO).
 *
 * A Web é a única superfície que fala com o browser: o BFF intermedeia a API, então é aqui que
 * cabeçalho de segurança tem efeito. O módulo é **puro** — recebe o que descreve a requisição e
 * devolve strings. Quem escreve na resposta é o `proxy.ts` (dinâmicos) e o `next.config.ts`
 * (estáticos); isso mantém a política testável sem servidor e sem mock de framework.
 */

/**
 * Dois anos, o valor que a documentação do Next usa como referência.
 *
 * **Sem `includeSubDomains` e sem `preload`, deliberadamente** (D-S1-4): os dois têm alcance maior
 * que este repositório. `includeSubDomains` impõe HTTPS a TODOS os subdomínios do domínio servido
 * — inclusive os que não conhecemos e os que talvez ainda falem HTTP — e `preload` é, na prática,
 * irreversível (sair da lista dos browsers leva meses). Nenhum inventário de domínios foi
 * confirmado, então prometer por eles seria um chute com raio de alcance de anos.
 * Débito registrado: `DEB-S1-HSTS-SUBDOMAINS`.
 */
export const HSTS_MAX_AGE_S = 63072000;

/** Valor exato do `Strict-Transport-Security` emitido. */
export const HSTS_VALOR = `max-age=${HSTS_MAX_AGE_S}`;

/**
 * Cabeçalhos que não dependem da requisição — aplicados pelo `next.config.ts` a **toda** resposta,
 * inclusive assets estáticos (que o `matcher` do proxy exclui de propósito, para não gastar um
 * nonce por arquivo servido).
 *
 * `X-Frame-Options` é redundante com `frame-ancestors 'none'` da CSP para browser moderno; fica
 * porque o custo é um header e o benefício é cobrir quem não implementa a diretiva.
 */
export const CABECALHOS_ESTATICOS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nega explicitamente as APIs sensíveis que o produto não usa. Uma permissão que ninguém pede
  // não deveria depender do default do browser mudar a nosso favor.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/**
 * Gera o nonce da requisição.
 *
 * 16 bytes de `crypto.getRandomValues` — **Web Crypto apenas**, sem `Buffer`: o proxy do Next roda
 * no runtime de edge, onde `Buffer` não existe. Um nonce precisa ser imprevisível E irrepetível:
 * nonce fixo (ou derivado de algo estável) é `'unsafe-inline'` com etapa a mais, porque o atacante
 * que descobre o valor passa a injetar script válido.
 */
export function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decide se o esquema **efetivo** da requisição é HTTPS.
 *
 * Atrás do Traefik o processo Next recebe HTTP no socket interno — o TLS termina no proxy. Quem
 * conta a verdade é o `x-forwarded-proto` do hop confiável (D-01). Na ausência dele (dev, ou
 * acesso direto), vale o protocolo da própria URL.
 *
 * Um cliente poderia forjar `x-forwarded-proto: https`. O pior efeito é ele receber um HSTS que
 * pediu — não há decisão de autorização, de dado ou de sessão pendurada aqui, então a forja não
 * compra nada além de um cabeçalho para si mesmo.
 */
export function ehEsquemaHttps(forwardedProto: string | null, urlProtocol: string): boolean {
  if (forwardedProto !== null) {
    // A cadeia pode trazer mais de um valor (`https, http`); o primeiro é o do cliente original.
    const primeiro = forwardedProto.split(',')[0]?.trim().toLowerCase();
    if (primeiro === 'https') return true;
    if (primeiro === 'http') return false;
  }
  return urlProtocol === 'https:';
}

/** O que a política precisa saber sobre o contexto para montar a CSP. */
export interface ContextoCsp {
  /** Nonce desta requisição. */
  readonly nonce: string;
  /** `true` na build de produção. Só o servidor de desenvolvimento precisa de `eval`. */
  readonly producao: boolean;
  /** `true` quando a página já é servida sobre HTTPS. */
  readonly https: boolean;
}

/**
 * Monta a **CSP enforcing** da aplicação.
 *
 * Enforcing, não `Report-Only` (D-S1-1): Report-Only não bloqueia nada — é instrumento de
 * investigação. Entregar Report-Only como estado final seria declarar o S1 resolvido sem que uma
 * única injeção deixasse de executar.
 *
 * Escolhas que merecem justificativa:
 *
 * - **`script-src` com nonce + `'strict-dynamic'`, sem `'unsafe-inline'`.** O nonce viaja também no
 *   header de REQUISIÇÃO (ver `proxy.ts`), de onde o Next o aplica aos scripts que ele próprio
 *   injeta; `'strict-dynamic'` deixa esses scripts confiados carregarem os chunks seguintes sem
 *   allowlist de host — que, num app com hash em nome de arquivo, seria burla fácil.
 * - **`'unsafe-eval'` só fora de produção (D-S1-3).** O dev server do Next depende de `eval`; a
 *   build de produção não. Produção com `'unsafe-eval'` devolveria ao atacante exatamente a
 *   primitiva que a CSP existe para tirar.
 * - **`object-src 'none'`, `base-uri 'self'`** — `<object>`/`<embed>` são vetor legado de execução
 *   e um `<base>` injetado reescreve o destino de todo caminho relativo da página.
 * - **`form-action 'self'`** — impede que uma injeção aponte o POST do login para fora.
 * - **`frame-ancestors 'none'`** — clickjacking, a versão moderna do `X-Frame-Options`.
 * - **`upgrade-insecure-requests` só sobre HTTPS (D-S1-6)** — numa página HTTP a diretiva não tem
 *   o que proteger e ainda pode quebrar subrecurso legítimo.
 */
export function montarCsp({ nonce, producao, https }: ContextoCsp): string {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(producao ? [] : ["'unsafe-eval'"]),
  ].join(' ');

  const diretivas = [
    "default-src 'self'",
    `script-src ${script}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // `blob:`/`data:` cobrem pré-visualização local de imagem (avatar) sem abrir host de terceiro.
    "img-src 'self' blob: data:",
    // As fontes são self-hospedadas pelo `next/font` — nenhum host externo é necessário.
    "font-src 'self'",
    // O front só fala com a própria origem: quem conversa com a API é o BFF, no servidor.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ];

  return diretivas.join('; ');
}
