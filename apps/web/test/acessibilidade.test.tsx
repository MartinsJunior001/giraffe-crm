// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Sem globals:true, o auto-cleanup do Testing Library não roda; desmontamos entre testes.
afterEach(cleanup);

import { Botao } from '@/components/ui/button';
import { Navegacao } from '@/app/painel/_componentes/Navegacao';
import type { ItemNav } from '@/lib/navegacao';

vi.mock('next/navigation', () => ({ usePathname: () => '/painel' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ITENS: ItemNav[] = [{ href: '/painel', rotulo: 'Dashboard', icone: 'LayoutDashboard' }];

/**
 * Piso de acessibilidade transversal (Story 1.8, AC4 / WCAG 2.2 AA), provável no unitário:
 * foco visível, nomes acessíveis, ordem de foco = ordem de DOM (sem tabindex positivo). Tab nativo
 * e contraste renderizado ficam para verificação manual/e2e (fora do que o jsdom observa).
 */
describe('Foco visível (WCAG 2.4.7 / 1.4.11)', () => {
  it('o Botão sempre traz o anel de foco', () => {
    render(<Botao>Salvar</Botao>);
    expect(screen.getByRole('button', { name: 'Salvar' }).className).toContain(
      'focus-visible:ring-2',
    );
  });

  it('cada link de navegação traz o anel de foco', () => {
    render(<Navegacao itens={ITENS} orientacao="vertical" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('focus-visible:ring-2');
    }
  });
});

describe('Nome acessível e ordem de foco', () => {
  it('a navegação tem nome acessível em ambas as orientações', () => {
    render(
      <>
        <Navegacao itens={ITENS} orientacao="vertical" />
        <Navegacao itens={ITENS} orientacao="horizontal" />
      </>,
    );
    // As duas orientações expõem o mesmo nome acessível (uma aparece por vez via media query).
    expect(screen.getAllByRole('navigation', { name: 'Navegação principal' }).length).toBe(2);
  });

  it('nenhum controle usa tabindex positivo (ordem de foco = ordem do DOM, WCAG 2.4.3)', () => {
    const { container } = render(<Navegacao itens={ITENS} orientacao="horizontal" />);
    for (const el of container.querySelectorAll('[tabindex]')) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });

  it('todo link tem nome acessível (não há ícone sem rótulo)', () => {
    render(<Navegacao itens={ITENS} orientacao="vertical" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAccessibleName();
    }
  });
});
