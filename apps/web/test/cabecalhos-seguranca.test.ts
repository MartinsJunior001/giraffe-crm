import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import {
  CABECALHOS_ESTATICOS,
  HSTS_VALOR,
  ehEsquemaHttps,
  gerarNonce,
  montarCsp,
} from '@/lib/cabecalhos-seguranca';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * TECH-S1 — hardening de cabeçalhos de borda (finding S1 do veredito de staging).
 *
 * Duas camadas aqui: a política PURA e a função `proxy()` REAL. A terceira camada — a aplicação
 * SERVIDA — é provada pelo `scripts/smoke.mjs`, que roda no job `containers` do CI contra a imagem
 * de produção. A separação importa: um teste que só inspecionasse o objeto exportado provaria que
 * escrevemos as chaves que escrevemos, e continuaria verde se o servidor nunca emitisse nada.
 */

function req(path: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return new NextRequest(new URL(`http://localhost:3000${path}`), { headers: h });
}

// `process.env.NODE_ENV` não é redefinível por `Object.defineProperty` no Node 24 — o stub do
// Vitest é o caminho suportado, e o unstub garante que um teste não contamine o vizinho.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('política de CSP (núcleo puro)', () => {
  const producao = { nonce: 'NONCE', producao: true, https: true };

  it('em PRODUÇÃO não contém `unsafe-eval` — a primitiva que a CSP existe para tirar', () => {
    expect(montarCsp(producao)).not.toContain('unsafe-eval');
  });

  it('em desenvolvimento contém `unsafe-eval` (o dev server do Next depende de eval)', () => {
    expect(montarCsp({ ...producao, producao: false })).toContain("'unsafe-eval'");
  });

  it('`script-src` NUNCA contém `unsafe-inline` — é nonce, não allowlist de inline', () => {
    const scriptSrc = montarCsp(producao)
      .split('; ')
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).toContain("'nonce-NONCE'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it('trava as diretivas que fecham injeção e clickjacking', () => {
    const csp = montarCsp(producao);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('`upgrade-insecure-requests` só existe quando a página já é HTTPS', () => {
    expect(montarCsp(producao)).toContain('upgrade-insecure-requests');
    expect(montarCsp({ ...producao, https: false })).not.toContain('upgrade-insecure-requests');
  });
});

describe('nonce', () => {
  it('é diferente a cada geração — nonce fixo seria `unsafe-inline` com etapa a mais', () => {
    const amostra = new Set(Array.from({ length: 500 }, () => gerarNonce()));
    expect(amostra.size).toBe(500);
  });

  it('é base64 de 16 bytes (entropia suficiente para não ser adivinhado)', () => {
    const nonce = gerarNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(nonce)).toHaveLength(16);
  });
});

describe('HSTS', () => {
  it('não promete por subdomínio nem entra em lista de preload (D-S1-4)', () => {
    expect(HSTS_VALOR).toBe('max-age=63072000');
    expect(HSTS_VALOR).not.toContain('includeSubDomains');
    expect(HSTS_VALOR).not.toContain('preload');
  });
});

describe('esquema efetivo da requisição', () => {
  it('honra o `x-forwarded-proto` do hop confiável (o TLS termina no Traefik)', () => {
    expect(ehEsquemaHttps('https', 'http:')).toBe(true);
    expect(ehEsquemaHttps('http', 'http:')).toBe(false);
  });

  it('usa a PRIMEIRA entrada da cadeia — a do cliente original', () => {
    expect(ehEsquemaHttps('https, http', 'http:')).toBe(true);
    expect(ehEsquemaHttps('http, https', 'http:')).toBe(false);
  });

  it('sem o header, cai no protocolo da própria URL', () => {
    expect(ehEsquemaHttps(null, 'https:')).toBe(true);
    expect(ehEsquemaHttps(null, 'http:')).toBe(false);
  });
});

describe('cabeçalhos estáticos', () => {
  it('cobre todos os itens nomeados pelo finding S1', () => {
    const chaves = CABECALHOS_ESTATICOS.map((c) => c.key);
    expect(chaves).toContain('X-Content-Type-Options');
    expect(chaves).toContain('X-Frame-Options');
    expect(chaves).toContain('Referrer-Policy');
    expect(chaves).toContain('Permissions-Policy');
    const nosniff = CABECALHOS_ESTATICOS.find((c) => c.key === 'X-Content-Type-Options');
    expect(nosniff?.value).toBe('nosniff');
    const frame = CABECALHOS_ESTATICOS.find((c) => c.key === 'X-Frame-Options');
    expect(frame?.value).toBe('DENY');
  });
});

describe('proxy() — cabeçalhos dinâmicos na resposta REAL', () => {
  it('emite CSP ENFORCING (nunca Report-Only) numa rota pública', () => {
    const res = proxy(req('/login'));
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(res.headers.get('content-security-policy-report-only')).toBeNull();
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('o nonce muda a cada requisição', () => {
    const extrair = (r: ReturnType<typeof proxy>) =>
      /'nonce-([^']+)'/.exec(r.headers.get('content-security-policy') ?? '')?.[1];
    expect(extrair(proxy(req('/login')))).not.toBe(extrair(proxy(req('/login'))));
  });

  it('emite HSTS quando o esquema efetivo é HTTPS', () => {
    const res = proxy(req('/login', { 'x-forwarded-proto': 'https' }));
    expect(res.headers.get('strict-transport-security')).toBe(HSTS_VALOR);
  });

  it('NÃO emite HSTS em HTTP simples — a RFC 6797 manda o browser ignorá-lo', () => {
    expect(proxy(req('/login')).headers.get('strict-transport-security')).toBeNull();
  });

  it('a resposta de REDIRECT ao /login também sai com CSP — não há resposta nua', () => {
    const res = proxy(req('/painel'));
    expect(res.status).toBe(307);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });

  it('em produção, a CSP servida não carrega `unsafe-eval`', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(proxy(req('/login')).headers.get('content-security-policy')).not.toContain(
      'unsafe-eval',
    );
  });
});

describe('proxy() — regressão da Story 1.5 com o matcher ampliado', () => {
  it('rota PROTEGIDA com cookie continua deslizando o cookie', () => {
    const res = proxy(req('/painel', { cookie: `${SESSION_COOKIE}=abc` }));
    const set = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(SESSION_COOKIE));
    expect(set).toMatch(/Max-Age=604800/);
  });

  it('rota PÚBLICA com cookie NÃO desliza — o alcance do deslize não mudou junto com o matcher', () => {
    const res = proxy(req('/login', { cookie: `${SESSION_COOKIE}=abc` }));
    expect(res.headers.getSetCookie?.() ?? []).toHaveLength(0);
  });

  it('rota PÚBLICA sem cookie não é redirecionada (o matcher ampliou, a proteção não)', () => {
    const res = proxy(req('/'));
    expect(res.headers.get('location')).toBeNull();
  });

  /**
   * A armadilha do matcher ampliado: o proxy agora roda no `/logout`, que existe justamente para
   * APAGAR o cookie de sessão. Se o deslize valesse para toda rota, o proxy re-emitiria o cookie que
   * o handler acabou de limpar e o logout silenciosamente não deslogaria ninguém.
   */
  it('/logout NÃO tem o cookie re-emitido pelo proxy — deslizar ali desfaria o logout', () => {
    const res = proxy(req('/logout', { cookie: `${SESSION_COOKIE}=abc` }));
    expect(res.headers.getSetCookie?.() ?? []).toHaveLength(0);
  });
});
