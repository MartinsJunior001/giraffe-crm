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
 * Uso de arquivos em Registro (Story 3.8, Opção 1 / Fatia F2) pela porta da frente: HTTP real, banco real,
 * dispatcher de autorização REAL (RECORD→database-authz), storage e scanner FALSOS (determinísticos). Prova:
 *  - anexo geral de Registro = `FileObject(RECORD, recordId)` DISPONIVEL;
 *  - **Campo Arquivo** persiste uma REFERÊNCIA tipada (`fileId`) nos `valores` do Registro (editarValores);
 *  - o vínculo é conferido contra ESTE Registro: arquivo de outro Registro / em quarentena / cross-tenant /
 *    tipo inválido → 400 (não-enumerante); a criação NÃO aceita valor de Campo Arquivo (recurso inexistente).
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN só na Org A (cross-tenant)
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);

const adminConta = randomUUID();
const adminMemb = randomUUID();
const dbId = randomUUID();

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

interface FormResp {
  id: string | null;
  fields: { id: string; label: string; type: string }[];
}
interface RecordResp {
  id: string;
  valores: Record<string, unknown>;
}
interface FileResp {
  id: string;
  state: string;
  resourceType: string;
  resourceId: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let textFieldId = '';
let fileFieldId = '';
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

async function anexar(recordId: string, conta: string = adminConta, bytes = PNG): Promise<FileResp> {
  const form = new FormData();
  form.append('file', new Blob([bytes]), 'anexo.png');
  const res = await fetch(`${baseUrl}/databases/${dbId}/records/${recordId}/files`, {
    method: 'POST',
    headers: { [HEADER_CONTA]: conta },
    body: form,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as FileResp;
}

async function tiposHistorico(recordId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  const eventos = await db.recordHistory.findMany({
    where: { recordId },
    select: { type: true },
    orderBy: { createdAt: 'asc' },
  });
  return eventos.map((e) => e.type);
}

async function criarRegistro(nome: string): Promise<RecordResp> {
  const r = await req('POST', `/databases/${dbId}/records`, adminConta, {
    idempotencyKey: randomUUID(),
    valores: { [textFieldId]: nome },
  });
  expect(r.status).toBe(201);
  return (await r.json()) as RecordResp;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  process.env.FILE_UPLOAD_ENABLED = 'true';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.create({
    data: { id: adminConta, email: `recfile-${adminConta}@x.test`, name: 'Admin Org' },
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
  });
  await dbC.database.create({ data: { id: dbId, orgId: ORG_C, name: 'Base com arquivo' } });

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

  // Formulário de Database com um Campo TEXT + um Campo FILE, publicado (capacidade ligada permite publicar FILE).
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, { label: 'Nome', type: 'TEXT_SHORT' });
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, { label: 'Anexo', type: 'FILE' });
  const form = (await (await req('GET', `/databases/${dbId}/form`, adminConta)).json()) as FormResp;
  textFieldId = form.fields.find((f) => f.type === 'TEXT_SHORT')!.id;
  fileFieldId = form.fields.find((f) => f.type === 'FILE')!.id;
  expect((await req('POST', `/databases/${dbId}/form/publish`, adminConta)).status).toBe(201);
}, 40000);

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.database.deleteMany({ where: { id: dbId } }).catch(() => {});
    await dbC.membership.deleteMany({ where: { id: adminMemb } }).catch(() => {});
    await migrator.account.deleteMany({ where: { id: adminConta } }).catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('Campo Arquivo no Registro (F2) — referência tipada com vínculo', () => {
  it('cria sem FILE, anexa ao Registro e referencia no valor (persistido); substitui por outro', async () => {
    const rec = await criarRegistro('Alice');
    expect(rec.valores[fileFieldId]).toBeUndefined();

    const f1 = await anexar(rec.id);
    expect(f1.state).toBe('DISPONIVEL');
    expect(f1.resourceType).toBe('RECORD');
    expect(f1.resourceId).toBe(rec.id);
    // F5: o anexo emitiu FILE_ATTACHED na trilha do Registro.
    expect(await tiposHistorico(rec.id)).toEqual(['CREATED', 'FILE_ATTACHED']);

    // Campo Arquivo = referência tipada nos valores do Registro.
    const patch = await req('PATCH', `/databases/${dbId}/records/${rec.id}`, adminConta, {
      valores: { [textFieldId]: 'Alice', [fileFieldId]: f1.id },
    });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as RecordResp).valores[fileFieldId]).toBe(f1.id);
    // 1ª referência (não havia valor anterior) ⇒ VALUES_UPDATED, sem FILE_REPLACED.
    expect(await tiposHistorico(rec.id)).not.toContain('FILE_REPLACED');

    // Substituição: novo arquivo no mesmo Registro, nova referência (A→B) ⇒ FILE_REPLACED.
    const f2 = await anexar(rec.id);
    const patch2 = await req('PATCH', `/databases/${dbId}/records/${rec.id}`, adminConta, {
      valores: { [textFieldId]: 'Alice', [fileFieldId]: f2.id },
    });
    expect(patch2.status).toBe(200);
    expect(((await patch2.json()) as RecordResp).valores[fileFieldId]).toBe(f2.id);
    expect(await tiposHistorico(rec.id)).toContain('FILE_REPLACED');
  });

  it('criação NÃO aceita valor de Campo Arquivo (recurso inexistente) → 400', async () => {
    const r = await req('POST', `/databases/${dbId}/records`, adminConta, {
      idempotencyKey: randomUUID(),
      valores: { [textFieldId]: 'Bob', [fileFieldId]: randomUUID() },
    });
    expect(r.status).toBe(400);
  });

  it('arquivo de OUTRO Registro → 400 (vínculo confere o dono)', async () => {
    const recA = await criarRegistro('A');
    const recB = await criarRegistro('B');
    const fB = await anexar(recB.id); // vinculado a B
    const patch = await req('PATCH', `/databases/${dbId}/records/${recA.id}`, adminConta, {
      valores: { [textFieldId]: 'A', [fileFieldId]: fB.id }, // referenciado em A
    });
    expect(patch.status).toBe(400);
  });

  it('arquivo em QUARENTENA (não DISPONIVEL) → 400', async () => {
    const rec = await criarRegistro('Q');
    // Insere um FileObject vinculado ao Registro mas ainda em QUARENTENA (não promovido).
    const fid = randomUUID();
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.fileObject.create({
      data: {
        id: fid,
        orgId: ORG_C,
        bucketKey: `${ORG_C}/${randomUUID()}`,
        nomeOriginal: 'pendente.png',
        resourceType: 'RECORD',
        resourceId: rec.id,
        state: 'QUARENTENA',
      },
    });
    const patch = await req('PATCH', `/databases/${dbId}/records/${rec.id}`, adminConta, {
      valores: { [textFieldId]: 'Q', [fileFieldId]: fid },
    });
    expect(patch.status).toBe(400);
  });

  it('fileId inexistente/cross-tenant → 400; tipo inválido (não-UUID) → 400', async () => {
    const rec = await criarRegistro('X');
    // UUID que não existe neste tenant (equivale a cross-tenant sob RLS).
    expect(
      (
        await req('PATCH', `/databases/${dbId}/records/${rec.id}`, adminConta, {
          valores: { [textFieldId]: 'X', [fileFieldId]: randomUUID() },
        })
      ).status,
    ).toBe(400);
    // Não-UUID: recusado no shape (400, sem 500 no where id).
    expect(
      (
        await req('PATCH', `/databases/${dbId}/records/${rec.id}`, adminConta, {
          valores: { [textFieldId]: 'X', [fileFieldId]: 'não-é-uuid' },
        })
      ).status,
    ).toBe(400);
  });

  it('cross-tenant no anexo (Ana/Org A) → 404 não-enumerante', async () => {
    const rec = await criarRegistro('T');
    const form = new FormData();
    form.append('file', new Blob([PNG]), 'x.png');
    const res = await fetch(`${baseUrl}/databases/${dbId}/records/${rec.id}/files`, {
      method: 'POST',
      headers: { [HEADER_CONTA]: ANA },
      body: form,
    });
    expect(res.status).toBe(404);
  });
});
