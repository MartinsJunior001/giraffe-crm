/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
// @ts-expect-error — módulo .mjs sem tipos; o contrato é simples e está coberto aqui.
import * as provision from '../prisma/provision-tenant.mjs';

const {
  derivarSlug,
  idOrganizacaoParaSlug,
  mascararEmail,
  provisionarTenant,
  uuidV5,
  validarEntradaProvisionamento,
} = provision as any;

/**
 * tech-2 — provisionamento seguro do primeiro tenant. Unidade (validação/slug/sanitização) + integração
 * contra PostgreSQL REAL pelo papel migrator (único que pode inserir Organization). Escreve numa Org
 * NOVA e única por execução — não colide com as fixtures de leitura (A/B) nem com a área de escrita (C).
 */

// ── Unidade (sem I/O) ──────────────────────────────────────────────────────────────────────────────
describe('validarEntradaProvisionamento — fail-closed e sanitizado', () => {
  const base = {
    orgNome: 'Cliente Zero',
    adminEmail: 'admin@cliente.test',
    adminNome: 'Admin',
    adminSenha: 'senha-bem-longa-123',
  };

  it('exige campos obrigatórios', () => {
    expect(() => validarEntradaProvisionamento({ ...base, orgNome: '' })).toThrow(/orgNome/);
    expect(() => validarEntradaProvisionamento({ ...base, adminNome: '' })).toThrow(/adminNome/);
    expect(() => validarEntradaProvisionamento({ ...base, adminEmail: '' })).toThrow(/adminEmail/);
  });

  it('rejeita e-mail e slug inválidos', () => {
    expect(() => validarEntradaProvisionamento({ ...base, adminEmail: 'sem-arroba' })).toThrow(
      /adminEmail inválido/,
    );
    expect(() => validarEntradaProvisionamento({ ...base, orgSlug: 'Slug Inválido!' })).toThrow(
      /orgSlug inválido/,
    );
  });

  it('exige senha presente e no comprimento permitido, SEM vazar a senha na mensagem', () => {
    expect(() => validarEntradaProvisionamento({ ...base, adminSenha: undefined })).toThrow(
      /adminSenha é obrigatória/,
    );
    const curta = 'aB1$curta'; // < 12
    try {
      validarEntradaProvisionamento({ ...base, adminSenha: curta });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      const msg = (erro as Error).message;
      expect(msg).toMatch(/mínimo 12/);
      expect(msg).not.toContain(curta); // a senha nunca aparece no erro
    }
    expect(() => validarEntradaProvisionamento({ ...base, adminSenha: 'x'.repeat(129) })).toThrow(
      /máximo 128/,
    );
  });

  it('normaliza e-mail e deriva slug do nome', () => {
    const r = validarEntradaProvisionamento({ ...base, adminEmail: '  Admin@Cliente.TEST ' });
    expect(r.adminEmail).toBe('admin@cliente.test');
    expect(r.orgSlug).toBe('cliente-zero');
  });
});

