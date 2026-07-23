import { describe, expect, it } from 'vitest';
import {
  aoAlterarMembership,
  preflightEncerramentoMembership,
} from '../src/pipes/cards/access/membership-contract';

/**
 * Contrato de Membership × Card (Story 2.10, D-OA3) — funções PURAS, testadas sem banco. Provam a FORMA e os
 * invariantes do contrato que o Épico 8 consumirá: preflight vacuamente verdadeiro hoje (regra "Card exige
 * Responsável ativo" inexistente para Card — DIV-3), e o handler pós-alteração que revoga/remove ao encerrar,
 * preserva `creator` por construção e NÃO restaura ao reativar (SC-2106/2107/2108).
 */

describe('preflightEncerramentoMembership (SC-2106) — vacuamente verdadeiro hoje', () => {
  it('não bloqueia o encerramento por causa de Card (regra desligada), mesmo sendo Responsável', () => {
    const r = preflightEncerramentoMembership({ responsavelDe: ['card-1', 'card-2'] });
    expect(r.bloqueios).toEqual([]);
  });

  it('sem Cards de responsabilidade também não bloqueia', () => {
    expect(preflightEncerramentoMembership({ responsavelDe: [] }).bloqueios).toEqual([]);
  });
});

describe('aoAlterarMembership (SC-2107/2108) — reconciliação de acesso', () => {
  it('encerrar (REMOVED): revoga concessões, remove Responsável de Card, Tarefa E Solicitação e sinaliza reatribuição', () => {
    const plano = aoAlterarMembership({
      novoEstado: 'REMOVED',
      grantsAtivos: ['g1', 'g2'],
      responsavelDe: ['card-1'],
      taskResponsavelDe: ['task-1', 'task-2'],
      requestResponsavelDe: ['sol-1'],
    });
    expect(plano.revogarGrants).toEqual(['g1', 'g2']);
    expect(plano.removerResponsavelDe).toEqual(['card-1']);
    expect(plano.removerTaskResponsavelDe).toEqual(['task-1', 'task-2']); // Tarefas do alvo esvaziadas (5.1)
    expect(plano.removerRequestResponsavelDe).toEqual(['sol-1']); // Solicitações do alvo esvaziadas (5.2)
    // Cards, Tarefas E Solicitações órfãos sinalizados (não reatribuídos automaticamente — §1525/§1546).
    expect(plano.reatribuir).toEqual(['card-1', 'task-1', 'task-2', 'sol-1']);
  });

  it('compatibilidade: sem `requestResponsavelDe` (chamador anterior à 5.2), nada de Solicitação a esvaziar', () => {
    const plano = aoAlterarMembership({
      novoEstado: 'REMOVED',
      grantsAtivos: [],
      responsavelDe: [],
      taskResponsavelDe: ['task-1'],
    });
    expect(plano.removerRequestResponsavelDe).toEqual([]);
    expect(plano.reatribuir).toEqual(['task-1']);
  });

  it('compatibilidade: sem `taskResponsavelDe` (chamador anterior à 5.1), nada de Tarefa a esvaziar', () => {
    const plano = aoAlterarMembership({
      novoEstado: 'REMOVED',
      grantsAtivos: [],
      responsavelDe: ['card-1'],
    });
    expect(plano.removerTaskResponsavelDe).toEqual([]);
    expect(plano.reatribuir).toEqual(['card-1']);
  });

  it('suspender (SUSPENDED) desfaz acesso como encerrar', () => {
    const plano = aoAlterarMembership({
      novoEstado: 'SUSPENDED',
      grantsAtivos: ['g9'],
      responsavelDe: ['card-9'],
    });
    expect(plano.revogarGrants).toEqual(['g9']);
    expect(plano.removerResponsavelDe).toEqual(['card-9']);
  });

  it('reativar (ACTIVE) NÃO restaura nada — acesso perdido é reconcedido explicitamente (SC-2108)', () => {
    const plano = aoAlterarMembership({
      novoEstado: 'ACTIVE',
      grantsAtivos: ['g1'],
      responsavelDe: ['card-1'],
    });
    expect(plano.revogarGrants).toEqual([]);
    expect(plano.removerResponsavelDe).toEqual([]);
    expect(plano.reatribuir).toEqual([]);
  });

  it('creator é preservado por construção: o plano só toca concessões/Responsável, nunca a autoria', () => {
    // O contrato não tem conceito de "creator" a revogar — ele é o actorId do evento CREATED (2.7), não uma
    // concessão. Encerrar uma Membership sem concessões nem Responsável não produz NENHUMA ação.
    const plano = aoAlterarMembership({
      novoEstado: 'REMOVED',
      grantsAtivos: [],
      responsavelDe: [],
      taskResponsavelDe: [],
    });
    expect(plano).toEqual({
      revogarGrants: [],
      removerResponsavelDe: [],
      removerTaskResponsavelDe: [],
      removerRequestResponsavelDe: [],
      reatribuir: [],
    });
  });
});
