// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeletorOrganizacao } from '@/app/painel/_componentes/SeletorOrganizacao';
import { Topbar } from '@/app/painel/_componentes/Topbar';

/**
 * Seletor de Organização (Story 1.9 · UX-DR5). Testa COMPORTAMENTO — o que o usuário consegue fazer
 * e o que o componente envia —, não estrutura interna nem texto decorativo.
 *
 * A regra de elegibilidade NÃO é testada aqui como lógica de cliente, e isso é intencional: quem
 * decide quais Organizações existem é a API (só Memberships ACTIVE). O que se prova neste arquivo é
 * que a UI **renderiza exatamente o que recebeu** e não inventa nem completa a lista.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const ORG_A = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  nome: 'Organização A',
  papel: 'ADMIN' as const,
};
const ORG_B = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  nome: 'Organização B',
  papel: 'MEMBER' as const,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockClear();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AC-1 — o seletor só existe quando há escolha a fazer', () => {
  it('UMA Organização: nenhum seletor; a Organização atual fica visível', () => {
    render(<Topbar orgNome="Organização A" organizacoes={[ORG_A]} orgAtual={ORG_A.id} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/Organização A/)).toBeInTheDocument();
  });

  it('DUAS Organizações: o seletor aparece', () => {
    render(<Topbar orgNome="Organização A" organizacoes={[ORG_A, ORG_B]} orgAtual={ORG_A.id} />);

    expect(screen.getByRole('combobox', { name: /Organização/i })).toBeInTheDocument();
  });

  it('lista vazia (falha ao consultar): degrada para exibição, sem seletor quebrado', () => {
    render(<Topbar orgNome="—" organizacoes={[]} orgAtual={null} />);

    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('AC-2 — renderiza exatamente o que o servidor devolveu', () => {
  it('mostra as Organizações recebidas e marca a atual como selecionada', () => {
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_B.id} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe(ORG_B.id);
    expect(screen.getByRole('option', { name: 'Organização A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Organização B' })).toBeInTheDocument();
  });

  it('NÃO inventa opção alguma: uma Organização ausente da lista não aparece', () => {
    // Suspensa/removida/inacessível simplesmente não vem da API — a UI não deve materializá-la.
    render(<SeletorOrganizacao organizacoes={[ORG_A]} atual={ORG_A.id} />);

    expect(screen.queryByRole('option', { name: 'Organização B' })).toBeNull();
    expect(screen.queryByText(/bbbbbbbb/)).toBeNull();
  });

  it('escolha obrigatória: sem preferência válida, exibe o estado explícito', () => {
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={null} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: /Selecione uma Organização/i })).toBeInTheDocument();
  });
});

describe('troca explícita', () => {
  it('envia a Organização escolhida ao servidor e refaz os dados do contexto', async () => {
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_B.id } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/organizacao');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ orgId: ORG_B.id });

    // Invalidação do contexto anterior: refazer os Server Components é o que troca navegação,
    // topbar e conteúdo de uma vez — sem remendo peça a peça no cliente.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('escolher a Organização JÁ atual não dispara requisição', async () => {
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_A.id } });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bloqueia submissões concorrentes enquanto a troca está em curso', async () => {
    // Requisição que não resolve: mantém o componente ocupado durante a asserção.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: ORG_B.id } });

    // O controle fica desabilitado e sinaliza ocupação — é o que impede a segunda troca.
    await waitFor(() => expect(select).toBeDisabled());
    expect(select).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/Trocando/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('erro seguro', () => {
  it('falha da API exibe alerta e NÃO refaz os dados', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_B.id } });

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/não foi possível trocar/i);
    // Sem sucesso, nada do contexto é invalidado — a tela continua coerente com o servidor.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a mensagem de erro NÃO distingue os motivos — a não-enumeração da API é preservada', async () => {
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    for (const status of [400, 404, 500]) {
      fetchMock.mockResolvedValue({ ok: false, status });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_B.id } });
      const alerta = await screen.findByRole('alert');
      // Mensagem idêntica em todos: traduzir 404 em "essa Organização não existe" desfaria, na
      // tela, a proteção que o backend construiu com o 404 uniforme.
      expect(alerta).toHaveTextContent(/não foi possível trocar de organização/i);
    }
  });

  it('falha de rede também vira alerta, sem vazar detalhe técnico', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:3001'));
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_B.id } });

    const alerta = await screen.findByRole('alert');
    expect(alerta).not.toHaveTextContent(/ECONNREFUSED|10\.0\.0\.5|3001/);
  });

  it('o controle é reabilitado após o erro — o usuário não fica preso', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_B.id } });
    await screen.findByRole('alert');

    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
  });
});

describe('acessibilidade', () => {
  it('o seletor tem rótulo associado e é alcançável por teclado', () => {
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    const select = screen.getByRole('combobox', { name: /Organização/i });
    expect(select).toHaveAttribute('id', 'seletor-organizacao');

    // Foco por teclado: o `<select>` nativo é focável por construção — é justamente por isso que
    // ele foi escolhido em vez de um dropdown customizado, que precisaria reconstruir tudo isso.
    select.focus();
    expect(select).toHaveFocus();
  });

  it('o erro é anunciado e referenciado pelo controle', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    render(<SeletorOrganizacao organizacoes={[ORG_A, ORG_B]} atual={ORG_A.id} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ORG_B.id } });
    await screen.findByRole('alert');

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'erro-organizacao');
  });
});
