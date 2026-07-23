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
 * Anexo geral de Tarefa (Story 5.1) pela porta da frente: HTTP real, banco real, dispatcher de autorização REAL
 * (NÃO sobrescrito — prova a herança de permissão Tarefa→pipe-authz), storage e scanner FALSOS (determinísticos,
 * sem MinIO/ClamAV). Espelha `card-files-http` (3.8). Prova: o anexo é um `FileObject(TASK, taskId)`; herança de
 * autz (operar anexa; Viewer só lê; sem acesso 404; cross-tenant 404); evento `FILE_ATTACHED`/`FILE_REMOVED` no
 * `TaskHistory`; read-only sob arquivamento (409); gate AD-28 (desligado → 503).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A, sem papel no Pipe
const CARLA = '33333333-3333-3333-3333-333333333333'; // ADMIN na Org B (cross-tenant)
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
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
  bucketKey?: string; // NUNCA deve aparecer.
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

async function anexar(
  taskId: string,
  conta: string | undefined,
  bytes: Buffer,
  nome = 'anexo.png',
): Promise<{ status: number; body: FileResp }> {
  const form = new FormData();
  form.append('file', new Blob([bytes]), nome);
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  const res = await fetch(`${baseUrl}/tasks/${taskId}/files`, {
    method: 'POST',
    headers,
    body: form,
  });
  const body =
    res.status < 500 ? ((await res.json().catch(() => ({}))) as FileResp) : ({} as FileResp);
  return { status: res.status, body };
}

