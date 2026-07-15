import { describe, expect, it } from 'vitest';
import type { Marcos } from '../src/pipes/phases/milestones/phase-milestones.core';
import {
  derivarSaude,
  indicadorDominante,
  type SaudeTemporal,
} from '../src/pipes/cards/health/card-health.core';

/**
 * Núcleo PURO da saúde temporal (Story 2.13) — sem I/O. Prova a derivação da saúde dos marcos reais e o indicador
 * dominante (precedência ciclo de vida › saúde). Cada bloco carrega uma mutação candidata (fase vermelha): inverter
 * a ordem de severidade ou fundir os eixos quebra o teste correspondente.
 */

const AGORA = new Date('2026-07-14T12:00:00.000Z');
const PASSADO = new Date('2020-01-01T00:00:00.000Z');
const FUTURO = new Date('2999-01-01T00:00:00.000Z');

const marcos = (m: Partial<Marcos>): Marcos => ({
  esperado: m.esperado ?? null,
  vencimento: m.vencimento ?? null,
  expiracao: m.expiracao ?? null,
});

describe('derivarSaude — ok/atrasado/vencido/expirado', () => {
  it('sem marco algum → ok', () => {
    expect(derivarSaude(marcos({}), AGORA)).toBe('ok');
  });

  it('todos os marcos no futuro → ok', () => {
    expect(
      derivarSaude(marcos({ esperado: FUTURO, vencimento: FUTURO, expiracao: FUTURO }), AGORA),
    ).toBe('ok');
  });

  it('só o prazo esperado passou → atrasado', () => {
    expect(
      derivarSaude(marcos({ esperado: PASSADO, vencimento: FUTURO, expiracao: FUTURO }), AGORA),
    ).toBe('atrasado');
  });

  it('esperado e vencimento passaram → vencido', () => {
    expect(
      derivarSaude(marcos({ esperado: PASSADO, vencimento: PASSADO, expiracao: FUTURO }), AGORA),
    ).toBe('vencido');
  });

  it('todos passaram → expirado (o mais severo)', () => {
    expect(
      derivarSaude(marcos({ esperado: PASSADO, vencimento: PASSADO, expiracao: PASSADO }), AGORA),
    ).toBe('expirado');
  });

  it('marco ausente é ignorado: só a expiração passada → expirado (atrasado/vencido não se aplicam)', () => {
    expect(derivarSaude(marcos({ expiracao: PASSADO }), AGORA)).toBe('expirado');
  });

  it('limiar inclusivo: agora exatamente no marco já escala', () => {
    expect(derivarSaude(marcos({ esperado: AGORA }), AGORA)).toBe('atrasado');
  });
});

describe('indicadorDominante — precedência ciclo de vida › saúde (sem fundir os eixos)', () => {
  const casos: [string, SaudeTemporal, string][] = [
    ['ATIVO', 'ok', 'ok'],
    ['ATIVO', 'atrasado', 'atrasado'],
    ['ATIVO', 'expirado', 'expirado'],
    ['FINALIZADO', 'atrasado', 'finalizado'], // ciclo de vida vence a saúde
    ['FINALIZADO', 'ok', 'finalizado'],
    ['ARQUIVADO', 'expirado', 'arquivado'], // arquivado vence tudo
    ['ARQUIVADO', 'ok', 'arquivado'],
  ];
  it.each(casos)('%s + saude=%s → %s', (lifecycle, saude, esperado) => {
    expect(indicadorDominante(lifecycle, saude)).toBe(esperado);
  });
});
