import { describe, expect, it } from 'vitest';
import {
  CATALOGO_NOTIFICACOES,
  exigirTipoImplementado,
  formatoTipoValido,
  obterTipoNotificacao,
  TipoNotificacaoInvalidoError,
} from '../src/notifications/notification-catalog';

/**
 * Provas PURAS do catálogo canônico de tipos de Notificação (Story 5.6) — sem banco, sem Nest. Fecha o gate
 * OQ-33: cada tipo declara estratégia/ator/metadados de preferência/origem; os tipos de E5 são implementados; os
 * slots de E6/E8 são declarados mas fail-closed no produtor.
 */

describe('catálogo — forma e integridade', () => {
  it('todo tipo casa o formato estrutural e é único', () => {
    const nomes = CATALOGO_NOTIFICACOES.map((t) => t.tipo);
    for (const n of nomes) expect(formatoTipoValido(n)).toBe(true);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('obrigatoriedade nasce TODA false (não se inventa obrigatoriedade sem decisão de Produto)', () => {
    expect(CATALOGO_NOTIFICACOES.every((t) => t.obrigatorio === false)).toBe(true);
  });

  it('registra os 5 tipos de E5 (implementados) e os 2 slots E6/E8 (não implementados)', () => {
    const e5 = CATALOGO_NOTIFICACOES.filter((t) => t.origem === 'E5');
    expect(e5.map((t) => t.tipo).sort()).toEqual(
      [
        'CARD_MOVED_BY_AUTOMATION',
        'CARD_RESPONSIBLE_ASSIGNED',
        'SOLICITACAO_RESPONSIBLE_ASSIGNED',
        'TASK_OVERDUE',
        'TASK_RESPONSIBLE_ASSIGNED',
      ].sort(),
    );
    expect(e5.every((t) => t.implementado)).toBe(true);

    expect(obterTipoNotificacao('AI_COMMAND_AWAITING_APPROVAL')?.origem).toBe('E6');
    expect(obterTipoNotificacao('INVITE_ACCEPTED')?.origem).toBe('E8');
    expect(obterTipoNotificacao('AI_COMMAND_AWAITING_APPROVAL')?.implementado).toBe(false);
    expect(obterTipoNotificacao('INVITE_ACCEPTED')?.implementado).toBe(false);
  });

  it('os tipos de designação EXCLUEM o ator (incluirAtor=false)', () => {
    for (const tipo of [
      'TASK_RESPONSIBLE_ASSIGNED',
      'SOLICITACAO_RESPONSIBLE_ASSIGNED',
      'CARD_RESPONSIBLE_ASSIGNED',
    ]) {
      expect(obterTipoNotificacao(tipo)?.incluirAtor).toBe(false);
    }
  });
});

describe('exigirTipoImplementado — fail-closed', () => {
  it('aceita um tipo de E5 implementado e devolve seus metadados', () => {
    const meta = exigirTipoImplementado('CARD_RESPONSIBLE_ASSIGNED');
    expect(meta.resourceType).toBe('CARD');
    expect(meta.estrategia).toBe('ALVO_DIRETO');
  });

  it('rejeita tipo desconhecido', () => {
    expect(() => exigirTipoImplementado('NAO_EXISTE')).toThrow(TipoNotificacaoInvalidoError);
  });

  it('rejeita SLOT de E6/E8 (registrado, mas sem produtor)', () => {
    expect(() => exigirTipoImplementado('AI_COMMAND_AWAITING_APPROVAL')).toThrow(
      TipoNotificacaoInvalidoError,
    );
    expect(() => exigirTipoImplementado('INVITE_ACCEPTED')).toThrow(TipoNotificacaoInvalidoError);
  });
});
