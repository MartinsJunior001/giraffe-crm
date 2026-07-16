import 'reflect-metadata';
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
 * Databases pela porta da frente: HTTP real, `AppModule` de produção, banco real (Story 3.1). Prova o
 * Épico 3 ponta a ponta — o `AuthzGuard` global concede a Database (ADMIN) e nega (MEMBER/GUEST), o
 * controller valida a entrada, o service roda sob `withTenantContext` e a RLS isola. A única costura é
 * o provider de identidade (o login é da Story 1.4), idêntico a `pipes-http.test.ts`.
 *
 * Cobre: CA1 (criar/renomear → catálogo real, distinto de Pipe), CA2 (arquivar não é bloqueado; entra
 * em somente-leitura), CA3 (**D1** — renomear arquivado → 409; dados seguem consultáveis), CA4
 * (restaurar preserva identidade e reabilita a escrita), CA5 (sem exclusão; MEMBER negado).
 *
 * Ana é ADMIN da Org A; Bruno é MEMBER da Org A; Carla é ADMIN da Org B. As escritas caem na Org A
 * (`Database` é tabela nova desta Story: nenhuma suíte paralela conta Databases). Faxina pelo migrator
 * (o runtime não tem GRANT de DELETE).
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

interface DatabaseResp {
  id: string;
  name: string;
  state: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const criados: string[] = [];

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

async function criarBase(nome: string): Promise<DatabaseResp> {
  const res = await req('POST', '/databases', ANA, { name: nome });
  expect(res.status).toBe(201);
  const base = (await res.json()) as DatabaseResp;
  criados.push(base.id);
  return base;
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
}, 30000);

