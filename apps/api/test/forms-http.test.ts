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
 * Formulários pela porta da frente (Story 2.4): HTTP real, `AppModule` de produção, banco real. Ana é ADMIN
 * da Org A; Carla é ADMIN da Org B (não vê os Pipes da A). Cada teste cria o SEU Pipe (id único), então cada
 * Formulário é isolado — asserções de ordem podem ser exatas.
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
interface OpcaoResp {
  id: string;
  label: string;
  position: number;
}
interface CampoResp {
  id: string;
  formId: string;
  label: string;
  type: string;
  typeConfig: { options?: OpcaoResp[] };
  state: 'ACTIVE' | 'ARCHIVED';
}
interface FormResp {
  id: string | null;
  context: string;
  pipeId: string | null;
  phaseId: string | null;
  capabilities: { fileUpload: boolean };
  fields: CampoResp[];
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

async function addCampo(base: string, body: unknown, conta = ANA): Promise<CampoResp> {
  const res = await req('POST', `${base}/fields`, conta, body);
  expect(res.status).toBe(201);
  return (await res.json()) as CampoResp;
}

async function obterForm(path: string, conta = ANA): Promise<FormResp> {
  const res = await req('GET', path, conta);
  expect(res.status).toBe(200);
  return (await res.json()) as FormResp;
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
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } }); // cascateia Forms e Fields
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('catálogo canônico e validação (SC-241)', () => {
  it('aceita os 12 tipos canônicos e rejeita um tipo fora do catálogo (400)', async () => {
    const pipeId = await criarPipe('Forms — catálogo');
    const base = `/pipes/${pipeId}/forms/initial`;
    const tipos = [
      'TEXT_SHORT',
      'TEXT_LONG',
      'NUMBER',
      'BOOLEAN',
      'DATE',
      'DATETIME',
      'EMAIL',
      'PHONE',
      'URL',
      'FILE',
    ];
    for (const type of tipos) {
      const campo = await addCampo(base, { label: `Campo ${type}`, type });
      expect(campo.type).toBe(type);
    }
    // Seleção exige options.
    const sel = await addCampo(base, {
      label: 'Prioridade',
      type: 'SELECT_SINGLE',
      options: ['Alta', 'Baixa'],
    });
    expect(sel.type).toBe('SELECT_SINGLE');

    // Tipo inexistente → 400.
    expect((await req('POST', `${base}/fields`, ANA, { label: 'x', type: 'RATING' })).status).toBe(
      400,
    );
    // Seleção sem options → 400; tipo não-Seleção com options → 400.
    expect(
      (await req('POST', `${base}/fields`, ANA, { label: 'x', type: 'SELECT_MULTI' })).status,
    ).toBe(400);
    expect(
      (await req('POST', `${base}/fields`, ANA, { label: 'x', type: 'TEXT_SHORT', options: ['a'] }))
        .status,
    ).toBe(400);
  });

  it('POST sem label é 400; id de rota malformado é 400', async () => {
    const pipeId = await criarPipe('Forms — validação');
    const base = `/pipes/${pipeId}/forms/initial`;
    expect((await req('POST', `${base}/fields`, ANA, {})).status).toBe(400);
    expect(
      (await req('POST', `${base}/fields`, ANA, { label: '   ', type: 'NUMBER' })).status,
    ).toBe(400);
    expect((await req('GET', `/pipes/nao-e-uuid/forms/initial`, ANA)).status).toBe(400);
  });
});

describe('identidade estável do Campo e das opções (SC-242)', () => {
  it('Campo e opções de Seleção têm id UUID estável, independente do rótulo', async () => {
    const pipeId = await criarPipe('Forms — identidade');
    const base = `/pipes/${pipeId}/forms/initial`;
    const campo = await addCampo(base, {
      label: 'Status',
      type: 'SELECT_SINGLE',
      options: ['Aberto', 'Fechado'],
    });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(campo.id).toMatch(uuid);
    const opcoes = campo.typeConfig.options ?? [];
    expect(opcoes).toHaveLength(2);
    for (const o of opcoes) {
      expect(o.id).toMatch(uuid);
      expect(o.id).not.toBe(o.label); // identidade NÃO é o rótulo
    }
    expect(opcoes[0]?.id).not.toBe(opcoes[1]?.id);

    // Estável: reler o Formulário devolve os MESMOS ids.
    const form = await obterForm(base);
    const relido = form.fields.find((c) => c.id === campo.id);
    expect(relido?.typeConfig.options?.map((o) => o.id)).toEqual(opcoes.map((o) => o.id));
  });
});

