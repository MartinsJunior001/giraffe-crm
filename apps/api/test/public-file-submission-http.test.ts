import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import { StorageService } from '../src/kernel/storage/storage.service';
import { ClamavService } from '../src/kernel/scanner/clamav.service';
import type { ResultadoClamAV } from '../src/files/file-verdict.core';

/**
 * Canal PÚBLICO com arquivo inline (Story 3.8, Opção 1 / Fatia F6) pela porta da frente: HTTP real, banco real,
 * storage/scanner FALSOS (o scanner marca INFECTADO se o conteúdo tem o marcador). Prova: submissão pública
 * multipart bem-sucedida (o servidor reserva o cardId, sobe o arquivo vinculado a (CARD, cardId) e cria o Card já
 * com a referência em `valores` — sem UPDATE de valores); e a **compensação fail-closed** (scan bloqueia ⇒ 400,
 * sem Card parcial e sem órfão DISPONIVEL). Limites do canal e idempotência.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
const VIRUS = Buffer.concat([PNG, Buffer.from('__VIRUS__')]); // o FakeScanner marca INFECTADO

const adminConta = randomUUID();
const adminMemb = randomUUID();

class FakeStorage {
  objetos = new Map<string, Buffer>();
  put(key: string, body: Buffer): Promise<{ etag: string | undefined }> {
    this.objetos.set(key, body);
    return Promise.resolve({ etag: `"${createHash('md5').update(body).digest('hex')}"` });
  }
  getBytes(key: string): Promise<Uint8Array> {
    return Promise.resolve(this.objetos.get(key) ?? Buffer.alloc(0));
  }
  getStream(key: string): Promise<IncomingMessage> {
    return Promise.resolve(Readable.from([this.objetos.get(key) ?? Buffer.alloc(0)]) as IncomingMessage);
  }
  copyIfMatch(srcKey: string, destKey: string): Promise<boolean> {
    const b = this.objetos.get(srcKey);
    if (!b) return Promise.resolve(false);
    this.objetos.set(destKey, b);
    return Promise.resolve(true);
  }
  remove(key: string): Promise<void> {
    this.objetos.delete(key);
    return Promise.resolve();
  }
}
class FakeScanner {
  escanear(conteudo: Buffer): Promise<ResultadoClamAV> {
    return Promise.resolve(conteudo.includes('__VIRUS__') ? 'INFECTADO' : 'LIMPO');
  }
  dataDaBase(): Promise<Date | null> {
    return Promise.resolve(new Date());
  }
  canarioDetecta(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
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
interface EstadoPublico {
  publicId: string | null;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let pipeId = '';
let textFieldId = '';
let fileFieldId = '';
let publicId = '';
let baseOrfaos = 0; // órfãos pré-existentes (execuções anteriores): a asserção é RELATIVA a esta baseline.
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

/** Submissão pública multipart: valores JSON + N partes de arquivo (campo = Field.id do Campo Arquivo). */
async function submitMultipart(
  valores: Record<string, unknown>,
  arquivos: { campoId: string; bytes: Buffer; nome?: string }[],
  idempotencyKey?: string,
): Promise<Response> {
  const form = new FormData();
  form.append('valores', JSON.stringify(valores));
  if (idempotencyKey) form.append('idempotencyKey', idempotencyKey);
  for (const a of arquivos) {
    form.append(a.campoId, new Blob([a.bytes]), a.nome ?? 'anexo.png');
  }
  return fetch(`${baseUrl}/public/forms/${publicId}/submit`, { method: 'POST', body: form });
}

function db() {
  return withTenantContext(migrator, { orgId: ORG_C }, semLog);
}
async function cardsDoPipe(): Promise<{ id: string; valores: Record<string, unknown> }[]> {
  const cards = await db().card.findMany({ where: { pipeId }, select: { id: true, valores: true } });
  return cards as { id: string; valores: Record<string, unknown> }[];
}
/** Todo FileObject DISPONIVEL(CARD) da Org tem um Card correspondente? (nenhum órfão DISPONIVEL). */
async function orfaosDisponiveis(): Promise<number> {
  const arquivos = await db().fileObject.findMany({
    where: { resourceType: 'CARD', state: 'DISPONIVEL' },
    select: { resourceId: true },
  });
  let orfaos = 0;
  for (const a of arquivos) {
    const existe = await db().card.findUnique({ where: { id: a.resourceId }, select: { id: true } });
    if (!existe) orfaos += 1;
  }
  return orfaos;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  process.env.FILE_UPLOAD_ENABLED = 'true';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';
  process.env.PUBLIC_FILE_MAX_PER_SUBMISSION = '3';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.create({
    data: { id: adminConta, email: `pubfile-${adminConta}@x.test`, name: 'Admin Org' },
  });
  await db().membership.create({
    data: { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(ClamavService)
    .useValue(new FakeScanner())
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  // Pipe + Fase + Form inicial (TEXT + FILE) publicado, público DIRECT.
  pipeId = ((await (await req('POST', '/pipes', adminConta, { name: 'Público com arquivo' })).json()) as Ident).id;
  await req('POST', `/pipes/${pipeId}/phases`, adminConta, { name: 'A Fazer' });
  textFieldId = (
    (await (await req('POST', `/pipes/${pipeId}/forms/initial/fields`, adminConta, {
      label: 'Nome',
      type: 'TEXT_SHORT',
    })).json()) as Ident
  ).id;
  fileFieldId = (
    (await (await req('POST', `/pipes/${pipeId}/forms/initial/fields`, adminConta, {
      label: 'Anexo',
      type: 'FILE',
    })).json()) as Ident
  ).id;
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, adminConta)).status).toBe(201);
  const est = (await (
    await req('POST', `/pipes/${pipeId}/forms/initial/public/enable`, adminConta, { mode: 'DIRECT' })
  ).json()) as EstadoPublico;
  publicId = est.publicId!;
  // Rate limit é DB-backed com janela de 10min; execuções repetidas acumulariam a chave por Org (`pub-files:`)
  // e por publicId. Limpa as chaves DESTE teste (globais, sem RLS) para começar com orçamento limpo.
  await migrator.rateLimit.deleteMany({ where: { key: { startsWith: `pub-files:${ORG_C}` } } });
  await migrator.rateLimit.deleteMany({ where: { key: { contains: publicId } } });
  baseOrfaos = await orfaosDisponiveis(); // pode haver órfãos de execuções anteriores; medimos o DELTA.
}, 40000);

