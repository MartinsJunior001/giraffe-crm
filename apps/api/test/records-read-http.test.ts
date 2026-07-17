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
 * Visualização/navegação de Registros (Story 3.5) pela porta da frente: HTTP real, `AppModule` de produção, banco
 * real. Prova a tabela (paginação/ordenação/filtros por tipo), arquivados sob opção + edição refletida, o
 * fail-closed (Campo desconhecido/gated → 400), INV-REPORT-01 (sem acesso → 404; VIEWER lê) e o isolamento.
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
let idadeId = '';
let fileId = '';

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface Pagina {
  linhas: {
    id: string;
    valores: Record<string, unknown>;
    lifecycleState: string;
    podeEditar: boolean;
  }[];
  total: number;
  colunas: { fieldId: string; label: string; type: string }[];
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

async function criarRegistro(valores: Record<string, unknown>): Promise<string> {
  const r = await req('POST', `/databases/${dbId}/records`, adminConta, {
    idempotencyKey: randomUUID(),
    valores,
  });
  expect(r.status).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `rr-admin-${adminConta}@x.test`, name: 'Admin' },
      { id: viewerConta, email: `rr-viewer-${viewerConta}@x.test`, name: 'Viewer' },
      { id: semAcessoConta, email: `rr-noacc-${semAcessoConta}@x.test`, name: 'Sem acesso' },
    ],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
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
  await dbC.database.create({ data: { id: dbId, orgId: ORG_C, name: 'Base de Registros' } });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  await req('POST', `/databases/${dbId}/grants`, adminConta, {
    membershipId: viewerMemb,
    role: 'VIEWER',
  });

  // Constrói o Formulário: Nome (texto) + Idade (número); publica.
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, {
    label: 'Idade',
    type: 'NUMBER',
  });
  const form = (await (await req('GET', `/databases/${dbId}/form`, adminConta)).json()) as {
    fields: { id: string; label: string }[];
  };
  nomeId = form.fields.find((f) => f.label === 'Nome')!.id;
  idadeId = form.fields.find((f) => f.label === 'Idade')!.id;
  expect((await req('POST', `/databases/${dbId}/form/publish`, adminConta)).status).toBe(201);

  // Registros (contra a versão publicada Nome+Idade).
  await criarRegistro({ [nomeId]: 'Ana', [idadeId]: 30 });
  await criarRegistro({ [nomeId]: 'Bruno', [idadeId]: 20 });
  await criarRegistro({ [nomeId]: 'Carla', [idadeId]: 40 });

  // Adiciona um Campo Arquivo APÓS publicar (fica na definição ativa, mas gated para filtro — 3.7/3.8).
  const file = await req('POST', `/databases/${dbId}/form/fields`, adminConta, {
    label: 'Anexo',
    type: 'FILE',
  });
  fileId = ((await file.json()) as { id: string }).id;
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

describe('AC1: tabela, colunas, ordenação por Campo', () => {
  it('lista 3 Registros ativos, com colunas e total; ordena por Idade asc', async () => {
    const res = await req('GET', `/databases/${dbId}/records`, adminConta);
    expect(res.status).toBe(200);
    const pg = (await res.json()) as Pagina;
    expect(pg.total).toBe(3);
    expect(pg.linhas).toHaveLength(3);
    expect(pg.colunas.some((c) => c.fieldId === nomeId)).toBe(true);
    expect(JSON.stringify(pg)).not.toContain(ORG_C); // orgId não vaza

    const ord = (await (
      await req('GET', `/databases/${dbId}/records?orderBy=${idadeId}&dir=asc`, adminConta)
    ).json()) as Pagina;
    expect(ord.linhas.map((l) => l.valores[nomeId])).toEqual(['Bruno', 'Ana', 'Carla']);
  });
});

