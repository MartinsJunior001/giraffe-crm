import { describe, expect, it } from 'vitest';
import {
  HEADER_HOP,
  JANELA_PADRAO_MS,
  assinarHop,
  verificarHop,
  type PayloadHop,
} from '../src/kernel/auth/internal-hop';

/**
 * Núcleo do hop Web→API autenticado (D-01). Testes PUROS — sem HTTP, sem banco: o valor a proteger é a
 * lógica de verificação, e ela é determinística. A prova de que o hop está LIGADO no fluxo real (403
 * fail-closed, IP confiado no G2) vive na integração (`internal-hop-http`).
 */

const SEGREDO = 'k'.repeat(40);
const SEGREDO_ANTERIOR = 'j'.repeat(40);
const V = 3;
const AGORA = 1_800_000_000_000;
const CHAVES = [{ versao: V, segredo: SEGREDO }] as const;

function payload(over: Partial<PayloadHop> = {}): PayloadHop {
  return { v: V, ts: AGORA, ip: '203.0.113.10', m: 'POST', p: '/api/auth/sign-in/email', ...over };
}

const base = { method: 'POST', path: '/api/auth/sign-in/email', segredos: CHAVES, agora: AGORA };

describe('assinatura válida (AC1)', () => {
  it('assina e verifica: devolve o IP provado', () => {
    const header = assinarHop(payload(), SEGREDO);
    const r = verificarHop({ ...base, header });
    expect(r).toEqual({ ok: true, ip: '203.0.113.10', keyVersion: V });
  });

  it('o nome do cabeçalho é serviço→serviço (x-internal-)', () => {
    expect(HEADER_HOP).toBe('x-internal-hop');
  });

  it('normaliza IPv4-mapeado do Node para IPv4 puro', () => {
    const header = assinarHop(payload({ ip: '::ffff:203.0.113.20' }), SEGREDO);
    const r = verificarHop({ ...base, header });
    expect(r.ok && r.ip).toBe('203.0.113.20');
  });
});

