import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  type Opcao,
  OpcaoNaoEncontradaError,
  TypeConfigInvalidoError,
  adicionarOpcao,
  arquivarOpcao,
  lerOpcoes,
  removerOpcao,
  renomearOpcao,
  reordenarOpcao,
  serializarOpcoes,
} from '../src/pipes/forms/option-config';

/**
 * Núcleo PURO das opções de Seleção (Story 2.5) — os invariantes do `typeConfig` provados em unidade, sem
 * banco. Cada asserção de recusa é uma **mutação de risco**: se a validação correspondente fosse removida
 * (aceitar id duplicado, aceitar chave desconhecida, gravar label no lugar do id, aceitar label vazio), o
 * teste ficaria vermelho.
 */

function opc(over: Partial<Opcao> = {}): Opcao {
  return { id: randomUUID(), label: 'Opção', position: 1, state: 'ACTIVE', ...over };
}

describe('lerOpcoes — fail-closed a leitura malformada (invariante 8/9)', () => {
  it('lê `{}` como lista vazia e opções válidas em ordem de position', () => {
    expect(lerOpcoes({})).toEqual([]);
    const a = randomUUID();
    const b = randomUUID();
    const lidas = lerOpcoes({
      options: [
        { id: b, label: 'B', position: 2, state: 'ACTIVE' },
        { id: a, label: 'A', position: 1, state: 'ARCHIVED' },
      ],
    });
    expect(lidas.map((o) => o.id)).toEqual([a, b]); // ordenado por position
    expect(lidas[0]!.state).toBe('ARCHIVED');
  });

  it('opção legada sem `state` (2.4) é lida como ACTIVE', () => {
    const id = randomUUID();
    const [o] = lerOpcoes({ options: [{ id, label: 'Legada', position: 1 }] });
    expect(o).toEqual({ id, label: 'Legada', position: 1, state: 'ACTIVE' });
  });

  it('recusa typeConfig não-objeto, options não-array e item não-objeto', () => {
    expect(() => lerOpcoes(null)).toThrow(TypeConfigInvalidoError);
    expect(() => lerOpcoes([] as unknown as Record<string, never>)).toThrow(
      TypeConfigInvalidoError,
    );
    expect(() => lerOpcoes({ options: 'x' })).toThrow(TypeConfigInvalidoError);
    expect(() => lerOpcoes({ options: ['x'] })).toThrow(TypeConfigInvalidoError);
  });

  it('recusa id inválido, id duplicado e state inválido', () => {
    expect(() => lerOpcoes({ options: [{ id: 'nao-uuid', label: 'X', position: 1 }] })).toThrow(
      TypeConfigInvalidoError,
    );
    const dup = randomUUID();
    expect(() =>
      lerOpcoes({
        options: [
          { id: dup, label: 'A', position: 1 },
          { id: dup, label: 'B', position: 2 },
        ],
      }),
    ).toThrow(TypeConfigInvalidoError);
    expect(() =>
      lerOpcoes({ options: [{ id: randomUUID(), label: 'X', position: 1, state: 'X' }] }),
    ).toThrow(TypeConfigInvalidoError);
  });

  it('recusa chave desconhecida (anti-mass-assignment, invariante 9)', () => {
    expect(() =>
      lerOpcoes({ options: [{ id: randomUUID(), label: 'X', position: 1, extra: 'perigo' }] }),
    ).toThrow(TypeConfigInvalidoError);
  });

  it('recusa label vazio/só-espaços (invariante 6)', () => {
    expect(() => lerOpcoes({ options: [{ id: randomUUID(), label: '   ', position: 1 }] })).toThrow(
      TypeConfigInvalidoError,
    );
  });
});

