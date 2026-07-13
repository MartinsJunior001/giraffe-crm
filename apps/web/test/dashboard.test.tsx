// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Sem globals:true, o auto-cleanup do Testing Library não roda; desmontamos entre testes.
afterEach(cleanup);

const obterContextoMock = vi.fn();
vi.mock('@/lib/contexto', () => ({ obterContexto: () => obterContextoMock() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import DashboardPage from '@/app/painel/page';

/**
 * AC2 sobre a casca real: o Dashboard deve tornar "sem Organização" (zero legítimo) DISTINGUÍVEL de
 * "indisponível" (falha). O contexto é um Server Component async — renderizamos o JSX que ele devolve.
 */
describe('Dashboard — estados honestos (AC2)', () => {
  it('sem-organizacao é um vazio legítimo (status), NÃO um alerta', async () => {
    obterContextoMock.mockResolvedValue({ ok: false, motivo: 'sem-organizacao' });
    render(await DashboardPage());
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('indisponivel é uma falha (alert) com recuperação real — distinta do vazio', async () => {
    obterContextoMock.mockResolvedValue({ ok: false, motivo: 'indisponivel' });
    render(await DashboardPage());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    // Ação de recuperação é um link REAL (recarrega), não um botão falso.
    expect(screen.getByRole('link', { name: /tentar novamente/i })).toHaveAttribute(
      'href',
      '/painel',
    );
  });

  it('org ativa mostra o nome e nenhum estado de vazio/erro', async () => {
    obterContextoMock.mockResolvedValue({
      ok: true,
      orgId: 'o1',
      orgNome: 'Organização A',
      papel: 'ADMIN',
    });
    render(await DashboardPage());
    expect(screen.getByText('Organização A')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
