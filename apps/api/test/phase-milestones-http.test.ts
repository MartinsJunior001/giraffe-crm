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
 * Marcos por Fase e override por Card (Story 2.12) pela porta da frente: HTTP real, banco real. Prova a
 * autorização da config ("config do Pipe" — Admin gerencia, Membro não), a validação (ordenação, Campo de override),
 * a materialização da referência de entrada na criação do Card, a precedência override › duração › ausência, e a
 * NÃO-RETROATIVIDADE (mudar a config não recalcula Cards já na Fase — snapshot congelado na entrada).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (única Org ativa)
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

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
interface ConfigView {
  phaseId: string;
  pipeId: string;
  expectedDurationMin: number | null;
  dueDurationMin: number | null;
  expirationDurationMin: number | null;
  expectedFieldId: string | null;
  dueFieldId: string | null;
  expirationFieldId: string | null;
}
interface BaseView {
  cardId: string;
  phaseId: string;
  enteredAt: string;
  origin: string;
  marcos: { esperado: string | null; vencimento: string | null; expiracao: string | null };
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
 * Pipe pronto: 1 Fase, Formulário inicial com um Campo TEXT e um Campo DATE, publicado. Devolve o pipeId, o
 * phaseId (para configurar marcos) e os ids dos Campos (texto e data).
 */
async function pipePronto(
  nome: string,
): Promise<{ pipeId: string; phaseId: string; textFieldId: string; dateFieldId: string }> {
  const pipeRes = await req('POST', '/pipes', ANA, { name: nome });
  expect(pipeRes.status).toBe(201);
  const pipeId = ((await pipeRes.json()) as Ident).id;
  pipesCriados.push(pipeId);

  const faseRes = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' });
  expect(faseRes.status).toBe(201);
  const phaseId = ((await faseRes.json()) as Ident).id;

  const texto = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  expect(texto.status).toBe(201);
  const textFieldId = ((await texto.json()) as Ident).id;

  const data = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Prazo do cliente',
    type: 'DATE',
  });
  expect(data.status).toBe(201);
  const dateFieldId = ((await data.json()) as Ident).id;

  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);
  return { pipeId, phaseId, textFieldId, dateFieldId };
}

async function submeter(
  pipeId: string,
  key: string,
  valores: Record<string, unknown>,
): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: key,
    valores,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

const getBase = async (cardId: string, conta = ANA): Promise<BaseView> =>
  (await (await req('GET', `/cards/${cardId}/phase-entry`, conta)).json()) as BaseView;

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

describe('config de marcos — autorização e validação (AC 2.12)', () => {
  it('Admin configura (200) e lê (200); ordenação inválida → 400', async () => {
    const { pipeId, phaseId } = await pipePronto('2.12 config admin');
    const put = await req('PUT', `/phases/${phaseId}/milestones`, ANA, {
      expectedDurationMin: 60,
      dueDurationMin: 120,
      expirationDurationMin: 240,
    });
    expect(put.status).toBe(200);
    const cfg = (await put.json()) as ConfigView;
    expect(cfg.pipeId).toBe(pipeId);
    expect(cfg.expectedDurationMin).toBe(60);
    expect(JSON.stringify(cfg)).not.toContain(ORG_A);

    const get = await req('GET', `/phases/${phaseId}/milestones`, ANA);
    expect(get.status).toBe(200);
    expect((await get.json()) as ConfigView).toMatchObject({ dueDurationMin: 120 });

    const ruim = await req('PUT', `/phases/${phaseId}/milestones`, ANA, {
      expectedDurationMin: 200,
      dueDurationMin: 100,
    });
    expect(ruim.status).toBe(400);
  });

  it('Campo de override deve ser DATE/DATETIME do Formulário inicial → 400 caso contrário', async () => {
    const { phaseId, textFieldId } = await pipePronto('2.12 override valida');
    // Campo TEXT não serve como override.
    const texto = await req('PUT', `/phases/${phaseId}/milestones`, ANA, {
      expectedFieldId: textFieldId,
    });
    expect(texto.status).toBe(400);
    // UUID que não é Campo do Formulário.
    const alheio = await req('PUT', `/phases/${phaseId}/milestones`, ANA, {
      expectedFieldId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    });
    expect(alheio.status).toBe(400);
  });

  it('Membro não configura (403), mas lê (200); sem acesso → 404', async () => {
    const { pipeId, phaseId } = await pipePronto('2.12 authz membro');
    // Bruno sem concessão no Pipe → 404 não-enumerante.
    expect((await req('PUT', `/phases/${phaseId}/milestones`, BRUNO, {})).status).toBe(404);
    expect((await req('GET', `/phases/${phaseId}/milestones`, BRUNO)).status).toBe(404);
    // Concede MEMBER a Bruno: opera/lê, mas não gerencia (config).
    const g = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'MEMBER',
    });
    expect(g.status).toBe(201);
    expect((await req('PUT', `/phases/${phaseId}/milestones`, BRUNO, {})).status).toBe(403);
    expect((await req('GET', `/phases/${phaseId}/milestones`, BRUNO)).status).toBe(200);
  });
});

