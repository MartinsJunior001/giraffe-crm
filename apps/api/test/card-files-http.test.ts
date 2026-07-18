import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
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
 * Anexo geral de Card (Story 3.8, Opção 1) pela porta da frente: HTTP real, banco real, dispatcher de
 * autorização REAL (NÃO sobrescrito — prova a herança de permissão Card→pipe-authz), storage e scanner FALSOS
 * (determinísticos, sem MinIO/ClamAV). Prova os invariantes do dono: o anexo é um `FileObject(CARD, cardId)` e
 * **`Card.valores` NUNCA é escrito** (modelo append-only preservado); listar/baixar/remover; sem acesso → 404.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A, sem papel no Pipe
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);

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
    return Promise.resolve(
      Readable.from([this.objetos.get(key) ?? Buffer.alloc(0)]) as IncomingMessage,
    );
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
  escanear(): Promise<ResultadoClamAV> {
    return Promise.resolve('LIMPO');
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
interface FileResp {
  id: string;
  state: string;
  resourceType: string;
  resourceId: string;
  nomeOriginal: string;
  bucketKey?: string; // NUNCA deve aparecer.
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
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

async function anexar(
  cardId: string,
  conta: string | undefined,
  bytes: Buffer,
  nome = 'anexo.png',
): Promise<{ status: number; body: FileResp }> {
  const form = new FormData();
  form.append('file', new Blob([bytes]), nome);
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  const res = await fetch(`${baseUrl}/cards/${cardId}/files`, { method: 'POST', headers, body: form });
  const body = res.status < 500 ? ((await res.json().catch(() => ({}))) as FileResp) : ({} as FileResp);
  return { status: res.status, body };
}

/** Pipe com Fase + Campo publicado e um Card submetido (via ANA, Admin). Devolve pipeId/cardId/campoId. */
async function pipeComCard(nome: string): Promise<{ cardId: string; campoId: string }> {
  const pipe = (await (await req('POST', '/pipes', ANA, { name: nome })).json()) as Ident;
  pipesCriados.push(pipe.id);
  await req('POST', `/pipes/${pipe.id}/phases`, ANA, { name: 'A Fazer' });
  const campo = (await (
    await req('POST', `/pipes/${pipe.id}/forms/initial/fields`, ANA, {
      label: 'Nome',
      type: 'TEXT_SHORT',
    })
  ).json()) as Ident;
  await req('POST', `/pipes/${pipe.id}/forms/initial/publish`, ANA);
  const sub = await req('POST', `/pipes/${pipe.id}/forms/initial/submit`, ANA, {
    idempotencyKey: `${nome}-1`,
    valores: { [campo.id]: 'x' },
  });
  return { cardId: ((await sub.json()) as Ident).id, campoId: campo.id };
}

async function cardDoBanco(cardId: string): Promise<{ valores: unknown } | null> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.card.findUnique({ where: { id: cardId }, select: { valores: true } });
}

async function tiposHistorico(cardId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const eventos = await db.cardHistory.findMany({
    where: { cardId },
    select: { type: true },
    orderBy: { createdAt: 'asc' },
  });
  return eventos.map((e) => e.type);
}

beforeAll(async () => {
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  process.env.FILE_UPLOAD_ENABLED = 'true';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';

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
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
}, 30000);

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('anexo geral de Card (Opção 1) — Card.valores intocado', () => {
  it('anexa um arquivo como FileObject(CARD, cardId) SEM escrever em Card.valores', async () => {
    const { cardId, campoId } = await pipeComCard('3.8 anexo card');
    const valoresAntes = (await cardDoBanco(cardId))?.valores;
    expect(valoresAntes).toEqual({ [campoId]: 'x' });

    const up = await anexar(cardId, ANA, PNG);
    expect(up.status).toBe(201);
    expect(up.body.state).toBe('DISPONIVEL');
    expect(up.body.resourceType).toBe('CARD');
    expect(up.body.resourceId).toBe(cardId);
    expect(up.body.bucketKey).toBeUndefined(); // a chave nunca vaza.

    // O anexo é uma linha FileObject própria...
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const fo = await db.fileObject.findUnique({
      where: { id: up.body.id },
      select: { resourceType: true, resourceId: true, state: true },
    });
    expect(fo).toEqual({ resourceType: 'CARD', resourceId: cardId, state: 'DISPONIVEL' });

    // ...e Card.valores permanece EXATAMENTE o mesmo (append-only preservado, sem UPDATE de valores).
    expect((await cardDoBanco(cardId))?.valores).toEqual({ [campoId]: 'x' });
  });

  it('lista, baixa e remove (lógico) o anexo; emite FILE_ATTACHED e FILE_REMOVED', async () => {
    const { cardId } = await pipeComCard('3.8 anexo ciclo');
    const up = await anexar(cardId, ANA, PNG);
    expect(up.status).toBe(201);
    // F5: o anexo emitiu FILE_ATTACHED na trilha do Card (na mesma tx da promoção).
    expect(await tiposHistorico(cardId)).toEqual(['CREATED', 'FILE_ATTACHED']);

    const lista = (await (await req('GET', `/cards/${cardId}/files`, ANA)).json()) as FileResp[];
    expect(lista.map((f) => f.id)).toContain(up.body.id);

    const dl = await fetch(`${baseUrl}/cards/${cardId}/files/${up.body.id}/download`, {
      headers: { [HEADER_CONTA]: ANA },
      redirect: 'manual',
    });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer())).toEqual(PNG);

    const rm = await fetch(`${baseUrl}/cards/${cardId}/files/${up.body.id}`, {
      method: 'DELETE',
      headers: { [HEADER_CONTA]: ANA },
    });
    expect(rm.status).toBe(200);
    const lista2 = (await (await req('GET', `/cards/${cardId}/files`, ANA)).json()) as FileResp[];
    expect(lista2.map((f) => f.id)).not.toContain(up.body.id); // some da lista (REMOVIDO_LOGICO).
    // F5: a remoção emitiu FILE_REMOVED (idempotente — remover de novo não duplica o evento).
    expect(await tiposHistorico(cardId)).toEqual(['CREATED', 'FILE_ATTACHED', 'FILE_REMOVED']);
    await fetch(`${baseUrl}/cards/${cardId}/files/${up.body.id}`, {
      method: 'DELETE',
      headers: { [HEADER_CONTA]: ANA },
    });
    expect(await tiposHistorico(cardId)).toEqual(['CREATED', 'FILE_ATTACHED', 'FILE_REMOVED']);
  });
});

describe('autorização herdada do Card (F1) — não-enumeração', () => {
  it('sem papel no Pipe → 404 ao anexar e ao listar (não-enumerante)', async () => {
    const { cardId } = await pipeComCard('3.8 anexo authz');
    expect((await anexar(cardId, BRUNO, PNG)).status).toBe(404);
    expect((await req('GET', `/cards/${cardId}/files`, BRUNO)).status).toBe(404);
  });

  it('anexar em Card inexistente → 404', async () => {
    expect((await anexar('ffffffff-ffff-ffff-ffff-ffffffffffff', ANA, PNG)).status).toBe(404);
  });
});
