/**
 * Resolve a URL base da API interna. Variável de SERVIDOR (`API_BASE_URL`) —
 * NÃO usa o prefixo `NEXT_PUBLIC_` porque não deve ser inlinada no bundle do
 * browser: é lida server-side (no compose aponta para `http://api:3001`, uma
 * URL da rede interna inalcançável pelo browser). Nenhum segredo aqui.
 */
export function getApiBaseUrl(raw: string | undefined = process.env.API_BASE_URL): string {
  const url = (raw ?? '').trim();
  if (!url) {
    throw new Error('API_BASE_URL ausente: configure a URL base da API interna (server-side).');
  }
  return url.replace(/\/+$/, '');
}

/**
 * Segredo do hop Web→API autenticado (D-01). Variável de SERVIDOR (`INTERNAL_HMAC_SECRET`) —
 * jamais `NEXT_PUBLIC_`, jamais no bundle do browser. **Opcional**: ausente = modo direto (dev/CI), a
 * Web não assina e a API resolve o IP pelo socket. Presente (staging/produção) = a Web assina cada
 * chamada BFF→API que carrega o IP do cliente, e a API passa a exigir a prova.
 *
 * Devolve `undefined` quando ausente/vazio; caso contrário `{ secret, keyVersion }`.
 */
export function getInternalHmac(
  raw: string | undefined = process.env.INTERNAL_HMAC_SECRET,
  versaoRaw: string | undefined = process.env.INTERNAL_HMAC_KEY_VERSION,
): { secret: string; keyVersion: number } | undefined {
  const secret = (raw ?? '').trim();
  if (!secret) return undefined;
  const versao = Number(versaoRaw ?? '1');
  const keyVersion = Number.isInteger(versao) && versao > 0 ? versao : 1;
  return { secret, keyVersion };
}

/**
 * Origem PÚBLICA da Web (`WEB_PUBLIC_ORIGIN`) — a URL pela qual o BROWSER nos alcança.
 *
 * Existe porque `req.nextUrl.origin` NÃO é confiável atrás de proxy: no standalone do Next, ele
 * reflete o bind interno do servidor (`0.0.0.0:3000` no container), não o domínio público — visto
 * em staging, onde o `Origin` enviado à API virava `https://0.0.0.0:3000` e o `trustedOrigins` do
 * Better Auth recusava o login. Derivar de header (`Host`/`X-Forwarded-Host`) trocaria um valor
 * errado por um valor FORJÁVEL; a origem é CONFIGURAÇÃO, determinística, como `API_BASE_URL`.
 *
 * Usos: o header `Origin` do relay BFF (precisa constar em `CORS_ALLOWED_ORIGINS` da API) e o
 * fallback da checagem CSRF. Redirects NÃO a usam — são relativos, o browser resolve sozinho.
 *
 * Fail-fast em produção (ausente ⇒ erro honesto, só o NOME da variável); em dev/test o padrão é
 * a origem local, para `pnpm dev` funcionar sem configuração.
 */
export function getPublicOrigin(
  raw: string | undefined = process.env.WEB_PUBLIC_ORIGIN,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  const bruto = (raw ?? '').trim();
  if (!bruto) {
    if (nodeEnv === 'production') {
      throw new Error(
        'WEB_PUBLIC_ORIGIN ausente: configure a origem pública da Web (ex.: https://crm.exemplo.com).',
      );
    }
    return 'http://localhost:3000';
  }
  try {
    // `URL.origin` normaliza (esquema minúsculo, sem path/barra final) e valida de graça.
    return new URL(bruto).origin;
  } catch {
    throw new Error(
      'WEB_PUBLIC_ORIGIN inválida: use uma URL absoluta (ex.: https://crm.exemplo.com).',
    );
  }
}