afterAll(async () => {
  if (migrator && criados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.database.deleteMany({ where: { id: { in: criados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('CA1: Admin cria e renomeia — catálogo real da Org, distinto de Pipe', () => {
  it('cria um Database ACTIVE e o vê no catálogo; orgId não vaza', async () => {
    const base = await criarBase('Clientes');
    expect(base.state).toBe('ACTIVE');
    expect(base.archivedAt).toBeNull();
    expect(JSON.stringify(base)).not.toContain(ORG_A);

    const lista = (await (await req('GET', '/databases', ANA)).json()) as DatabaseResp[];
    expect(lista.some((d) => d.id === base.id)).toBe(true);
  });

  it('renomeia um Database ACTIVE (200) e o novo nome reflete no catálogo', async () => {
    const base = await criarBase('Nome antigo');
    const res = await req('PATCH', `/databases/${base.id}`, ANA, { name: 'Nome novo' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as DatabaseResp).name).toBe('Nome novo');

    const obtido = (await (await req('GET', `/databases/${base.id}`, ANA)).json()) as DatabaseResp;
    expect(obtido.name).toBe('Nome novo');
  });

  it('o catálogo de Database é DISTINTO do de Pipe (RN-061): criar um não cria o outro', async () => {
    const base = await criarBase('Só Database');
    const pipes = (await (await req('GET', '/pipes', ANA)).json()) as { id: string }[];
    expect(pipes.some((p) => p.id === base.id)).toBe(false);
  });

  it('nome inválido → 400 sanitizado', async () => {
    expect((await req('POST', '/databases', ANA, { name: '   ' })).status).toBe(400);
    expect((await req('POST', '/databases', ANA, {})).status).toBe(400);
  });
});

describe('CA2/CA3: arquivar não é bloqueado; somente-leitura integral (D1)', () => {
  it('arquiva (200, archivedAt preenchido) e o Database sai do catálogo ativo', async () => {
    const base = await criarBase('A arquivar');
    const res = await req('POST', `/databases/${base.id}/archive`, ANA);
    expect(res.status).toBe(200);
    const arquivado = (await res.json()) as DatabaseResp;
    expect(arquivado.state).toBe('ARCHIVED');
    expect(arquivado.archivedAt).not.toBeNull();

    // Sai do catálogo ATIVO (default), mas continua consultável com ?arquivados=true e por id.
    const ativos = (await (await req('GET', '/databases', ANA)).json()) as DatabaseResp[];
    expect(ativos.some((d) => d.id === base.id)).toBe(false);
    const todos = (await (
      await req('GET', '/databases?arquivados=true', ANA)
    ).json()) as DatabaseResp[];
    expect(todos.some((d) => d.id === base.id)).toBe(true);
  });

  it('arquivar já-arquivado é no-op idempotente (200), sem reescrever archivedAt', async () => {
    const base = await criarBase('Idempotente arquivar');
    const um = (await (await req('POST', `/databases/${base.id}/archive`, ANA)).json()) as DatabaseResp;
    const dois = await req('POST', `/databases/${base.id}/archive`, ANA);
    expect(dois.status).toBe(200);
    const doisBody = (await dois.json()) as DatabaseResp;
    expect(doisBody.state).toBe('ARCHIVED');
    expect(doisBody.archivedAt).toBe(um.archivedAt); // instante ORIGINAL preservado
  });

  it('CA3/D1: renomear um Database ARCHIVED → 409 DATABASE_ARQUIVADO; dados seguem consultáveis', async () => {
    const base = await criarBase('Congelada');
    await req('POST', `/databases/${base.id}/archive`, ANA);

    const res = await req('PATCH', `/databases/${base.id}`, ANA, { name: 'Tentativa' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain('DATABASE_ARQUIVADO');

    // Somente-leitura: o nome NÃO mudou, e o recurso continua consultável (leitura não é bloqueada).
    const obtido = (await (await req('GET', `/databases/${base.id}`, ANA)).json()) as DatabaseResp;
    expect(obtido.name).toBe('Congelada');
    expect(obtido.state).toBe('ARCHIVED');
  });
});

describe('CA4: restaurar preserva identidade e reabilita a escrita', () => {
  it('restaura (200), preserva id/nome e zera archivedAt', async () => {
    const base = await criarBase('Vai e volta');
    await req('POST', `/databases/${base.id}/archive`, ANA);

    const res = await req('POST', `/databases/${base.id}/restore`, ANA);
    expect(res.status).toBe(200);
    const restaurado = (await res.json()) as DatabaseResp;
    expect(restaurado.id).toBe(base.id); // identidade preservada — não é nova linha
    expect(restaurado.name).toBe('Vai e volta');
    expect(restaurado.state).toBe('ACTIVE');
    expect(restaurado.archivedAt).toBeNull();
  });

  it('restaurar já-ativo é no-op idempotente (200)', async () => {
    const base = await criarBase('Já ativa');
    const res = await req('POST', `/databases/${base.id}/restore`, ANA);
    expect(res.status).toBe(200);
    expect(((await res.json()) as DatabaseResp).state).toBe('ACTIVE');
  });

  it('D1: o fluxo autorizado para renomear um arquivado é restaurar → renomear → arquivar', async () => {
    const base = await criarBase('Nome preso');
    await req('POST', `/databases/${base.id}/archive`, ANA);
    expect((await req('PATCH', `/databases/${base.id}`, ANA, { name: 'X' })).status).toBe(409);

    // restaurar → renomear → arquivar novamente
    expect((await req('POST', `/databases/${base.id}/restore`, ANA)).status).toBe(200);
    expect((await req('PATCH', `/databases/${base.id}`, ANA, { name: 'Nome livre' })).status).toBe(200);
    const rearquivado = (await (
      await req('POST', `/databases/${base.id}/archive`, ANA)
    ).json()) as DatabaseResp;
    expect(rearquivado.name).toBe('Nome livre');
    expect(rearquivado.state).toBe('ARCHIVED');
  });
});

describe('CA5: sem exclusão, deny-by-default e não-enumeração', () => {
  it('MEMBER (Bruno) é NEGADO em toda operação de Database — até a 3.2', async () => {
    const base = await criarBase('Fora do alcance do Bruno');
    expect((await req('GET', '/databases', BRUNO)).status).toBe(403);
    expect((await req('GET', `/databases/${base.id}`, BRUNO)).status).toBe(403);
    expect((await req('POST', '/databases', BRUNO, { name: 'Do Bruno' })).status).toBe(403);
    expect((await req('PATCH', `/databases/${base.id}`, BRUNO, { name: 'X' })).status).toBe(403);
    expect((await req('POST', `/databases/${base.id}/archive`, BRUNO)).status).toBe(403);
    expect((await req('POST', `/databases/${base.id}/restore`, BRUNO)).status).toBe(403);
  });

  it('não existe rota de exclusão: DELETE /databases/:id → 404 de rota', async () => {
    const base = await criarBase('Nunca apagada');
    expect((await req('DELETE', `/databases/${base.id}`, ANA)).status).toBe(404);
    // E continua lá: arquivar é estado, não exclusão.
    expect((await req('GET', `/databases/${base.id}`, ANA)).status).toBe(200);
  });

  it('Admin de OUTRA Org (Carla) não enxerga nem alcança o Database da Org A → 404 não-enumerante', async () => {
    const base = await criarBase('Só da Org A');
    // Carla é ADMIN (passa o guard), mas a RLS filtra: mesma resposta de "não existe".
    expect((await req('GET', `/databases/${base.id}`, CARLA)).status).toBe(404);
    const daCarla = (await (await req('GET', '/databases', CARLA)).json()) as DatabaseResp[];
    expect(daCarla.some((d) => d.id === base.id)).toBe(false);
  });

  it('id malformado → 400 (não é sonda de enumeração)', async () => {
    expect((await req('GET', '/databases/nao-e-uuid', ANA)).status).toBe(400);
  });

  it('inexistente (UUID válido) → 404', async () => {
    expect(
      (await req('GET', '/databases/00000000-0000-4000-8000-000000000000', ANA)).status,
    ).toBe(404);
  });
});