describe('serializarOpcoes — reindexa e revalida (invariante 4/5/7)', () => {
  it('reindexa position 1..n na ordem recebida', () => {
    const saida = serializarOpcoes([opc({ position: 50 }), opc({ position: 99 })]) as unknown as {
      options: Opcao[];
    };
    expect(saida.options.map((o) => o.position)).toEqual([1, 2]);
  });

  it('recusa id duplicado (mutação: aceitar id duplicado ficaria vermelho)', () => {
    const id = randomUUID();
    expect(() => serializarOpcoes([opc({ id }), opc({ id })])).toThrow(TypeConfigInvalidoError);
  });

  it('round-trip preserva id e label', () => {
    const entrada = [opc({ label: 'Alfa' }), opc({ label: 'Beta' })];
    const relida = lerOpcoes(serializarOpcoes(entrada) as never);
    expect(relida.map((o) => o.id)).toEqual(entrada.map((o) => o.id));
    expect(relida.map((o) => o.label)).toEqual(['Alfa', 'Beta']);
  });
});

describe('transformações puras — identidade estável (invariante 1/3)', () => {
  it('adicionarOpcao acrescenta ACTIVE ao final com id novo', () => {
    const base = [opc({ label: 'A' })];
    const depois = adicionarOpcao(base, 'Nova');
    expect(depois).toHaveLength(2);
    expect(depois[1]!.label).toBe('Nova');
    expect(depois[1]!.state).toBe('ACTIVE');
    expect(depois[1]!.id).not.toBe(depois[0]!.id);
  });

  it('adicionarOpcao recusa label vazio', () => {
    expect(() => adicionarOpcao([], '   ')).toThrow(TypeConfigInvalidoError);
  });

  it('renomearOpcao muda só o label — o id PERMANECE (mutação: gravar label no lugar do id ficaria vermelho)', () => {
    const alvo = opc({ label: 'Antigo' });
    const [o] = renomearOpcao([alvo], alvo.id, 'Novo');
    expect(o!.id).toBe(alvo.id); // id inalterado
    expect(o!.label).toBe('Novo');
  });

  it('renomearOpcao 404 quando a opção não existe', () => {
    expect(() => renomearOpcao([opc()], randomUUID(), 'X')).toThrow(OpcaoNaoEncontradaError);
  });

  it('reordenarOpcao reordena sem alterar valor (id/label/state preservados)', () => {
    const a = opc({ label: 'A' });
    const b = opc({ label: 'B' });
    const c = opc({ label: 'C' });
    const depois = reordenarOpcao([a, b, c], c.id, null); // C para o início
    expect(depois.map((o) => o.label)).toEqual(['C', 'A', 'B']);
    // valores intactos (só a ordem mudou)
    expect(new Set(depois.map((o) => o.id))).toEqual(new Set([a.id, b.id, c.id]));
  });

  it('reordenarOpcao coloca após a âncora e 404 se a âncora não existe', () => {
    const a = opc({ label: 'A' });
    const b = opc({ label: 'B' });
    expect(reordenarOpcao([a, b], b.id, a.id).map((o) => o.label)).toEqual(['A', 'B']);
    expect(() => reordenarOpcao([a, b], a.id, randomUUID())).toThrow(OpcaoNaoEncontradaError);
  });

  it('reordenarOpcao "após si mesmo" é no-op (não erro) — M1', () => {
    const a = opc({ label: 'A' });
    const b = opc({ label: 'B' });
    const depois = reordenarOpcao([a, b], a.id, a.id); // âncora == alvo
    expect(depois.map((o) => o.label)).toEqual(['A', 'B']); // ordem inalterada, sem lançar
  });

  it('arquivarOpcao marca ARCHIVED preservando id/label; idempotente', () => {
    const alvo = opc({ label: 'X' });
    const uma = arquivarOpcao([alvo], alvo.id);
    expect(uma[0]!.state).toBe('ARCHIVED');
    expect(uma[0]!.id).toBe(alvo.id);
    const duas = arquivarOpcao(uma, alvo.id); // idempotente
    expect(duas[0]!.state).toBe('ARCHIVED');
  });

  it('removerOpcao retira a opção; 404 se não existe', () => {
    const a = opc();
    const b = opc();
    expect(removerOpcao([a, b], a.id).map((o) => o.id)).toEqual([b.id]);
    expect(() => removerOpcao([a], randomUUID())).toThrow(OpcaoNaoEncontradaError);
  });
});
