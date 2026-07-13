// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

// Sem globals:true, o auto-cleanup do Testing Library não roda; desmontamos entre testes.
afterEach(cleanup);

import { Carregando, Estado, EstadoErro, EstadoVazio, SemPermissao } from '@/components/ui/estado';
import { Inbox } from 'lucide-react';

describe('Estado (base) — nunca só cor (AC1)', () => {
  it('combina ícone (aria-hidden) + texto + token semântico', () => {
    const { container } = render(<Estado icone={Inbox} titulo="Título" descricao="Detalhe" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden');
    // O ícone é decorativo: a informação está no texto, não só na cor/ícone.
    expect(screen.getByText('Título')).toBeInTheDocument();
    expect(screen.getByText('Detalhe')).toBeInTheDocument();
  });
});

describe('Distinção carregando × vazio × erro (AC2)', () => {
  it('Carregando é status e marca aria-busy', () => {
    render(<Carregando />);
    const regiao = screen.getByRole('status');
    expect(regiao).toHaveAttribute('aria-busy', 'true');
  });

  it('EstadoVazio é status SEM aria-busy e SEM tom de erro (zero legítimo ≠ falha/carregando)', () => {
    render(<EstadoVazio titulo="Nada por aqui ainda" />);
    const regiao = screen.getByRole('status');
    expect(regiao).not.toHaveAttribute('aria-busy');
    // Não é alerta e o título não usa o token destructive.
    expect(screen.queryByRole('alert')).toBeNull();
    const titulo = within(regiao).getByText('Nada por aqui ainda');
    expect(titulo.className).not.toContain('text-destructive');
  });

  it('EstadoErro é alert e usa o token destructive', () => {
    render(<EstadoErro titulo="Não foi possível carregar" />);
    const regiao = screen.getByRole('alert');
    expect(regiao).toBeInTheDocument();
    const titulo = within(regiao).getByText('Não foi possível carregar');
    expect(titulo.className).toContain('text-destructive');
    // Erro nunca aparenta sucesso.
    expect(titulo.className).not.toContain('text-success');
  });
});

describe('SemPermissao — não revela recurso (AC3)', () => {
  it('mensagem genérica, sem nome de recurso e sem link para ele', () => {
    const { container } = render(<SemPermissao />);
    // Estado informativo, não falha do sistema.
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Mensagem genérica (não nomeia rota/recurso) e nenhum link que revele/leve ao recurso.
    expect(screen.getByText(/não tem acesso/i)).toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
  });
});
