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
 * Poder DIFERENCIAL por papel de Pipe sobre Fases (Story 2.3) — a prova de que o `role` de `PipeGrant`,
 * dormente na 2.2, ATIVA aqui (fecha DBT-2.2-ROLE-DORMENTE). Pela porta da frente: HTTP real, banco real.
 *
 * Gerenciar Fases = **Admin da Org** (Ana, qualquer Pipe) OU **Admin do Pipe** (Bruno com concessão
 * `role=ADMIN` ACTIVE). MEMBER/VIEWER concedidos **leem**, não gerenciam (403). Sem concessão → 404.
 *
 * Fase VERMELHA do diferencial: se o serviço concedesse gestão a MEMBER/VIEWER (ou não lesse `role`), as
 * asserções de 403 falhariam; se negasse ao Admin do Pipe, as de 201/200 falhariam.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';

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

async function concederABruno(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
}

async function criarFaseComoAna(pipeId: string, nome: string): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: nome });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
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
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } }); // cascateia Fases e concessões
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('poder diferencial por papel de Pipe sobre Fases (SC-236 — fecha DBT-2.2-ROLE-DORMENTE)', () => {
  it('Admin da Org gerencia Fases de qualquer Pipe SEM concessão', async () => {
    const pipeId = await criarPipe('Fases authz — Admin da Org');
    // Ana nunca se concedeu nada; ainda assim cria, renomeia e arquiva não é a última.
    const a = await criarFaseComoAna(pipeId, 'A');
    await criarFaseComoAna(pipeId, 'B');
    expect((await req('PATCH', `/pipes/${pipeId}/phases/${a}`, ANA, { name: 'A2' })).status).toBe(
      200,
    );
    expect((await req('POST', `/pipes/${pipeId}/phases/${a}/archive`, ANA)).status).toBe(200);
  });

  it('Admin do Pipe (grant ADMIN) GERENCIA as Fases do seu Pipe', async () => {
    const pipeId = await criarPipe('Fases authz — Admin do Pipe');
    await concederABruno(pipeId, 'ADMIN');
    // Bruno (MEMBER da Org, mas ADMIN deste Pipe) cria, renomeia, reordena, arquiva/restaura.
    const criar = await req('POST', `/pipes/${pipeId}/phases`, BRUNO, { name: 'Por Bruno' });
    expect(criar.status).toBe(201);
    const faseBruno = ((await criar.json()) as Ident).id;
    await req('POST', `/pipes/${pipeId}/phases`, BRUNO, { name: 'Segunda' });
    expect(
      (await req('PATCH', `/pipes/${pipeId}/phases/${faseBruno}`, BRUNO, { name: 'Editada' }))
        .status,
    ).toBe(200);
    expect((await req('POST', `/pipes/${pipeId}/phases/${faseBruno}/archive`, BRUNO)).status).toBe(
      200,
    );
    expect((await req('POST', `/pipes/${pipeId}/phases/${faseBruno}/restore`, BRUNO)).status).toBe(
      200,
    );
  });

  it('MEMBER concedido LÊ as Fases mas NÃO gerencia (403)', async () => {
    const pipeId = await criarPipe('Fases authz — MEMBER lê');
    const a = await criarFaseComoAna(pipeId, 'A');
    await concederABruno(pipeId, 'MEMBER');
    // Lê (tem concessão ACTIVE).
    expect((await req('GET', `/pipes/${pipeId}/phases`, BRUNO)).status).toBe(200);
    // …mas não gerencia: criar, renomear, reordenar, arquivar → 403.
    expect((await req('POST', `/pipes/${pipeId}/phases`, BRUNO, { name: 'x' })).status).toBe(403);
    expect((await req('PATCH', `/pipes/${pipeId}/phases/${a}`, BRUNO, { name: 'x' })).status).toBe(
      403,
    );
    expect(
      (
        await req('POST', `/pipes/${pipeId}/phases/reorder`, BRUNO, {
          phaseId: a,
          afterPhaseId: null,
        })
      ).status,
    ).toBe(403);
    expect((await req('POST', `/pipes/${pipeId}/phases/${a}/archive`, BRUNO)).status).toBe(403);
  });

  it('VIEWER concedido LÊ as Fases mas NÃO gerencia (403)', async () => {
    const pipeId = await criarPipe('Fases authz — VIEWER lê');
    const a = await criarFaseComoAna(pipeId, 'A');
    await concederABruno(pipeId, 'VIEWER');
    expect((await req('GET', `/pipes/${pipeId}/phases`, BRUNO)).status).toBe(200);
    expect((await req('POST', `/pipes/${pipeId}/phases`, BRUNO, { name: 'x' })).status).toBe(403);
    expect((await req('POST', `/pipes/${pipeId}/phases/${a}/archive`, BRUNO)).status).toBe(403);
  });

  it('SEM concessão, o não-Admin não vê nem gerencia — 404 (não-enumeração)', async () => {
    const pipeId = await criarPipe('Fases authz — Bruno sem papel');
    await criarFaseComoAna(pipeId, 'A');
    // Bruno passa a guarda grossa de `ler Pipe`, mas sem concessão o serviço responde 404.
    expect((await req('GET', `/pipes/${pipeId}/phases`, BRUNO)).status).toBe(404);
    expect((await req('POST', `/pipes/${pipeId}/phases`, BRUNO, { name: 'x' })).status).toBe(404);
  });
});
