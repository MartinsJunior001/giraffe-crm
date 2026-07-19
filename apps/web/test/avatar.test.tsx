// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar, iniciaisDe } from '@/components/ui/avatar';

// Sem globals:true, o auto-cleanup do Testing Library não roda; desmontamos entre testes.
afterEach(cleanup);

/**
 * Avatar e o fallback por iniciais (Story 3.10 / FR-32). O que se prova aqui é que **nenhum caminho de falha
 * quebra a UI**: sem avatar, com a capacidade de arquivos desligada (que chega como `src` ausente), ou com a
 * imagem falhando ao carregar, o usuário sempre vê iniciais legíveis — nunca uma imagem partida.
 */

describe('iniciaisDe', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(iniciaisDe('Ana Silva')).toBe('AS');
    expect(iniciaisDe('Ana Maria Silva')).toBe('AS');
  });

  it('com um nome só, usa uma inicial', () => {
    expect(iniciaisDe('Ana')).toBe('A');
  });

  it('preserva acentuação (não normaliza para ASCII)', () => {
    expect(iniciaisDe('Ávila Óliveira')).toBe('ÁÓ');
  });

  it('tolera espaços extras', () => {
    expect(iniciaisDe('   Ana    Silva   ')).toBe('AS');
  });

  it('nome vazio ou em branco cai em `?` — nunca uma caixa vazia', () => {
    expect(iniciaisDe('')).toBe('?');
    expect(iniciaisDe('    ')).toBe('?');
  });
});

describe('<Avatar />', () => {
  it('sem `src`, mostra as iniciais', () => {
    render(<Avatar nome="Ana Silva" />);
    expect(screen.getByTestId('avatar-iniciais')).toHaveTextContent('AS');
    expect(screen.queryByRole('img', { hidden: true })).not.toHaveAttribute('src');
  });

  it('`src` nulo (sem avatar / capacidade desligada) mostra as iniciais', () => {
    render(<Avatar nome="Ana Silva" src={null} />);
    expect(screen.getByTestId('avatar-iniciais')).toHaveTextContent('AS');
  });

  it('com `src`, mostra a imagem servida pela API', () => {
    const { container } = render(<Avatar nome="Ana Silva" src="/me/avatar/download" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/me/avatar/download');
  });

  it('se a imagem falha ao carregar, cai nas iniciais sem quebrar', () => {
    const { container } = render(<Avatar nome="Ana Silva" src="/me/avatar/download" />);
    fireEvent.error(container.querySelector('img')!);

    expect(screen.getByTestId('avatar-iniciais')).toHaveTextContent('AS');
    expect(container.querySelector('img')).toBeNull();
  });

  it('o rótulo acessível é o mesmo com imagem ou com iniciais', () => {
    const comImagem = render(<Avatar nome="Ana Silva" src="/me/avatar/download" />);
    expect(comImagem.getByRole('img')).toHaveAccessibleName('Avatar de Ana Silva');
    comImagem.unmount();

    render(<Avatar nome="Ana Silva" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Avatar de Ana Silva');
  });

  it('a URL nunca é do storage — a imagem vem da API, sob sessão (sem presigned)', () => {
    const { container } = render(<Avatar nome="Ana Silva" src="/me/avatar/download" />);
    const src = container.querySelector('img')!.getAttribute('src')!;
    expect(src.startsWith('/')).toBe(true);
    expect(src).not.toMatch(/amazonaws|minio|X-Amz-Signature|\?.*Expires/i);
  });
});
