import { setTimeout as espera } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { ContextoIndisponivelError, RequestContext } from '../src/kernel/context/request-context';

/**
 * O escopo de contexto é a peça onde um vazamento seria SILENCIOSO: nada quebra, nada loga, e
 * uma requisição passa a enxergar o tenant da outra. Por isso estes testes são desconfiados.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANA = '11111111-1111-1111-1111-111111111111';
const CARLA = '33333333-3333-3333-3333-333333333333';

describe('leitura fora de contexto LANÇA (e não devolve undefined)', () => {
  it('obter() fora de qualquer requisição lança', () => {
    const ctx = new RequestContext();

    // Esta é a decisão central do arquivo. Devolver `undefined` seria a porta do bug clássico:
    // alguém escreve `ctx?.orgId`, "trata" o undefined com um default, e o que era "sem
    // contexto" vira "qualquer contexto".
    expect(() => ctx.obter()).toThrow(ContextoIndisponivelError);
    expect(() => ctx.obter()).toThrow(/fora de uma requisição/i);
  });

  it('obter() DENTRO da requisição, mas antes de o guard resolver, também lança', () => {
    const ctx = new RequestContext();

    // Os dois casos são distintos e ambos precisam falhar: "não há escopo" e "há escopo, mas o
    // contexto ainda não foi resolvido". O segundo é o mais perigoso — parece que está tudo bem.
    ctx.executarNoEscopo(() => {
      expect(() => ctx.obter()).toThrow(/ainda não teve o contexto resolvido/i);
      expect(ctx.temContexto()).toBe(false);
    });
  });

  it('definir() fora de um escopo lança — ninguém escreve contexto no vácuo', () => {
    const ctx = new RequestContext();

    expect(() => ctx.definir({ orgId: ORG_A, accountId: ANA, papel: 'MEMBER' })).toThrow(
      ContextoIndisponivelError,
    );
  });
});

describe('o contexto é imutável dentro da requisição', () => {
  it('definir() duas vezes lança', () => {
    const ctx = new RequestContext();

    ctx.executarNoEscopo(() => {
      ctx.definir({ orgId: ORG_A, accountId: ANA, papel: 'MEMBER' });

      // Um contexto que pode ser trocado no meio da requisição é um contexto que pode ser trocado
      // POR UM ATACANTE no meio da requisição.
      expect(() => ctx.definir({ orgId: ORG_B, accountId: CARLA, papel: 'MEMBER' })).toThrow(
        /já foi definido nesta requisição/i,
      );

      expect(ctx.obter().orgId).toBe(ORG_A);
    });
  });
});

describe('o contexto não sobrevive nem vaza', () => {
  it('não sobrevive ao fim do escopo', () => {
    const ctx = new RequestContext();

    ctx.executarNoEscopo(() => {
      ctx.definir({ orgId: ORG_A, accountId: ANA, papel: 'MEMBER' });
      expect(ctx.obter().orgId).toBe(ORG_A);
    });

    // Contexto que sobrevive à requisição é contexto que vaza para a próxima.
    expect(() => ctx.obter()).toThrow(ContextoIndisponivelError);
  });

  it('não vaza entre escopos SEQUENCIAIS (o caso do worker/conexão reutilizada)', () => {
    const ctx = new RequestContext();

    ctx.executarNoEscopo(() => ctx.definir({ orgId: ORG_A, accountId: ANA, papel: 'MEMBER' }));

    ctx.executarNoEscopo(() => {
      // Se o escopo anterior tivesse deixado resíduo, o contexto da Org A apareceria aqui — e a
      // requisição da Carla leria dados da Ana.
      expect(ctx.temContexto()).toBe(false);
      expect(() => ctx.obter()).toThrow();
    });
  });

  it('NÃO vaza entre escopos CONCORRENTES — o teste que realmente importa', async () => {
    const ctx = new RequestContext();

    // Duas "requisições" simultâneas, de Organizações diferentes, no mesmo processo, com pontos
    // de await no meio (que é onde o event loop intercala as duas). Se a AsyncLocalStorage
    // vazasse, é aqui que apareceria.
    const requisicao = async (orgId: string, accountId: string, atraso: number) =>
      ctx.executarNoEscopo(async () => {
        ctx.definir({ orgId, accountId, papel: 'MEMBER' });
        await espera(atraso);
        const meio = ctx.obter();
        await espera(atraso);
        const fim = ctx.obter();
        return { meio: meio.orgId, fim: fim.orgId, conta: fim.accountId };
      });

    const [a, b] = await Promise.all([
      requisicao(ORG_A, ANA, 8),
      requisicao(ORG_B, CARLA, 3), // termina antes, de propósito: força a intercalação
    ]);

    expect(a).toEqual({ meio: ORG_A, fim: ORG_A, conta: ANA });
    expect(b).toEqual({ meio: ORG_B, fim: ORG_B, conta: CARLA });
  });

  it('aguenta muitas requisições concorrentes sem trocar nenhum contexto', async () => {
    const ctx = new RequestContext();

    // 50 requisições intercaladas com atrasos irregulares. Uma única troca de contexto aqui é um
    // vazamento cross-tenant em produção.
    const resultados = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        ctx.executarNoEscopo(async () => {
          const orgId = `org-${i}`;
          ctx.definir({ orgId, accountId: `conta-${i}`, papel: 'MEMBER' });
          await espera(i % 7);
          return ctx.obter().orgId === orgId;
        }),
      ),
    );

    expect(resultados.every(Boolean)).toBe(true);
  });
});
