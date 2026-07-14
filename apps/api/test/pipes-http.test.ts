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
 * Pipes pela porta da frente: HTTP real, `AppModule` de produção, banco real. Prova o Épico 2 ponta a
 * ponta — o `AuthzGuard` global concede a Pipe (ADMIN) e nega (MEMBER), o `PipesController` valida a
 * entrada, o `PipesService` roda sob `withTenantContext` e a RLS isola. A única costura é o provider
 * de identidade (o login é da Story 1.4), idêntico a `tenant-context-http.test.ts`.
 *
 * Ana é ADMIN da Org A; Bruno é MEMBER da Org A; Carla é ADMIN da Org B. Org C não tem Membership,
 * então não há ADMIN por HTTP nela — as escritas caem na Org A (fixture de leitura para Membership,
 * mas o Pipe é tabela nova desta Story: nenhuma suíte paralela conta Pipes). Faxina pelo migrator.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (ACTIVE)
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

interface PipeResp {
  id: string;
  name: string;
  state: 'ACTIVE' | 'ARCHIVED';
  locked: boolean;
  starred: boolean;
  archivedAt: string | null;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const criados: string[] = [];

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

/** Cria um Pipe como Ana e devolve o corpo, registrando o id para faxina. */
async function criarComoAna(name: string): Promise<PipeResp> {
  const res = await req('POST', '/pipes', ANA, { name });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as PipeResp;
  criados.push(pipe.id);
  return pipe;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) {
    throw new Error(
      'MIGRATION_DATABASE_URL ausente: a faxina dos Pipes de teste exige o migrator.',
    );
  }

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
  if (migrator && criados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: criados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('autorização de Pipe sobre HTTP (SC-203)', () => {
  it('sem principal, POST /pipes é 401 — não 403', async () => {
    const res = await req('POST', '/pipes', undefined, { name: 'x' });
    expect(res.status).toBe(401);
  });

  it('MEMBER recebe 403 ao criar e ao listar Pipe (deny-by-default em 2.1)', async () => {
    expect((await req('POST', '/pipes', BRUNO, { name: 'x' })).status).toBe(403);
    expect((await req('GET', '/pipes', BRUNO)).status).toBe(403);
  });

  it('ADMIN cria e lista Pipe (201 / 200)', async () => {
    const pipe = await criarComoAna('Vendas');
    expect(pipe).toMatchObject({ name: 'Vendas', state: 'ACTIVE', locked: false, starred: false });

    const lista = await req('GET', '/pipes', ANA);
    expect(lista.status).toBe(200);
    expect(((await lista.json()) as PipeResp[]).map((p) => p.id)).toContain(pipe.id);
  });
});

describe('ciclo de vida e catálogo (SC-201 / SC-202)', () => {
  it('GET /pipes/:id devolve o Pipe da própria Org (200)', async () => {
    const pipe = await criarComoAna('Obtível');
    const res = await req('GET', `/pipes/${pipe.id}`, ANA);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: pipe.id, name: 'Obtível', state: 'ACTIVE' });
  });

  it('restaurar um Pipe já ativo é idempotente (200, sem alterar dado)', async () => {
    const pipe = await criarComoAna('Já ativo');
    const res = await req('POST', `/pipes/${pipe.id}/restore`, ANA);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as PipeResp;
    expect(corpo.state).toBe('ACTIVE');
    expect(corpo.archivedAt).toBeNull();
  });

  it('renomeia e alterna marcadores via PATCH, preservando o id', async () => {
    const pipe = await criarComoAna('Original');
    const res = await req('PATCH', `/pipes/${pipe.id}`, ANA, { name: 'Renomeado', starred: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: pipe.id, name: 'Renomeado', starred: true });
  });

  it('arquivar tira do catálogo ativo e restaurar devolve — sem perder dados', async () => {
    const pipe = await criarComoAna('Ciclo');
    // Renomeia para provar depois que arquivar/restaurar preservam o dado, não só o estado.
    await req('PATCH', `/pipes/${pipe.id}`, ANA, { name: 'Ciclo v2' });

    const arquivado = await req('POST', `/pipes/${pipe.id}/archive`, ANA);
    expect(arquivado.status).toBe(200);
    const corpoArq = (await arquivado.json()) as PipeResp;
    expect(corpoArq.state).toBe('ARCHIVED');
    expect(corpoArq.archivedAt).not.toBeNull();
    expect(corpoArq.name).toBe('Ciclo v2'); // dado preservado

    // Some do catálogo ativo…
    const ativos = (await (await req('GET', '/pipes', ANA)).json()) as PipeResp[];
    expect(ativos.map((p) => p.id)).not.toContain(pipe.id);
    // …mas aparece quando se pede os arquivados.
    const comArquivados = (await (
      await req('GET', '/pipes?arquivados=true', ANA)
    ).json()) as PipeResp[];
    expect(comArquivados.map((p) => p.id)).toContain(pipe.id);

    // Arquivar de novo é idempotente: 200, e NÃO reescreve `archivedAt` (o caminho idempotente
    // retorna sem emitir o updateMany — nem toca o dado, nem suja a auditoria com um falso `denied`).
    const rearquivado = await req('POST', `/pipes/${pipe.id}/archive`, ANA);
    expect(rearquivado.status).toBe(200);
    const corpoRearq = (await rearquivado.json()) as PipeResp;
    expect(corpoRearq.state).toBe('ARCHIVED');
    expect(corpoRearq.archivedAt).toBe(corpoArq.archivedAt); // preservado, não reescrito

    const restaurado = await req('POST', `/pipes/${pipe.id}/restore`, ANA);
    expect(restaurado.status).toBe(200);
    const corpoRest = (await restaurado.json()) as PipeResp;
    expect(corpoRest.state).toBe('ACTIVE');
    expect(corpoRest.archivedAt).toBeNull();
    expect(corpoRest.name).toBe('Ciclo v2'); // dado preservado após o ciclo completo

    const ativosDepois = (await (await req('GET', '/pipes', ANA)).json()) as PipeResp[];
    expect(ativosDepois.map((p) => p.id)).toContain(pipe.id);
  });

  it('um tenant não vê o Pipe de outro por id — 404 sanitizado (não-enumeração, SC-201/AC4)', async () => {
    const pipe = await criarComoAna('Só da Org A');
    // Carla é ADMIN da Org B: tem a ability de Pipe, mas a RLS filtra o Pipe da Org A ⇒ 404,
    // indistinguível de "não existe". Não se revela a existência de recurso de outro tenant.
    const res = await req('GET', `/pipes/${pipe.id}`, CARLA);
    expect(res.status).toBe(404);
  });
});

describe('validação de entrada (400, sanitizada)', () => {
  it('POST sem name é 400', async () => {
    expect((await req('POST', '/pipes', ANA, {})).status).toBe(400);
    expect((await req('POST', '/pipes', ANA, { name: '   ' })).status).toBe(400);
  });

  it('id malformado é 400, não 500', async () => {
    expect((await req('GET', '/pipes/nao-e-uuid', ANA)).status).toBe(400);
  });

  it('PATCH sem nenhum campo conhecido é 400 (não é no-op silencioso)', async () => {
    const pipe = await criarComoAna('Para patch vazio');
    expect((await req('PATCH', `/pipes/${pipe.id}`, ANA, {})).status).toBe(400);
  });
});
