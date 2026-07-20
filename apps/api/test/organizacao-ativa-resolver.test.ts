import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrgContextResolver } from '../src/kernel/context/org-context.resolver';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Semântica de resolução da Organização ativa (Story 1.9), no nível do `OrgContextResolver`.
 *
 * Por que aqui e não só por HTTP: os casos que mais importam — Membership **SUSPENSA** e
 * **REMOVIDA** — exigem escrever `Membership`, e as contas do seed são fixtures de **LEITURA**
 * (TEST-ISO-01: reusá-las num `membership.create` persistente quebra o teste do vizinho). Então
 * cada teste aqui usa uma conta **descartável** (`randomUUID`) na **Org C**, criada e removida por
 * ele mesmo. O caminho HTTP completo é coberto por `organizacao-ativa-http.test.ts`, com Bruno.
 *
 * **O invariante sob teste:** a preferência de sessão é PEDIDO, a Membership ATIVA é AUTORIDADE.
 * Se algum dia a preferência passar a conceder acesso sozinha, estes testes ficam vermelhos — que é
 * exatamente o serviço que eles prestam.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const loggerFake = { info: () => {}, warn: () => {}, debug: () => {}, setContext: () => {} };

const migratorUrl = process.env.MIGRATION_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

let migrator: PrismaClient;
let runtime: PrismaClient;
let resolver: OrgContextResolver;

const contasCriadas: string[] = [];

/** Conta descartável com uma Membership no estado pedido, na Org indicada. */
async function contaCom(
  vinculos: { orgId: string; state: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' }[],
): Promise<string> {
  const accountId = randomUUID();
  await migrator.account.create({
    data: { id: accountId, email: `wa-1-9-${accountId}@exemplo.test`, name: 'Descartável' },
  });
  contasCriadas.push(accountId);

  for (const v of vinculos) {
    const db = withTenantContext(migrator, { orgId: v.orgId, accountId }, semLog);
    await db.membership.create({
      data: { accountId, orgId: v.orgId, role: 'MEMBER', state: v.state },
    });
  }
  return accountId;
}

beforeAll(async () => {
  if (!migratorUrl || !databaseUrl) {
    throw new Error('DATABASE_URL/MIGRATION_DATABASE_URL ausentes: este teste exige PostgreSQL.');
  }
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  runtime = new PrismaClient({ datasourceUrl: databaseUrl });
  await Promise.all([migrator.$connect(), runtime.$connect()]);
  resolver = new OrgContextResolver(runtime as never, loggerFake as never);
});

afterAll(async () => {
  if (migrator) {
    for (const accountId of contasCriadas) {
      for (const orgId of [ORG_A, ORG_B, ORG_C]) {
        const db = withTenantContext(migrator, { orgId, accountId }, semLog);
        await db.membership.deleteMany({ where: { accountId } });
      }
      await migrator.account.deleteMany({ where: { id: accountId } });
    }
  }
  await Promise.all([migrator?.$disconnect(), runtime?.$disconnect()]);
});

describe('preferência de sessão × Membership ATIVA (a autoridade)', () => {
  it('preferência VÁLIDA resolve no contexto pedido', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'ACTIVE' }]);

    const ctx = await resolver.resolver(conta, { orgId: ORG_C, origem: 'preferencia' });
    expect(ctx.orgId).toBe(ORG_C);
    expect(ctx.papel).toBe('MEMBER');
  });

  it('Membership SUSPENSA: a preferência NÃO concede acesso', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'SUSPENDED' }]);

    // Suspender é o botão que precisa fazer efeito. Se a preferência valesse por si, suspender
    // alguém não tiraria o acesso dele — o buraco exato que a 1.3 fechou e que a sessão não reabre.
    await expect(
      resolver.resolver(conta, { orgId: ORG_C, origem: 'preferencia' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Membership REMOVIDA: a preferência NÃO concede acesso', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'REMOVED' }]);

    await expect(
      resolver.resolver(conta, { orgId: ORG_C, origem: 'preferencia' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preferência para Organização ALHEIA (sem vínculo nenhum) não concede acesso', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'ACTIVE' }]);

    // A conta é de C; a preferência aponta para A. Como ela tem UMA Membership ativa, a preferência
    // obsoleta caduca e a resolução cai na única legítima — nunca na Organização pedida.
    const ctx = await resolver.resolver(conta, { orgId: ORG_A, origem: 'preferencia' });
    expect(ctx.orgId).toBe(ORG_C);
    expect(ctx.orgId).not.toBe(ORG_A);
  });

  it('preferência obsoleta com MÚLTIPLAS Memberships ativas → 403 (escolher de novo)', async () => {
    const conta = await contaCom([
      { orgId: ORG_A, state: 'ACTIVE' },
      { orgId: ORG_B, state: 'ACTIVE' },
    ]);

    // Sem como adivinhar qual das duas, a plataforma NÃO escolhe: exige escolha explícita.
    await expect(
      resolver.resolver(conta, { orgId: ORG_C, origem: 'preferencia' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('origem do pedido: header AFIRMA, preferência é DEFAULT', () => {
  it('HEADER inválido é REJEITADO, nunca corrigido em silêncio', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'ACTIVE' }]);

    // A conta TEM uma Membership ativa (em C). Ainda assim, pedir A explicitamente é erro — e cair
    // em C seria "corrigir em silêncio", ensinando o cliente a mandar qualquer coisa.
    await expect(
      resolver.resolver(conta, { orgId: ORG_A, origem: 'header' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a MESMA entrada, vinda da preferência, caduca em vez de derrubar a requisição', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'ACTIVE' }]);

    // Mesmo `orgId`, origem diferente, resultado deliberadamente diferente: o header é afirmação
    // desta requisição; a preferência é um default que envelhece por fora.
    const ctx = await resolver.resolver(conta, { orgId: ORG_A, origem: 'preferencia' });
    expect(ctx.orgId).toBe(ORG_C);
  });

  it('header MALFORMADO é rejeitado — ele vem do cliente e pode ser qualquer coisa', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'ACTIVE' }]);

    await expect(
      resolver.resolver(conta, { orgId: 'nao-e-uuid', origem: 'header' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // O caso simétrico "preferência malformada" NÃO é testado aqui, e a ausência é deliberada:
    // `AuthSession.activeOrganizationId` é coluna `uuid`, e o PostgreSQL recusa a gravação de valor
    // inválido — provado em `preferencia-uuid-constraint.test.ts`. Testar o tratamento de um estado
    // que o banco impede de existir daria falsa confiança e exigiria código para um caso impossível.
  });
});

describe('regras de base preservadas (regressão da 1.3)', () => {
  it('nenhuma Membership ativa → 403, com ou sem pedido', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'SUSPENDED' }]);

    await expect(resolver.resolver(conta)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      resolver.resolver(conta, { orgId: ORG_C, origem: 'header' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('múltiplas ativas e NENHUM pedido → 403 (a plataforma não escolhe pelo usuário)', async () => {
    const conta = await contaCom([
      { orgId: ORG_A, state: 'ACTIVE' },
      { orgId: ORG_B, state: 'ACTIVE' },
    ]);

    await expect(resolver.resolver(conta)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('única ativa e nenhum pedido → resolve nela', async () => {
    const conta = await contaCom([{ orgId: ORG_C, state: 'ACTIVE' }]);

    const ctx = await resolver.resolver(conta);
    expect(ctx.orgId).toBe(ORG_C);
  });
});
