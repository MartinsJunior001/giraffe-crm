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
 * Formulário de Database (Story 3.3) pela porta da frente: HTTP real, `AppModule` de produção, banco real.
 * Prova o REUSO do Form Builder no contexto DATABASE (catálogo canônico, isolamento INV-FORM-01), a
 * autorização roteada por `database-authz` (Admin da Org / Admin do Database gerenciam; MEMBER/VIEWER só leem;
 * sem acesso → 404), a publicação imutável e o isolamento por Organização.
 *
 * Atores descartáveis (Org C, uma Membership ativa cada). Papéis por Database concedidos via a API de grants (3.2).
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

const dbId1 = randomUUID(); // Database com schema
const dbId2 = randomUUID(); // Database sem Form (obter não cria)

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface FormResp {
  id: string | null;
  context: string;
  databaseId: string | null;
  pipeId: string | null;
  fields: { id: string; label: string; type: string }[];
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

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `dbf-admin-${adminConta}@x.test`, name: 'Admin Org' },
      { id: dbAdminConta, email: `dbf-dbadmin-${dbAdminConta}@x.test`, name: 'Admin DB' },
      { id: memberConta, email: `dbf-member-${memberConta}@x.test`, name: 'Membro DB' },
      { id: viewerConta, email: `dbf-viewer-${viewerConta}@x.test`, name: 'Viewer DB' },
      { id: semAcessoConta, email: `dbf-noacc-${semAcessoConta}@x.test`, name: 'Sem acesso' },
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
      { id: dbId1, orgId: ORG_C, name: 'Base com schema' },
      { id: dbId2, orgId: ORG_C, name: 'Base vazia' },
    ],
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  // Concede papéis por Database (via a API de grants da 3.2) — o Admin da Org concede.
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
}, 30000);

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.database.deleteMany({ where: { id: { in: [dbId1, dbId2] } } }).catch(() => {});
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

describe('AC2/AC5: obter o Formulário de Database (ler não cria; acesso por Database)', () => {
  it('Admin obtém o Form vazio (id null, context DATABASE, databaseId); sem acesso → 404', async () => {
    const res = await req('GET', `/databases/${dbId2}/form`, adminConta);
    expect(res.status).toBe(200);
    const form = (await res.json()) as FormResp;
    expect(form.id).toBeNull(); // ler NÃO cria
    expect(form.context).toBe('DATABASE');
    expect(form.databaseId).toBe(dbId2);
    expect(form.fields).toEqual([]);
    expect(JSON.stringify(form)).not.toContain(ORG_C); // orgId não vaza

    // Sem concessão ao Database → 404 não-enumerante.
    expect((await req('GET', `/databases/${dbId1}/form`, semAcessoConta)).status).toBe(404);
  });
});

describe('AC1/AC2/AC3: montagem e evolução com o builder canônico', () => {
  it('Admin adiciona Campo (201, materializa), edita (200); type não muda', async () => {
    const criado = await req('POST', `/databases/${dbId1}/form/fields`, adminConta, {
      label: 'Nome',
      type: 'TEXT_SHORT',
    });
    expect(criado.status).toBe(201);
    const campo = (await criado.json()) as { id: string; type: string };
    expect(campo.type).toBe('TEXT_SHORT');

    const form = (await (
      await req('GET', `/databases/${dbId1}/form`, adminConta)
    ).json()) as FormResp;
    expect(form.id).not.toBeNull(); // materializou
    expect(form.context).toBe('DATABASE');
    expect(form.fields.some((f) => f.id === campo.id)).toBe(true);

    const editado = await req('PATCH', `/databases/${dbId1}/form/fields/${campo.id}`, adminConta, {
      label: 'Nome completo',
    });
    expect(editado.status).toBe(200);
    expect(((await editado.json()) as { label: string }).label).toBe('Nome completo');
  });
});

