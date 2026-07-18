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
 * Histórico do Registro (Story 3.6) pela porta da frente: HTTP real, `AppModule` de produção, banco real. Prova a
 * timeline (ordem cronológica + cursor), a projeção allowlist (`orgId`/`recordId` não vazam), a autorização por
 * acesso ATUAL ao Database dono (sem acesso → 404; VIEWER lê; o histórico não concede), o isolamento (cross-tenant
 * → 404) e a leitura append-only (correção = novo evento, original preservado).
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const adminConta = randomUUID();
const adminMemb = randomUUID();
const viewerConta = randomUUID();
const viewerMemb = randomUUID();
const semAcessoConta = randomUUID();
const semAcessoMemb = randomUUID();
const dbId = randomUUID();

let nomeId = '';
let recordId = '';

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface Evento {
  id: string;
  type: string;
  summary: string;
  actorId: string | null;
  occurredAt: string;
}
interface Pagina {
  eventos: Evento[];
  proximoCursor: string | null;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(method: string, path: string, conta?: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `rh-admin-${adminConta}@x.test`, name: 'Admin' },
      { id: viewerConta, email: `rh-viewer-${viewerConta}@x.test`, name: 'Viewer' },
      { id: semAcessoConta, email: `rh-noacc-${semAcessoConta}@x.test`, name: 'Sem acesso' },
    ],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: viewerMemb, accountId: viewerConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: semAcessoMemb, accountId: semAcessoConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  await dbC.database.create({ data: { id: dbId, orgId: ORG_C, name: 'Base de Histórico' } });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  await req('POST', `/databases/${dbId}/grants`, adminConta, { membershipId: viewerMemb, role: 'VIEWER' });

  // Formulário: Nome (texto); publica.
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, { label: 'Nome', type: 'TEXT_SHORT' });
  const form = (await (await req('GET', `/databases/${dbId}/form`, adminConta)).json()) as {
    fields: { id: string; label: string }[];
  };
  nomeId = form.fields.find((f) => f.label === 'Nome')!.id;
  expect((await req('POST', `/databases/${dbId}/form/publish`, adminConta)).status).toBe(201);

  // Cria o Registro (CREATED), edita valores (VALUES_UPDATED), arquiva (ARCHIVED), restaura (RESTORED):
  // quatro eventos na trilha, todos escritos pelo write-side 3.4.
  const criado = await req('POST', `/databases/${dbId}/records`, adminConta, {
    idempotencyKey: randomUUID(),
    valores: { [nomeId]: 'Ana' },
  });
  expect(criado.status).toBe(201);
  recordId = ((await criado.json()) as { id: string }).id;
  expect(
    (await req('PATCH', `/databases/${dbId}/records/${recordId}`, adminConta, { valores: { [nomeId]: 'Ana Maria' } }))
      .status,
  ).toBe(200);
  expect((await req('POST', `/databases/${dbId}/records/${recordId}/archive`, adminConta)).status).toBe(200);
  expect((await req('POST', `/databases/${dbId}/records/${recordId}/restore`, adminConta)).status).toBe(200);
}, 40000);

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.database.deleteMany({ where: { id: dbId } }).catch(() => {});
    await dbC.membership
      .deleteMany({ where: { id: { in: [adminMemb, viewerMemb, semAcessoMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [adminConta, viewerConta, semAcessoConta] } } })
      .catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

const rota = () => `/databases/${dbId}/records/${recordId}/history`;

describe('AC1/AC5: timeline cronológica e append-only', () => {
  it('devolve os 4 eventos em ordem cronológica; o CREATED é o primeiro e permanece', async () => {
    const res = await req('GET', rota(), adminConta);
    expect(res.status).toBe(200);
    const pg = (await res.json()) as Pagina;
    const tipos = pg.eventos.map((e) => e.type);
    expect(tipos).toEqual(['CREATED', 'VALUES_UPDATED', 'ARCHIVED', 'RESTORED']);
    // Ordem estável e não-decrescente por data-hora.
    const tempos = pg.eventos.map((e) => new Date(e.occurredAt).getTime());
    expect([...tempos].sort((a, b) => a - b)).toEqual(tempos);
    // A correção (edição/arquivar/restaurar) NÃO apagou o evento de criação (append-only).
    expect(tipos.filter((t) => t === 'CREATED')).toHaveLength(1);
  });
});

describe('AC2: projeção allowlist', () => {
  it('só expõe id/type/summary/actorId/occurredAt; orgId/recordId não vazam', async () => {
    const res = await req('GET', rota(), adminConta);
    const texto = await res.text();
    expect(texto).not.toContain(ORG_C);
    expect(texto).not.toContain(recordId);
    const pg = JSON.parse(texto) as Pagina;
    const e = pg.eventos[0]!;
    expect(Object.keys(e).sort()).toEqual(['actorId', 'id', 'occurredAt', 'summary', 'type']);
  });
});

describe('AC3/AC4/AC7: autorização e isolamento', () => {
  it('VIEWER lê (ler ≠ operar); sem acesso → 404; cross-tenant → 404; sem principal → 401', async () => {
    expect((await req('GET', rota(), viewerConta)).status).toBe(200);
    expect((await req('GET', rota(), semAcessoConta)).status).toBe(404); // MEMBER da Org, sem grant no Database
    expect((await req('GET', rota(), ANA)).status).toBe(404); // conta de outra Org (cross-tenant)
    expect((await req('GET', rota(), undefined)).status).toBe(401);
  });

  it('Registro inexistente e Registro de outro Database → 404 não-enumerante', async () => {
    expect(
      (await req('GET', `/databases/${dbId}/records/${randomUUID()}/history`, adminConta)).status,
    ).toBe(404);
    // Outro Database (inexistente) com o mesmo recordId → 404 (o Registro não pertence a ele).
    expect(
      (await req('GET', `/databases/${randomUUID()}/records/${recordId}/history`, adminConta)).status,
    ).toBe(404);
  });
});

describe('AC6: paginação determinística por cursor', () => {
  it('limite=2 pagina em 2+2 com cursor estável e sem sobreposição', async () => {
    const p1 = (await (await req('GET', `${rota()}?limite=2`, adminConta)).json()) as Pagina;
    expect(p1.eventos).toHaveLength(2);
    expect(p1.proximoCursor).not.toBeNull();

    const p2 = (await (
      await req('GET', `${rota()}?limite=2&cursor=${p1.proximoCursor}`, adminConta)
    ).json()) as Pagina;
    expect(p2.eventos).toHaveLength(2);
    // Sem sobreposição entre as páginas; juntas cobrem os 4 eventos em ordem.
    const ids1 = p1.eventos.map((e) => e.id);
    const ids2 = p2.eventos.map((e) => e.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    expect(p2.proximoCursor).toBeNull(); // acabou

    // cursor/limite inválidos → 400.
    expect((await req('GET', `${rota()}?cursor=nao-uuid`, adminConta)).status).toBe(400);
    expect((await req('GET', `${rota()}?limite=0`, adminConta)).status).toBe(400);
  });
});