async function criarPipe(nome: string): Promise<string> {
  const pipe = (await (await req('POST', '/pipes', ANA, { name: nome })).json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

async function criarTarefa(pipeId: string): Promise<string> {
  const t = (await (
    await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T' })
  ).json()) as Ident;
  return t.id;
}

async function conceder(pipeId: string, role: 'MEMBER' | 'VIEWER'): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

async function alterarPapel(
  pipeId: string,
  grantId: string,
  role: 'MEMBER' | 'VIEWER',
): Promise<void> {
  expect((await req('PATCH', `/pipes/${pipeId}/grants/${grantId}`, ANA, { role })).status).toBe(
    200,
  );
}

async function tiposHistorico(taskId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const evs = await db.taskHistory.findMany({
    where: { taskId },
    select: { type: true },
    orderBy: { createdAt: 'asc' },
  });
  return evs.map((e) => e.type);
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
    await db.task.deleteMany({ where: { pipeId: { in: pipesCriados } } });
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('anexo geral de Tarefa via 3.7/3.8', () => {
  it('anexa como FileObject(TASK, taskId); DISPONIVEL; sem bucketKey; FILE_ATTACHED no TaskHistory', async () => {
    const pipeId = await criarPipe('5.1 anexo');
    const taskId = await criarTarefa(pipeId);

    const up = await anexar(taskId, ANA, PNG);
    expect(up.status).toBe(201);
    expect(up.body.state).toBe('DISPONIVEL');
    expect(up.body.resourceType).toBe('TASK');
    expect(up.body.resourceId).toBe(taskId);
    expect(up.body.bucketKey).toBeUndefined();

    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const fo = await db.fileObject.findUnique({
      where: { id: up.body.id },
      select: { resourceType: true, resourceId: true, state: true },
    });
    expect(fo).toEqual({ resourceType: 'TASK', resourceId: taskId, state: 'DISPONIVEL' });
    expect(await tiposHistorico(taskId)).toEqual(['CREATED', 'FILE_ATTACHED']);
  });

  it('lista, baixa e remove (lógico) o anexo; emite FILE_REMOVED', async () => {
    const pipeId = await criarPipe('5.1 anexo ciclo');
    const taskId = await criarTarefa(pipeId);
    const up = await anexar(taskId, ANA, PNG);
    expect(up.status).toBe(201);

    const lista = (await (await req('GET', `/tasks/${taskId}/files`, ANA)).json()) as FileResp[];
    expect(lista.map((f) => f.id)).toContain(up.body.id);

    const dl = await fetch(`${baseUrl}/tasks/${taskId}/files/${up.body.id}/download`, {
      headers: { [HEADER_CONTA]: ANA },
      redirect: 'manual',
    });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer())).toEqual(PNG);

    const rm = await fetch(`${baseUrl}/tasks/${taskId}/files/${up.body.id}`, {
      method: 'DELETE',
      headers: { [HEADER_CONTA]: ANA },
    });
    expect(rm.status).toBe(200);
    expect(await tiposHistorico(taskId)).toEqual(['CREATED', 'FILE_ATTACHED', 'FILE_REMOVED']);
  });
});

describe('autorização herdada da Tarefa (Pipe)', () => {
  it('sem papel no Pipe → 404 (anexar e listar); Viewer → 200 lista mas 404 anexa; Membro → anexa', async () => {
    const pipeId = await criarPipe('5.1 anexo authz');
    const taskId = await criarTarefa(pipeId);

    // Bruno sem papel → 404 não-enumerante.
    expect((await anexar(taskId, BRUNO, PNG)).status).toBe(404);
    expect((await req('GET', `/tasks/${taskId}/files`, BRUNO)).status).toBe(404);

    // Viewer: LÊ (200) mas não anexa. A capacidade de arquivos (3.7/3.8) NÃO distingue 403 de 404 no
    // upload — o `FilesService` traduz qualquer `podeEditar=false` (aqui, o 403 de `exigirOperarPipe` que
    // o dispatcher captura como fail-closed) em **404 não-enumerante**, para não vazar que o recurso existe
    // e o principal só-lê. É o MESMO comportamento provado para Card/Registro na 3.8 (não é regressão).
    const grantId = await conceder(pipeId, 'VIEWER');
    expect((await req('GET', `/tasks/${taskId}/files`, BRUNO)).status).toBe(200);
    expect((await anexar(taskId, BRUNO, PNG)).status).toBe(404);

    // Membro do Pipe → opera (anexa).
    await alterarPapel(pipeId, grantId, 'MEMBER');
    expect((await anexar(taskId, BRUNO, PNG)).status).toBe(201);
  });

  it('cross-tenant: Carla (Org B) não enxerga a Tarefa → 404 ao anexar/listar', async () => {
    const pipeId = await criarPipe('5.1 anexo cross');
    const taskId = await criarTarefa(pipeId);
    expect((await anexar(taskId, CARLA, PNG)).status).toBe(404);
    expect((await req('GET', `/tasks/${taskId}/files`, CARLA)).status).toBe(404);
  });
});

describe('read-only sob arquivamento e gate AD-28', () => {
  it('Tarefa arquivada → anexar/remover 409 TAREFA_ARQUIVADA; listar/baixar segue OK', async () => {
    const pipeId = await criarPipe('5.1 anexo arq');
    const taskId = await criarTarefa(pipeId);
    const up = await anexar(taskId, ANA, PNG); // anexa ANTES de arquivar
    expect(up.status).toBe(201);

    expect((await req('POST', `/tasks/${taskId}/archive`, ANA)).status).toBe(200);

    // Anexar sob arquivamento → 409.
    expect((await anexar(taskId, ANA, PNG)).status).toBe(409);
    // Remover sob arquivamento → 409 (mutação bloqueada).
    const rm = await fetch(`${baseUrl}/tasks/${taskId}/files/${up.body.id}`, {
      method: 'DELETE',
      headers: { [HEADER_CONTA]: ANA },
    });
    expect(rm.status).toBe(409);
    // Leitura preservada.
    expect((await req('GET', `/tasks/${taskId}/files`, ANA)).status).toBe(200);
  });

  it('gate AD-28: FILE_UPLOAD_ENABLED desligado → 503 (capacidade indisponível) também para TASK', async () => {
    const pipeId = await criarPipe('5.1 anexo gate');
    const taskId = await criarTarefa(pipeId);
    const anterior = process.env.FILE_UPLOAD_ENABLED;
    process.env.FILE_UPLOAD_ENABLED = 'false';
    try {
      expect((await anexar(taskId, ANA, PNG)).status).toBe(503);
    } finally {
      process.env.FILE_UPLOAD_ENABLED = anterior;
    }
  });
});
