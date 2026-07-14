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
 * Ciclo de publicação (Story 2.6) pela porta da frente: HTTP real, `AppModule` de produção, banco real. Ana é
 * ADMIN da Org A. Cada teste cria o SEU Pipe (id único) → o Formulário e as versões são isolados, asserções de
 * número/ordem são exatas. Prova: primeira/próxima publicação, snapshot ordenado, imutabilidade do histórico
 * (editar o rascunho não muda versões anteriores), validações (Seleção sem opção, gate de Arquivo, vazio),
 * despublicar, leitura de estado/versão e concorrência (sem número duplicado nem versão perdida).
 */

const ANA = '11111111-1111-1111-1111-111111111111';
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
  typeConfig: { options?: OpcaoResp[] };
}
interface VersaoResp {
  version: number;
  revision: string;
  publishedAt: string;
  actorId: string | null;
  snapshot: { formId: string; fields: { id: string; label: string; type: string }[] };
}
interface EstadoResp {
  formId: string;
  publishedVersion: number | null;
  versions: { version: number; revision: string }[];
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

async function adicionarCampo(pipeId: string, corpo: unknown): Promise<CampoResp> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, corpo);
  expect(res.status).toBe(201);
  return (await res.json()) as CampoResp;
}

const url = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

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
    const db = withTenantContext(
      migrator,
      { orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      semLog,
    );
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('publicar (SC-261)', () => {
  it('primeira publicação cria a versão 1 com snapshot ordenado; a próxima cria a versão 2', async () => {
    const pipeId = await criarPipe('2.6 publicar');
    const a = await adicionarCampo(pipeId, { label: 'A', type: 'TEXT_SHORT' });
    const b = await adicionarCampo(pipeId, { label: 'B', type: 'TEXT_SHORT' });

    const pub1 = await req('POST', `${url(pipeId)}/publish`, ANA);
    expect(pub1.status).toBe(201);
    const v1 = (await pub1.json()) as VersaoResp;
    expect(v1.version).toBe(1);
    expect(v1.actorId).toBe(ANA);
    expect(v1.snapshot.fields.map((f) => f.id)).toEqual([a.id, b.id]); // ordenado
    expect(typeof v1.revision).toBe('string');

    const pub2 = await req('POST', `${url(pipeId)}/publish`, ANA);
    expect(pub2.status).toBe(201);
    expect(((await pub2.json()) as VersaoResp).version).toBe(2);

    const est = (await (await req('GET', `${url(pipeId)}/publication`, ANA)).json()) as EstadoResp;
    expect(est.publishedVersion).toBe(2);
    expect(est.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it('editar o rascunho NÃO altera versões já publicadas (imutabilidade — SC-262)', async () => {
    const pipeId = await criarPipe('2.6 imutabilidade');
    const a = await adicionarCampo(pipeId, { label: 'Original', type: 'TEXT_SHORT' });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);

    // Muda o rascunho: renomeia o Campo e adiciona outro.
    expect(
      (await req('PATCH', `${url(pipeId)}/fields/${a.id}`, ANA, { label: 'Renomeado' })).status,
    ).toBe(200);
    await adicionarCampo(pipeId, { label: 'Novo', type: 'TEXT_SHORT' });

    // A versão 1 permanece congelada: rótulo "Original", um único Campo.
    const v1 = (await (await req('GET', `${url(pipeId)}/versions/1`, ANA)).json()) as VersaoResp;
    expect(v1.snapshot.fields).toHaveLength(1);
    expect(v1.snapshot.fields[0]!.label).toBe('Original');

    // Publicar de novo captura o rascunho ATUAL na versão 2.
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);
    const v2 = (await (await req('GET', `${url(pipeId)}/versions/2`, ANA)).json()) as VersaoResp;
    expect(v2.snapshot.fields.map((f) => f.label)).toEqual(['Renomeado', 'Novo']);
  });

  it('despublicar zera a versão publicada, preservando o histórico (SC-261)', async () => {
    const pipeId = await criarPipe('2.6 despublicar');
    await adicionarCampo(pipeId, { label: 'A', type: 'TEXT_SHORT' });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);

    const des = await req('POST', `${url(pipeId)}/unpublish`, ANA);
    expect(des.status).toBe(200);
    const est = (await des.json()) as EstadoResp;
    expect(est.publishedVersion).toBeNull();
    expect(est.versions.map((v) => v.version)).toEqual([1]); // versão preservada

    // Despublicar de novo é idempotente.
    expect((await req('POST', `${url(pipeId)}/unpublish`, ANA)).status).toBe(200);
  });

  it('versão inexistente → 404', async () => {
    const pipeId = await criarPipe('2.6 versao 404');
    await adicionarCampo(pipeId, { label: 'A', type: 'TEXT_SHORT' });
    expect((await req('GET', `${url(pipeId)}/versions/99`, ANA)).status).toBe(404);
  });
});

describe('validações de publicação (SC-264) — draft inválido → 400 determinístico', () => {
  it('Formulário sem Campos ativos não publica', async () => {
    const pipeId = await criarPipe('2.6 vazio');
    const a = await adicionarCampo(pipeId, { label: 'Único', type: 'TEXT_SHORT' });
    expect((await req('POST', `${url(pipeId)}/fields/${a.id}/archive`, ANA)).status).toBe(200);
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(400);
  });

  it('Campo de Seleção sem opção ativa não publica', async () => {
    const pipeId = await criarPipe('2.6 selecao sem opcao');
    const campo = await adicionarCampo(pipeId, {
      label: 'Prioridade',
      type: 'SELECT_SINGLE',
      options: ['Única'],
    });
    const opId = campo.typeConfig.options![0]!.id;
    // Arquiva a única opção → Seleção sem opção ativa.
    expect(
      (await req('POST', `${url(pipeId)}/fields/${campo.id}/options/${opId}/archive`, ANA)).status,
    ).toBe(200);
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(400);
  });

  it('Campo de Arquivo ativo barra a publicação (upload desabilitado por padrão)', async () => {
    const pipeId = await criarPipe('2.6 arquivo');
    await adicionarCampo(pipeId, { label: 'Anexo', type: 'FILE' });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(400);
  });

  it('publicar Formulário não materializado → 404', async () => {
    const pipeId = await criarPipe('2.6 sem form');
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(404);
  });
});

describe('concorrência de publicação (SC-263) — sem número duplicado nem versão perdida', () => {
  it('publicações simultâneas: cada resposta é 201 ou 409; a numeração fica consistente', async () => {
    const pipeId = await criarPipe('2.6 concorrência');
    await adicionarCampo(pipeId, { label: 'A', type: 'TEXT_SHORT' });

    // Rajada de 5 publicações do MESMO Formulário. O backstop de número (UNIQUE) é provado de forma
    // determinística em `publication-rls` (duplicado → P2002) e o mapeamento P2002/P2028 → 409 em
    // `publication-conflict`; aqui exercitamos o caminho concorrente ponta a ponta e afirmamos o invariante
    // determinístico: nenhuma resposta fora de {201, 409} e a numeração final é EXATAMENTE 1..(nº de 201),
    // sem número duplicado nem buraco (nenhuma versão parcial de uma transação que fez rollback).
    const respostas = await Promise.all(
      Array.from({ length: 5 }, () => req('POST', `${url(pipeId)}/publish`, ANA)),
    );
    for (const r of respostas) expect([201, 409]).toContain(r.status);
    const criadas = respostas.filter((r) => r.status === 201).length;
    expect(criadas).toBeGreaterThanOrEqual(1);

    const est = (await (await req('GET', `${url(pipeId)}/publication`, ANA)).json()) as EstadoResp;
    expect(est.versions.map((v) => v.version)).toEqual(
      Array.from({ length: criadas }, (_, i) => i + 1),
    );
    expect(est.publishedVersion).toBe(criadas); // o ponteiro reflete a última versão criada
  });
});
