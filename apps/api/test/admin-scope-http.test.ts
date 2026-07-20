import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
 * Guarda do Painel Administrativo (Story 8.1) sobre HTTP real, `AppModule` de produção e banco real.
 *
 * O que este arquivo prova é a fronteira: quem **não** é Administrador ativo da Organização atual não
 * passa — e não passa no SERVIDOR, pelo `AuthzGuard` deny-by-default, não por uma checagem de UI.
 *
 * Ana é ADMIN na Org A; Bruno é MEMBER na Org A; Carla é ADMIN na Org B. Todas são fixtures de
 * **LEITURA**. Os estados SUSPENDED/REMOVED usam conta **descartável** (`randomUUID`) na **Org C** —
 * reusar conta do seed num `membership.create` persistente quebra o teste do vizinho (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
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

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const contasCriadas: string[] = [];

const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(caminho: string, conta?: string, orgId?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  if (orgId !== undefined) headers['x-org-id'] = orgId;
  return fetch(`${baseUrl}${caminho}`, { headers });
}

/** Conta descartável com uma Membership no papel e estado pedidos, na Org C. */
async function contaCom(
  state: 'ACTIVE' | 'SUSPENDED' | 'REMOVED',
  role: 'ADMIN' | 'MEMBER' | 'GUEST' = 'ADMIN',
): Promise<string> {
  const accountId = randomUUID();
  await migrator.account.create({
    data: { id: accountId, email: `wa-8-1-${accountId}@exemplo.test`, name: 'Descartável' },
  });
  contasCriadas.push(accountId);

  const db = withTenantContext(migrator, { orgId: ORG_C, accountId }, semLog);
  await db.membership.create({ data: { accountId, orgId: ORG_C, role, state } });
  return accountId;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (migrator) {
    for (const accountId of contasCriadas) {
      const db = withTenantContext(migrator, { orgId: ORG_C, accountId }, semLog);
      await db.membership.deleteMany({ where: { accountId } });
      await migrator.account.deleteMany({ where: { id: accountId } });
    }
    await migrator.$disconnect();
  }
  await app?.close();
});

describe('AC-6 — deny-by-default revalidado no servidor', () => {
  it('Administrador ativo → 200 com o escopo da própria Organização', async () => {
    const res = await req('/organizations/admin-scope', ANA, ORG_A);

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { id: string; name: string; slug: string };
    expect(corpo.id).toBe(ORG_A);
    expect(typeof corpo.name).toBe('string');
  });

  it('MEMBER → 403 (não é Administrador)', async () => {
    expect((await req('/organizations/admin-scope', BRUNO, ORG_A)).status).toBe(403);
  });

  it.each(['MEMBER', 'GUEST'] as const)(
    '%s com Membership ATIVA → 403: o papel é a fronteira, não o vínculo',
    async (role) => {
      // A fase vermelha desta Story mostrou que UM único teste guardava esta fronteira: neutralizada
      // a autorização, só o caso do MEMBER ficava vermelho. Cobrir os dois papéis não-Admin com
      // contas descartáveis fecha a lacuna — se alguém trocar `administrar` por `ler` amanhã, dois
      // testes caem, e nenhum deles depende de fixture do seed.
      const conta = await contaCom('ACTIVE', role);
      expect((await req('/organizations/admin-scope', conta, ORG_C)).status).toBe(403);
    },
  );

  it('sem sessão → 401, nunca 403', async () => {
    // A distinção importa: 401 diz "não sei quem você é"; 403 diria "sei e você não pode" — e já
    // revelaria que a rota existe para alguém autenticado.
    expect((await req('/organizations/admin-scope')).status).toBe(401);
  });

  it('o corpo do 403 não explica o motivo', async () => {
    const res = await req('/organizations/admin-scope', BRUNO, ORG_A);
    const texto = await res.text();

    expect(texto).not.toMatch(/administrar|Administrador|papel|MEMBER/i);
  });
});

describe('AC-1 — Membership suspensa ou encerrada não acessa', () => {
  it('Membership SUSPENDED → negado, mesmo com papel ADMIN', async () => {
    // O papel é ADMIN; o que barra é o ESTADO. Se o papel bastasse, suspender alguém não tiraria o
    // acesso administrativo dele — o botão de suspensão não faria nada onde mais importa.
    const conta = await contaCom('SUSPENDED');
    const res = await req('/organizations/admin-scope', conta, ORG_C);

    expect(res.status).not.toBe(200);
    expect([401, 403]).toContain(res.status);
  });

  it('Membership REMOVED → negado, mesmo com papel ADMIN', async () => {
    const conta = await contaCom('REMOVED');
    const res = await req('/organizations/admin-scope', conta, ORG_C);

    expect([401, 403]).toContain(res.status);
  });

  it('a MESMA conta com Membership ACTIVE passa — o discriminador é o estado', async () => {
    // Sem este controle, os dois testes acima passariam mesmo que a rota estivesse quebrada para
    // todo mundo.
    const conta = await contaCom('ACTIVE');
    expect((await req('/organizations/admin-scope', conta, ORG_C)).status).toBe(200);
  });
});

describe('AC-2 / AC-5 — isolamento e ausência de enumeração', () => {
  it('Admin de OUTRA Organização não alcança esta (403, sem revelar nada)', async () => {
    // Carla é ADMIN, mas da Org B. Pedir a Org A explicitamente não a torna administradora dela.
    const res = await req('/organizations/admin-scope', CARLA, ORG_A);

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(ORG_A);
  });

  it('o escopo devolvido é SEMPRE o da Organização do contexto', async () => {
    const res = await req('/organizations/admin-scope', ANA, ORG_A);
    const corpo = (await res.json()) as { id: string };

    expect(corpo.id).toBe(ORG_A);
  });

  it('a resposta não expõe outra Organização nem contagem alguma', async () => {
    const res = await req('/organizations/admin-scope', ANA, ORG_A);
    const corpo = (await res.json()) as Record<string, unknown>;

    // Exatamente os três campos do escopo. Qualquer número aqui seria dado fictício (INV-ADMIN-02)
    // ou cálculo duplicado dos read-models de E7.
    expect(Object.keys(corpo).sort()).toEqual(['id', 'name', 'slug']);
  });

  it('`x-org-id` de Organização alheia NÃO amplia escopo — é rejeitado', async () => {
    // Ana é ADMIN na Org A e não tem Membership na Org C. Afirmar a Org C não lhe dá acesso a ela:
    // o pedido do cliente nunca é autoridade (1.3).
    const res = await req('/organizations/admin-scope', ANA, ORG_C);

    expect(res.status).not.toBe(200);
  });
});
