// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Botao, variantesBotao } from '@/components/ui/button';

// Sem globals:true, o auto-cleanup do Testing Library não roda; desmontamos entre testes para não
// acumular DOM (renders somados geram "múltiplos elementos").
afterEach(cleanup);

describe('Botao', () => {
  it('usa type="button" por padrão — não submete um <form> sem querer', () => {
    render(<Botao>Salvar</Botao>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('type', 'button');
  });

  it('aplica a variante e mantém o foco visível (ring)', () => {
    render(<Botao variante="destructive">Excluir</Botao>);
    const btn = screen.getByRole('button', { name: 'Excluir' });
    expect(btn.className).toContain('bg-destructive');
    expect(btn.className).toContain('focus-visible:ring-ring');
  });

  it('variantesBotao gera classes distintas por variante', () => {
    expect(variantesBotao({ variante: 'primary' })).toContain('bg-primary');
    expect(variantesBotao({ variante: 'secondary' })).toContain('bg-muted');
    expect(variantesBotao({ variante: 'tertiary' })).toContain('bg-transparent');
  });
});
