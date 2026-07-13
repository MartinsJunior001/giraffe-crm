import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_SECURE,
  decidirAcesso,
  ehMesmaOrigem,
  rotaExigeSessao,
  temSessao,
} from '../lib/session';

describe('proteção de rota (UX)', () => {
  it('marca as rotas protegidas por prefixo, e só elas', () => {
    expect(rotaExigeSessao('/painel')).toBe(true);
    expect(rotaExigeSessao('/painel/algum-sub')).toBe(true);
    expect(rotaExigeSessao('/login')).toBe(false);
    expect(rotaExigeSessao('/')).toBe(false);
    // Não pode casar por substring frouxa: '/painelzinho' NÃO é uma sub-rota de '/painel'.
    expect(rotaExigeSessao('/painelzinho')).toBe(false);
  });
});

describe('detecção de sessão (dev e produção)', () => {
  it('reconhece o cookie de dev e o `__Secure-` de produção', () => {
    expect(temSessao([SESSION_COOKIE])).toBe(true);
    expect(temSessao([SESSION_COOKIE_SECURE])).toBe(true);
    expect(temSessao(['outro', SESSION_COOKIE_SECURE])).toBe(true);
  });

  it('ausência de cookie de sessão é ausência de sessão', () => {
    expect(temSessao([])).toBe(false);
    expect(temSessao(['carrinho', 'tema'])).toBe(false);
  });
});

describe('decisão do middleware', () => {
  it('rota pública sempre libera, mesmo sem sessão', () => {
    expect(decidirAcesso('/login', [])).toBe('permitir');
    expect(decidirAcesso('/', [])).toBe('permitir');
  });

  it('rota protegida sem sessão vai ao Login; com sessão, libera', () => {
    expect(decidirAcesso('/painel', [])).toBe('login');
    expect(decidirAcesso('/painel', [SESSION_COOKIE])).toBe('permitir');
    expect(decidirAcesso('/painel/x', [SESSION_COOKIE_SECURE])).toBe('permitir');
  });
});

describe('CSRF — mesma origem nos POST de login/logout', () => {
  const EU = 'https://web.giraffe.test';

  it('Sec-Fetch-Site=same-origin ⇒ aceita', () => {
    expect(ehMesmaOrigem('same-origin', null, EU)).toBe(true);
  });

  it('Sec-Fetch-Site cross-site/same-site ⇒ recusa (login CSRF)', () => {
    expect(ehMesmaOrigem('cross-site', 'https://evil.test', EU)).toBe(false);
    // `same-site` também recusa: nossa topologia é single-origin; um subdomínio irmão não basta.
    expect(ehMesmaOrigem('same-site', null, EU)).toBe(false);
    expect(ehMesmaOrigem('none', null, EU)).toBe(false);
  });

  it('sem Sec-Fetch-Site, cai no Origin: só a própria origem passa', () => {
    expect(ehMesmaOrigem(null, EU, EU)).toBe(true);
    expect(ehMesmaOrigem(null, 'https://evil.test', EU)).toBe(false);
  });

  it('sem nenhum sinal de origem ⇒ recusa (fail-closed)', () => {
    expect(ehMesmaOrigem(null, null, EU)).toBe(false);
  });
});
