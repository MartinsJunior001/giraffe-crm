import { describe, expect, it } from 'vitest';
import { normalizarIp, resolverIpCliente } from '../src/kernel/auth/client-ip';

/**
 * A regra de resolução de IP — o alicerce do G2.
 *
 * Estes casos existem porque a versão anterior desta Story delegava a decisão ao `getIp()` do Better
 * Auth, que resolve o IP **só a partir de headers**. Um teste de spoofing provou o resultado: com um
 * `X-Forwarded-For` forjado diferente a cada requisição, o limite por origem nunca disparava.
 */

const PROXY = '10.1.2.3';
const CLIENTE = '203.0.113.10';
const ATACANTE = '198.51.100.66';

describe('sem proxy confiável (o default)', () => {
  it('o X-Forwarded-For do cliente é IGNORADO — vale o socket', () => {
    // O ataque, em uma linha: "eu sou outra pessoa a cada requisição". Se o header vencesse, cada
    // tentativa cairia num contador novo e o G2 nunca acumularia nada.
    const ip = resolverIpCliente({
      peer: CLIENTE,
      forwarded: '1.1.1.1',
      proxiesConfiaveis: [],
    });

    expect(ip).toBe(CLIENTE);
  });

  it('uma cadeia inteira forjada também é ignorada', () => {
    const ip = resolverIpCliente({
      peer: CLIENTE,
      forwarded: '1.1.1.1, 2.2.2.2, 3.3.3.3',
      proxiesConfiaveis: [],
    });

    expect(ip).toBe(CLIENTE);
  });

  it('sem header nenhum, vale o socket', () => {
    expect(resolverIpCliente({ peer: CLIENTE, forwarded: undefined, proxiesConfiaveis: [] })).toBe(
      CLIENTE,
    );
  });
});

describe('com proxy confiável', () => {
  it('o cliente é o salto mais à DIREITA que não é proxy nosso', () => {
    // O proxy ACRESCENTA à direita o endereço de quem falou com ele. Logo, o último salto não
    // confiável, lido da direita para a esquerda, é o cliente real.
    const ip = resolverIpCliente({
      peer: PROXY,
      forwarded: `${ATACANTE}, ${CLIENTE}`,
      proxiesConfiaveis: [PROXY],
    });

    // O `ATACANTE` está à esquerda porque foi ELE quem enviou aquele valor — a parte da cadeia que o
    // cliente controla. Ler da esquerda (o erro clássico) devolveria exatamente o que o atacante
    // escreveu.
    expect(ip).toBe(CLIENTE);
  });

  it('proxies encadeados são pulados, um a um', () => {
    const ip = resolverIpCliente({
      peer: PROXY,
      forwarded: `${CLIENTE}, ${PROXY}, 10.9.9.9`,
      proxiesConfiaveis: [PROXY, '10.9.9.9'],
    });

    expect(ip).toBe(CLIENTE);
  });

  it('cadeia só de proxies: cai no peer, e não inventa um cliente', () => {
    const ip = resolverIpCliente({
      peer: PROXY,
      forwarded: PROXY,
      proxiesConfiaveis: [PROXY],
    });

    expect(ip).toBe(PROXY);
  });

  it('salto não-confiável que não é IP válido cai no peer (não envenena o contador)', () => {
    // Um proxy confiável pode encaminhar lixo no lugar do IP do cliente (`999.999.999.999`, um nome,
    // vazio). Se esse lixo virasse a chave do rate limit, o atacante escolheria em qual balde cair —
    // um por string forjada — e o G2 nunca acumularia. A regra: salto que não é IP de verdade é
    // descartado e vale o peer (o proxy), que é sempre um endereço real.
    const ip = resolverIpCliente({
      peer: PROXY,
      forwarded: `${CLIENTE}, 999.999.999.999`,
      proxiesConfiaveis: [PROXY],
    });

    expect(ip).toBe(PROXY);
  });

  it('lixo não-IP na ponta direita não é aceito nem quando há um cliente válido antes', () => {
    // Variação com string arbitrária (não numérica): mesmo tratamento — não é IP, cai no peer.
    const ip = resolverIpCliente({
      peer: PROXY,
      forwarded: `${CLIENTE}, não-é-um-ip`,
      proxiesConfiaveis: [PROXY],
    });

    expect(ip).toBe(PROXY);
  });

  it('o proxy confiável NÃO autoriza um peer qualquer a forjar', () => {
    // Configurar o proxy não abre o header para todo mundo: quem chega direto no contêiner (peer =
    // atacante) continua sem autoridade nenhuma sobre o próprio IP. É exatamente o caso que o
    // Better Auth não consegue distinguir, porque ele nunca vê o socket.
    const ip = resolverIpCliente({
      peer: ATACANTE,
      forwarded: '1.1.1.1',
      proxiesConfiaveis: [PROXY],
    });

    expect(ip).toBe(ATACANTE);
  });
});

describe('normalização', () => {
  it('IPv4 mapeado em IPv6 vira IPv4 — o mesmo cliente, um contador só', () => {
    // O Node entrega `::ffff:127.0.0.1` em socket dual-stack. Sem normalizar, o mesmo cliente teria
    // DOIS contadores (um por grafia) e o limite efetivo dobraria.
    expect(normalizarIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('a normalização também vale para a lista de confiáveis e para a cadeia', () => {
    const ip = resolverIpCliente({
      peer: `::ffff:${PROXY}`,
      forwarded: `::ffff:${CLIENTE}`,
      proxiesConfiaveis: [PROXY],
    });

    expect(ip).toBe(CLIENTE);
  });
});
