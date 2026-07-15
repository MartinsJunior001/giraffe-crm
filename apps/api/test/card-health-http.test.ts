import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Saúde temporal derivada (Story 2.13) pela porta da frente: HTTP real, banco real. Prova que o DETALHE do Card
 * (2.9) expõe a `saude` DERIVADA dos marcos reais (2.12) e o `indicadorDominante` (precedência ciclo de vida ›
 * saúde) — sem persistir estado (o `Card` segue append-only). Datas de override extremas tornam o teste
 * determinístico (não dependem do relógio real além de "passado < agora < futuro").
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (única Org ativa)
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const PASSADO = '2020-01-01';
const FUTURO = '2999-01-01';

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface Ident {
  id: string;
}
interface DetalheView {
  card: { lifecycleState: string; saude: string; indicadorDominante: string };
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(
  method: string,
  path: string,
  conta?: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Pipe pronto com 3 Campos DATE (esperado/vencimento/expiração), publicado, e a config de marcos apontando cada
 * marco ao seu Campo (override absoluto). Devolve pipeId, phaseId e os ids dos 3 Campos.
 */
async function pipeComMarcos(
  nome: string,
): Promise<{ pipeId: string; espId: string; venId: string; expId: string }> {
  const pipeId = ((await (await req('POST', '/pipes', ANA, { name: nome })).json()) as Ident).id;
  pipesCriados.push(pipeId);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' })).status).toBe(201);

  const criarCampo = async (label: string): Promise<string> => {
    const r = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
      label,
      type: 'DATE',
    });
    expect(r.status).toBe(201);
    return ((await r.json()) as Ident).id;
  };
  const espId = await criarCampo('Prazo esperado');
  const venId = await criarCampo('Vencimento');
  const expId = await criarCampo('Expiração');
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);

  // A 1ª Fase ativa (menor position) é onde o Card nasce; configuramos os marcos nela.
  const fases = (await (await req('GET', `/pipes/${pipeId}/phases`, ANA)).json()) as Ident[];
  const primeira = fases[0]!.id;
  const cfg = await req('PUT', `/phases/${primeira}/milestones`, ANA, {
    expectedFieldId: espId,
    dueFieldId: venId,
    expirationFieldId: expId,
  });
  expect(cfg.status).toBe(200);
  return { pipeId, espId, venId, expId };
}

async function submeter(
  pipeId: string,
  key: string,
  valores: Record<string, unknown>,
): Promise<string> {
  const r = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: key,
    valores,
  });
  expect(r.status).toBe(201);
  return ((await r.json()) as Ident).id;
}

const detalhe = async (pipeId: string, cardId: string, conta = ANA): Promise<DetalheView> =>
  (await (await req('GET', `/pipes/${pipeId}/cards/${cardId}`, conta)).json()) as DetalheView;

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
}, 30000);

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('saúde derivada no detalhe do Card (AC 2.13)', () => {
  it('ok / atrasado / vencido / expirado conforme os marcos reais; sem marco → ok', async () => {
    const { pipeId, espId, venId, expId } = await pipeComMarcos('2.13 saude');

    const atrasado = await submeter(pipeId, '2.13-atr', {
      [espId]: PASSADO,
      [venId]: FUTURO,
      [expId]: FUTURO,
    });
    expect((await detalhe(pipeId, atrasado)).card.saude).toBe('atrasado');

    const vencido = await submeter(pipeId, '2.13-ven', {
      [espId]: PASSADO,
      [venId]: PASSADO,
      [expId]: FUTURO,
    });
    expect((await detalhe(pipeId, vencido)).card.saude).toBe('vencido');

    const expirado = await submeter(pipeId, '2.13-exp', {
      [espId]: PASSADO,
      [venId]: PASSADO,
      [expId]: PASSADO,
    });
    expect((await detalhe(pipeId, expirado)).card.saude).toBe('expirado');

    const ok = await submeter(pipeId, '2.13-ok', {
      [espId]: FUTURO,
      [venId]: FUTURO,
      [expId]: FUTURO,
    });
    expect((await detalhe(pipeId, ok)).card.saude).toBe('ok');

    const semMarco = await submeter(pipeId, '2.13-sem', {}); // sem valores de data → marcos não se aplicam
    expect((await detalhe(pipeId, semMarco)).card.saude).toBe('ok');
  });

  it('indicador dominante: ciclo de vida vence a saúde, sem fundir os eixos', async () => {
    const { pipeId, espId, venId, expId } = await pipeComMarcos('2.13 dominante');
    const cardId = await submeter(pipeId, '2.13-dom', {
      [espId]: PASSADO,
      [venId]: FUTURO,
      [expId]: FUTURO,
    });

    // Ativo e atrasado: o dominante é a própria saúde.
    const ativo = await detalhe(pipeId, cardId);
    expect(ativo.card.lifecycleState).toBe('ATIVO');
    expect(ativo.card.saude).toBe('atrasado');
    expect(ativo.card.indicadorDominante).toBe('atrasado');

    // Finalizar: o dominante passa a 'finalizado', mas a saúde canônica CONTINUA 'atrasado' (eixos distintos).
    expect((await req('POST', `/cards/${cardId}/finalize`, ANA)).status).toBe(200);
    const finalizado = await detalhe(pipeId, cardId);
    expect(finalizado.card.indicadorDominante).toBe('finalizado');
    expect(finalizado.card.saude).toBe('atrasado');

    // Arquivar: o dominante passa a 'arquivado'.
    expect((await req('POST', `/cards/${cardId}/archive`, ANA)).status).toBe(200);
    expect((await detalhe(pipeId, cardId)).card.indicadorDominante).toBe('arquivado');
  });

  it('autorização de leitura reusa a 2.9: VIEWER concedido lê; sem acesso → 404', async () => {
    const { pipeId, espId, venId, expId } = await pipeComMarcos('2.13 authz');
    const cardId = await submeter(pipeId, '2.13-authz', {
      [espId]: PASSADO,
      [venId]: FUTURO,
      [expId]: FUTURO,
    });

    // Bruno sem concessão → 404 não-enumerante.
    expect((await req('GET', `/pipes/${pipeId}/cards/${cardId}`, BRUNO)).status).toBe(404);
    // Concede VIEWER a Bruno: ler ≠ operar, mas o detalhe (leitura) é permitido.
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: MEMBERSHIP_BRUNO_A,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(201);
    const vis = await detalhe(pipeId, cardId, BRUNO);
    expect(vis.card.saude).toBe('atrasado');
  });
});