afterAll(async () => {
  if (migrator) {
    // Limpa os FileObjects (sem FK a Card) ANTES do pipe, para não deixar órfãos CARD para execuções futuras.
    const cards = await db().card.findMany({ where: { pipeId }, select: { id: true } });
    await db()
      .fileObject.deleteMany({
        where: { resourceType: 'CARD', resourceId: { in: cards.map((c) => c.id) } },
      })
      .catch(() => {});
    await db().pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
    await db().membership.deleteMany({ where: { id: adminMemb } }).catch(() => {});
    await migrator.account.deleteMany({ where: { id: adminConta } }).catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('canal público com arquivo inline (F6)', () => {
  it('submissão multipart bem-sucedida: reserva cardId, sobe arquivo e cria Card com a referência', async () => {
    const res = await submitMultipart({ [textFieldId]: 'Alice' }, [{ campoId: fileFieldId, bytes: PNG }]);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const cards = await cardsDoPipe();
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    // O valor de Campo Arquivo é uma REFERÊNCIA (fileId) nos valores do Card (INSERT — sem UPDATE de valores).
    const fileId = card.valores[fileFieldId] as string;
    expect(typeof fileId).toBe('string');
    expect(card.valores[textFieldId]).toBe('Alice');

    // O FileObject está DISPONIVEL e vinculado a (CARD, cardId).
    const fo = await db().fileObject.findUnique({
      where: { id: fileId },
      select: { state: true, resourceType: true, resourceId: true },
    });
    expect(fo).toEqual({ state: 'DISPONIVEL', resourceType: 'CARD', resourceId: card.id });
    expect(await orfaosDisponiveis()).toBe(baseOrfaos);
  });

  it('scan bloqueia (INFECTADO) → 400, sem Card parcial e sem órfão DISPONIVEL (compensação)', async () => {
    const antes = (await cardsDoPipe()).length;
    const res = await submitMultipart({ [textFieldId]: 'Mallory' }, [{ campoId: fileFieldId, bytes: VIRUS }]);
    expect(res.status).toBe(400);
    expect((await cardsDoPipe()).length).toBe(antes); // nenhum Card criado
    expect(await orfaosDisponiveis()).toBe(baseOrfaos); // nenhum FileObject DISPONIVEL órfão
  });

  it('excede o limite de arquivos por submissão → 400 (antes do trabalho caro)', async () => {
    const antes = (await cardsDoPipe()).length;
    const arquivos = Array.from({ length: 4 }, () => ({ campoId: fileFieldId, bytes: PNG }));
    // Campo não-múltiplo aceita ≤1; 4 partes no mesmo Campo excede — 400.
    expect((await submitMultipart({ [textFieldId]: 'X' }, arquivos)).status).toBe(400);
    expect((await cardsDoPipe()).length).toBe(antes);
    expect(await orfaosDisponiveis()).toBe(baseOrfaos);
  });

  it('parte de arquivo em Campo não-Arquivo → 400 (allowlist de Campo)', async () => {
    expect(
      (await submitMultipart({}, [{ campoId: textFieldId, bytes: PNG }])).status,
    ).toBe(400);
    expect(await orfaosDisponiveis()).toBe(baseOrfaos);
  });

  it('idempotência: mesma chave duas vezes cria 1 Card só', async () => {
    const chave = randomUUID();
    const r1 = await submitMultipart({ [textFieldId]: 'Bob' }, [{ campoId: fileFieldId, bytes: PNG }], chave);
    expect(r1.status).toBe(201);
    const depois1 = (await cardsDoPipe()).length;
    const r2 = await submitMultipart({ [textFieldId]: 'Bob' }, [{ campoId: fileFieldId, bytes: PNG }], chave);
    expect(r2.status).toBe(201);
    expect((await cardsDoPipe()).length).toBe(depois1); // retry não criou 2º Card
    expect(await orfaosDisponiveis()).toBe(baseOrfaos);
  });
});