describe('referência de entrada e base — precedência override › duração › ausência (AC 2.12)', () => {
  it('criar Card grava a entrada (origin SUBMISSION); override do Card prevalece; ausência cai para a duração', async () => {
    const { pipeId, phaseId, dateFieldId } = await pipePronto('2.12 base');
    // Config ANTES da criação → o snapshot da entrada captura duração + Campo de override.
    expect(
      (
        await req('PUT', `/phases/${phaseId}/milestones`, ANA, {
          expectedDurationMin: 1440, // 1 dia
          expectedFieldId: dateFieldId,
        })
      ).status,
    ).toBe(200);

    // Card COM valor de data → override absoluto prevalece.
    const comData = await submeter(pipeId, '2.12-base-1', { [dateFieldId]: '2027-01-01' });
    const baseCom = await getBase(comData);
    expect(baseCom.origin).toBe('SUBMISSION');
    expect(baseCom.phaseId).toBe(phaseId);
    expect(baseCom.marcos.esperado).toBe(new Date('2027-01-01').toISOString());

    // Card SEM valor de data → cai para a duração (entrada + 1440 min).
    const semData = await submeter(pipeId, '2.12-base-2', {});
    const baseSem = await getBase(semData);
    const esperado = new Date(new Date(baseSem.enteredAt).getTime() + 1440 * 60_000).toISOString();
    expect(baseSem.marcos.esperado).toBe(esperado);
  });
});

describe('não-retroatividade — mudar a config não recalcula Cards já na Fase (AC 2.12)', () => {
  it('Card criado ANTES da config mantém base vazia; Card criado DEPOIS reflete a config', async () => {
    const { pipeId, phaseId, dateFieldId } = await pipePronto('2.12 nao retro');
    // Card criado SEM config: snapshot da entrada é todo-nulo.
    const antigo = await submeter(pipeId, '2.12-retro-1', { [dateFieldId]: '2027-06-06' });
    expect((await getBase(antigo)).marcos.esperado).toBeNull();

    // Configura marcos DEPOIS.
    expect(
      (
        await req('PUT', `/phases/${phaseId}/milestones`, ANA, {
          expectedDurationMin: 60,
          expectedFieldId: dateFieldId,
        })
      ).status,
    ).toBe(200);

    // O Card antigo NÃO muda (snapshot congelado na entrada) — override do valor tampouco reaparece.
    expect((await getBase(antigo)).marcos.esperado).toBeNull();

    // Um Card novo reflete a config vigente.
    const novo = await submeter(pipeId, '2.12-retro-2', { [dateFieldId]: '2027-06-06' });
    expect((await getBase(novo)).marcos.esperado).toBe(new Date('2027-06-06').toISOString());
  });
});