describe('ausência e malformação (AC2 — fail-closed)', () => {
  it('cabeçalho ausente ⇒ ausente', () => {
    for (const header of [undefined, null, '']) {
      expect(verificarHop({ ...base, header }).ok).toBe(false);
      expect(verificarHop({ ...base, header })).toMatchObject({ motivo: 'ausente' });
    }
  });

  it('formato/partes erradas ⇒ malformado', () => {
    for (const header of ['lixo', 'h1.só-duas', 'h9.abc.def', 'h1..', 'h1.###.@@@']) {
      expect(verificarHop({ ...base, header }).ok).toBe(false);
    }
  });

  it('payload sem os campos obrigatórios ⇒ malformado', () => {
    const b64 = Buffer.from(JSON.stringify({ v: V, ts: AGORA }), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    // assinatura correta sobre um payload incompleto: ainda assim malformado (falta ip/m/p).
    const header = assinarHop(payload(), SEGREDO).replace(/\..*\./, `.${b64}.`);
    expect(verificarHop({ ...base, header }).ok).toBe(false);
  });
});

describe('falsificação (AC3/AC4 — a prova é a única autoridade)', () => {
  it('assinatura adulterada ⇒ assinatura', () => {
    const header = assinarHop(payload(), SEGREDO);
    const adulterado = header.slice(0, -2) + (header.endsWith('00') ? '11' : '00');
    expect(verificarHop({ ...base, header: adulterado })).toMatchObject({
      ok: false,
      motivo: 'assinatura',
    });
  });

  it('segredo errado (atacante sem a chave) ⇒ assinatura', () => {
    const header = assinarHop(payload(), 'segredo-do-atacante-000000000000000000');
    expect(verificarHop({ ...base, header })).toMatchObject({ ok: false, motivo: 'assinatura' });
  });

  it('payload trocado sob assinatura antiga ⇒ assinatura (o IP não pode ser reescrito)', () => {
    const header = assinarHop(payload({ ip: '203.0.113.10' }), SEGREDO);
    const [fmt, , sig] = header.split('.');
    const outroPayload = Buffer.from(JSON.stringify(payload({ ip: '10.0.0.9' })), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verificarHop({ ...base, header: `${fmt}.${outroPayload}.${sig}` })).toMatchObject({
      ok: false,
      motivo: 'assinatura',
    });
  });
});

describe('amarração à requisição (barra replay cruzado)', () => {
  it('mesma prova em OUTRA rota ⇒ rota', () => {
    const header = assinarHop(payload({ p: '/api/auth/sign-in/email' }), SEGREDO);
    expect(verificarHop({ ...base, header, path: '/organizations/current' })).toMatchObject({
      ok: false,
      motivo: 'rota',
    });
  });

  it('mesma prova em OUTRO método ⇒ rota', () => {
    const header = assinarHop(payload({ m: 'POST' }), SEGREDO);
    expect(verificarHop({ ...base, header, method: 'GET' })).toMatchObject({
      ok: false,
      motivo: 'rota',
    });
  });
});

describe('janela temporal (AC5 — replay/expiração)', () => {
  it('dentro da janela ⇒ aceita', () => {
    const header = assinarHop(payload({ ts: AGORA - JANELA_PADRAO_MS + 1 }), SEGREDO);
    expect(verificarHop({ ...base, header }).ok).toBe(true);
  });

  it('velho além da janela (replay tardio) ⇒ expirado', () => {
    const header = assinarHop(payload({ ts: AGORA - JANELA_PADRAO_MS - 1 }), SEGREDO);
    expect(verificarHop({ ...base, header })).toMatchObject({ ok: false, motivo: 'expirado' });
  });

  it('muito adiantado (além do skew) ⇒ expirado', () => {
    const header = assinarHop(payload({ ts: AGORA + 60_000 }), SEGREDO);
    expect(verificarHop({ ...base, header })).toMatchObject({ ok: false, motivo: 'expirado' });
  });
});

describe('rotação de chave (AC6)', () => {
  const AMBAS = [
    { versao: V, segredo: SEGREDO },
    { versao: V - 1, segredo: SEGREDO_ANTERIOR },
  ] as const;

  it('assinado pela chave ANTERIOR é aceito enquanto ela está na janela', () => {
    const header = assinarHop(payload({ v: V - 1 }), SEGREDO_ANTERIOR);
    expect(verificarHop({ ...base, header, segredos: AMBAS })).toMatchObject({
      ok: true,
      keyVersion: V - 1,
    });
  });

  it('assinado pela chave ATUAL também é aceito', () => {
    const header = assinarHop(payload({ v: V }), SEGREDO);
    expect(verificarHop({ ...base, header, segredos: AMBAS }).ok).toBe(true);
  });

  it('encerrada a janela (só a atual), a prova da anterior é recusada', () => {
    const header = assinarHop(payload({ v: V - 1 }), SEGREDO_ANTERIOR);
    expect(verificarHop({ ...base, header, segredos: CHAVES })).toMatchObject({
      ok: false,
      motivo: 'assinatura',
    });
  });

  it('versão de chave declarada que não existe ⇒ assinatura (não vaza qual falhou)', () => {
    const header = assinarHop(payload({ v: 99 }), SEGREDO);
    expect(verificarHop({ ...base, header, segredos: AMBAS })).toMatchObject({
      ok: false,
      motivo: 'assinatura',
    });
  });
});

describe('IP do payload precisa ser um IP', () => {
  it('lixo assinado ⇒ ip (não vira chave de rate limit)', () => {
    const header = assinarHop(payload({ ip: '999.999.999.999' }), SEGREDO);
    expect(verificarHop({ ...base, header })).toMatchObject({ ok: false, motivo: 'ip' });
  });
});

describe('paridade de formato Web↔API (vetor fixo)', () => {
  // Este literal é produzido pelo `assinarHop` de `apps/web/lib/internal-hop.ts` (o mesmo vetor é
  // afirmado no teste da Web). Se a API verifica o que a Web assinou — e vice-versa — os formatos são
  // idênticos por construção, sem pacote compartilhado. Mude um lado sem o outro e um destes quebra.
  const VETOR =
    'h1.eyJ2IjoyLCJ0cyI6MTgwMDAwMDAwMDAwMCwiaXAiOiIyMDMuMC4xMTMuNyIsIm0iOiJQT1NUIiwicCI6Ii9hcGkvYXV0aC9zaWduLWluL2VtYWlsIn0.65cb9fb103f01da79015698e6e69e1e0ba609964e7eda9572aa07fe1814b81c7';
  it('a API verifica o cabeçalho que a Web produz', () => {
    const r = verificarHop({
      header: VETOR,
      method: 'POST',
      path: '/api/auth/sign-in/email',
      segredos: [{ versao: 2, segredo: 'k'.repeat(40) }],
      agora: 1_800_000_000_000,
    });
    expect(r).toEqual({ ok: true, ip: '203.0.113.7', keyVersion: 2 });
  });
});
