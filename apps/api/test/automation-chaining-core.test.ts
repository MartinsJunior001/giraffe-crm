import { describe, expect, it } from 'vitest';
import {
  MAX_ACTION_DURATION_MS,
  MAX_CHAIN_DEPTH,
  MAX_CHAIN_DURATION_MS,
  MAX_EXECUTION_DURATION_MS,
  avaliarBarreira,
  derivarAssinaturaVisita,
  excedeuDuracaoAcao,
  excedeuDuracaoCadeia,
  excedeuDuracaoExecucao,
  excedeuProfundidade,
} from '../src/pipes/automations/engine/chain-guard.core';

/**
 * Provas do núcleo PURO da prevenção de ciclos (Story 4.7 — NFR-7/AD-18) — sem I/O, sem PostgreSQL. Cobre a
 * ASSINATURA determinística de visita, os LIMITES (profundidade/durações) e o FAIL-CLOSED da barreira
 * (§1428 — na dúvida, barra). A detecção de ciclo por COLISÃO de assinatura é integração (banco) e vive no e2e.
 */

const AUTO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const RES = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const OUTRO_RES = 'cccccccc-3333-4333-8333-cccccccccccc';

describe('assinatura determinística de visita', () => {
  it('é DETERMINÍSTICA — mesmos componentes ⇒ mesma assinatura', () => {
    const a = derivarAssinaturaVisita(AUTO, 1, 'RECORD_CREATED', RES);
    const b = derivarAssinaturaVisita(AUTO, 1, 'RECORD_CREATED', RES);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex, tamanho fixo (não vaza os componentes)
  });

  it('DIFERE por Automação, por tipo de Evento e por recurso alvo (sem falso positivo)', () => {
    const base = derivarAssinaturaVisita(AUTO, 1, 'RECORD_CREATED', RES);
    expect(derivarAssinaturaVisita('dddddddd-4444-4444-8444-dddddddddddd', 1, 'RECORD_CREATED', RES)).not.toBe(base);
    expect(derivarAssinaturaVisita(AUTO, 2, 'RECORD_CREATED', RES)).not.toBe(base); // versão distinta
    expect(derivarAssinaturaVisita(AUTO, 1, 'CARD_CREATED', RES)).not.toBe(base);
    expect(derivarAssinaturaVisita(AUTO, 1, 'RECORD_CREATED', OUTRO_RES)).not.toBe(base); // alvo distinto
  });
});

describe('limites de profundidade e duração', () => {
  it('excedeuProfundidade: > MAX_CHAIN_DEPTH ⇒ true; <= ⇒ false; malformado ⇒ true (fail-closed)', () => {
    expect(excedeuProfundidade(MAX_CHAIN_DEPTH)).toBe(false);
    expect(excedeuProfundidade(MAX_CHAIN_DEPTH + 1)).toBe(true);
    expect(excedeuProfundidade(0)).toBe(false);
    expect(excedeuProfundidade(-1)).toBe(true);
    expect(excedeuProfundidade(Number.NaN)).toBe(true);
  });

  it('excedeuDuracaoCadeia: além de MAX_CHAIN_DURATION_MS ⇒ true; null ⇒ false (decisão é do chamador)', () => {
    const agora = new Date(1_000_000_000_000);
    const velha = new Date(agora.getTime() - MAX_CHAIN_DURATION_MS - 1);
    const nova = new Date(agora.getTime() - 1);
    expect(excedeuDuracaoCadeia(velha, agora)).toBe(true);
    expect(excedeuDuracaoCadeia(nova, agora)).toBe(false);
    expect(excedeuDuracaoCadeia(null, agora)).toBe(false);
  });

  it('excedeuDuracaoExecucao/Acao respeitam seus tetos', () => {
    const agora = new Date(1_000_000_000_000);
    expect(excedeuDuracaoExecucao(new Date(agora.getTime() - MAX_EXECUTION_DURATION_MS - 1), agora)).toBe(true);
    expect(excedeuDuracaoExecucao(new Date(agora.getTime() - 1), agora)).toBe(false);
    expect(excedeuDuracaoExecucao(null, agora)).toBe(false);
    expect(excedeuDuracaoAcao(new Date(agora.getTime() - MAX_ACTION_DURATION_MS - 1), agora)).toBe(true);
    expect(excedeuDuracaoAcao(new Date(agora.getTime() - 1), agora)).toBe(false);
  });
});

describe('avaliarBarreira — precedência e fail-closed', () => {
  const agora = new Date(1_000_000_000_000);

  it('RAIZ (profundidade 0) NUNCA é barrada por duração (a cadeia começa agora)', () => {
    expect(avaliarBarreira({ chainDepth: 0, chainStartedAt: null, ehRaiz: true, agora })).toEqual({
      barrado: false,
      motivo: null,
    });
  });

  it('profundidade > MAX ⇒ DEPTH_EXCEEDED (precede a duração)', () => {
    const v = avaliarBarreira({
      chainDepth: MAX_CHAIN_DEPTH + 1,
      chainStartedAt: new Date(agora.getTime() - 1),
      ehRaiz: false,
      agora,
    });
    expect(v).toEqual({ barrado: true, motivo: 'DEPTH_EXCEEDED' });
  });

  it('filho SEM início de cadeia conhecido ⇒ CHAIN_TIMEOUT (fail-closed — §1428)', () => {
    const v = avaliarBarreira({ chainDepth: 2, chainStartedAt: null, ehRaiz: false, agora });
    expect(v).toEqual({ barrado: true, motivo: 'CHAIN_TIMEOUT' });
  });

  it('filho com cadeia VELHA ⇒ CHAIN_TIMEOUT', () => {
    const v = avaliarBarreira({
      chainDepth: 2,
      chainStartedAt: new Date(agora.getTime() - MAX_CHAIN_DURATION_MS - 1),
      ehRaiz: false,
      agora,
    });
    expect(v).toEqual({ barrado: true, motivo: 'CHAIN_TIMEOUT' });
  });

  it('filho dentro dos limites ⇒ LIBERADO', () => {
    const v = avaliarBarreira({
      chainDepth: 3,
      chainStartedAt: new Date(agora.getTime() - 1_000),
      ehRaiz: false,
      agora,
    });
    expect(v).toEqual({ barrado: false, motivo: null });
  });
});
