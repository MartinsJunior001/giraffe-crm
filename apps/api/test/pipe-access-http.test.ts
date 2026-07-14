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
 * Acesso a Pipe POR CONCESSÃO (Story 2.2, incremento 2) pela porta da frente: HTTP real, `AppModule` de
 * produção, banco real. A guarda GROSSA deixa qualquer Membership ativa poder o tipo `ler Pipe`; a guarda
 * FINA (QUAL Pipe) é do `PipesService`, pela concessão `PipeGrant` ACTIVE — com não-enumeração (404).
 *
 * Ana é ADMIN da Org A (vê todos os Pipes sem concessão); Bruno é MEMBER da Org A (só vê os concedidos).
 * As asserções usam `toContain`/`not.toContain` (nunca contagem) para conviver com as suítes paralelas.
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

interface PipeResp {
  id: string;
}
interface GrantResp {
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

async function criarPipeComoAna(name: string): Promise<string> {
  const res = await req('POST', '/pipes', ANA, { name });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as PipeResp;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

async function concederABrunoComo(
  pipeId: string,
  role: 'ADMIN' | 'MEMBER' | 'VIEWER',
): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as GrantResp).id;
}

async function listaDeIds(conta: string): Promise<string[]> {
  const res = await req('GET', '/pipes', conta);
  expect(res.status).toBe(200);
  return ((await res.json()) as PipeResp[]).map((p) => p.id);
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: faxina exige o migrator.');

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
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('acesso a Pipe por concessão (SC-221 / SC-224 / SC-225 / SC-227) — incremento 2', () => {
  it('Admin da Org acessa qualquer Pipe SEM concessão (SC-224)', async () => {
    const pipeId = await criarPipeComoAna('Acesso — Admin vê tudo');
    // Ana nunca se concedeu nada; mesmo assim obtém e lista o Pipe.
    expect((await req('GET', `/pipes/${pipeId}`, ANA)).status).toBe(200);
    expect(await listaDeIds(ANA)).toContain(pipeId);
  });

  it('MEMBER SEM concessão não vê o Pipe — 404 e ausente da lista (SC-221, não-enumeração)', async () => {
    const pipeId = await criarPipeComoAna('Acesso — Bruno sem papel');
    // Bruno agora PASSA a guarda grossa (200 na lista, não 403), mas a lista não traz o Pipe…
    expect(await listaDeIds(BRUNO)).not.toContain(pipeId);
    // …e obtê-lo por id é 404 (indistinguível de "não existe").
    expect((await req('GET', `/pipes/${pipeId}`, BRUNO)).status).toBe(404);
  });

  it('com concessão ACTIVE, o MEMBER acessa APENAS aquele Pipe (SC-221/SC-227)', async () => {
    const concedido = await criarPipeComoAna('Acesso — concedido a Bruno');
    const outro = await criarPipeComoAna('Acesso — NÃO concedido a Bruno');
    await concederABrunoComo(concedido, 'MEMBER');

    // Vê o concedido…
    expect((await req('GET', `/pipes/${concedido}`, BRUNO)).status).toBe(200);
    const lista = await listaDeIds(BRUNO);
    expect(lista).toContain(concedido);
    // …e NÃO o outro (SC-227): nem por id, nem na lista.
    expect(lista).not.toContain(outro);
    expect((await req('GET', `/pipes/${outro}`, BRUNO)).status).toBe(404);
  });

  it('revogar corta o acesso: o MEMBER volta a 404 no Pipe (SC-225)', async () => {
    const pipeId = await criarPipeComoAna('Acesso — será revogado');
    const grantId = await concederABrunoComo(pipeId, 'MEMBER');
    expect((await req('GET', `/pipes/${pipeId}`, BRUNO)).status).toBe(200);

    expect((await req('DELETE', `/pipes/${pipeId}/grants/${grantId}`, ANA)).status).toBe(200);

    // Após REVOKED, o acesso é cortado: 404 no id e ausente da lista.
    expect((await req('GET', `/pipes/${pipeId}`, BRUNO)).status).toBe(404);
    expect(await listaDeIds(BRUNO)).not.toContain(pipeId);
  });

  it('ciclo de vida do Pipe permanece SÓ do Admin da Org: MEMBER concedido não renomeia/arquiva (403)', async () => {
    const pipeId = await criarPipeComoAna('Acesso — Bruno lê mas não administra');
    await concederABrunoComo(pipeId, 'MEMBER');
    // Bruno lê (tem concessão)…
    expect((await req('GET', `/pipes/${pipeId}`, BRUNO)).status).toBe(200);
    // …mas o ciclo de vida/config (renomear, arquivar) segue exigindo `administrar` (Admin da Org) — 403.
    expect((await req('PATCH', `/pipes/${pipeId}`, BRUNO, { name: 'x' })).status).toBe(403);
    expect((await req('POST', `/pipes/${pipeId}/archive`, BRUNO)).status).toBe(403);
  });
});
