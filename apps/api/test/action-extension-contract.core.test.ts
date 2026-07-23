import { describe, expect, it } from 'vitest';
import type { Acao } from '../src/pipes/automations/automation-config';
import { SCHEMA_VERSION_CONFIG } from '../src/pipes/automations/automation-config';
import { ACOES_CATALOGO, TIPOS_ACAO } from '../src/pipes/automations/actions/action-catalog';
import { TIPOS_NUCLEO } from '../src/domain-events/event-catalog';
import {
  AcaoDeExtensaoIndisponivelError,
  AcaoDesconhecidaError,
  DADOS_DE_TRILHA_PERMITIDOS,
  EVENTO_GERADO_ASSIGN_RESPONSIBLE,
  EVENTO_GERADO_RECORD_CREATE,
  type ExecutorKind,
  type GateDisponibilidade,
  type HandlerDeAcao,
  REGISTRO_ACOES_EXTENSAO,
  REGISTRO_ACOES_NUCLEO,
  SUPERFICIE_HANDLER,
  TIPOS_ACAO_EXTENSAO,
  exigirAcaoDisponivel,
  handlerEhExecutavelNaFase1,
  obterHandler,
  rejeitarAcoesDeExtensao,
} from '../src/pipes/automations/actions/action-extension-contract';

/**
 * Contrato de extensão de Ações (Story 4.9) — teste PURO do registro tipado/versionado de handlers a que os 8
 * handlers núcleo (4.5/4.6) JÁ se conformam, dos pontos de extensão E5/E6 declarados-mas-não-executáveis, e das
 * proibições da Fase 1 IMPOSSÍVEIS por construção (plugins/código/scripts/handlers externos/HTTP). Sem banco: o
 * contrato é um invariante testável sem PostgreSQL, como `action-catalog.core.test.ts` (4.5) e
 * `event-catalog.core.test.ts` (4.3).
 */

const EXECUTORES_FECHADOS: readonly ExecutorKind[] = [
  'ATRIBUIR_RESPONSAVEL',
  'CRIAR_REGISTRO',
  'CONFIRMACAO_HUMANA',
  'EXTENSAO',
];
const GATES_FECHADOS: readonly GateDisponibilidade[] = ['ESTADO_ALVO', 'FORMVERSION_PUBLICADA'];

const acao = (tipo: string): Acao => ({ tipo, parametros: {}, refs: [] });

describe('(§1463) bijeção catálogo(4.5) ↔ registro núcleo (fonte única, sem tipo órfão)', () => {
  it('todo tipo do catálogo tem exatamente um handler núcleo e vice-versa', () => {
    const tiposCatalogo = new Set(ACOES_CATALOGO.map((c) => c.tipo));
    const tiposRegistro = REGISTRO_ACOES_NUCLEO.map((h) => h.tipo);
    expect(new Set(tiposRegistro).size).toBe(tiposRegistro.length); // sem duplicata
    expect(new Set(tiposRegistro)).toEqual(tiposCatalogo);
    expect(tiposRegistro.length).toBe(TIPOS_ACAO.size);
  });

  it('cada handler núcleo herda dominio/exigeConfirmacaoHumana/validarConfig do catálogo (não duplica)', () => {
    for (const h of REGISTRO_ACOES_NUCLEO) {
      const cat = ACOES_CATALOGO.find((c) => c.tipo === h.tipo)!;
      expect(h.dominio).toBe(cat.dominio);
      expect(h.exigeConfirmacaoHumana).toBe(cat.exigeConfirmacaoHumana);
      expect(h.validarConfig).toBe(cat.validar); // MESMA função — sem reimplementar o validador
      expect(h.origem).toBe('CORE');
      expect(h.schemaVersion).toBe(SCHEMA_VERSION_CONFIG);
    }
  });
});

describe('(§1463) as 11 facetas declaradas e TOTAIS; executor de enum FECHADO (proibições por construção)', () => {
  it('toda faceta variável está presente e bem-formada em cada handler núcleo', () => {
    for (const h of REGISTRO_ACOES_NUCLEO) {
      expect(typeof h.tipo).toBe('string');
      expect(typeof h.schemaVersion).toBe('number');
      expect(typeof h.exigeConfirmacaoHumana).toBe('boolean');
      expect(Array.isArray(h.gatesDisponibilidade)).toBe(true);
      expect(Array.isArray(h.eventosProduzidos)).toBe(true);
      expect(typeof h.validarConfig).toBe('function');
      // executor é SEMPRE um valor do enum fechado — NUNCA uma função/URL/script vinda de fora.
      expect(typeof h.executor).toBe('string');
      expect(EXECUTORES_FECHADOS).toContain(h.executor);
      for (const g of h.gatesDisponibilidade) expect(GATES_FECHADOS).toContain(g);
    }
  });

  it('a superfície uniforme expõe resolvedor/revalidador/sanitização/allowlist de trilha', () => {
    expect(typeof SUPERFICIE_HANDLER.resolverAlvo).toBe('function');
    expect(typeof SUPERFICIE_HANDLER.revalidar).toBe('function');
    expect(SUPERFICIE_HANDLER.sanitizacao).toBe('ENUM_ESTRUTURAL_AD30');
    expect([...DADOS_DE_TRILHA_PERMITIDOS]).toEqual(['type', 'summary', 'actorId']);
  });
});

