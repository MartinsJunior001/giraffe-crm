import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import { StorageService } from '../src/kernel/storage/storage.service';
import { ClamavService } from '../src/kernel/scanner/clamav.service';
import { FILE_AUTHZ_CONTRACT, type FileAuthzContract } from '../src/files/file-authz.contract';
import type { ResultadoClamAV } from '../src/files/file-verdict.core';

/**
 * Capacidade de arquivos (Story 3.7) pela porta da frente: HTTP real, banco real, mas com storage e scanner
 * FALSOS (determinísticos) — assim as mutações fail-closed (infectado / não-escaneável / base cega / troca de
 * bytes / tipo mentido / limite) são provadas SEM depender de MinIO/ClamAV no CI. O gate é ligado no processo do
 * teste e restaurado ao fim; a autz de recurso é permissiva (o isolamento aqui é por RLS/Org, não pela porta).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTA_C = randomUUID(); // uploader (Org C)
const CONTA_A = randomUUID(); // atacante cross-tenant (Org A)
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]); // executável renomeado.

/** Storage FALSO em memória. `trocarNaReleitura` simula troca de bytes entre aceite e verificação. */
class FakeStorage {
  objetos = new Map<string, Buffer>();
  trocarNaReleitura = false;
  put(key: string, body: Buffer): Promise<{ etag: string | undefined }> {
    this.objetos.set(key, body);
    return Promise.resolve({ etag: `"${createHash('md5').update(body).digest('hex')}"` });
  }
  getBytes(key: string): Promise<Uint8Array> {
    if (this.trocarNaReleitura) return Promise.resolve(Buffer.from('CONTEUDO TROCADO'));
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

/** Scanner FALSO configurável. */
class FakeScanner {
  resultado: ResultadoClamAV = 'LIMPO';
  base: Date | null = new Date();
  canario = true;
  escanear(): Promise<ResultadoClamAV> {
    return Promise.resolve(this.resultado);
  }
  dataDaBase(): Promise<Date | null> {
    return Promise.resolve(this.base);
  }
  canarioDetecta(): Promise<boolean> {
    return Promise.resolve(this.canario);
  }
}

const authzPermissivo: FileAuthzContract = {
  podeLer: () => Promise.resolve(true),
  podeEditar: () => Promise.resolve(true),
};

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const storage = new FakeStorage();
const scanner = new FakeScanner();
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

interface FileResp {
  id: string;
  state: string;
  nomeOriginal: string;
  bucketKey?: string; // NUNCA deve aparecer.
}

/** Upload multipart. Devolve status + corpo. */
async function upload(
  conta: string | undefined,
  resourceId: string,
  bytes: Buffer,
  nome = 'x.png',
): Promise<{ status: number; body: FileResp }> {
  const form = new FormData();
  form.append('file', new Blob([bytes]), nome);
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  const res = await fetch(`${baseUrl}/files/resource/teste/${resourceId}`, {
    method: 'POST',
    headers,
    body: form,
  });
  const body =
    res.status < 500 ? ((await res.json().catch(() => ({}))) as FileResp) : ({} as FileResp);
  return { status: res.status, body };
}

async function baixar(conta: string | undefined, fileId: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  return fetch(`${baseUrl}/files/${fileId}/content`, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });
}

beforeAll(async () => {
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  // Gate LIGADO só neste processo de teste + storage dummy (a coerência do env exige, mesmo com storage falso).
  process.env.FILE_UPLOAD_ENABLED = 'true';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(ClamavService)
    .useValue(scanner)
    .overrideProvider(FILE_AUTHZ_CONTRACT)
    .useValue(authzPermissivo)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
  // Contas descartáveis (nunca reusar as do seed em membership persistente).
  await migrator.account.create({
    data: { id: CONTA_C, email: `files-e2e-${CONTA_C}@x.test`, name: 'Uploader C' },
  });
  await migrator.account.create({
    data: { id: CONTA_A, email: `files-e2e-${CONTA_A}@x.test`, name: 'Atacante A' },
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: { id: randomUUID(), orgId: ORG_C, accountId: CONTA_C, role: 'MEMBER', state: 'ACTIVE' },
  });
  const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await dbA.membership.create({
    data: { id: randomUUID(), orgId: ORG_A, accountId: CONTA_A, role: 'MEMBER', state: 'ACTIVE' },
  });
}, 40000);

afterAll(async () => {
  if (migrator) {
    await migrator.membership
      .deleteMany({ where: { accountId: { in: [CONTA_C, CONTA_A] } } })
      .catch(() => {});
    // FileObject/FileScan não têm DELETE no runtime; a limpeza usa o migrator (dono) por cascata da conta? Não —
    // arquivos são por Org. Deixa-os (dados de teste em Org C); o próximo run usa ids novos (resourceId aleatório).
    await migrator.account
      .deleteMany({ where: { id: { in: [CONTA_C, CONTA_A] } } })
      .catch(() => {});
  }
  delete process.env.FILE_UPLOAD_ENABLED;
  await app?.close();
  await migrator?.$disconnect();
});

beforeEach(() => {
  storage.trocarNaReleitura = false;
  scanner.resultado = 'LIMPO';
  scanner.base = new Date();
  scanner.canario = true;
});

describe('US1 — quarentena e verificação fail-closed', () => {
  it('PNG benigno com scanner LIMPO → DISPONIVEL', async () => {
    const { status, body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(status).toBe(201);
    expect(body.state).toBe('DISPONIVEL');
    expect(body.bucketKey).toBeUndefined(); // a chave NUNCA sai (SC-003).
  });

  it('scanner INFECTADO → BLOCKED (nunca disponível)', async () => {
    scanner.resultado = 'INFECTADO';
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('BLOCKED');
  });

  it('scanner NAO_ESCANEAVEL (timeout/limite) → BLOCKED', async () => {
    scanner.resultado = 'NAO_ESCANEAVEL';
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('BLOCKED');
  });

  it('scanner cego (canário EICAR não detecta) → BLOCKED', async () => {
    scanner.canario = false;
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('BLOCKED');
  });

  it('base de assinaturas velha → BLOCKED', async () => {
    scanner.base = new Date('2000-01-01T00:00:00Z');
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('BLOCKED');
  });

  it('troca de bytes entre aceite e releitura → BLOCKED', async () => {
    storage.trocarNaReleitura = true;
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('BLOCKED');
  });
});

describe('US2 — download por stream sob sessão', () => {
  it('baixa um DISPONIVEL por stream; sem redirect a bucket; sem sessão → 401/negado', async () => {
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('DISPONIVEL');

    const ok = await baixar(CONTA_C, body.id);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('location')).toBeNull(); // nunca redireciona para o bucket.
    const bytes = Buffer.from(await ok.arrayBuffer());
    expect(bytes.equals(PNG)).toBe(true);

    const semSessao = await baixar(undefined, body.id);
    expect(semSessao.status).toBe(401);
  });

  it('um BLOCKED não é baixável → 404', async () => {
    scanner.resultado = 'INFECTADO';
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    const res = await baixar(CONTA_C, body.id);
    expect(res.status).toBe(404);
  });
});

describe('US3 — sem acesso cruzado mesmo conhecendo o id', () => {
  it('Org A não baixa o arquivo da Org C → 404 não-enumerante', async () => {
    const { body } = await upload(CONTA_C, randomUUID(), PNG);
    expect(body.state).toBe('DISPONIVEL');
    const res = await baixar(CONTA_A, body.id); // atacante em outra Org, de posse do id.
    expect(res.status).toBe(404);
  });
});

describe('US5 — validação server-side', () => {
  it('executável renomeado .png → 400 (conteúdo real)', async () => {
    const { status } = await upload(CONTA_C, randomUUID(), EXE, 'foto.png');
    expect(status).toBe(400);
  });
});

describe('gate AD-28', () => {
  it('com FILE_UPLOAD_ENABLED desligado → indisponibilidade honesta (503), sem 500', async () => {
    process.env.FILE_UPLOAD_ENABLED = 'false';
    try {
      const res = await fetch(`${baseUrl}/files/limits`, { headers: { [HEADER_CONTA]: CONTA_C } });
      // limits não é gated, mas o upload é: prova o 503 no upload.
      const form = new FormData();
      form.append('file', new Blob([PNG]), 'x.png');
      const up = await fetch(`${baseUrl}/files/resource/teste/${randomUUID()}`, {
        method: 'POST',
        headers: { [HEADER_CONTA]: CONTA_C },
        body: form,
      });
      expect(up.status).toBe(503);
      expect(res.status).toBeLessThan(500);
    } finally {
      process.env.FILE_UPLOAD_ENABLED = 'true';
    }
  });
});
