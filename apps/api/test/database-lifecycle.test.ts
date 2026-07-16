import { describe, expect, it } from 'vitest';
import {
  planejarArquivamento,
  planejarRestauracao,
  podeEditarDatabase,
} from '../src/databases/database-lifecycle';

/**
 * Núcleo PURO do ciclo de vida do Database (Story 3.1) — sem banco, sem Nest: só a decisão. O que
 * este teste protege é a REGRA (idempotência e o gate de somente-leitura), não o encanamento; o
 * caminho HTTP e o isolamento têm suas próprias suítes (`databases-http`, `databases-rls`).
 */

const AGORA = new Date('2026-07-16T12:00:00.000Z');

describe('planejarArquivamento', () => {
  it('ACTIVE → ARCHIVED, carimbando archivedAt', () => {
    const plano = planejarArquivamento('ACTIVE', AGORA);
    expect(plano.aplicar).toBe(true);
    expect(plano.novoState).toBe('ARCHIVED');
    expect(plano.archivedAt).toEqual(AGORA);
  });

  it('já ARCHIVED → idempotente: não aplica e NÃO reescreve archivedAt', () => {
    const plano = planejarArquivamento('ARCHIVED', AGORA);
    expect(plano.aplicar).toBe(false);
    expect(plano.novoState).toBe('ARCHIVED');
    // `undefined` = não tocar: preserva o instante do arquivamento ORIGINAL.
    expect(plano.archivedAt).toBeUndefined();
  });
});

describe('planejarRestauracao', () => {
  it('ARCHIVED → ACTIVE, zerando archivedAt', () => {
    const plano = planejarRestauracao('ARCHIVED');
    expect(plano.aplicar).toBe(true);
    expect(plano.novoState).toBe('ACTIVE');
    expect(plano.archivedAt).toBeNull();
  });

  it('já ACTIVE → idempotente: não aplica', () => {
    const plano = planejarRestauracao('ACTIVE');
    expect(plano.aplicar).toBe(false);
    expect(plano.novoState).toBe('ACTIVE');
    expect(plano.archivedAt).toBeUndefined();
  });
});

describe('podeEditarDatabase — gate de somente-leitura integral (D1)', () => {
  it('ACTIVE é editável (renomear permitido)', () => {
    expect(podeEditarDatabase('ACTIVE')).toBe(true);
  });

  it('ARCHIVED NÃO é editável: somente leitura integral — só restaurar escreve', () => {
    expect(podeEditarDatabase('ARCHIVED')).toBe(false);
  });
});

describe('arquivar → restaurar preserva a decisão (ciclo reversível)', () => {
  it('o ciclo volta ao estado inicial e reabilita a edição', () => {
    const arquivado = planejarArquivamento('ACTIVE', AGORA);
    expect(podeEditarDatabase(arquivado.novoState)).toBe(false);

    const restaurado = planejarRestauracao(arquivado.novoState);
    expect(restaurado.novoState).toBe('ACTIVE');
    expect(restaurado.archivedAt).toBeNull();
    expect(podeEditarDatabase(restaurado.novoState)).toBe(true);
  });
});