describe('utilitários puros', () => {
  it('derivarSlug remove acentos e normaliza', () => {
    expect(derivarSlug('Organização Física & Cia')).toBe('organizacao-fisica-cia');
  });
  it('mascararEmail esconde o local mantendo o domínio', () => {
    expect(mascararEmail('ana@exemplo.test')).toBe('a***@exemplo.test');
    expect(mascararEmail('')).toBe('***');
  });
  it('uuidV5/idOrganizacaoParaSlug são determinísticos', () => {
    expect(idOrganizacaoParaSlug('org-x')).toBe(idOrganizacaoParaSlug('org-x'));
    expect(idOrganizacaoParaSlug('org-x')).not.toBe(idOrganizacaoParaSlug('org-y'));
    expect(uuidV5('org:org-x', 'a7c3e1d2-5b64-4f8a-9c2e-1f0a3b5d7e90')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ── Integração (PostgreSQL real, papel migrator) ─────────────────────────────────────────────────────
const migratorUrl = process.env.MIGRATION_DATABASE_URL;
const sufixo = randomBytes(6).toString('hex');
const SLUG = `prov-test-${sufixo}`;
const EMAIL = `prov-${sufixo}@exemplo.test`;
const SENHA = `provisao-forte-${sufixo}`; // ≥ 12
const ORG_ID = idOrganizacaoParaSlug(SLUG);

let prisma: PrismaClient;
let hashSenha: (s: string) => Promise<string>;
let verify: (arg: { hash: string; password: string }) => Promise<boolean>;
let accountId: string;

describe('provisionarTenant — integração real', () => {
  beforeAll(async () => {
    if (!migratorUrl) {
      // Falha honesta: cita o NOME da variável, nunca o valor (a URL carrega senha).
      throw new Error('MIGRATION_DATABASE_URL ausente: o provisionamento exige o papel migrator.');
    }
    prisma = new PrismaClient({ datasourceUrl: migratorUrl });
    await prisma.$connect();
    const auth = betterAuth({
      secret: 'provision-test-secret-'.padEnd(48, 'x'),
      database: prismaAdapter(prisma, { provider: 'postgresql' }),
      emailAndPassword: { enabled: true },
      user: { modelName: 'Account' },
      account: { modelName: 'AuthCredential' },
      session: { modelName: 'AuthSession' },
      verification: { modelName: 'AuthVerification' },
    });
    const ctx = await (auth as any).$context;
    hashSenha = (s: string) => ctx.password.hash(s);
    verify = (arg) => ctx.password.verify(arg);
  });

  afterAll(async () => {
    // Limpeza best-effort: apaga a Org de teste (com contexto), o vínculo, a credencial e a conta.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ORG_ID}, true)`;
        await tx.membership.deleteMany({ where: { orgId: ORG_ID } });
        await tx.organization.deleteMany({ where: { id: ORG_ID } });
      });
      if (accountId) {
        await prisma.authCredential.deleteMany({ where: { userId: accountId } });
        await prisma.account.deleteMany({ where: { id: accountId } });
      }
    } catch {
      /* limpeza é best-effort; não mascara falha do teste */
    }
    await prisma?.$disconnect();
  });

  it('cria Org + Account + Membership ADMIN/ACTIVE + credencial; o Admin AUTENTICA (SC-T201)', async () => {
    const r = await provisionarTenant({
      prisma,
      hashSenha,
      entrada: {
        orgNome: 'Cliente de Teste',
        orgSlug: SLUG,
        adminEmail: EMAIL,
        adminNome: 'Admin Teste',
        adminSenha: SENHA,
      },
    });
    accountId = r.accountId;
    expect(r.orgId).toBe(ORG_ID);
    expect(r.criou).toEqual({
      organization: true,
      account: true,
      membership: true,
      credential: true,
    });
    expect(r.emailMascarado).toBe(`${EMAIL[0]}***@exemplo.test`);

    // Org existe (leitura com contexto na mesma transação — o contexto é transação-local).
    const temOrg = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ORG_ID}, true)`;
      return (await tx.organization.findUnique({ where: { id: ORG_ID } })) !== null;
    });
    expect(temOrg).toBe(true);

    const vinculo = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ORG_ID}, true)`;
      return tx.membership.findUnique({ where: { accountId_orgId: { accountId, orgId: ORG_ID } } });
    });
    expect(vinculo?.role).toBe('ADMIN');
    expect(vinculo?.state).toBe('ACTIVE');

    // A credencial autentica com a senha fornecida (hash compatível com o Better Auth).
    const cred = await prisma.authCredential.findFirst({
      where: { userId: accountId, providerId: 'credential' },
    });
    expect(cred?.password).toBeTruthy();
    expect(await verify({ hash: cred!.password as string, password: SENHA })).toBe(true);
    expect(await verify({ hash: cred!.password as string, password: 'senha-errada-000' })).toBe(
      false,
    );
  });

  it('é idempotente e NÃO sobrescreve a credencial (SC-T203/SC-T205)', async () => {
    const antes = await prisma.authCredential.findFirst({
      where: { userId: accountId, providerId: 'credential' },
    });
    const r = await provisionarTenant({
      prisma,
      hashSenha,
      entrada: {
        orgNome: 'Cliente de Teste',
        orgSlug: SLUG,
        adminEmail: EMAIL,
        adminNome: 'Admin Teste',
        adminSenha: SENHA,
      },
    });
    expect(r.criou).toEqual({
      organization: false,
      account: false,
      membership: false,
      credential: false,
    });

    // Sem duplicar Membership.
    const nVinculos = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ORG_ID}, true)`;
      return tx.membership.count({ where: { orgId: ORG_ID, accountId } });
    });
    expect(nVinculos).toBe(1);

    // Hash da credencial inalterado.
    const depois = await prisma.authCredential.findFirst({
      where: { userId: accountId, providerId: 'credential' },
    });
    expect(depois?.password).toBe(antes?.password);
  });

  it('SEM contexto, o INSERT de Organization é NEGADO — prova de que não é bypass (SC-T202)', async () => {
    const idAvulso = idOrganizacaoParaSlug(`prov-nocontext-${sufixo}`);
    // Sem set_config: current_org_id() é NULL, e o WITH CHECK (id = NULL) reprova. O migrator é
    // SUJEITO à RLS (FORCE); só o contexto correto habilita — não há bypass.
    await expect(
      prisma.organization.create({
        data: { id: idAvulso, name: 'Sem Contexto', slug: `prov-nocontext-${sufixo}` },
      }),
    ).rejects.toThrow();
  });

  it('fail-closed: senha curta lança e NÃO cria a Org (SC-T204)', async () => {
    const slugCurta = `prov-short-${sufixo}`;
    const idCurta = idOrganizacaoParaSlug(slugCurta);
    await expect(
      provisionarTenant({
        prisma,
        hashSenha,
        entrada: {
          orgNome: 'Curta',
          orgSlug: slugCurta,
          adminEmail: `s-${sufixo}@x.test`,
          adminNome: 'S',
          adminSenha: 'curta',
        },
      }),
    ).rejects.toThrow(/mínimo 12/);

    const existe = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${idCurta}, true)`;
      return (await tx.organization.findUnique({ where: { id: idCurta } })) !== null;
    });
    expect(existe).toBe(false);
  });
});
