import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `FileObject`/`FileScan`/`ScanSlot` (Story 3.7) contra um PostgreSQL REAL, pelo papel
 * de runtime `giraffe_app` (sem BYPASSRLS, não é dono). Prova, com FASE VERMELHA por privilégio:
 *   (1) isolamento por Org (FileObject/FileScan) + WITH CHECK no INSERT (orgId alheio → row-level security);
 *   (2) GRANT column-scoped em FileObject: UPDATE de state/nomeOriginal/updatedAt/purgedAt OK; bucketKey/
 *       resourceType/resourceId/orgId → permission denied (não transferível); e **sem DELETE**;
 *   (3) FileScan IMUTÁVEL (sem UPDATE/DELETE);
 *   (4) ScanSlot é GLOBAL (sem RLS): INSERT/SELECT/DELETE funcionam sem contexto de Org.
 *
 * Área de escrita = Org C (fixtures descartáveis). NUNCA reusar contas do seed em membership persistente.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

/** Cria um FileObject (runtime) na Org C, em QUARENTENA, e devolve id + bucketKey. */
async function criarFile(): Promise<{ id: string; bucketKey: string }> {
  const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const bucketKey = `${ORG_C}/${randomUUID()}`;
  const f = await dbC.fileObject.create({
    data: {
      orgId: ORG_C,
      bucketKey,
      nomeOriginal: 'x.png',
      resourceType: 'teste',
      resourceId: randomUUID(),
      state: 'QUARENTENA',
    },
    select: { id: true, bucketKey: true },
  });
  return f;
}

describe('isolamento por Organização', () => {
  it('um FileObject da Org C não é visível pela Org A; INSERT com orgId alheio é negado', async () => {
    const { id } = await criarFile();
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.fileObject.findUnique({ where: { id } })).toBeNull();

    // INSERT com orgId alheio (WITH CHECK, via createMany sem RETURNING) → negado.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.fileObject.createMany({
        data: [
          {
            orgId: ORG_A,
            bucketKey: `${ORG_A}/${randomUUID()}`,
            nomeOriginal: 'y.png',
            resourceType: 'teste',
            resourceId: randomUUID(),
          },
        ],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('GRANT column-scoped em FileObject', () => {
  it('UPDATE de state/nomeOriginal/purgedAt OK; bucketKey/resourceType/resourceId/orgId → permission denied; sem DELETE', async () => {
    const { id } = await criarFile();
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Colunas concedidas: OK.
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { state: 'BLOCKED' } }),
    ).resolves.toBeTruthy();
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { nomeOriginal: 'z.png' } }),
    ).resolves.toBeTruthy();
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { purgedAt: new Date() } }),
    ).resolves.toBeTruthy();

    // Colunas NÃO concedidas: permission denied (chave/recurso/org não são transferíveis).
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { bucketKey: `${ORG_C}/${randomUUID()}` } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { resourceType: 'outro' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { resourceId: randomUUID() } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.fileObject.updateMany({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/permission denied/i);

    // Sem DELETE (sem exclusão física — LGPD; expurgo é do binário, não da linha).
    await expect(dbC.fileObject.deleteMany({ where: { id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('FileScan permanece imutável no runtime', () => {
  it('o runtime cria FileScan, mas NÃO tem UPDATE nem DELETE nele', async () => {
    const { id: fileId } = await criarFile();
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const scan = await dbC.fileScan.create({
      data: {
        orgId: ORG_C,
        fileId,
        tamanhoBytes: BigInt(10),
        mimeDetectado: 'image/png',
        sha256Ingest: 'a',
        sha256Releitura: 'a',
        veredito: 'CLEAN',
      },
      select: { id: true },
    });
    await expect(
      dbC.fileScan.updateMany({ where: { id: scan.id }, data: { veredito: 'BLOCKED' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(dbC.fileScan.deleteMany({ where: { id: scan.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('FileScan da Org C não vaza para a Org A (isolamento)', async () => {
    const { id: fileId } = await criarFile();
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const scan = await dbC.fileScan.create({
      data: {
        orgId: ORG_C,
        fileId,
        tamanhoBytes: BigInt(1),
        mimeDetectado: 'image/png',
        sha256Ingest: 'a',
        sha256Releitura: 'a',
        veredito: 'CLEAN',
      },
      select: { id: true },
    });
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.fileScan.findUnique({ where: { id: scan.id } })).toBeNull();
  });
});

describe('ScanSlot é global (sem RLS) e o runtime pode INSERT/SELECT/DELETE', () => {
  it('insere e apaga um slot sem contexto de Org (tabela global)', async () => {
    const token = randomUUID();
    const key = `scan:${ORG_C}`;
    await prisma.$executeRaw`INSERT INTO "ScanSlot" ("token","key","expiraEm") VALUES (${token}::uuid, ${key}, now() + interval '60 seconds')`;
    const linhas = await prisma.$queryRaw<
      { token: string }[]
    >`SELECT "token" FROM "ScanSlot" WHERE "token" = ${token}::uuid`;
    expect(linhas.length).toBe(1);
    await prisma.$executeRaw`DELETE FROM "ScanSlot" WHERE "token" = ${token}::uuid`;
    const depois = await prisma.$queryRaw<
      { token: string }[]
    >`SELECT "token" FROM "ScanSlot" WHERE "token" = ${token}::uuid`;
    expect(depois.length).toBe(0);
  });
});
