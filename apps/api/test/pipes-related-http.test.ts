import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
 * Pipes relacionados no Perfil (Story 2.18, suporte a FR-32) pela porta da frente: HTTP real, banco real. Prova:
 *   CA1 — Admin da Org vê TODOS os Pipes com poder `gerenciar`; um Membro vê o Pipe concedido com o papel efetivo;
 *   CA2 — um Pipe sem concessão NÃO aparece na lista do Membro (não-enumeração);
 *   CA3 — listar NÃO concede acesso: o Pipe fora do acesso segue 404 em `GET /pipes/:id`;
 *   CA4 — um Membro sem concessões vê lista VAZIA (ausência honesta), sem dado fictício.
 * `orgId` nunca cruza a fronteira.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (única Org ativa)
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
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
interface RelacionadoView {
  id: string;
  name: string;
  state: string;
  poder: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

// Conta descartável SEM concessões, na Org C (área de escrita) — para o caso "ausência honesta" (CA4).
const contaVaziaId = randomUUID();
const membershipVaziaId = randomUUID();

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

const relacionados = (conta: string) => req('GET', '/pipes/related', conta);

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

  // Conta global descartável + Membership ACTIVE (MEMBER) na Org C, sem nenhuma concessão de Pipe.
  await migrator.account.createMany({
    data: [{ id: contaVaziaId, email: `rel-${contaVaziaId}@exemplo.test`, name: 'Sem Pipes' }],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: {
      id: membershipVaziaId,
      accountId: contaVaziaId,
      orgId: ORG_C,
      role: 'MEMBER',
      state: 'ACTIVE',
    },
  });
}, 30000);

afterAll(async () => {
  if (migrator) {
    const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    if (pipesCriados.length > 0) await dbA.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.membership.deleteMany({ where: { id: membershipVaziaId } }).catch(() => {});
    await migrator.account.deleteMany({ where: { id: contaVaziaId } }).catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('CA1/CA2/CA3: papel efetivo, só o que tem acesso, listar não concede', () => {
  it('Admin vê todos (gerenciar); Membro vê só o concedido (papel efetivo); Pipe alheio → 404', async () => {
    const p1 = await criarPipe('2.18 P1');
    const p2 = await criarPipe('2.18 P2');

    // Antes de conceder, o Membro NÃO se relaciona a P1 (criar Pipe não relaciona ninguém).
    const antes = (await (await relacionados(BRUNO)).json()) as RelacionadoView[];
    expect(antes.some((r) => r.id === p1)).toBe(false);

    // Concede a Bruno papel VIEWER só em P1.
    const g = await req('POST', `/pipes/${p1}/grants`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'VIEWER',
    });
    expect(g.status).toBe(201);

    // Admin (ANA): vê P1 e P2, ambos com poder `gerenciar`; nenhum entry sem poder.
    const daAna = (await (await relacionados(ANA)).json()) as RelacionadoView[];
    const anaP1 = daAna.find((r) => r.id === p1);
    const anaP2 = daAna.find((r) => r.id === p2);
    expect(anaP1?.poder).toBe('gerenciar');
    expect(anaP2?.poder).toBe('gerenciar');
    expect(daAna.every((r) => r.poder === 'gerenciar')).toBe(true);
    expect(JSON.stringify(daAna)).not.toContain(ORG_A); // orgId fora da fronteira

    // Membro (BRUNO): vê P1 com poder `ler`; NÃO vê P2 (sem concessão — CA2).
    const doBruno = (await (await relacionados(BRUNO)).json()) as RelacionadoView[];
    expect(doBruno.find((r) => r.id === p1)?.poder).toBe('ler');
    expect(doBruno.some((r) => r.id === p2)).toBe(false);

    // CA3 — listar não concedeu acesso: P2 (sem concessão) segue 404; P1 (concedido) 200.
    expect((await req('GET', `/pipes/${p2}`, BRUNO)).status).toBe(404);
    expect((await req('GET', `/pipes/${p1}`, BRUNO)).status).toBe(200);
  });
});

describe('CA4: ausência honesta — Membro sem concessões vê lista vazia', () => {
  it('conta com Membership ACTIVE mas sem PipeGrant → []', async () => {
    const res = await relacionados(contaVaziaId);
    expect(res.status).toBe(200);
    expect((await res.json()) as RelacionadoView[]).toEqual([]);
  });
});
