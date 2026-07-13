import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';

/**
 * O contexto organizacional pela porta da frente: HTTP real, `AppModule` real, banco real.
 *
 * Os testes de unidade provam as peças. Este prova a APLICAÇÃO — que o guard está de fato
 * registrado como global, que a dispensa dos probes funciona, que o handler recebe a Organização
 * certa e que duas requisições simultâneas de tenants diferentes não se contaminam.
 *
 * Montar um módulo-cópia aqui provaria a cópia. Por isso o `AppModule` é o de produção: a única
 * coisa substituída é o provider de identidade — que na Story 1.4 vira o login de verdade.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANA = '11111111-1111-1111-1111-111111111111'; // ACTIVE só na Org A
const CARLA = '33333333-3333-3333-3333-333333333333'; // ACTIVE só na Org B
const EVA = '55555555-5555-5555-5555-555555555555'; // ACTIVE nas Orgs A e B

/** Header usado APENAS pelo provider de teste. Não existe no bundle de produção. */
const HEADER_CONTA = 'x-test-account';

/**
 * Costura de teste que ocupa o lugar do login que ainda não existe (Story 1.4).
 *
 * Ela vive no diretório de testes de propósito. Colocar isto atrás de uma flag em `src/` seria um
 * bypass de autenticação embarcado na imagem de produção, esperando ser ligado por engano.
 */
class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

/** Requisição autenticada como `conta`, opcionalmente pedindo uma Organização. */
async function comoConta(baseUrl: string, conta: string, orgId?: string): Promise<Response> {
  const headers: Record<string, string> = { [HEADER_CONTA]: conta };
  if (orgId !== undefined) headers['x-org-id'] = orgId;
  return fetch(`${baseUrl}/organizations/current`, { headers });
}

