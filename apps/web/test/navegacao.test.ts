import { describe, expect, it } from 'vitest';
import { ehAtivo, itensVisiveis, type ItemNav } from '@/lib/navegacao';

/**
 * O filtro de navegação é UX, não segurança (a autorização é do servidor — 1.6). Estes itens sintéticos
 * com allowlist provam o MECANISMO para os Épicos de domínio; hoje a produção só tem o Dashboard.
 */
const ITENS: ItemNav[] = [
  { href: '/painel', rotulo: 'Dashboard', icone: 'LayoutDashboard' },
  { href: '/admin', rotulo: 'Admin', icone: 'Shield', papeis: ['ADMIN'] },
  { href: '/relatorios', rotulo: 'Relatórios', icone: 'BarChart', papeis: ['ADMIN', 'MEMBER'] },
];

describe('itensVisiveis', () => {
  it('item sem allowlist é visível a todo papel', () => {
    for (const papel of ['ADMIN', 'MEMBER', 'GUEST'] as const) {
      expect(itensVisiveis(papel, ITENS).some((i) => i.href === '/painel')).toBe(true);
    }
  });

  it('item com allowlist só aparece para os papéis listados — o vetado NÃO está no resultado', () => {
    // Fase vermelha: se um item vetado vazasse para o resultado, estas asserções falhariam.
    const guest = itensVisiveis('GUEST', ITENS);
    expect(guest.find((i) => i.href === '/admin')).toBeUndefined();
    expect(guest.find((i) => i.href === '/relatorios')).toBeUndefined();

    const member = itensVisiveis('MEMBER', ITENS);
    expect(member.find((i) => i.href === '/relatorios')).toBeDefined();
    expect(member.find((i) => i.href === '/admin')).toBeUndefined();

    const admin = itensVisiveis('ADMIN', ITENS);
    expect(admin.find((i) => i.href === '/admin')).toBeDefined();
  });
});

describe('ehAtivo', () => {
  it('a raiz do painel casa exatamente (não acende em subrotas)', () => {
    expect(ehAtivo('/painel', '/painel')).toBe(true);
    expect(ehAtivo('/painel', '/painel/x')).toBe(false);
  });

  it('outras rotas casam por prefixo de subrota', () => {
    expect(ehAtivo('/pipes', '/pipes')).toBe(true);
    expect(ehAtivo('/pipes', '/pipes/123')).toBe(true);
    expect(ehAtivo('/pipes', '/pipesX')).toBe(false);
  });
});
