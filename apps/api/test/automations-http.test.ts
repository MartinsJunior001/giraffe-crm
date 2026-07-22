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
 * Automações pela porta da frente: HTTP real, `AppModule` de produção, banco real (Story 4.1).
 *
 * Prova a autoridade de D4.3 na fronteira: **Admin da Org e Admin do Pipe administram**; **Membro do
 * Pipe só lê** (403 ao criar); **quem não alcança o Pipe recebe 404 não-enumerante** — nunca 403, que
 * confirmaria a existência do Pipe. E prova os dois gates que a autorização NÃO cobre: **Pipe arquivado
 * → 409** (autz resolve poder, não estado) e **configuração inválida → 400** (fail-closed).
 *
 * Ana é ADMIN da Org A; Bruno é MEMBER da Org A; Carla é ADMIN da Org B. As escritas de Pipe caem na
 * **Org A** com nome descartável; contas extras são criadas com `randomUUID` — nunca reusar
 * Ana/Bruno/Carla num `membership.create` persistente (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (ACTIVE)
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

const CONFIG_VALIDA = {
  quando: { tipo: 'CARD_CREATED' },
  condicoes: [],
  entao: [{ tipo: 'MOVER_CARD', parametros: {} }],
};

interface AutomacaoResp {
  id: string;
  pipeId: string;
  name: string;
  state: 'INACTIVE' | 'ACTIVE' | 'ARCHIVED';
  quando: unknown;
  condicoes: unknown;
  entao: unknown;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: { id: string; orgId: string }[] = [];
const automacoesCriadas: string[] = [];

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

/** Cria um Pipe pelo migrator (fixture), na Org indicada. */
async function criarPipe(orgId: string, estado: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): Promise<string> {
  const db = withTenantContext(migrator, { orgId }, semLog);
  const pipe = await db.pipe.create({
    data: {
      orgId,
      name: `pipe-4-1-${randomUUID().slice(0, 8)}`,
      state: estado,
      ...(estado === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
    },
    select: { id: true },
  });
  pipesCriados.push({ id: pipe.id, orgId });
  return pipe.id;
}

async function criarAutomacao(pipeId: string, conta = ANA): Promise<AutomacaoResp> {
  const res = await req('POST', `/pipes/${pipeId}/automations`, conta, {
    name: 'automação de teste',
    ...CONFIG_VALIDA,
  });
  expect(res.status).toBe(201);
  const a = (await res.json()) as AutomacaoResp;
  automacoesCriadas.push(a.id);
  return a;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
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
    // Automação antes do Pipe: a FK composta é RESTRICT.
    for (const orgId of [ORG_A]) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      if (automacoesCriadas.length > 0) {
        await db.automation.deleteMany({ where: { id: { in: automacoesCriadas } } });
      }
    }
    for (const { id, orgId } of pipesCriados) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.automation.deleteMany({ where: { pipeId: id } });
      await db.pipe.deleteMany({ where: { id } });
    }
    await migrator.$disconnect();
  }
  await app?.close();
});

describe('AC-1 — criar: nasce ligada a exatamente um Pipe, INACTIVE, com identidade estável', () => {
  it('Admin da Org cria e a Automação nasce no Pipe do caminho', async () => {
    const pipeId = await criarPipe(ORG_A);
    const a = await criarAutomacao(pipeId);

    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.pipeId).toBe(pipeId); // RN-100 — exatamente aquele Pipe
    expect(a.state).toBe('INACTIVE'); // D4.3 — default seguro
    expect(a.quando).toMatchObject({ tipo: 'CARD_CREATED' });
    expect(a.entao).toHaveLength(1);
    // `orgId` é fronteira interna: nunca sai no payload.
    expect(a as unknown as Record<string, unknown>).not.toHaveProperty('orgId');
  });

  it('a identidade é estável — obter devolve a MESMA Automação', async () => {
    const pipeId = await criarPipe(ORG_A);
    const a = await criarAutomacao(pipeId);

    const res = await req('GET', `/pipes/${pipeId}/automations/${a.id}`, ANA);
    expect(res.status).toBe(200);
    expect(((await res.json()) as AutomacaoResp).id).toBe(a.id);
  });

  it('listar devolve o resumo SEM a configuração (possível PII fica no detalhe)', async () => {
    const pipeId = await criarPipe(ORG_A);
    await criarAutomacao(pipeId);

    const res = await req('GET', `/pipes/${pipeId}/automations`, ANA);
    expect(res.status).toBe(200);
    const lista = (await res.json()) as Record<string, unknown>[];
    expect(lista).toHaveLength(1);
    expect(lista[0]).not.toHaveProperty('quando');
    expect(lista[0]).not.toHaveProperty('condicoes');
    expect(lista[0]).not.toHaveProperty('entao');
  });
});

