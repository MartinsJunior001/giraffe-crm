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
 * Ciclo de vida do Registro (Story 3.4) pela porta da frente: HTTP real, `AppModule` de produção, banco real.
 * Prova a criação idempotente contra o Formulário de Database publicado (3.3), a edição de valores, o ciclo
 * arquivar/restaurar, a autorização por Database (MEMBER opera — poder acordado; VIEWER 403; sem acesso 404), o
 * isolamento por Organização e a somente-leitura sob Database arquivado.
 *
 * Atores descartáveis (Org C, uma Membership ativa cada). Papéis por Database via a API de grants (3.2).
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN só na Org A (cross-tenant)
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const adminConta = randomUUID();
const adminMemb = randomUUID();
const dbAdminConta = randomUUID();
const dbAdminMemb = randomUUID();
const memberConta = randomUUID();
const memberMemb = randomUUID();
const viewerConta = randomUUID();
const viewerMemb = randomUUID();
const semAcessoConta = randomUUID();
const semAcessoMemb = randomUUID();

const dbId1 = randomUUID(); // Database com Formulário publicado
const dbArch = randomUUID(); // Database publicado e depois ARQUIVADO

let nomeFieldId1 = '';
let nomeFieldIdArch = '';

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface FormResp {
  id: string | null;
  fields: { id: string; label: string; type: string }[];
}
interface RecordResp {
  id: string;
  databaseId: string;
  lifecycleState: string;
  valores: Record<string, unknown>;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
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

/** Constrói e publica um Formulário de Database com um Campo TEXT_SHORT "Nome". Devolve o `Field.id`. */
async function construirFormPublicado(dbId: string): Promise<string> {
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  const form = (await (await req('GET', `/databases/${dbId}/form`, adminConta)).json()) as FormResp;
  const fieldId = form.fields[0]!.id;
  const pub = await req('POST', `/databases/${dbId}/form/publish`, adminConta);
  expect(pub.status).toBe(201);
  return fieldId;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `rec-admin-${adminConta}@x.test`, name: 'Admin Org' },
      { id: dbAdminConta, email: `rec-dbadmin-${dbAdminConta}@x.test`, name: 'Admin DB' },
      { id: memberConta, email: `rec-member-${memberConta}@x.test`, name: 'Membro DB' },
      { id: viewerConta, email: `rec-viewer-${viewerConta}@x.test`, name: 'Viewer DB' },
      { id: semAcessoConta, email: `rec-noacc-${semAcessoConta}@x.test`, name: 'Sem acesso' },
    ],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: dbAdminMemb, accountId: dbAdminConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: memberMemb, accountId: memberConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: viewerMemb, accountId: viewerConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      {
        id: semAcessoMemb,
        accountId: semAcessoConta,
        orgId: ORG_C,
        role: 'MEMBER',
        state: 'ACTIVE',
      },
    ],
  });
  await dbC.database.createMany({
    data: [
      { id: dbId1, orgId: ORG_C, name: 'Base de Registros' },
      { id: dbArch, orgId: ORG_C, name: 'Base a arquivar' },
    ],
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  // Papéis por Database (via API de grants da 3.2) — o Admin da Org concede.
  await req('POST', `/databases/${dbId1}/grants`, adminConta, {
    membershipId: dbAdminMemb,
    role: 'ADMIN',
  });
  await req('POST', `/databases/${dbId1}/grants`, adminConta, {
    membershipId: memberMemb,
    role: 'MEMBER',
  });
  await req('POST', `/databases/${dbId1}/grants`, adminConta, {
    membershipId: viewerMemb,
    role: 'VIEWER',
  });

  nomeFieldId1 = await construirFormPublicado(dbId1);
  nomeFieldIdArch = await construirFormPublicado(dbArch);
  // Arquiva o Database `dbArch` (3.1) para provar a somente-leitura integral.
  expect((await req('POST', `/databases/${dbArch}/archive`, adminConta)).status).toBe(200);
}, 40000);

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.database.deleteMany({ where: { id: { in: [dbId1, dbArch] } } }).catch(() => {});
    await dbC.membership
      .deleteMany({
        where: { id: { in: [adminMemb, dbAdminMemb, memberMemb, viewerMemb, semAcessoMemb] } },
      })
      .catch(() => {});
    await migrator.account
      .deleteMany({
        where: { id: { in: [adminConta, dbAdminConta, memberConta, viewerConta, semAcessoConta] } },
      })
      .catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('AC1/AC2: criação idempotente contra a versão publicada', () => {
  it('cria 1 Registro; retry com a mesma chave devolve o MESMO (idempotente)', async () => {
    const chave = randomUUID();
    const r1 = await req('POST', `/databases/${dbId1}/records`, adminConta, {
      idempotencyKey: chave,
      valores: { [nomeFieldId1]: 'Alice' },
    });
    expect(r1.status).toBe(201);
    const rec1 = (await r1.json()) as RecordResp;
    expect(rec1.lifecycleState).toBe('ATIVO');
    expect(rec1.valores[nomeFieldId1]).toBe('Alice');
    expect(JSON.stringify(rec1)).not.toContain(ORG_C); // orgId não vaza

    const r2 = await req('POST', `/databases/${dbId1}/records`, adminConta, {
      idempotencyKey: chave,
      valores: { [nomeFieldId1]: 'Alice' },
    });
    const rec2 = (await r2.json()) as RecordResp;
    expect(rec2.id).toBe(rec1.id); // não duplicou
  });

  it('valores inválidos → 400 (Campo desconhecido); idempotencyKey ausente → 400', async () => {
    expect(
      (
        await req('POST', `/databases/${dbId1}/records`, adminConta, {
          idempotencyKey: randomUUID(),
          valores: { [randomUUID()]: 'x' },
        })
      ).status,
    ).toBe(400);
    expect(
      (await req('POST', `/databases/${dbId1}/records`, adminConta, { valores: {} })).status,
    ).toBe(400);
  });
});