describe('AC5: autorização por Database (gerenciar × MEMBER/VIEWER × sem acesso)', () => {
  it('Admin do Database gerencia; MEMBER/VIEWER só leem (403 ao mutar); sem acesso → 404', async () => {
    // Admin do Database (grant ADMIN) adiciona Campo → 201.
    expect(
      (
        await req('POST', `/databases/${dbId1}/form/fields`, dbAdminConta, {
          label: 'Setor',
          type: 'TEXT_SHORT',
        })
      ).status,
    ).toBe(201);

    // MEMBER e VIEWER leem o Form (200) mas não mutam (403).
    expect((await req('GET', `/databases/${dbId1}/form`, memberConta)).status).toBe(200);
    expect((await req('GET', `/databases/${dbId1}/form`, viewerConta)).status).toBe(200);
    expect(
      (
        await req('POST', `/databases/${dbId1}/form/fields`, memberConta, {
          label: 'X',
          type: 'NUMBER',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req('POST', `/databases/${dbId1}/form/fields`, viewerConta, {
          label: 'Y',
          type: 'NUMBER',
        })
      ).status,
    ).toBe(403);

    // Sem acesso ao Database → 404 (não-enumerante) ao mutar.
    expect(
      (
        await req('POST', `/databases/${dbId1}/form/fields`, semAcessoConta, {
          label: 'Z',
          type: 'NUMBER',
        })
      ).status,
    ).toBe(404);
  });
});

describe('AC4: publicação e imutabilidade (2.6)', () => {
  it('Admin publica (201, versão), lê o estado; MEMBER só lê estado; VIEWER não publica (403)', async () => {
    const pub = await req('POST', `/databases/${dbId1}/form/publish`, adminConta);
    expect(pub.status).toBe(201);
    const versao = (await pub.json()) as { version: number };
    expect(versao.version).toBeGreaterThanOrEqual(1);

    const estado = await req('GET', `/databases/${dbId1}/form/publication`, memberConta);
    expect(estado.status).toBe(200); // MEMBER lê o estado

    // VIEWER não publica.
    expect((await req('POST', `/databases/${dbId1}/form/publish`, viewerConta)).status).toBe(403);
  });
});

describe('Cobertura crítica: opções, mutação por MEMBER, publicação inválida, Admin do Database', () => {
  it('opções de Seleção no contexto Database (SELECT_SINGLE + adicionar opção)', async () => {
    const criado = await req('POST', `/databases/${dbId1}/form/fields`, adminConta, {
      label: 'Prioridade',
      type: 'SELECT_SINGLE',
      options: ['Baixa', 'Alta'],
    });
    expect(criado.status).toBe(201);
    const campo = (await criado.json()) as {
      id: string;
      typeConfig: { options?: { id: string; label: string }[] };
    };
    expect(campo.typeConfig.options).toHaveLength(2);

    const add = await req(
      'POST',
      `/databases/${dbId1}/form/fields/${campo.id}/options`,
      adminConta,
      { label: 'Média' },
    );
    expect(add.status).toBe(200);
    const atualizado = (await add.json()) as { typeConfig: { options?: unknown[] } };
    expect(atualizado.typeConfig.options).toHaveLength(3);
  });

  it('MEMBER do Database não muta (editar/reorder → 403); só o schema, autz roteada por database-authz', async () => {
    // Pega um Campo existente do Form de dbId1 (como Admin).
    const form = (await (
      await req('GET', `/databases/${dbId1}/form`, adminConta)
    ).json()) as FormResp;
    const fieldId = form.fields[0]?.id;
    expect(fieldId).toBeTruthy();

    expect(
      (
        await req('PATCH', `/databases/${dbId1}/form/fields/${fieldId}`, memberConta, {
          label: 'hack',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req('POST', `/databases/${dbId1}/form/fields/reorder`, memberConta, {
          fieldId,
          afterFieldId: null,
        })
      ).status,
    ).toBe(403);
  });

  it('publicar Formulário de Database não materializado → 404; materializado sem Campo ativo → 400', async () => {
    // dbId2 nunca recebeu Campo (obter não cria): não há o que publicar → 404 (não se publica o inexistente).
    expect((await req('POST', `/databases/${dbId2}/form/publish`, adminConta)).status).toBe(404);

    // Materializa o Form de dbId2 com 1 Campo e o arquiva → 0 Campos ativos → rascunho inválido → 400.
    const campo = (await (
      await req('POST', `/databases/${dbId2}/form/fields`, adminConta, {
        label: 'Temp',
        type: 'NUMBER',
      })
    ).json()) as { id: string };
    expect(
      (await req('POST', `/databases/${dbId2}/form/fields/${campo.id}/archive`, adminConta)).status,
    ).toBe(200);
    expect((await req('POST', `/databases/${dbId2}/form/publish`, adminConta)).status).toBe(400);
  });

  it('Admin do Database (grant ADMIN) publica e despublica (gerenciar via concessão)', async () => {
    expect((await req('POST', `/databases/${dbId1}/form/publish`, dbAdminConta)).status).toBe(201);
    expect((await req('POST', `/databases/${dbId1}/form/unpublish`, dbAdminConta)).status).toBe(
      200,
    );
  });
});

describe('AC6: isolamento por Organização (cross-tenant)', () => {
  it('Admin de OUTRA Org (Ana/Org A) não alcança o Formulário de um Database da Org C → 404', async () => {
    expect((await req('GET', `/databases/${dbId1}/form`, ANA)).status).toBe(404);
    expect(
      (await req('POST', `/databases/${dbId1}/form/fields`, ANA, { label: 'H', type: 'NUMBER' }))
        .status,
    ).toBe(404);
  });

  it('sem principal → 401', async () => {
    expect((await req('GET', `/databases/${dbId1}/form`, undefined)).status).toBe(401);
  });
});
