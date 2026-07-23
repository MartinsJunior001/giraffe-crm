import { describe, expect, it } from 'vitest';
import {
  construirSinal,
  ContadorConexoes,
  EVENTO_INVALIDACAO,
  salaDe,
  type SinalInvalidacao,
  SignalThrottle,
} from '../src/notifications/realtime/realtime-signal.core';

/**
 * Núcleo PURO do tempo real (Story 5.5) — isolamento de sala, forma do sinal (sanitizada) e o
 * backpressure (coalescing/teto), sem Socket.IO nem timers reais. Prova a lógica que o gateway apenas
 * transporta.
 */
describe('salaDe — isolamento por (userId, orgId)', () => {
  it('a chave inclui usuário E Organização, e é estável', () => {
    expect(salaDe('org1', 'user1')).toBe('u:user1:o:org1');
  });

  it('usuários diferentes na mesma Org têm salas diferentes (isolamento por usuário)', () => {
    expect(salaDe('org1', 'a')).not.toBe(salaDe('org1', 'b'));
  });

  it('o mesmo usuário em Orgs diferentes tem salas diferentes (isolamento por Org)', () => {
    expect(salaDe('orgA', 'u')).not.toBe(salaDe('orgB', 'u'));
  });
});

describe('construirSinal — payload sanitizado (nada sensível)', () => {
  it('carrega SÓ id + at (ISO); nenhuma outra chave', () => {
    const at = new Date('2026-07-23T10:00:00.000Z');
    const sinal: SinalInvalidacao = construirSinal('notif-123', at);
    expect(sinal).toEqual({ id: 'notif-123', at: '2026-07-23T10:00:00.000Z' });
    expect(Object.keys(sinal).sort()).toEqual(['at', 'id']); // sem type/params/resourceId/actorId
  });

  it('o nome do evento é o contrato estável', () => {
    expect(EVENTO_INVALIDACAO).toBe('notifications:invalidate');
  });
});

describe('SignalThrottle — coalescing por sala (backpressure/tempestade)', () => {
  it('emite o 1º; coalesce os seguintes dentro da janela; reemite após a janela', () => {
    const t = new SignalThrottle(250);
    const sala = salaDe('o', 'u');
    expect(t.deveEmitir(sala, 1000)).toBe(true); // 1º
    expect(t.deveEmitir(sala, 1100)).toBe(false); // dentro da janela → coalesce
    expect(t.deveEmitir(sala, 1249)).toBe(false); // ainda dentro
    expect(t.deveEmitir(sala, 1250)).toBe(true); // janela expirou → reemite
  });

  it('salas diferentes não interferem entre si', () => {
    const t = new SignalThrottle(250);
    expect(t.deveEmitir(salaDe('o', 'a'), 1000)).toBe(true);
    expect(t.deveEmitir(salaDe('o', 'b'), 1000)).toBe(true); // sala diferente → emite
  });

  it('uma rajada síncrona (mesmo instante) colapsa em UM sinal', () => {
    const t = new SignalThrottle(250);
    const sala = salaDe('o', 'u');
    const agora = 5000;
    const emitidos = [1, 2, 3, 4, 5].filter(() => t.deveEmitir(sala, agora));
    expect(emitidos).toHaveLength(1);
  });
});

describe('ContadorConexoes — teto de conexões por usuário', () => {
  it('admite até o teto e recusa o excedente', () => {
    const c = new ContadorConexoes(2);
    expect(c.admitir('u')).toBe(true);
    expect(c.admitir('u')).toBe(true);
    expect(c.admitir('u')).toBe(false); // teto
    expect(c.ativas('u')).toBe(2);
  });

  it('liberar devolve cota e zera a chave', () => {
    const c = new ContadorConexoes(1);
    expect(c.admitir('u')).toBe(true);
    expect(c.admitir('u')).toBe(false);
    c.liberar('u');
    expect(c.ativas('u')).toBe(0);
    expect(c.admitir('u')).toBe(true); // cota devolvida
  });

  it('usuários diferentes têm cotas independentes', () => {
    const c = new ContadorConexoes(1);
    expect(c.admitir('a')).toBe(true);
    expect(c.admitir('b')).toBe(true); // outro usuário, cota própria
  });
});
