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
 * Fases pela porta da frente (Story 2.3): HTTP real, `AppModule` de produção, banco real. Ana é ADMIN da
 * Org A (gerencia Fases de qualquer Pipe); Carla é ADMIN da Org B (não vê os Pipes da A). Cada teste cria o
 * SEU Pipe (id único), então a lista de Fases por Pipe é isolada — asserções de ordem podem ser exatas.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const CARLA = '33333333-3333-3333-3333-333333333333'; // ADMIN na Org B

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
interface FaseResp {
  id: string;
  pipeId: string;
  name: string;
  state: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
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

async function criarPipe(nome: string): Promise<string> {
  const res = await req('POST', '/pipes', ANA, { name: nome });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

async function criarFase(pipeId: string, nome: string): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: nome });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

async function ordemAtiva(pipeId: string): Promise<string[]> {
  const res = await req('GET', `/pipes/${pipeId}/phases`, ANA);
  expect(res.status).toBe(200);
  return ((await res.json()) as FaseResp[]).map((f) => f.id);
}

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
});

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } }); // cascateia as Fases
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('ciclo de vida e ordem de Fases (SC-231 / SC-234)', () => {
  it('cria Fases que aparecem NA ORDEM de criação e sob o Pipe (RN-030)', async () => {
    const pipeId = await criarPipe('Fases — ordem');
    const a = await criarFase(pipeId, 'A');
    const b = await criarFase(pipeId, 'B');
    const c = await criarFase(pipeId, 'C');
    expect(await ordemAtiva(pipeId)).toEqual([a, b, c]);

    // Cada Fase pertence a ESTE Pipe (RN-030) — o payload traz o pipeId da rota.
    const lista = (await (await req('GET', `/pipes/${pipeId}/phases`, ANA)).json()) as FaseResp[];
    expect(lista.every((f) => f.pipeId === pipeId)).toBe(true);
  });

  it('renomeia preservando id e posição', async () => {
    const pipeId = await criarPipe('Fases — renomear');
    const a = await criarFase(pipeId, 'Original');
    const b = await criarFase(pipeId, 'Outra');
    const res = await req('PATCH', `/pipes/${pipeId}/phases/${a}`, ANA, { name: 'Renomeada' });
    expect(res.status).toBe(200);
    expect((await res.json()) as FaseResp).toMatchObject({ id: a, name: 'Renomeada' });
    expect(await ordemAtiva(pipeId)).toEqual([a, b]); // ordem intacta
  });
});

describe('reordenação intra-Pipe (SC-232)', () => {
  it('mover para o início e para depois de uma irmã reposiciona só neste Pipe', async () => {
    const pipeId = await criarPipe('Fases — reordenar');
    const a = await criarFase(pipeId, 'A');
    const b = await criarFase(pipeId, 'B');
    const c = await criarFase(pipeId, 'C');

    // Move C para o início (afterPhaseId null).
    expect(
      (
        await req('POST', `/pipes/${pipeId}/phases/reorder`, ANA, {
          phaseId: c,
          afterPhaseId: null,
        })
      ).status,
    ).toBe(200);
    expect(await ordemAtiva(pipeId)).toEqual([c, a, b]);

    // Move A para depois de B.
    expect(
      (
        await req('POST', `/pipes/${pipeId}/phases/reorder`, ANA, {
          phaseId: a,
          afterPhaseId: b,
        })
      ).status,
    ).toBe(200);
    expect(await ordemAtiva(pipeId)).toEqual([c, b, a]);
  });

  it('reordenar um Pipe NÃO afeta a ordem de outro Pipe', async () => {
    const pipe1 = await criarPipe('Fases — isolado 1');
    const x = await criarFase(pipe1, 'X');
    const y = await criarFase(pipe1, 'Y');
    const pipe2 = await criarPipe('Fases — isolado 2');
    const m = await criarFase(pipe2, 'M');
    const n = await criarFase(pipe2, 'N');

    await req('POST', `/pipes/${pipe1}/phases/reorder`, ANA, { phaseId: y, afterPhaseId: null });
    expect(await ordemAtiva(pipe1)).toEqual([y, x]);
    expect(await ordemAtiva(pipe2)).toEqual([m, n]); // intacto
  });
});