describe('contexto organizacional sobre HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'silent';

    const moduloDeTeste = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRINCIPAL_PROVIDER)
      .useClass(PrincipalDeTeste)
      .compile();

    app = moduloDeTeste.createNestApplication({ logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('deny-by-default', () => {
    it('sem principal, a rota responde 401 — e não 200 com dados de alguém', async () => {
      const res = await fetch(`${baseUrl}/organizations/current`);

      // 401 e não 403: "não sei quem você é" é diferente de "sei e você não pode".
      expect(res.status).toBe(401);
    });

    it('o corpo do 401 não vaza nada sobre o que existe do outro lado', async () => {
      const res = await fetch(`${baseUrl}/organizations/current`);
      const corpo = await res.text();

      expect(corpo).not.toMatch(/organization|membership|postgres|prisma/i);
    });
  });

  describe('dispensa explícita dos probes', () => {
    it('GET /health continua 200 SEM contexto', async () => {
      // Se o guard global valesse aqui, o healthcheck do orquestrador levaria 401, o container
      // nunca ficaria healthy e o deploy morreria — o guard mataria a aplicação que protege.
      const res = await fetch(`${baseUrl}/health`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });

    it('GET /ready continua 200 SEM contexto', async () => {
      const res = await fetch(`${baseUrl}/ready`);

      expect(res.status).toBe(200);
    });

    it('e a dispensa NÃO se espalha: uma rota de domínio segue protegida', async () => {
      // A prova de que a allowlist é uma allowlist, e não um interruptor geral.
      const res = await fetch(`${baseUrl}/organizations/current`);

      expect(res.status).toBe(401);
    });
  });

  describe('caminho positivo', () => {
    it('com Membership ativa, o handler enxerga a PRÓPRIA Organização', async () => {
      const res = await comoConta(baseUrl, ANA);

      expect(res.status).toBe(200);
      // `papel` (Story 1.7) vem do contexto resolvido: Ana é ADMIN na Org A. É o único campo além de
      // id/name/slug — sem PII, sem contagem.
      expect(await res.json()).toEqual({
        id: ORG_A,
        name: 'Organização A',
        slug: 'org-a',
        papel: 'ADMIN',
      });
    });

    it('o handler não recebe orgId nenhum do cliente — a Org vem do contexto', async () => {
      // Carla, sem pedir nada, cai na Org B. Ana, sem pedir nada, cai na Org A. A rota é a mesma
      // e não tem parâmetro: não existe caminho pelo qual o cliente escolha o que vai ler.
      const res = await comoConta(baseUrl, CARLA);

      expect(res.status).toBe(200);
      expect((await res.json()) as { id: string }).toMatchObject({ id: ORG_B });
    });

    it('conta com duas Organizações escolhe explicitamente', async () => {
      const res = await comoConta(baseUrl, EVA, ORG_B);

      expect(res.status).toBe(200);
      expect((await res.json()) as { id: string }).toMatchObject({ id: ORG_B });
    });

    it('…e sem escolher, é 403 — a plataforma não adivinha por ela', async () => {
      const res = await comoConta(baseUrl, EVA);

      expect(res.status).toBe(403);
    });
  });

  describe('o header x-org-id é um pedido, não uma autoridade', () => {
    it('pedir a Organização de outro tenant é 403', async () => {
      // O ataque direto: Ana manda `x-org-id: <Org B>`. Sem o resolvedor, `withTenantContext`
      // obedeceria — e a RLS, funcionando perfeitamente, entregaria a Org B.
      const res = await comoConta(baseUrl, ANA, ORG_B);

      expect(res.status).toBe(403);
    });

    it('header repetido é pedido ambíguo, e ambíguo é negado', async () => {
      // ATENÇÃO ao que o Node faz aqui, porque a primeira versão deste teste passava pelo motivo
      // errado: duplicatas NÃO viram array (só `set-cookie` vira). Elas chegam como uma única
      // string juntada por vírgula — `"uuid-a, uuid-b"`. O `Array.isArray()` original nunca
      // disparava, e o 403 vinha por acidente, da vírgula quebrando a regex de UUID.
      //
      // Escolher "o primeiro" (ou o último) é a assimetria de que vive o request smuggling: o proxy
      // valida um valor, a aplicação honra outro.
      const res = await fetch(`${baseUrl}/organizations/current`, {
        headers: [
          [HEADER_CONTA, ANA],
          ['x-org-id', ORG_A], // ← a Org de Ana: se a aplicação "escolhesse o primeiro", daria 200
          ['x-org-id', ORG_B],
        ],
      });

      // 403 e não 200: a requisição é negada mesmo que o PRIMEIRO valor fosse legítimo. É isso que
      // distingue "rejeitou a ambiguidade" de "escolheu um dos dois e deu certo por sorte".
      expect(res.status).toBe(403);
    });

    it('orgId malformado é 403, não 500', async () => {
      const res = await comoConta(baseUrl, ANA, 'nao-e-um-uuid');

      expect(res.status).toBe(403);
    });

    it('UUID em MAIÚSCULAS de um membro legítimo é aceito (200)', async () => {
      // O PostgreSQL emite `uuid` sempre em minúsculas. A regex aceitava maiúsculas, mas a
      // comparação com a Membership era byte a byte — então um cliente .NET/Java mandando
      // `Guid.ToString().ToUpper()` levava 403 sendo membro ativo, E gerava um `context.denied`.
      // Ruído fabricado em cima do único sinal de segurança que esta Story produz.
      const res = await comoConta(baseUrl, EVA, ORG_B.toUpperCase());

      expect(res.status).toBe(200);
      expect((await res.json()) as { id: string }).toMatchObject({ id: ORG_B });
    });
  });

  describe('concorrência — o teste que um vazamento silencioso teria de sobreviver', () => {
    it('30 requisições simultâneas de tenants diferentes: nenhuma vê a Organização da outra', async () => {
      // Sequencialmente, um contexto vazado quase nunca aparece: cada requisição sobrescreve o
      // resíduo da anterior antes de lê-lo. Ele aparece SOB CONCORRÊNCIA, quando duas requisições
      // se intercalam no mesmo processo — que é o estado normal de um servidor em produção e o
      // estado raro de uma suíte de testes. Por isso este teste existe.
      const esperado = Array.from({ length: 30 }, (_, i) =>
        i % 2 === 0 ? { conta: ANA, org: ORG_A } : { conta: CARLA, org: ORG_B },
      );

      const respostas = await Promise.all(
        esperado.map(async ({ conta }) => {
          const res = await comoConta(baseUrl, conta);
          return { status: res.status, corpo: (await res.json()) as { id: string } };
        }),
      );

      respostas.forEach((res, i) => {
        expect(res.status).toBe(200);
        expect(res.corpo.id).toBe(esperado[i]!.org);
      });
    });

    it('a MESMA conta pedindo Organizações diferentes ao mesmo tempo não se contamina', async () => {
      // O teste acima alterna CONTAS, e por isso deixaria passar um vazamento chaveado por conta —
      // um cache/memoização por `accountId`, um `Map` no resolvedor, um `set_config` que escapasse
      // do escopo transacional. Todos resolveriam "a Org da conta X" e devolveriam a mesma resposta
      // para as duas requisições dela.
      //
      // Eva é ACTIVE nas Orgs A e B. Aqui ela pede as duas simultaneamente, e cada resposta tem de
      // corresponder ao que AQUELA requisição pediu.
      const pedidos = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? ORG_A : ORG_B));

      const respostas = await Promise.all(
        pedidos.map(async (org) => {
          const res = await comoConta(baseUrl, EVA, org);
          return { status: res.status, corpo: (await res.json()) as { id: string } };
        }),
      );

      respostas.forEach((res, i) => {
        expect(res.status).toBe(200);
        expect(res.corpo.id).toBe(pedidos[i]);
      });
    });
  });
});

describe('o AppModule de PRODUÇÃO nega — a costura de teste não existe lá', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'silent';

    // Sem `overrideProvider`. Este é o grafo que vai para a imagem.
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('o provider real devolve 401 mesmo com o header da costura de teste', async () => {
    // A garantia de que o `PrincipalDeTeste` é costura e não backdoor: no grafo de produção o
    // header não significa nada. Se um dia alguém registrar o provider de teste no `AppModule`,
    // ESTE teste fica vermelho.
    const res = await fetch(`${baseUrl}/organizations/current`, {
      headers: { [HEADER_CONTA]: ANA },
    });

    expect(res.status).toBe(401);
  });
});