describe('isolamento entre contextos — INV-FORM-01 / RN-054 (SC-243)', () => {
  it('alterar o Formulário inicial NÃO altera o de Fase (e vice-versa)', async () => {
    const pipeId = await criarPipe('Forms — INV-FORM-01');
    const phaseId = await criarFase(pipeId, 'Fase 1');
    const baseInicial = `/pipes/${pipeId}/forms/initial`;
    const baseFase = `/pipes/${pipeId}/phases/${phaseId}/form`;

    const i1 = await addCampo(baseInicial, { label: 'Inicial-A', type: 'TEXT_SHORT' });
    const f1 = await addCampo(baseFase, { label: 'Fase-A', type: 'TEXT_SHORT' });

    // Cada contexto vê SÓ o seu Campo, e o contexto está identificado.
    const formIni = await obterForm(baseInicial);
    const formFase = await obterForm(baseFase);
    expect(formIni.context).toBe('PIPE_INITIAL');
    expect(formFase.context).toBe('PHASE');
    expect(formIni.fields.map((c) => c.id)).toEqual([i1.id]);
    expect(formFase.fields.map((c) => c.id)).toEqual([f1.id]);
    expect(formIni.id).not.toBe(formFase.id); // Formulários distintos

    // Adiciona outro Campo SÓ no inicial: o de Fase não muda.
    await addCampo(baseInicial, { label: 'Inicial-B', type: 'NUMBER' });
    expect((await obterForm(baseFase)).fields.map((c) => c.id)).toEqual([f1.id]);

    // Adiciona no de Fase: o inicial não muda em quantidade.
    await addCampo(baseFase, { label: 'Fase-B', type: 'NUMBER' });
    expect((await obterForm(baseInicial)).fields).toHaveLength(2);
  });
});

describe('montagem: ordem e getOrCreate (SC-243)', () => {
  it('Campos aparecem na ordem de criação; reordenar reposiciona', async () => {
    const pipeId = await criarPipe('Forms — ordem');
    const base = `/pipes/${pipeId}/forms/initial`;
    const a = (await addCampo(base, { label: 'A', type: 'TEXT_SHORT' })).id;
    const b = (await addCampo(base, { label: 'B', type: 'TEXT_SHORT' })).id;
    const c = (await addCampo(base, { label: 'C', type: 'TEXT_SHORT' })).id;
    expect((await obterForm(base)).fields.map((f) => f.id)).toEqual([a, b, c]);

    // Move C para o início.
    expect(
      (await req('POST', `${base}/fields/reorder`, ANA, { fieldId: c, afterFieldId: null })).status,
    ).toBe(200);
    expect((await obterForm(base)).fields.map((f) => f.id)).toEqual([c, a, b]);

    // Move A para depois de B.
    expect(
      (await req('POST', `${base}/fields/reorder`, ANA, { fieldId: a, afterFieldId: b })).status,
    ).toBe(200);
    expect((await obterForm(base)).fields.map((f) => f.id)).toEqual([c, b, a]);
  });

  it('obter antes de qualquer Campo devolve Formulário virtual (id null, vazio); adicionar o materializa uma vez', async () => {
    const pipeId = await criarPipe('Forms — getOrCreate');
    const base = `/pipes/${pipeId}/forms/initial`;
    const vazio = await obterForm(base);
    expect(vazio.id).toBeNull();
    expect(vazio.fields).toEqual([]);
    expect(vazio.capabilities.fileUpload).toBe(false); // fail-closed por padrão

    const c1 = await addCampo(base, { label: 'Primeiro', type: 'TEXT_SHORT' });
    const form1 = await obterForm(base);
    expect(form1.id).not.toBeNull();
    // Segundo Campo NÃO cria um segundo Formulário: mesmo formId.
    const c2 = await addCampo(base, { label: 'Segundo', type: 'TEXT_SHORT' });
    expect(c2.formId).toBe(c1.formId);
    // Reler é idempotente: mesmo id de Formulário.
    expect((await obterForm(base)).id).toBe(form1.id);
  });
});

describe('não-enumeração entre tenants (SC-247)', () => {
  it('um tenant não vê o Formulário do Pipe de outro — 404', async () => {
    const pipeId = await criarPipe('Forms — só da Org A');
    const base = `/pipes/${pipeId}/forms/initial`;
    await addCampo(base, { label: 'A', type: 'TEXT_SHORT' });
    // Carla é ADMIN da Org B: a RLS filtra o Pipe da Org A ⇒ 404.
    expect((await req('GET', base, CARLA)).status).toBe(404);
    expect(
      (await req('POST', `${base}/fields`, CARLA, { label: 'x', type: 'NUMBER' })).status,
    ).toBe(404);
  });
});