describe('arquivar / restaurar e o invariante ≥1 Fase ativa (SC-233 / SC-234)', () => {
  it('arquivar tira do fluxo ativo; restaurar volta ao FINAL da ordem, com dados preservados', async () => {
    const pipeId = await criarPipe('Fases — arquivar');
    const a = await criarFase(pipeId, 'A');
    const b = await criarFase(pipeId, 'B');
    const c = await criarFase(pipeId, 'C');

    const arq = await req('POST', `/pipes/${pipeId}/phases/${a}/archive`, ANA);
    expect(arq.status).toBe(200);
    const corpoArq = (await arq.json()) as FaseResp;
    expect(corpoArq.state).toBe('ARCHIVED');
    expect(corpoArq.archivedAt).not.toBeNull();

    expect(await ordemAtiva(pipeId)).toEqual([b, c]); // A saiu do fluxo ativo
    const comArq = (await (
      await req('GET', `/pipes/${pipeId}/phases?arquivadas=true`, ANA)
    ).json()) as FaseResp[];
    expect(comArq.map((f) => f.id)).toContain(a); // mas aparece entre as arquivadas

    // Arquivar de novo é idempotente (200, sem reescrever archivedAt).
    const rearq = await req('POST', `/pipes/${pipeId}/phases/${a}/archive`, ANA);
    expect(rearq.status).toBe(200);
    expect(((await rearq.json()) as FaseResp).archivedAt).toBe(corpoArq.archivedAt);

    // Restaurar volta ao FINAL da ordem ativa.
    const rest = await req('POST', `/pipes/${pipeId}/phases/${a}/restore`, ANA);
    expect(rest.status).toBe(200);
    expect((await rest.json()) as FaseResp).toMatchObject({ id: a, state: 'ACTIVE', name: 'A' });
    expect(await ordemAtiva(pipeId)).toEqual([b, c, a]);
  });

  it('bloqueia arquivar a ÚLTIMA Fase ativa do Pipe (409) — invariante ≥1 ativa', async () => {
    const pipeId = await criarPipe('Fases — última ativa');
    const unica = await criarFase(pipeId, 'Única');
    const res = await req('POST', `/pipes/${pipeId}/phases/${unica}/archive`, ANA);
    expect(res.status).toBe(409);
    expect(await ordemAtiva(pipeId)).toEqual([unica]); // continua ativa
  });

  it('arquivar até a penúltima é permitido; a última barra em 409', async () => {
    const pipeId = await criarPipe('Fases — desce até uma');
    const a = await criarFase(pipeId, 'A');
    const b = await criarFase(pipeId, 'B');
    expect((await req('POST', `/pipes/${pipeId}/phases/${a}/archive`, ANA)).status).toBe(200);
    expect((await req('POST', `/pipes/${pipeId}/phases/${b}/archive`, ANA)).status).toBe(409);
    expect(await ordemAtiva(pipeId)).toEqual([b]);
  });
});

describe('não-enumeração e validação (SC-237)', () => {
  it('um tenant não vê as Fases do Pipe de outro — 404 (não-enumeração)', async () => {
    const pipeId = await criarPipe('Fases — só da Org A');
    await criarFase(pipeId, 'A');
    // Carla é ADMIN da Org B: a RLS filtra o Pipe da Org A ⇒ 404 em listar as Fases.
    expect((await req('GET', `/pipes/${pipeId}/phases`, CARLA)).status).toBe(404);
    // …e não consegue criar Fase nele.
    expect((await req('POST', `/pipes/${pipeId}/phases`, CARLA, { name: 'intrusa' })).status).toBe(
      404,
    );
  });

  it('POST sem name é 400; id de rota malformado é 400', async () => {
    const pipeId = await criarPipe('Fases — validação');
    expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, {})).status).toBe(400);
    expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: '   ' })).status).toBe(400);
    expect((await req('GET', `/pipes/nao-e-uuid/phases`, ANA)).status).toBe(400);
  });
});
