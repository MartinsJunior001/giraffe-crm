import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOrgAtual, loginNaApi, logoutNaApi } from '../lib/auth';

const BASE = 'http://api:3001';

/** Resposta mínima que `lib/auth` consome: status, ok, getSetCookie, json. */
function resposta(opts: { status: number; cookies?: string[]; json?: unknown }): Response {
  return {
    status: opts.status,
    ok: opts.status >= 200 && opts.status < 300,
    headers: { getSetCookie: () => opts.cookies ?? [] },
    json: async () => opts.json ?? {},
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('loginNaApi — classificação honesta e relay de cookie', () => {
  it('200 ⇒ ok, com os Set-Cookie para reencaminhar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resposta({
          status: 200,
          cookies: ['better-auth.session_token=abc; HttpOnly; SameSite=Lax'],
        }),
      ),
    );
    const r = await loginNaApi(BASE, 'ana@exemplo.test', 'senha', 'http://localhost:3000');
    expect(r).toEqual({
      ok: true,
      cookies: ['better-auth.session_token=abc; HttpOnly; SameSite=Lax'],
    });
  });

  it('429 ⇒ limite (não confundir com credenciais)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ status: 429 })),
    );
    expect(await loginNaApi(BASE, 'a@b.test', 'x', 'http://localhost:3000')).toEqual({
      ok: false,
      motivo: 'limite',
    });
  });

  it('401 ⇒ credenciais NEUTRO (não distingue conta inexistente de senha errada)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ status: 401 })),
    );
    expect(await loginNaApi(BASE, 'a@b.test', 'x', 'http://localhost:3000')).toEqual({
      ok: false,
      motivo: 'credenciais',
    });
  });

  it('erro de rede ⇒ indisponivel (nunca vaza o erro cru)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED api:3001');
      }),
    );
    expect(await loginNaApi(BASE, 'a@b.test', 'x', 'http://localhost:3000')).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
  });

  it('manda o Origin da Web à API (CSRF do Better Auth)', async () => {
    const espia = vi.fn(async () => resposta({ status: 200 }));
    vi.stubGlobal('fetch', espia);
    await loginNaApi(BASE, 'a@b.test', 'x', 'http://localhost:3000');
    const [, init] = espia.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).origin).toBe('http://localhost:3000');
  });
});

describe('logoutNaApi — best-effort', () => {
  it('devolve os Set-Cookie de limpeza e manda o Origin (aceito em produção)', async () => {
    const espia = vi.fn(async () =>
      resposta({ status: 200, cookies: ['better-auth.session_token=; Max-Age=0'] }),
    );
    vi.stubGlobal('fetch', espia);
    expect(
      await logoutNaApi(BASE, 'better-auth.session_token=abc', 'http://localhost:3000'),
    ).toEqual(['better-auth.session_token=; Max-Age=0']);
    const [, init] = espia.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).origin).toBe('http://localhost:3000');
  });

  it('rede fora ⇒ lista vazia, sem lançar (o chamador ainda limpa e vai ao Login)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    expect(await logoutNaApi(BASE, 'x=y', 'http://localhost:3000')).toEqual([]);
  });
});

describe('fetchOrgAtual — o backend é a autoridade', () => {
  it('200 com id ⇒ Organização ativa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ status: 200, json: { id: 'org-a' } })),
    );
    expect(await fetchOrgAtual(BASE, 'c=1')).toEqual({ ok: true, orgId: 'org-a' });
  });

  it('401 ⇒ sem-sessao (volta ao Login)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ status: 401 })),
    );
    expect(await fetchOrgAtual(BASE, 'c=1')).toEqual({ ok: false, motivo: 'sem-sessao' });
  });

  it('403 ⇒ sem-organizacao (autenticado, Membership suspensa/removida/ausente)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta({ status: 403 })),
    );
    expect(await fetchOrgAtual(BASE, 'c=1')).toEqual({ ok: false, motivo: 'sem-organizacao' });
  });

  it('erro de rede ⇒ indisponivel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    expect(await fetchOrgAtual(BASE, 'c=1')).toEqual({ ok: false, motivo: 'indisponivel' });
  });
});
