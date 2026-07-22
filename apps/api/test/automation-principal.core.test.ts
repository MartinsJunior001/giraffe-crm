import { describe, expect, it } from 'vitest';
import {
  escopoAlcancaRecurso,
  type Iniciador,
  montarTrilhaAtoria,
  PRINCIPAL_AUTOMACAO,
  type PrincipalAutomacao,
  temCapacidade,
} from '../src/pipes/automations/actions/automation-principal';

/**
 * Contrato do PRINCIPAL AUTOMAÇÃO (Story 4.5 — RN-101; AD-9/AD-18) — teste PURO. Prova o escopo RESTRITO
 * (deny-by-default), as capacidades explícitas e a distinção dos TRÊS papéis da trilha (ator/iniciador/principal).
 */

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PIPE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECURSO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function principal(parcial: Partial<PrincipalAutomacao> = {}): PrincipalAutomacao {
  return {
    tipo: PRINCIPAL_AUTOMACAO,
    orgId: ORG,
    pipeId: PIPE,
    automationId: 'auto-1',
    automationVersionId: 'v1',
    recursosAutorizados: new Set([PIPE, RECURSO]),
    capacidades: new Set(['CARD_FINALIZE', 'RECORD_CREATE']),
    ...parcial,
  };
}

describe('escopo RESTRITO (deny-by-default)', () => {
  it('(c) alcança apenas recursos na allowlist — o que não está é inalcançável', () => {
    const p = principal();
    expect(escopoAlcancaRecurso(p, RECURSO)).toBe(true);
    expect(escopoAlcancaRecurso(p, PIPE)).toBe(true);
    // Um recurso que o CRIADOR poderia alcançar, mas que não está na allowlist do principal → negado.
    expect(escopoAlcancaRecurso(p, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')).toBe(false);
  });

  it('capacidade é EXPLÍCITA (AD-18) — tipo de Ação fora da allowlist é negado', () => {
    const p = principal();
    expect(temCapacidade(p, 'CARD_FINALIZE')).toBe(true);
    expect(temCapacidade(p, 'RECORD_CREATE')).toBe(true);
    // CARD_MOVE é um tipo VÁLIDO do catálogo, mas o principal não o carrega → negado.
    expect(temCapacidade(p, 'CARD_MOVE')).toBe(false);
  });
});

describe('(f) trilha distingue ator, iniciador e principal', () => {
  it('os três papéis saem distintos e explícitos', () => {
    const iniciador: Iniciador = {
      tipo: 'HUMANO',
      accountId: 'conta-humana',
      automationId: null,
    };
    const trilha = montarTrilhaAtoria(principal(), iniciador);

    // ATOR = o principal Automação (quem executa agora), NÃO o humano iniciador.
    expect(trilha.ator.tipo).toBe(PRINCIPAL_AUTOMACAO);
    expect(trilha.ator.automationId).toBe('auto-1');

    // INICIADOR = quem começou a mudança original (o humano), PRESERVADO.
    expect(trilha.iniciador.tipo).toBe('HUMANO');
    expect(trilha.iniciador.accountId).toBe('conta-humana');

    // PRINCIPAL = a definição versionada que agiu (AD-18 — registra a versão usada).
    expect(trilha.principal.automationId).toBe('auto-1');
    expect(trilha.principal.automationVersionId).toBe('v1');

    // O ator não é fundido com o iniciador: a Automação não "vira" o humano criador.
    expect(trilha.ator.automationId).not.toBe(trilha.iniciador.accountId);
  });

  it('preserva um iniciador que é OUTRA Automação (encadeamento — 4.7)', () => {
    const iniciador: Iniciador = {
      tipo: 'AUTOMACAO',
      accountId: null,
      automationId: 'auto-origem',
    };
    const trilha = montarTrilhaAtoria(principal(), iniciador);
    expect(trilha.iniciador.tipo).toBe('AUTOMACAO');
    expect(trilha.iniciador.automationId).toBe('auto-origem');
    // O principal que age agora é distinto de quem iniciou a cadeia.
    expect(trilha.principal.automationId).not.toBe(trilha.iniciador.automationId);
  });
});
