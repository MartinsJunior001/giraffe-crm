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
 * Templates de e-mail (Story 6.2) pela porta da frente: HTTP real, banco real. Prova o ciclo do Admin
 * (criar v1 → editar v2 → arquivar → 409 → restaurar → v3), o `templateId` estável com versões
 * imutáveis, a validação fail-closed do catálogo de variáveis e a autorização fina (Admin administra;
 * MEMBER consulta; GUEST 403; 404 não-enumerante). Sem rota de exclusão.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const CARLA = '33333333-3333-3333-3333-333333333333'; // ADMIN na Org B (cross-tenant)
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface TemplateView {
  id: string;
  name: string;
  state: string;
  activeVersion: number;
}
interface VersaoView {
  id: string;
  templateId: string;
  version: number;
  subject: string;
  variables: { nome: string; obrigatoria: boolean }[];
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const templatesCriados: string[] = [];
// GUEST descartável na Org A (conta dedicada — mesmo padrão justificado em emails-http, TEST-ISO-01).
const GUEST_CONTA = randomUUID();
let guestMembershipId = '';
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

async function criarTemplate(body: unknown, esperado = 201): Promise<TemplateView> {
  const res = await req('POST', '/email-templates', ANA, body);
  expect(res.status).toBe(esperado);
  const t = (await res.json()) as TemplateView;
  if (esperado === 201) templatesCriados.push(t.id);
  return t;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
  await migrator.account.create({
    data: { id: GUEST_CONTA, email: `guest-${GUEST_CONTA}@teste.local`, name: 'Guest 6.2' },
  });
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const m = await db.membership.create({
    data: { accountId: GUEST_CONTA, orgId: ORG_A, role: 'GUEST', state: 'ACTIVE' },
    select: { id: true },
  });
  guestMembershipId = m.id;
}, 30000);

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.emailTemplateVersion
      .deleteMany({ where: { templateId: { in: templatesCriados } } })
      .catch(() => {});
    await db.emailTemplate.deleteMany({ where: { id: { in: templatesCriados } } }).catch(() => {});
    if (guestMembershipId) {
      await db.membership.deleteMany({ where: { id: guestMembershipId } }).catch(() => {});
    }
    await migrator.account.deleteMany({ where: { id: GUEST_CONTA } }).catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('AC1 — ciclo do Admin com versionamento', () => {
  it('cria v1 (201), edita → v2 com templateId estável, arquiva → editar 409 → restaura → v3', async () => {
    const t = await criarTemplate({
      name: 'Boas-vindas',
      subject: 'Oi {{user.name}}',
      body: 'Bem-vindo à {{org.name}}!',
      variables: [{ nome: 'user.name', obrigatoria: true }, { nome: 'org.name' }],
    });
    expect(t.state).toBe('ACTIVE');
    expect(t.activeVersion).toBe(1);
    expect('orgId' in (t as unknown as Record<string, unknown>)).toBe(false);

    const v2Res = await req('POST', `/email-templates/${t.id}/versions`, ANA, {
      subject: 'Olá {{user.name}}',
      body: 'corpo novo',
      variables: [{ nome: 'user.name', obrigatoria: true }],
    });
    expect(v2Res.status).toBe(201);
    const v2 = (await v2Res.json()) as VersaoView;
    expect(v2.templateId).toBe(t.id); // identidade estável
    expect(v2.version).toBe(2);

    expect((await req('POST', `/email-templates/${t.id}/archive`, ANA)).status).toBe(200);
    expect((await req('POST', `/email-templates/${t.id}/archive`, ANA)).status).toBe(200); // no-op
    expect(
      (
        await req('POST', `/email-templates/${t.id}/versions`, ANA, {
          subject: 's',
          body: 'b',
        })
      ).status,
    ).toBe(409); // arquivado é somente-leitura
    expect((await req('POST', `/email-templates/${t.id}/restore`, ANA)).status).toBe(200);
    const v3Res = await req('POST', `/email-templates/${t.id}/versions`, ANA, {
      subject: 's3',
      body: 'b3',
    });
    expect(v3Res.status).toBe(201);
    expect(((await v3Res.json()) as VersaoView).version).toBe(3);

    // Histórico completo consultável; versões anteriores intactas.
    const versoes = (await (
      await req('GET', `/email-templates/${t.id}/versions`, ANA)
    ).json()) as VersaoView[];
    expect(versoes.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(versoes[0]!.subject).toBe('Oi {{user.name}}');
    // AC-3: a definição persiste TIPADA e normalizada na versão (a 6.3 consome exatamente este dado).
    expect(versoes[0]!.variables).toEqual([
      { nome: 'user.name', obrigatoria: true },
      { nome: 'org.name', obrigatoria: false },
    ]);
    // AC-2 (QA-F2): o PONTEIRO avançou e `versaoAtiva` reflete a última versão.
    const detalhe = (await (await req('GET', `/email-templates/${t.id}`, ANA)).json()) as {
      activeVersion: number;
      versaoAtiva: { version: number; subject: string } | null;
      state: string;
    };
    expect(detalhe.activeVersion).toBe(3);
    expect(detalhe.versaoAtiva?.version).toBe(3);
    expect(detalhe.versaoAtiva?.subject).toBe('s3');
  });

  it('renome junto da edição (QA-F3): name novo grava; ausente preserva; não-string → 400', async () => {
    const t = await criarTemplate({ name: 'Original', subject: 's', body: 'b' });
    expect(
      (
        await req('POST', `/email-templates/${t.id}/versions`, ANA, {
          name: 'Renomeado',
          subject: 's2',
          body: 'b2',
        })
      ).status,
    ).toBe(201);
    let detalhe = (await (await req('GET', `/email-templates/${t.id}`, ANA)).json()) as {
      name: string;
    };
    expect(detalhe.name).toBe('Renomeado');
    expect(
      (await req('POST', `/email-templates/${t.id}/versions`, ANA, { subject: 's3', body: 'b3' }))
        .status,
    ).toBe(201);
    detalhe = (await (await req('GET', `/email-templates/${t.id}`, ANA)).json()) as {
      name: string;
    };
    expect(detalhe.name).toBe('Renomeado'); // ausente preserva
    expect(
      (
        await req('POST', `/email-templates/${t.id}/versions`, ANA, {
          name: 123,
          subject: 's',
          body: 'b',
        })
      ).status,
    ).toBe(400);
  });

  it('AC-2 (QA-F1): edição concorrente determinística — o serviço perde a corrida e responde 409, nunca 500', async () => {
    const t = await criarTemplate({ name: 'corrida', subject: 's', body: 'b' });
    // Simula um publish CONCORRENTE que o cliente não viu: o migrator insere a v2 SEM avançar o
    // ponteiro — o serviço (que leu activeVersion=1 e computará proxima=2) colide no UNIQUE dentro da
    // tx → rollback integral → 409 EDICAO_CONCORRENTE (nunca 500), sem versão órfã nem ponteiro torto.
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.emailTemplateVersion.create({
      data: {
        orgId: ORG_A,
        templateId: t.id,
        version: 2,
        subject: 'concorrente',
        body: 'x',
        authorMembershipId: randomUUID(),
      },
    });
    const res = await req('POST', `/email-templates/${t.id}/versions`, ANA, {
      subject: 'perdedor',
      body: 'y',
    });
    expect(res.status).toBe(409);
    // Rollback provado: nenhuma versão além de [1, 2]; ponteiro inalterado (o vencedor "real" o teria
    // avançado — aqui o simulado não avançou, e o perdedor NÃO pode tê-lo tocado).
    const versoes = await db.emailTemplateVersion.findMany({
      where: { templateId: t.id },
      orderBy: { version: 'asc' },
      select: { version: true, subject: true },
    });
    expect(versoes.map((v) => v.version)).toEqual([1, 2]);
    expect(versoes.find((v) => v.version === 2)?.subject).toBe('concorrente');
    const detalhe = (await (await req('GET', `/email-templates/${t.id}`, ANA)).json()) as {
      activeVersion: number;
    };
    expect(detalhe.activeVersion).toBe(1);
  });
});

describe('AC3/AC4 — catálogo tipado fail-closed', () => {
  it('referência não declarada, variável fora do catálogo e duplicata → 400', async () => {
    await criarTemplate({ name: 'x', subject: 'Oi {{user.name}}', body: 'b' }, 400); // não declarada
    await criarTemplate(
      { name: 'x', subject: 's', body: 'b', variables: [{ nome: 'hack.env' }] },
      400,
    );
    await criarTemplate(
      {
        name: 'x',
        subject: 's',
        body: 'b',
        variables: [{ nome: 'org.name' }, { nome: 'org.name' }],
      },
      400,
    );
  });
});

describe('RF-1/RF-4 — autorização fina', () => {
  it('MEMBER consulta (200) e não administra (403); GUEST 403 em tudo', async () => {
    const t = await criarTemplate({ name: 'consulta', subject: 's', body: 'b' });
    expect((await req('GET', '/email-templates', BRUNO)).status).toBe(200);
    expect((await req('GET', `/email-templates/${t.id}`, BRUNO)).status).toBe(200);
    expect(
      (await req('POST', '/email-templates', BRUNO, { name: 'n', subject: 's', body: 'b' })).status,
    ).toBe(403);
    expect(
      (await req('POST', `/email-templates/${t.id}/versions`, BRUNO, { subject: 's', body: 'b' }))
        .status,
    ).toBe(403);
    expect((await req('POST', `/email-templates/${t.id}/archive`, BRUNO)).status).toBe(403);
    expect((await req('GET', '/email-templates', GUEST_CONTA)).status).toBe(403);
    expect((await req('GET', `/email-templates/${t.id}`, GUEST_CONTA)).status).toBe(403);
    // GUEST 403 no ciclo TODO (QA-F5), inclusive versões e mutações.
    expect((await req('GET', `/email-templates/${t.id}/versions`, GUEST_CONTA)).status).toBe(403);
    expect(
      (await req('POST', '/email-templates', GUEST_CONTA, { name: 'n', subject: 's', body: 'b' }))
        .status,
    ).toBe(403);
    expect(
      (
        await req('POST', `/email-templates/${t.id}/versions`, GUEST_CONTA, {
          subject: 's',
          body: 'b',
        })
      ).status,
    ).toBe(403);
    expect((await req('POST', `/email-templates/${t.id}/archive`, GUEST_CONTA)).status).toBe(403);
    // AC-4 (QA-F8): consultar segue 200 sob arquivamento.
    expect((await req('POST', `/email-templates/${t.id}/archive`, ANA)).status).toBe(200);
    expect((await req('GET', `/email-templates/${t.id}`, BRUNO)).status).toBe(200);
    expect((await req('POST', `/email-templates/${t.id}/restore`, ANA)).status).toBe(200);
  });

  it('cross-tenant: Carla (Org B) não vê o Template da Org A (404 não-enumerante)', async () => {
    const t = await criarTemplate({ name: 'privado', subject: 's', body: 'b' });
    expect((await req('GET', `/email-templates/${t.id}`, CARLA)).status).toBe(404);
    expect(
      (await req('POST', `/email-templates/${t.id}/versions`, CARLA, { subject: 's', body: 'b' }))
        .status,
    ).toBe(404);
    expect((await req('POST', `/email-templates/${t.id}/archive`, CARLA)).status).toBe(404);
    expect((await req('GET', `/email-templates/${t.id}/versions`, CARLA)).status).toBe(404);
  });

  it('não existe rota de exclusão (DELETE → 404/405)', async () => {
    const t = await criarTemplate({ name: 'del', subject: 's', body: 'b' });
    expect([404, 405]).toContain((await req('DELETE', `/email-templates/${t.id}`, ANA)).status);
  });
});