describe('AC-2/AC-3 — configuração fail-closed', () => {
  it.each([
    ['entao vazio', { name: 'x', quando: { tipo: 'CARD_CREATED' }, entao: [] }],
    ['quando ausente', { name: 'x', entao: [{ tipo: 'A' }] }],
    [
      'condicoes não-array',
      { name: 'x', quando: { tipo: 'CARD_CREATED' }, condicoes: {}, entao: [{ tipo: 'A' }] },
    ],
    ['nome vazio', { name: '   ', quando: { tipo: 'CARD_CREATED' }, entao: [{ tipo: 'A' }] }],
    [
      'referência por rótulo',
      {
        name: 'x',
        quando: { tipo: 'CARD_CREATED', refs: [{ tipo: 'PHASE', id: 'Triagem' }] },
        entao: [{ tipo: 'A' }],
      },
    ],
  ])('400 em: %s', async (_nome, corpo) => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('POST', `/pipes/${pipeId}/automations`, ANA, corpo);
    expect(res.status).toBe(400);
  });

  it('400 ao tentar forjar `state` — o cliente não escolhe o estado inicial', async () => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('POST', `/pipes/${pipeId}/automations`, ANA, {
      name: 'x',
      state: 'ACTIVE',
      ...CONFIG_VALIDA,
    });
    expect(res.status).toBe(400);
  });

  it('400 ao tentar forjar `orgId` no corpo', async () => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('POST', `/pipes/${pipeId}/automations`, ANA, {
      name: 'x',
      orgId: '00000000-0000-4000-8000-000000000000',
      ...CONFIG_VALIDA,
    });
    expect(res.status).toBe(400);
  });

  // Story 4.3 (CA1): o catálogo de Eventos é fixo. Um `quando.tipo` fora do núcleo selecionável → 400.
  it.each([
    ['tipo desconhecido', 'EVENTO_INVENTADO'],
    ['ponto de extensão E5 ainda indisponível', 'TASK_CREATED'],
    ['E-mail recebido — indisponível na Fase 1', 'EMAIL_RECEIVED'],
  ])('400 EVENTO_FORA_DO_CATALOGO: %s', async (_nome, tipo) => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('POST', `/pipes/${pipeId}/automations`, ANA, {
      name: 'x',
      quando: { tipo },
      condicoes: [],
      entao: [{ tipo: 'MOVER_CARD', parametros: {} }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { motivo?: string }).motivo).toBe('EVENTO_FORA_DO_CATALOGO');
  });
});

describe('AC-4/AC-5 — alcance: cross-tenant e inexistente são 404 não-enumerante', () => {
  it('Pipe de OUTRA Organização → 404 (nunca 403, que confirmaria a existência)', async () => {
    const pipeDaOrgA = await criarPipe(ORG_A);
    // Carla é ADMIN da Org B: o Pipe existe, mas não na Organização dela.
    const res = await req('POST', `/pipes/${pipeDaOrgA}/automations`, CARLA, {
      name: 'x',
      ...CONFIG_VALIDA,
    });
    expect(res.status).toBe(404);
  });

  it('Pipe inexistente → 404', async () => {
    const res = await req('POST', `/pipes/${randomUUID()}/automations`, ANA, {
      name: 'x',
      ...CONFIG_VALIDA,
    });
    expect(res.status).toBe(404);
  });

  it('pipeId malformado → 400 (não vira query)', async () => {
    const res = await req('GET', '/pipes/nao-e-uuid/automations', ANA);
    expect(res.status).toBe(400);
  });

  it('Automação de OUTRO Pipe não é legível pela rota deste Pipe → 404', async () => {
    const pipeA = await criarPipe(ORG_A);
    const pipeB = await criarPipe(ORG_A);
    const a = await criarAutomacao(pipeA);

    const res = await req('GET', `/pipes/${pipeB}/automations/${a.id}`, ANA);
    expect(res.status).toBe(404);
  });
});

describe('AC-6 — autoridade D4.3: quem administra, quem só lê, quem não acessa', () => {
  it('Membro do Pipe LÊ (200) mas NÃO cria (403)', async () => {
    const pipeId = await criarPipe(ORG_A);
    await criarAutomacao(pipeId); // pela Ana (Admin da Org)

    // Bruno é MEMBER da Org A; concede-se a ele papel MEMBER neste Pipe.
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const membership = await db.membership.findFirst({
      where: { accountId: BRUNO, state: 'ACTIVE' },
      select: { id: true },
    });
    await db.pipeGrant.create({
      data: { orgId: ORG_A, pipeId, membershipId: membership!.id, role: 'MEMBER', state: 'ACTIVE' },
    });

    const leitura = await req('GET', `/pipes/${pipeId}/automations`, BRUNO);
    expect(leitura.status).toBe(200);
    expect((await leitura.json()) as unknown[]).toHaveLength(1);

    // Ler ≠ administrar: criar exige gerenciar o Pipe.
    const escrita = await req('POST', `/pipes/${pipeId}/automations`, BRUNO, {
      name: 'x',
      ...CONFIG_VALIDA,
    });
    expect(escrita.status).toBe(403);
  });

  it('Membro SEM concessão no Pipe → 404 (não revela que o Pipe existe)', async () => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('GET', `/pipes/${pipeId}/automations`, BRUNO);
    expect(res.status).toBe(404);
  });

  it('sem identidade → 401/403, nunca 200', async () => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('GET', `/pipes/${pipeId}/automations`);
    expect([401, 403]).toContain(res.status);
  });
});