describe('(§1463) gate de estado conforme o catálogo 4.5 (estadosAlvoValidos)', () => {
  it('handler declara ESTADO_ALVO sse, e só se, o catálogo restringe o estado do alvo', () => {
    for (const h of REGISTRO_ACOES_NUCLEO) {
      const cat = ACOES_CATALOGO.find((c) => c.tipo === h.tipo)!;
      const temGateEstado = h.gatesDisponibilidade.includes('ESTADO_ALVO');
      expect(temGateEstado).toBe(cat.estadosAlvoValidos !== null);
    }
  });
});

describe('(§1463 faceta .10) eventos produzidos = emissão real do motor (declarado = usado, sem drift)', () => {
  const byTipo = (t: string): HandlerDeAcao => obterHandler(t)!;

  it('os 3 executáveis declaram exatamente o Evento canônico que os executores 4.6 emitem', () => {
    expect(byTipo('CARD_ASSIGN_RESPONSIBLE').executor).toBe('ATRIBUIR_RESPONSAVEL');
    expect(byTipo('CARD_ASSIGN_RESPONSIBLE').eventosProduzidos).toEqual([
      EVENTO_GERADO_ASSIGN_RESPONSIBLE,
    ]);
    for (const t of ['RECORD_CREATE', 'RECORD_CREATE_RELATED']) {
      expect(byTipo(t).executor).toBe('CRIAR_REGISTRO');
      expect(byTipo(t).eventosProduzidos).toEqual([EVENTO_GERADO_RECORD_CREATE]);
    }
  });

  it('todo Evento produzido declarado é um Evento canônico NÚCLEO real (4.3), nunca inventado', () => {
    for (const h of REGISTRO_ACOES_NUCLEO) {
      for (const ev of h.eventosProduzidos) expect(TIPOS_NUCLEO.has(ev)).toBe(true);
    }
  });

  it('Ações sensíveis (confirmação humana) não executam na Fase 1 ⇒ executor CONFIRMACAO_HUMANA e sem Evento', () => {
    for (const h of REGISTRO_ACOES_NUCLEO) {
      if (h.exigeConfirmacaoHumana) {
        expect(h.executor).toBe('CONFIRMACAO_HUMANA');
        expect(h.eventosProduzidos).toEqual([]);
      }
    }
  });
});

describe('(§1463) pontos de extensão E5/E6: contrato declarado, NÃO executável (espelho de EVENTOS_EXTENSAO, 4.3)', () => {
  it('todo tipo de extensão é EXTENSION, executor EXTENSAO e não executável na Fase 1', () => {
    for (const t of TIPOS_ACAO_EXTENSAO) {
      const h = obterHandler(t)!;
      expect(h.origem).toBe('EXTENSION');
      expect(h.executor).toBe('EXTENSAO');
      expect(handlerEhExecutavelNaFase1(t)).toBe(false);
      expect(h.eventosProduzidos).toEqual([]);
    }
    expect(REGISTRO_ACOES_EXTENSAO.length).toBe(TIPOS_ACAO_EXTENSAO.length);
  });

  it('configurar uma Ação de extensão é recusado fail-closed (validarConfig lança)', () => {
    for (const t of TIPOS_ACAO_EXTENSAO) {
      expect(() => obterHandler(t)!.validarConfig(acao(t), 'entao[0]')).toThrow(
        AcaoDeExtensaoIndisponivelError,
      );
    }
  });

  it('nenhum tipo de extensão colide com o catálogo núcleo executável', () => {
    for (const t of TIPOS_ACAO_EXTENSAO) expect(TIPOS_ACAO.has(t)).toBe(false);
  });
});

describe('enforcement fail-closed: extensão × desconhecido têm motivos DISTINTOS', () => {
  it('exigirAcaoDisponivel: núcleo passa; extensão e desconhecido lançam erros distintos', () => {
    for (const c of ACOES_CATALOGO) expect(() => exigirAcaoDisponivel(c.tipo)).not.toThrow();
    expect(() => exigirAcaoDisponivel('TASK_CREATE')).toThrow(AcaoDeExtensaoIndisponivelError);
    expect(() => exigirAcaoDisponivel('NAO_EXISTE')).toThrow(AcaoDesconhecidaError);
  });

  it('rejeitarAcoesDeExtensao: recusa extensão; deixa passar desconhecido (segue p/ o catálogo 4.5) e núcleo', () => {
    expect(() => rejeitarAcoesDeExtensao([acao('EMAIL_SEND')])).toThrow(
      AcaoDeExtensaoIndisponivelError,
    );
    // desconhecido NÃO é responsabilidade desta guarda (preserva a regressão da 4.5) ⇒ não lança aqui.
    expect(() => rejeitarAcoesDeExtensao([acao('NAO_EXISTE')])).not.toThrow();
    expect(() => rejeitarAcoesDeExtensao([acao('RECORD_CREATE')])).not.toThrow();
  });
});
