import { describe, expect, it } from 'vitest';
import { assinarHop, cabecalhoHop } from '@/lib/internal-hop';

/**
 * Lado que ASSINA (a Web) do hop Web→API (D-01). O que importa provar aqui:
 *  1. paridade de formato com a API (vetor fixo — o MESMO literal do teste da API);
 *  2. `cabecalhoHop` só emite o cabeçalho quando há segredo E IP (fail-closed do emissor).
 */

const SEGREDO = 'k'.repeat(40);

describe('paridade de formato Web↔API (vetor fixo)', () => {
  it('assina exatamente o cabeçalho que a API verifica', () => {
    const header = assinarHop(
      { v: 2, ts: 1_800_000_000_000, ip: '203.0.113.7', m: 'POST', p: '/api/auth/sign-in/email' },
      SEGREDO,
    );
    expect(header).toBe(
      'h1.eyJ2IjoyLCJ0cyI6MTgwMDAwMDAwMDAwMCwiaXAiOiIyMDMuMC4xMTMuNyIsIm0iOiJQT1NUIiwicCI6Ii9hcGkvYXV0aC9zaWduLWluL2VtYWlsIn0.65cb9fb103f01da79015698e6e69e1e0ba609964e7eda9572aa07fe1814b81c7',
    );
  });
});

describe('cabecalhoHop — fail-closed do emissor', () => {
  const comum = { method: 'POST', path: '/api/auth/sign-in/email', agora: 1_800_000_000_000 };

  it('sem segredo ⇒ não emite cabeçalho (modo direto)', () => {
    expect(cabecalhoHop({ ...comum, hmac: undefined, ipCliente: '203.0.113.7' })).toEqual({});
  });

  it('sem IP validado ⇒ não emite cabeçalho', () => {
    expect(
      cabecalhoHop({ ...comum, hmac: { secret: SEGREDO, keyVersion: 2 }, ipCliente: undefined }),
    ).toEqual({});
  });

  it('com segredo e IP ⇒ emite x-internal-hop assinado', () => {
    const h = cabecalhoHop({
      ...comum,
      hmac: { secret: SEGREDO, keyVersion: 2 },
      ipCliente: '203.0.113.7',
    });
    expect(Object.keys(h)).toEqual(['x-internal-hop']);
    expect(h['x-internal-hop']).toMatch(/^h1\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  });
});