describe('F-A4 — referências relidas sob RLS: nenhum ID cross-tenant é persistido', () => {
  it('referência a Fase de OUTRO Pipe → 400 REFERENCIA_INALCANCAVEL', async () => {
    const pipeDono = await criarPipe(ORG_A);
    const pipeVizinho = await criarPipe(ORG_A);

    // Fase real, da mesma Organização, mas de outro Pipe: a Automação não a alcança.
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const fase = await db.phase.create({
      data: { orgId: ORG_A, pipeId: pipeVizinho, name: 'vizinha', position: 1000 },
      select: { id: true },
    });

    const res = await req('POST', `/pipes/${pipeDono}/automations`, ANA, {
      name: 'x',
      quando: { tipo: 'CARD_CREATED', refs: [{ tipo: 'PHASE', id: fase.id }] },
      entao: [{ tipo: 'A' }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { motivo?: string }).toMatchObject({
      motivo: 'REFERENCIA_INALCANCAVEL',
    });
  });

  it('referência a UUID inexistente → 400 (fail-closed, não é aceita "por via das dúvidas")', async () => {
    const pipeId = await criarPipe(ORG_A);
    const res = await req('POST', `/pipes/${pipeId}/automations`, ANA, {
      name: 'x',
      quando: { tipo: 'CARD_CREATED', refs: [{ tipo: 'RECORD', id: randomUUID() }] },
      entao: [{ tipo: 'A' }],
    });
    expect(res.status).toBe(400);
  });

  it('referência ao PRÓPRIO Pipe é aceita; a outro Pipe, não', async () => {
    const pipeDono = await criarPipe(ORG_A);
    const outro = await criarPipe(ORG_A);

    const ok = await req('POST', `/pipes/${pipeDono}/automations`, ANA, {
      name: 'proprio',
      quando: { tipo: 'CARD_CREATED', refs: [{ tipo: 'PIPE', id: pipeDono }] },
      entao: [{ tipo: 'A' }],
    });
    expect(ok.status).toBe(201);
    automacoesCriadas.push(((await ok.json()) as AutomacaoResp).id);

    const nao = await req('POST', `/pipes/${pipeDono}/automations`, ANA, {
      name: 'alheio',
      quando: { tipo: 'CARD_CREATED', refs: [{ tipo: 'PIPE', id: outro }] },
      entao: [{ tipo: 'A' }],
    });
    expect(nao.status).toBe(400);
  });
});

describe('F-A4 — versão do schema da configuração', () => {
  it('é carimbada pelo servidor (v1) e não aceita do cliente', async () => {
    const pipeId = await criarPipe(ORG_A);
    const a = await criarAutomacao(pipeId);

    // Persistida como COLUNA consultável.
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const linha = await db.automation.findFirst({
      where: { id: a.id },
      select: { configSchemaVersion: true },
    });
    expect(linha?.configSchemaVersion).toBe(1);

    // O cliente não escolhe qual parser o valida.
    const forjado = await req('POST', `/pipes/${pipeId}/automations`, ANA, {
      name: 'x',
      configSchemaVersion: 99,
      ...CONFIG_VALIDA,
    });
    expect(forjado.status).toBe(400);
  });
});

describe('AC-7 — gate de estado: Pipe arquivado', () => {
  it('criar em Pipe ARCHIVED → 409 PIPE_ARQUIVADO (autz resolve poder, não estado)', async () => {
    const pipeId = await criarPipe(ORG_A, 'ARCHIVED');
    const res = await req('POST', `/pipes/${pipeId}/automations`, ANA, {
      name: 'x',
      ...CONFIG_VALIDA,
    });
    expect(res.status).toBe(409);
    expect((await res.json()) as { motivo?: string }).toMatchObject({ motivo: 'PIPE_ARQUIVADO' });
  });

  it('CONTROLE do gate: o MESMO payload num Pipe ATIVO é aceito', async () => {
    // Controle positivo do teste acima: prova que o 409 veio do ESTADO do Pipe, e não de um defeito do
    // payload. Não há derrubada de proteção aqui — é o gate de arquivamento exercitado nos dois sentidos.
    const pipeAtivo = await criarPipe(ORG_A, 'ACTIVE');
    const res = await req('POST', `/pipes/${pipeAtivo}/automations`, ANA, {
      name: 'x',
      ...CONFIG_VALIDA,
    });
    expect(res.status).toBe(201);
    automacoesCriadas.push(((await res.json()) as AutomacaoResp).id);
  });
});
