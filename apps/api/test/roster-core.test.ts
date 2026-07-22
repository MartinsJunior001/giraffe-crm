import { describe, expect, it } from 'vitest';
import {
  capacidadesDoMembro,
  conviteExpirado,
  ehUltimoAdminAtivo,
  normalizarPaginacao,
  ROSTER_TAKE_DEFAULT,
  ROSTER_TAKE_MAX,
} from '../src/organizations/members/roster.core';
import {
  parseConsultaConvites,
  parseConsultaMembros,
} from '../src/organizations/members/roster.dto';

/**
 * Núcleo PURO do roster (Story 8.7). Prova em unidade — sem PostgreSQL — a regra sensível: a proteção do
 * último Administrador nunca apresenta ação executável (AC-2), o Membro/Convidado não veem o que não devem,
 * e a paginação/DTO são fail-closed. As capacidades são REFLEXO; a execução é revalidada por 8.4/8.5/8.6.
 */

describe('capacidadesDoMembro — proteção do último Admin (AC-2)', () => {
  it('ÚLTIMO Admin ativo: nenhuma ação de rebaixamento/suspensão/remoção é oferecida', () => {
    const cap = capacidadesDoMembro({
      role: 'ADMIN',
      state: 'ACTIVE',
      ehProprio: true,
      adminsAtivos: 1,
    });
    expect(cap).toEqual({
      podeAlterarPapel: false,
      podeSuspender: false,
      podeReativar: false,
      podeRemover: false,
    });
  });

  it('Admin quando há 2 Admins: a proteção NÃO barra (pode alterar/suspender/remover)', () => {
    const cap = capacidadesDoMembro({
      role: 'ADMIN',
      state: 'ACTIVE',
      ehProprio: false,
      adminsAtivos: 2,
    });
    expect(cap.podeAlterarPapel).toBe(true);
    expect(cap.podeSuspender).toBe(true);
    expect(cap.podeRemover).toBe(true);
  });

  it('o PRÓPRIO ator (Membro ativo) não pode se suspender, mas pode ter papel alterado/ser removido', () => {
    const cap = capacidadesDoMembro({
      role: 'MEMBER',
      state: 'ACTIVE',
      ehProprio: true,
      adminsAtivos: 3,
    });
    expect(cap.podeSuspender).toBe(false);
    expect(cap.podeAlterarPapel).toBe(true);
    expect(cap.podeRemover).toBe(true);
  });

  it('Membership SUSPENSA: só reativar; nada de alterar papel/suspender', () => {
    const cap = capacidadesDoMembro({
      role: 'MEMBER',
      state: 'SUSPENDED',
      ehProprio: false,
      adminsAtivos: 2,
    });
    expect(cap).toEqual({
      podeAlterarPapel: false,
      podeSuspender: false,
      podeReativar: true,
      podeRemover: true,
    });
  });

  it('Membership REMOVIDA (terminal): nenhuma ação', () => {
    const cap = capacidadesDoMembro({
      role: 'MEMBER',
      state: 'REMOVED',
      ehProprio: false,
      adminsAtivos: 2,
    });
    expect(cap).toEqual({
      podeAlterarPapel: false,
      podeSuspender: false,
      podeReativar: false,
      podeRemover: false,
    });
  });

  it('ehUltimoAdminAtivo: só Admin ATIVO com adminsAtivos <= 1', () => {
    expect(ehUltimoAdminAtivo({ role: 'ADMIN', state: 'ACTIVE', adminsAtivos: 1 })).toBe(true);
    expect(ehUltimoAdminAtivo({ role: 'ADMIN', state: 'ACTIVE', adminsAtivos: 2 })).toBe(false);
    expect(ehUltimoAdminAtivo({ role: 'ADMIN', state: 'SUSPENDED', adminsAtivos: 1 })).toBe(false);
    expect(ehUltimoAdminAtivo({ role: 'MEMBER', state: 'ACTIVE', adminsAtivos: 1 })).toBe(false);
  });
});

describe('normalizarPaginacao — clamp robusto (teto NFR-3/4)', () => {
  it('default quando ausente', () => {
    expect(normalizarPaginacao(undefined, undefined)).toEqual({
      skip: 0,
      take: ROSTER_TAKE_DEFAULT,
    });
  });
  it('take acima do teto é clampado ao máximo', () => {
    expect(normalizarPaginacao('0', '9999').take).toBe(ROSTER_TAKE_MAX);
  });
  it('take 0 ou negativo cai para o mínimo 1', () => {
    expect(normalizarPaginacao('0', '0').take).toBe(1);
    expect(normalizarPaginacao('0', '-5').take).toBe(ROSTER_TAKE_DEFAULT); // inválido → default
  });
  it('skip inválido cai para 0', () => {
    expect(normalizarPaginacao('abc', '10')).toEqual({ skip: 0, take: 10 });
  });
});

describe('conviteExpirado — derivado na leitura (sem agendador)', () => {
  const agora = new Date('2026-07-22T12:00:00Z');
  it('PENDING com prazo vencido → expirado', () => {
    expect(conviteExpirado('PENDING', new Date('2026-07-01T00:00:00Z'), agora)).toBe(true);
  });
  it('PENDING dentro do prazo → não expirado', () => {
    expect(conviteExpirado('PENDING', new Date('2026-07-30T00:00:00Z'), agora)).toBe(false);
  });
  it('CANCELLED/ACCEPTED nunca são "expirado" (o estado já é terminal)', () => {
    expect(conviteExpirado('CANCELLED', new Date('2026-07-01T00:00:00Z'), agora)).toBe(false);
    expect(conviteExpirado('ACCEPTED', new Date('2026-07-01T00:00:00Z'), agora)).toBe(false);
  });
});

describe('DTO — allowlist fail-closed', () => {
  it('membros: chave desconhecida → 400', () => {
    expect(() => parseConsultaMembros({ orgId: 'x' })).toThrow();
    expect(() => parseConsultaMembros({ foo: '1' })).toThrow();
  });
  it('membros: state inválido → 400; válido passa', () => {
    expect(() => parseConsultaMembros({ state: 'ZUMBI' })).toThrow();
    expect(parseConsultaMembros({ state: 'SUSPENDED' }).state).toBe('SUSPENDED');
  });
  it('membros: role inválido → 400', () => {
    expect(() => parseConsultaMembros({ role: 'ROOT' })).toThrow();
  });
  it('membros: busca só espaços → sem busca; muito longa → 400', () => {
    expect(parseConsultaMembros({ busca: '   ' }).busca).toBeUndefined();
    expect(() => parseConsultaMembros({ busca: 'a'.repeat(201) })).toThrow();
  });
  it('convites: state do Invite (não do Membership) → PENDING válido; MEMBERSHIP-only rejeitado', () => {
    expect(parseConsultaConvites({ state: 'PENDING' }).state).toBe('PENDING');
    expect(() => parseConsultaConvites({ state: 'SUSPENDED' })).toThrow();
  });
  it('convites: chave desconhecida → 400', () => {
    expect(() => parseConsultaConvites({ token: 'x' })).toThrow();
  });
});
