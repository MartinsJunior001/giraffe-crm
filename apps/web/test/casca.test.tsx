// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Sem globals:true, o auto-cleanup do Testing Library não roda; desmontamos entre testes.
afterEach(cleanup);
import { Navegacao } from '@/app/painel/_componentes/Navegacao';
import { Topbar } from '@/app/painel/_componentes/Topbar';
import type { ItemNav } from '@/lib/navegacao';

// A Sidebar é Client Component: mockamos o pathname (item ativo) e o Link (render determinístico).
vi.mock('next/navigation', () => ({ usePathname: () => '/painel' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ITENS: ItemNav[] = [{ href: '/painel', rotulo: 'Dashboard', icone: 'LayoutDashboard' }];

describe('Navegação', () => {
  it('marca o item ativo com aria-current="page" e não só por cor (fundo accent + peso)', () => {
    render(<Navegacao itens={ITENS} />);
    const link = screen.getByRole('link', { name: /Dashboard/ });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.className).toContain('bg-accent');
    expect(link.className).toContain('font-semibold');
  });

  it('renderiza somente os itens recebidos — item filtrado pelo servidor não aparece', () => {
    render(<Navegacao itens={ITENS} />);
    // Um item de admin que o servidor não enviou simplesmente não existe no DOM (não revela recurso).
    expect(screen.queryByRole('link', { name: /Admin/ })).toBeNull();
  });

  it('expõe a navegação com um nome acessível', () => {
    render(<Navegacao itens={ITENS} />);
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
  });
});

describe('Topbar', () => {
  it('mostra a Organização atual', () => {
    render(<Topbar orgNome="Organização A" />);
    expect(screen.getByText('Organização A')).toBeInTheDocument();
  });

  it('Busca/Notificações/Perfil são espaços reservados — sem controle funcional', () => {
    const { container } = render(<Topbar orgNome="Org" />);
    // Nenhum link e nenhum botão: os marcadores são divs não-interativas (sem controle falso).
    expect(container.querySelectorAll('a, button, input').length).toBe(0);
    expect(container.querySelector('[data-reservado="busca"]')).toBeTruthy();
    expect(container.querySelector('[data-reservado="notificacoes"]')).toBeTruthy();
  });
});
