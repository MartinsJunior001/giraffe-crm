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
 * Concessão de papel por Pipe (Story 2.2) pela porta da frente: HTTP real, `AppModule` de produção,
 * banco real. Em 2.2 só o Admin da Organização administra concessões — o `AuthzGuard` global concede a
 * quem tem `administrar Pipe` (ADMIN) e nega MEMBER/GUEST. A costura de identidade é a mesma da 2.1.
 *
 * Ana é ADMIN da Org A; Bruno é MEMBER da Org A; Carla é ADMIN da Org B. As concessões são criadas na
 * Org A, sobre Pipes criados nesta suíte (tabela nova; nenhuma suíte paralela conta PipeGrants). Alvo das
 * concessões: a Membership de Bruno na Org A. Faxina pelo migrator (apagar o Pipe cascateia as concessões).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const CARLA = '33333333-3333-3333-3333-333333333333'; // ADMIN na Org B
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002'; // alvo válido na Org A
const MEMBERSHIP_EVA_A = 'a1a1a1a1-0000-0000-0000-000000000003'; // outro alvo válido na Org A
const MEMBERSHIP_CARLA_B = 'b1b1b1b1-0000-0000-0000-000000000001'; // Membership de OUTRA Org

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
  pipeId: string;
  membershipId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  state: 'ACTIVE' | 'REVOKED';
  revokedAt: string | null;
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
    // Apagar o Pipe cascateia as concessões (onDelete: Cascade).
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('autorização das concessões (SC-203 estendido)', () => {
  it('sem principal, POST grant é 401 — não 403', async () => {
    const pipeId = await criarPipeComoAna('Grants 401');
    const res = await req('POST', `/pipes/${pipeId}/grants`, undefined, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'MEMBER',
    });
    expect(res.status).toBe(401);
  });

  it('MEMBER (Bruno) recebe 403 ao conceder e ao listar — só Admin da Org administra concessões', async () => {
    const pipeId = await criarPipeComoAna('Grants 403');
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, BRUNO, {
          membershipId: MEMBERSHIP_EVA_A,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(403);
    expect((await req('GET', `/pipes/${pipeId}/grants`, BRUNO)).status).toBe(403);
  });
});

describe('CRUD da concessão: conceder, listar, alterar papel, revogar (SC-223) — incremento 1', () => {
  it('concede, lista, altera o papel e revoga — soft-delete preserva a linha', async () => {
    const pipeId = await criarPipeComoAna('Grants ciclo');

    const criada = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'MEMBER',
    });
    expect(criada.status).toBe(201);
    const grant = (await criada.json()) as GrantResp;
    expect(grant.role).toBe('MEMBER');
    expect(grant.membershipId).toBe(MEMBERSHIP_BRUNO_A);
    expect(grant.state).toBe('ACTIVE');

    const lista = (await (await req('GET', `/pipes/${pipeId}/grants`, ANA)).json()) as GrantResp[];
    expect(lista.map((g) => g.id)).toContain(grant.id);

    const alterada = await req('PATCH', `/pipes/${pipeId}/grants/${grant.id}`, ANA, {
      role: 'VIEWER',
    });
    expect(alterada.status).toBe(200);
    expect(((await alterada.json()) as GrantResp).role).toBe('VIEWER');

    const revogada = await req('DELETE', `/pipes/${pipeId}/grants/${grant.id}`, ANA);
    expect(revogada.status).toBe(200);
    const corpoRev = (await revogada.json()) as GrantResp;
    expect(corpoRev.state).toBe('REVOKED');
    expect(corpoRev.revokedAt).not.toBeNull();

    // Some do roster ativo…
    const ativos = (await (await req('GET', `/pipes/${pipeId}/grants`, ANA)).json()) as GrantResp[];
    expect(ativos.map((g) => g.id)).not.toContain(grant.id);
    // …e revogar de novo é 404 (não há concessão ATIVA com esse id) — via o findUnique de guarda,
    // sem emitir updateMany, para não gerar falso `denied` de auditoria.
    expect((await req('DELETE', `/pipes/${pipeId}/grants/${grant.id}`, ANA)).status).toBe(404);
    // …e alterar o papel de uma concessão já revogada também é 404 (não há concessão ATIVA).
    expect(
      (await req('PATCH', `/pipes/${pipeId}/grants/${grant.id}`, ANA, { role: 'ADMIN' })).status,
    ).toBe(404);
  });

  it('recusa 2ª concessão ativa ao mesmo par com 409; após revogar, re-conceder é 201', async () => {
    const pipeId = await criarPipeComoAna('Grants unicidade');
    const primeira = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'MEMBER',
    });
    expect(primeira.status).toBe(201);
    const g1 = (await primeira.json()) as GrantResp;

    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: MEMBERSHIP_BRUNO_A,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(409);

    await req('DELETE', `/pipes/${pipeId}/grants/${g1.id}`, ANA);
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: MEMBERSHIP_BRUNO_A,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(201);
  });
});

describe('isolamento e validação (SC-226) — incremento 1', () => {
  it('Carla (Org B) não concede num Pipe da Org A — 404 (não-enumeração)', async () => {
    const pipeId = await criarPipeComoAna('Grants só da Org A');
    const res = await req('POST', `/pipes/${pipeId}/grants`, CARLA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'MEMBER',
    });
    expect(res.status).toBe(404);
  });

  it('conceder a uma Membership de OUTRA Organização é 400 (alvo inválido, sem vazar)', async () => {
    const pipeId = await criarPipeComoAna('Grants alvo alheio');
    const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
      membershipId: MEMBERSHIP_CARLA_B,
      role: 'VIEWER',
    });
    expect(res.status).toBe(400);
  });

  it('entrada inválida é 400 sanitizado (role inexistente; membershipId malformado; pipeId malformado)', async () => {
    const pipeId = await criarPipeComoAna('Grants validação');
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: MEMBERSHIP_BRUNO_A,
          role: 'SUPERADMIN',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: 'nao-uuid',
          role: 'MEMBER',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('POST', `/pipes/nao-uuid/grants`, ANA, {
          membershipId: MEMBERSHIP_BRUNO_A,
          role: 'MEMBER',
        })
      ).status,
    ).toBe(400);
  });
});