describe('AC3: filtros por tipo (E) + 400 fail-closed', () => {
  it('texto contém, número maior, e combinação por E', async () => {
    const f = encodeURIComponent(JSON.stringify([{ fieldId: idadeId, op: 'maior', valor: 25 }]));
    const pg = (await (
      await req(
        'GET',
        `/databases/${dbId}/records?filtros=${f}&orderBy=${idadeId}&dir=asc`,
        adminConta,
      )
    ).json()) as Pagina;
    expect(pg.linhas.map((l) => l.valores[nomeId])).toEqual(['Ana', 'Carla']);

    const f2 = encodeURIComponent(JSON.stringify([{ fieldId: nomeId, op: 'contem', valor: 'a' }]));
    const pg2 = (await (
      await req('GET', `/databases/${dbId}/records?filtros=${f2}`, adminConta)
    ).json()) as Pagina;
    // 'Ana' e 'Carla' contêm 'a' (ILIKE, case-insensitive); 'Bruno' não.
    expect(pg2.total).toBe(2);
  });

  it('valor com metacaracteres SQL é tratado como LITERAL (parametrização, sem injeção)', async () => {
    const malicioso = encodeURIComponent(
      JSON.stringify([{ fieldId: nomeId, op: 'igual', valor: '\'; DROP TABLE "Record"; --' }]),
    );
    const res = await req('GET', `/databases/${dbId}/records?filtros=${malicioso}`, adminConta);
    expect(res.status).toBe(200); // não executa, não erra
    expect(((await res.json()) as Pagina).total).toBe(0); // nenhum Nome é essa string

    // A tabela continua íntegra (o DROP não rodou): a listagem normal segue funcionando.
    expect(
      await (await req('GET', `/databases/${dbId}/records`, adminConta)).json(),
    ).toHaveProperty('total');
  });

  it('Campo desconhecido → 400; Campo Arquivo (gated) no filtro → 400', async () => {
    const desconhecido = encodeURIComponent(
      JSON.stringify([{ fieldId: randomUUID(), op: 'igual', valor: 'x' }]),
    );
    expect(
      (await req('GET', `/databases/${dbId}/records?filtros=${desconhecido}`, adminConta)).status,
    ).toBe(400);

    const arquivo = encodeURIComponent(
      JSON.stringify([{ fieldId: fileId, op: 'igual', valor: 'x' }]),
    );
    expect(
      (await req('GET', `/databases/${dbId}/records?filtros=${arquivo}`, adminConta)).status,
    ).toBe(400);

    // take > 100 → 400.
    expect((await req('GET', `/databases/${dbId}/records?take=500`, adminConta)).status).toBe(400);
  });
});

describe('AC2: arquivados sob opção; edição refletida', () => {
  it('arquivar sai do default; incluirArquivados traz de volta com podeEditar=false', async () => {
    const alvo = (await (
      await req('GET', `/databases/${dbId}/records`, adminConta)
    ).json()) as Pagina;
    const id = alvo.linhas[0]!.id;
    expect((await req('POST', `/databases/${dbId}/records/${id}/archive`, adminConta)).status).toBe(
      200,
    );

    const soAtivos = (await (
      await req('GET', `/databases/${dbId}/records`, adminConta)
    ).json()) as Pagina;
    expect(soAtivos.total).toBe(2);
    expect(soAtivos.linhas.some((l) => l.id === id)).toBe(false);

    const comArq = (await (
      await req('GET', `/databases/${dbId}/records?incluirArquivados=true`, adminConta)
    ).json()) as Pagina;
    expect(comArq.total).toBe(3);
    const arquivado = comArq.linhas.find((l) => l.id === id)!;
    expect(arquivado.lifecycleState).toBe('ARQUIVADO');
    expect(arquivado.podeEditar).toBe(false);
  });
});

describe('AC4/AC6: INV-REPORT-01 e autorização', () => {
  it('VIEWER lista (ler ≠ operar); sem acesso → 404; cross-tenant → 404; sem principal → 401', async () => {
    expect((await req('GET', `/databases/${dbId}/records`, viewerConta)).status).toBe(200);
    expect((await req('GET', `/databases/${dbId}/records`, semAcessoConta)).status).toBe(404);
    expect((await req('GET', `/databases/${dbId}/records`, ANA)).status).toBe(404);
    expect((await req('GET', `/databases/${dbId}/records`, undefined)).status).toBe(401);
  });
});
