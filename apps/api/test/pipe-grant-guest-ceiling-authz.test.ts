import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import {
  exigirGerenciarPipe,
  exigirOperarPipe,
  exigirRevisarSubmissoesPublicas,
  resolverPoderNoPipe,
} from '../src/pipes/pipe-authz';

/**
 * Read-side FAIL-CLOSED do teto do CONVIDADO (DEB-PIPEGRANT-GUEST-CEILING, decisão item 6) contra um
 * PostgreSQL REAL. Prova que, diante de DADO LEGADO/INCONSISTENTE — um `PipeGrant` `ADMIN` preexistente
 * ligado a uma Membership `GUEST` (estado que o write-side agora recusa criar, mas que pode existir de
 * antes ou surgir por corrida) — a resolução de poder REBAIXA ao teto do papel de Org: o Convidado nunca
 * supera leitura. Não confia no grant incompatível; quem decide é o serviço, fail-closed.
 *
 * **Fase vermelha (contraste):** um MEMBER da Org com o MESMO grant `ADMIN` mantém `gerenciar`. Isso prova
 * que o teto é DIRIGIDO PELO PAPEL DE ORG (só rebaixa o Convidado) e não neutraliza todo mundo — se a
 * resolução ignorasse o papel de Org, o Convidado também veria `gerenciar` (o buraco que fechamos).
 *
 * Fixtures descartáveis na Org C (contas globais + Membership + Pipe), semeadas pelo migrator; o RUNTIME
 * (`giraffe_app`) é quem resolve o poder — sem BYPASSRLS.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime — resolve o poder)
let migrator: PrismaClient; // giraffe_migrator (setup e faxina)

const pipeId = randomUUID();
const guestConta = randomUUID();
const guestMemb = randomUUID();
const memberConta = randomUUID();
const memberMemb = randomUUID();

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: read-side fail-closed exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  await migrator.account.createMany({
    data: [
      {
        id: guestConta,
        email: `pgc-authz-guest-${guestConta}@exemplo.test`,
        name: 'Convidado legado',
      },
      { id: memberConta, email: `pgc-authz-member-${memberConta}@exemplo.test`, name: 'Membro' },
    ],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: guestMemb, accountId: guestConta, orgId: ORG_C, role: 'GUEST', state: 'ACTIVE' },
      { id: memberMemb, accountId: memberConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe legado teto GUEST' } });
  // Dado LEGADO/INCONSISTENTE: grant ADMIN (com capacidade expansiva) a AMBOS — o Convidado é o caso a
  // rebaixar; o Membro é o contraste (fase vermelha).
  await dbC.pipeGrant.createMany({
    data: [
      {
        id: randomUUID(),
        orgId: ORG_C,
        pipeId,
        membershipId: guestMemb,
        role: 'ADMIN',
        reviewPublicSubmissions: true,
      },
      {
        id: randomUUID(),
        orgId: ORG_C,
        pipeId,
        membershipId: memberMemb,
        role: 'ADMIN',
        reviewPublicSubmissions: true,
      },
    ],
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia os grants
    await dbC.membership
      .deleteMany({ where: { id: { in: [guestMemb, memberMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [guestConta, memberConta] } } })
      .catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('resolverPoderNoPipe — teto do Convidado sobre grant legado (fail-closed)', () => {
  it('PROVA 9: GUEST com PipeGrant ADMIN legado → poder efetivo é "ler" (rebaixado ao teto)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const poder = await resolverPoderNoPipe(dbC, { accountId: guestConta, papel: 'GUEST' }, pipeId);
    expect(poder).toBe('ler');
  });

  it('FASE VERMELHA (contraste): MEMBER da Org com o MESMO grant ADMIN → "gerenciar" (teto é por papel de Org)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const poder = await resolverPoderNoPipe(
      dbC,
      { accountId: memberConta, papel: 'MEMBER' },
      pipeId,
    );
    expect(poder).toBe('gerenciar');
  });
});

describe('gates finos herdam o teto — Convidado não opera nem gerencia; leitura permanece', () => {
  it('exigirOperarPipe(GUEST) → 403 (só lê); exigirGerenciarPipe(GUEST) → 403', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      exigirOperarPipe(dbC, { accountId: guestConta, papel: 'GUEST' }, pipeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      exigirGerenciarPipe(dbC, { accountId: guestConta, papel: 'GUEST' }, pipeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exigirOperarPipe(MEMBER) e exigirGerenciarPipe(MEMBER) → passam (contraste)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      exigirOperarPipe(dbC, { accountId: memberConta, papel: 'MEMBER' }, pipeId),
    ).resolves.toBeUndefined();
    await expect(
      exigirGerenciarPipe(dbC, { accountId: memberConta, papel: 'MEMBER' }, pipeId),
    ).resolves.toBeUndefined();
  });
});

describe('exigirRevisarSubmissoesPublicas — capacidade expansiva não sobrevive ao teto do Convidado', () => {
  it('GUEST com reviewPublicSubmissions=true legado → 403 (fail-closed); MEMBER com a mesma capacidade → passa', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      exigirRevisarSubmissoesPublicas(dbC, { accountId: guestConta, papel: 'GUEST' }, pipeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      exigirRevisarSubmissoesPublicas(dbC, { accountId: memberConta, papel: 'MEMBER' }, pipeId),
    ).resolves.toBeUndefined();
  });
});
