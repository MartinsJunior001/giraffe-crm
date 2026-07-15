import { describe, expect, it } from 'vitest';
import {
  type ContextoDeTransicao,
  type ValidadorDeTransicao,
  VALIDADORES_PADRAO,
  executarPreflight,
  validarCicloAberto,
  validarConfirmacao,
  validarDestinoDiferente,
  validarFaseDestinoAtiva,
  validarMesmoPipe,
} from '../src/pipes/cards/movement/transition-preflight';

/**
 * Núcleo PURO do preflight de transição (Story 2.14) — provado sem PostgreSQL. Cobre cada validador built-in, a
 * composição/ordem com curto-circuito, e a EXTENSIBILIDADE (2.15/E4/E5 acrescentam validadores por composição de
 * lista, sem reescrever o serviço — CA4).
 */

const PIPE = 'pipe-1';

function ctx(over: Partial<ContextoDeTransicao> = {}): ContextoDeTransicao {
  return {
    card: { id: 'card-1', lifecycleState: 'ATIVO', phaseId: 'fase-origem' },
    faseOrigem: { id: 'fase-origem', pipeId: PIPE, ativa: true },
    faseDestino: { id: 'fase-destino', pipeId: PIPE, ativa: true },
    confirmado: true,
    ...over,
  };
}

describe('validadores built-in', () => {
  it('ciclo aberto: ATIVO passa; FINALIZADO/ARQUIVADO bloqueiam', () => {
    expect(validarCicloAberto(ctx())).toEqual({ ok: true });
    expect(
      validarCicloAberto(
        ctx({ card: { id: 'c', lifecycleState: 'FINALIZADO', phaseId: 'fase-origem' } }),
      ),
    ).toEqual({ ok: false, motivo: 'CICLO_NAO_ABERTO' });
    expect(
      validarCicloAberto(
        ctx({ card: { id: 'c', lifecycleState: 'ARQUIVADO', phaseId: 'fase-origem' } }),
      ),
    ).toEqual({ ok: false, motivo: 'CICLO_NAO_ABERTO' });
  });

  it('Fase destino ativa: ativa passa; arquivada bloqueia', () => {
    expect(validarFaseDestinoAtiva(ctx())).toEqual({ ok: true });
    expect(
      validarFaseDestinoAtiva(
        ctx({ faseDestino: { id: 'fase-destino', pipeId: PIPE, ativa: false } }),
      ),
    ).toEqual({ ok: false, motivo: 'FASE_DESTINO_ARQUIVADA' });
  });

  it('mesmo Pipe: igual passa; Pipe diferente bloqueia', () => {
    expect(validarMesmoPipe(ctx())).toEqual({ ok: true });
    expect(
      validarMesmoPipe(
        ctx({ faseDestino: { id: 'fase-destino', pipeId: 'outro-pipe', ativa: true } }),
      ),
    ).toEqual({ ok: false, motivo: 'FASE_DESTINO_OUTRO_PIPE' });
  });

  it('destino diferente: origem ≠ destino passa; iguais bloqueiam', () => {
    expect(validarDestinoDiferente(ctx())).toEqual({ ok: true });
    expect(
      validarDestinoDiferente(
        ctx({ faseDestino: { id: 'fase-origem', pipeId: PIPE, ativa: true } }),
      ),
    ).toEqual({ ok: false, motivo: 'FASE_DESTINO_IGUAL_ORIGEM' });
  });

  it('confirmação: true passa; false/ausente bloqueiam', () => {
    expect(validarConfirmacao(ctx())).toEqual({ ok: true });
    expect(validarConfirmacao(ctx({ confirmado: false }))).toEqual({
      ok: false,
      motivo: 'CONFIRMACAO_AUSENTE',
    });
  });
});

describe('executarPreflight — composição, ordem e curto-circuito', () => {
  it('contexto válido: todos passam → ok', () => {
    expect(executarPreflight(ctx())).toEqual({ ok: true });
  });

  it('curto-circuito: devolve o PRIMEIRO bloqueio (ciclo antes de confirmação)', () => {
    // Card ARQUIVADO e sem confirmação: a ordem padrão avalia ciclo antes; o motivo deve ser CICLO_NAO_ABERTO.
    const r = executarPreflight(
      ctx({
        card: { id: 'c', lifecycleState: 'ARQUIVADO', phaseId: 'fase-origem' },
        confirmado: false,
      }),
    );
    expect(r).toEqual({ ok: false, motivo: 'CICLO_NAO_ABERTO' });
  });

  it('confirmação ausente com o resto válido → CONFIRMACAO_AUSENTE', () => {
    expect(executarPreflight(ctx({ confirmado: false }))).toEqual({
      ok: false,
      motivo: 'CONFIRMACAO_AUSENTE',
    });
  });

  it('a lista padrão tem os 5 validadores built-in', () => {
    expect(VALIDADORES_PADRAO).toHaveLength(5);
  });
});

describe('extensibilidade (CA4) — 2.15/E4/E5 compõem sem reescrever o serviço', () => {
  it('um validador extra ACRESCENTADO à lista participa e pode bloquear', () => {
    const sempreBloqueia: ValidadorDeTransicao = () => ({
      ok: false,
      motivo: 'CONFIRMACAO_AUSENTE',
    });
    const lista = [...VALIDADORES_PADRAO, sempreBloqueia];
    // Contexto totalmente válido para os built-in, mas o validador extra bloqueia por último.
    expect(executarPreflight(ctx(), lista)).toEqual({ ok: false, motivo: 'CONFIRMACAO_AUSENTE' });
  });

  it('o validador extra não é consultado se um built-in anterior já bloqueou (curto-circuito preservado)', () => {
    let chamado = false;
    const espiao: ValidadorDeTransicao = () => {
      chamado = true;
      return { ok: true };
    };
    const lista = [...VALIDADORES_PADRAO, espiao];
    executarPreflight(ctx({ confirmado: false }), lista); // built-in confirma-ausente bloqueia antes do espião
    expect(chamado).toBe(false);
  });
});
