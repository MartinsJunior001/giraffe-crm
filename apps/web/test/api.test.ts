import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchApiHealth } from '../lib/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchApiHealth (estado honesto)', () => {
  it('retorna ok quando a API responde saudável', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
    );
    const result = await fetchApiHealth('http://api:3001');
    expect(result).toEqual({ ok: true, status: 'ok' });
  });

  it('retorna estado honesto quando a API responde erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    const result = await fetchApiHealth('http://api:3001');
    expect(result).toEqual({ ok: false, reason: 'HTTP 503' });
  });

  it('retorna "sem conexão" quando a API está indisponível (sem vazar detalhe)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3001');
      }),
    );
    const result = await fetchApiHealth('http://api:3001');
    expect(result).toEqual({ ok: false, reason: 'sem conexão' });
  });
});