describe('AC3/AC4/AC5: ciclo de vida e write-side', () => {
  it('editar valores; arquivar (editar bloqueado 409); restaurar (volta a ATIVO)', async () => {
    const criado = (await (
      await req('POST', `/databases/${dbId1}/records`, adminConta, {
        idempotencyKey: randomUUID(),
        valores: { [nomeFieldId1]: 'Bob' },
      })
    ).json()) as RecordResp;

    const editado = await req('PATCH', `/databases/${dbId1}/records/${criado.id}`, adminConta, {
      valores: { [nomeFieldId1]: 'Bob Silva' },
    });
    expect(editado.status).toBe(200);
    expect(((await editado.json()) as RecordResp).valores[nomeFieldId1]).toBe('Bob Silva');

    // Arquivar → 200; editar arquivado → 409.
    expect(
      (await req('POST', `/databases/${dbId1}/records/${criado.id}/archive`, adminConta)).status,
    ).toBe(200);
    expect(
      (
        await req('PATCH', `/databases/${dbId1}/records/${criado.id}`, adminConta, {
          valores: { [nomeFieldId1]: 'Nope' },
        })
      ).status,
    ).toBe(409);

    // Arquivar de novo → idempotente (200). Restaurar → 200, volta a ATIVO (preserva identidade/valores).
    expect(
      (await req('POST', `/databases/${dbId1}/records/${criado.id}/archive`, adminConta)).status,
    ).toBe(200);
    const restaurado = await req(
      'POST',
      `/databases/${dbId1}/records/${criado.id}/restore`,
      adminConta,
    );
    expect(restaurado.status).toBe(200);
    const rec = (await restaurado.json()) as RecordResp;
    expect(rec.lifecycleState).toBe('ATIVO');

    // Identidade e valores preservados (obter).
    const obtido = (await (
      await req('GET', `/databases/${dbId1}/records/${criado.id}`, adminConta)
    ).json()) as RecordResp;
    expect(obtido.id).toBe(criado.id);
    expect(obtido.valores[nomeFieldId1]).toBe('Bob Silva');
  });
});

describe('AC7: autorização por Database (poder diferencial de MEMBER)', () => {
  it('MEMBER cria/edita; VIEWER → 403; sem acesso → 404', async () => {
    const r = await req('POST', `/databases/${dbId1}/records`, memberConta, {
      idempotencyKey: randomUUID(),
      valores: { [nomeFieldId1]: 'Por membro' },
    });
    expect(r.status).toBe(201); // MEMBER opera (poder acordado)

    expect(
      (
        await req('POST', `/databases/${dbId1}/records`, viewerConta, {
          idempotencyKey: randomUUID(),
          valores: { [nomeFieldId1]: 'Por viewer' },
        })
      ).status,
    ).toBe(403); // VIEWER só lê

    expect(
      (
        await req('POST', `/databases/${dbId1}/records`, semAcessoConta, {
          idempotencyKey: randomUUID(),
          valores: {},
        })
      ).status,
    ).toBe(404); // sem acesso, não-enumerante

    // VIEWER lê o Registro criado pelo MEMBER (ler ≠ operar).
    const rec = (await r.json()) as RecordResp;
    expect((await req('GET', `/databases/${dbId1}/records/${rec.id}`, viewerConta)).status).toBe(
      200,
    );
  });

  it('Admin do Database (grant ADMIN) opera; dbAdmin cria Registro', async () => {
    expect(
      (
        await req('POST', `/databases/${dbId1}/records`, dbAdminConta, {
          idempotencyKey: randomUUID(),
          valores: { [nomeFieldId1]: 'Por admin do DB' },
        })
      ).status,
    ).toBe(201);
  });
});

describe('AC6: isolamento e Database arquivado', () => {
  it('cross-tenant (Ana/Org A) → 404; Database arquivado → 409 (somente-leitura)', async () => {
    expect(
      (
        await req('POST', `/databases/${dbId1}/records`, ANA, {
          idempotencyKey: randomUUID(),
          valores: {},
        })
      ).status,
    ).toBe(404);

    // Database arquivado: criar Registro → 409 DATABASE_ARQUIVADO.
    const r = await req('POST', `/databases/${dbArch}/records`, adminConta, {
      idempotencyKey: randomUUID(),
      valores: { [nomeFieldIdArch]: 'X' },
    });
    expect(r.status).toBe(409);
    expect(
      ((await r.json()) as { motivo?: string; message?: { motivo?: string } }).message ?? {},
    ).toBeDefined();
  });

  it('sem principal → 401', async () => {
    expect((await req('POST', `/databases/${dbId1}/records`, undefined, {})).status).toBe(401);
  });
});
