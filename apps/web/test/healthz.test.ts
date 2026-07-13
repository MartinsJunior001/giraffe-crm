import { describe, expect, it } from 'vitest';
import { GET } from '../app/healthz/route';

describe('GET /healthz (liveness da Web)', () => {
  it('responde 200 com exatamente { status: "ok" }', async () => {
    const res = GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'ok' });
    // Nenhuma chave extra: sem versão, host, env ou detalhe interno.
    expect(Object.keys(body)).toEqual(['status']);
  });

  it('não depende de API_BASE_URL nem consulta a API', async () => {
    const previous = process.env.API_BASE_URL;
    delete process.env.API_BASE_URL;

    // Se o handler tocasse na API ou na config, isto lançaria ou penduraria.
    const fetchSpy = () => {
      throw new Error('o healthz não pode fazer requisição de rede');
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const res = GET();
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ status: 'ok' });
    } finally {
      globalThis.fetch = originalFetch;
      if (previous !== undefined) process.env.API_BASE_URL = previous;
    }
  });
});
