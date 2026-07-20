import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEscopoAdmin } from '@/lib/auth';
import { ITENS_NAV, itensVisiveis } from '@/lib/navegacao';

/**
 * Painel Administrativo (Story 8.1) — navegação e tradução da guarda do servidor.
 *
 * O que **não** se testa aqui: se um MEMBER "consegue" abrir a página. Isso não é decisão da web —
 * quem nega é a API (`admin-scope`, `@Requer('administrar','Organizacao')`), coberto em
 * `admin-scope-http.test.ts`. Testar autorização no cliente daria a impressão de que ela mora aqui,
 * que é exatamente a confusão que o desenho da Story evita.
 *
 * O que se testa: que a web **traduz corretamente** a resposta do servidor, e que não revela a área
 * a quem não deve vê-la.
 */

afterEach(() => vi.unstubAllGlobals());

const ADMIN_SCOPE = /\/organizations\/admin-scope$/;

/** `fetch` que responde o status pedido na rota de escopo administrativo. */
function apiRespondendo(status: number, corpo: unknown = {}) {
  return (url: string) => {
    if (!ADMIN_SCOPE.test(url)) throw new Error(`rota inesperada: ${url}`);
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(corpo),
    } as Response);
  };
}

describe('AC-4 / não-enumeração — navegação', () => {
  it('o item de Administração aparece para o ADMIN', () => {
    const hrefs = itensVisiveis('ADMIN').map((i) => i.href);
    expect(hrefs).toContain('/painel/administracao');
  });

  it('MEMBER e GUEST não recebem o item — ele fica FORA do DOM, não escondido', () => {
    // Filtrar a lista é o que garante "não renderizar": um item com `hidden` ainda estaria no HTML
    // e revelaria a existência da área a quem lesse a resposta.
    for (const papel of ['MEMBER', 'GUEST'] as const) {
      expect(itensVisiveis(papel).map((i) => i.href)).not.toContain('/painel/administracao');
    }
  });

  it('a navegação NÃO tem Financeiro, Estatísticas, API, Tokens ou Webhooks (INV-ADMIN-02)', () => {
    const proibidos = /financeiro|estat[íi]stica|tokens?|webhooks?|billing|api/i;
    for (const item of ITENS_NAV) {
      expect(item.rotulo).not.toMatch(proibidos);
      expect(item.href).not.toMatch(proibidos);
    }
  });

  it('nenhum item de navegação aponta para rota inexistente de administração', () => {
    // Sem controle falso (AC3 da 1.7): só entra item com rota real.
    const admin = ITENS_NAV.filter((i) => i.href.startsWith('/painel/administracao'));
    expect(admin).toHaveLength(1);
    expect(admin[0]!.papeis).toEqual(['ADMIN']);
  });
});

describe('AC-6 — a web reflete a decisão do servidor, não a toma', () => {
  it('200 → escopo confirmado, com a Organização atual', async () => {
    vi.stubGlobal(
      'fetch',
      apiRespondendo(200, { id: 'org-1', name: 'Organização A', slug: 'org-a' }),
    );

    const estado = await fetchEscopoAdmin('http://api.test', 'cookie=x');
    expect(estado).toEqual({ ok: true, orgId: 'org-1', orgNome: 'Organização A' });
  });

  it('403 → negado (é a resposta do servidor, não uma checagem local de papel)', async () => {
    vi.stubGlobal('fetch', apiRespondendo(403));

    expect(await fetchEscopoAdmin('http://api.test', 'c=1')).toEqual({
      ok: false,
      motivo: 'negado',
    });
  });

  it('401 → sem sessão (distinto de negado: leva ao Login, não à tela de restrição)', async () => {
    vi.stubGlobal('fetch', apiRespondendo(401));

    expect(await fetchEscopoAdmin('http://api.test', 'c=1')).toEqual({
      ok: false,
      motivo: 'sem-sessao',
    });
  });

  it('API fora do ar → indisponível, e NUNCA "ok" por omissão', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:3001')));

    const estado = await fetchEscopoAdmin('http://api.test', 'c=1');
    // Falha de infraestrutura não pode virar acesso concedido — nem virar "negado", que mentiria
    // sobre a permissão do usuário.
    expect(estado).toEqual({ ok: false, motivo: 'indisponivel' });
  });

  it('resposta 200 malformada não vira acesso concedido', async () => {
    vi.stubGlobal('fetch', apiRespondendo(200, { slug: 'só-isso' }));

    expect((await fetchEscopoAdmin('http://api.test', 'c=1')).ok).toBe(false);
  });

  it('a falha não vaza detalhe técnico no estado devolvido', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:3001')));

    const estado = await fetchEscopoAdmin('http://api.test', 'c=1');
    expect(JSON.stringify(estado)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|3001/);
  });
});
