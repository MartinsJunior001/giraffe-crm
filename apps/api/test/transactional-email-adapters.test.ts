import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeTransactionalEmailAdapter } from '../src/organizations/invites/fake-transactional-email.adapter';
import { ResendTransactionalEmailAdapter } from '../src/organizations/invites/resend-transactional-email.adapter';
import type { EmailTransacional } from '../src/organizations/invites/transactional-email.port';
import { loadEnv } from '../src/kernel/config/env';

/**
 * Adapters de e-mail transacional (Story 8.2, G1). Sem rede, sem credencial real: o Resend é testado
 * mockando `fetch`; o Fake é determinístico. Prova o isolamento do provedor e a sanitização de log.
 */

const semLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

const EMAIL: EmailTransacional = {
  para: 'ana@exemplo.test',
  assunto: 'Convite',
  texto: 'texto',
  html: '<p>html</p>',
  idempotencyKey: 'conv-1-v1',
};

afterEach(() => vi.unstubAllGlobals());

describe('FakeTransactionalEmailAdapter — determinístico e inspecionável', () => {
  it('registra o que enviaria e devolve id determinístico por idempotencyKey', async () => {
    const fake = new FakeTransactionalEmailAdapter();
    const r = await fake.enviar(EMAIL);

    expect(r).toEqual({ estado: 'enviada', idProvedor: 'fake-conv-1-v1' });
    expect(fake.enviados).toHaveLength(1);
    expect(fake.enviados[0]!.para).toBe('ana@exemplo.test');
  });

  it('programarFalha força o próximo envio a falhar (testa o caminho `falhou`)', async () => {
    const fake = new FakeTransactionalEmailAdapter();
    fake.programarFalha({ estado: 'falhou', erro: { codigo: 'rejeitado', detalhe: 'HTTP 422' } });

    const r = await fake.enviar(EMAIL);
    expect(r.estado).toBe('falhou');
    // A falha não "envia": nada registrado.
    expect(fake.enviados).toHaveLength(0);
  });
});

describe('ResendTransactionalEmailAdapter — REST via fetch, sem vazar segredo', () => {
  it('POST em /emails com Bearer, Idempotency-Key e body from/to/subject/html/text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'resend-abc' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new ResendTransactionalEmailAdapter(
      're_secret_123',
      'Giraffe <c@x.test>',
      5000,
      semLog,
    );
    const r = await adapter.enviar(EMAIL);

    expect(r).toEqual({ estado: 'enviada', idProvedor: 'resend-abc' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_secret_123');
    expect(init.headers['Idempotency-Key']).toBe('conv-1-v1');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: 'Giraffe <c@x.test>',
      to: 'ana@exemplo.test',
      subject: 'Convite',
      html: '<p>html</p>',
      text: 'texto',
    });
  });

  it('401/403 → falha tipada `auth`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );
    const adapter = new ResendTransactionalEmailAdapter('k', 'f', 5000, semLog);
    const r = await adapter.enviar(EMAIL);
    expect(r).toEqual({ estado: 'falhou', erro: { codigo: 'auth', detalhe: 'HTTP 401' } });
  });

  it('422 → falha tipada `rejeitado`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({}) }),
    );
    const adapter = new ResendTransactionalEmailAdapter('k', 'f', 5000, semLog);
    expect((await adapter.enviar(EMAIL)).estado).toBe('falhou');
  });

  it('abort/timeout → falha tipada `timeout`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    const adapter = new ResendTransactionalEmailAdapter('k', 'f', 5000, semLog);
    const r = await adapter.enviar(EMAIL);
    expect(r.estado).toBe('falhou');
    expect(r.estado === 'falhou' && r.erro.codigo).toBe('timeout');
  });

  it('NUNCA vaza a chave nem o e-mail completo em log', async () => {
    const linhas: string[] = [];
    const logSpy = {
      info: (o: object) => linhas.push(JSON.stringify(o)),
      warn: (o: object) => linhas.push(JSON.stringify(o)),
      error: () => {},
      debug: () => {},
    } as never;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 'x' }) }),
    );
    const adapter = new ResendTransactionalEmailAdapter('re_super_secret', 'f', 5000, logSpy);
    await adapter.enviar(EMAIL);

    const tudo = linhas.join('\n');
    expect(tudo).not.toContain('re_super_secret');
    expect(tudo).not.toContain('ana@exemplo.test'); // mascarado
    expect(tudo).toContain('an***@exemplo.test');
  });
});

describe('fail-fast do gate de e-mail (env, G1)', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@localhost:5434/db?schema=public',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:3001',
    LOGIN_HMAC_SECRET: 'y'.repeat(32),
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    // Exposição direta (sem proxy) — satisfaz o superRefine de produção do proxy; ortogonal ao
    // gate de e-mail que este teste exercita.
    ALLOW_DIRECT_EXPOSURE: 'true',
  };

  it('EMAIL_SEND_ENABLED=true sem config → falha citando os NOMES ausentes, sem valor', () => {
    expect(() => loadEnv({ ...base, EMAIL_SEND_ENABLED: 'true' } as never)).toThrow(
      /RESEND_API_KEY.*EMAIL_FROM.*APP_PUBLIC_URL/s,
    );
  });

  it('EMAIL_SEND_ENABLED=true COM config → válido', () => {
    expect(() =>
      loadEnv({
        ...base,
        EMAIL_SEND_ENABLED: 'true',
        RESEND_API_KEY: 're_k',
        EMAIL_FROM: 'Giraffe <c@x.test>',
        APP_PUBLIC_URL: 'https://app.exemplo',
      } as never),
    ).not.toThrow();
  });

  it('gate desligado (default) → não exige credencial (adapter fake)', () => {
    expect(() => loadEnv(base as never)).not.toThrow();
  });
});
