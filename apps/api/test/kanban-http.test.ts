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
 * Kanban e espaço operacional do Card (Story 2.9) pela porta da frente: HTTP real, banco real. Prova a leitura —
 * Cards agrupados por Fase (colunas ordenadas por `position`, com contagem), paginação por cursor determinístico,
 * detalhe do Card (valores + Fase + capacidades) — e que NADA move (superfície somente leitura). Escreve na Org A
 * (fixture de leitura ADMIN); os Cards de Fases não-iniciais são injetados pelo migrator (não há movimentação).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
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

interface Ident {
  id: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
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

async function criarPipe(nome: string): Promise<string> {
  const res = await req('POST', '/pipes', ANA, { name: nome });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}
async function criarFase(pipeId: string, nome: string): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: nome });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}
const urlForm = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

/** Pipe com 2 Fases + Campo TEXT publicado. Devolve pipeId, o Campo e as duas Fases (na ordem de criação). */
async function pipeComDuasFases(
  nome: string,
): Promise<{ pipeId: string; campo: Ident; fase1: string; fase2: string }> {
  const pipeId = await criarPipe(nome);
  const fase1 = await criarFase(pipeId, 'A Fazer');
  const fase2 = await criarFase(pipeId, 'Fazendo');
  const campoRes = await req('POST', `${urlForm(pipeId)}/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  expect(campoRes.status).toBe(201);
  const campo = (await campoRes.json()) as Ident;
  expect((await req('POST', `${urlForm(pipeId)}/publish`, ANA)).status).toBe(201);
  return { pipeId, campo, fase1, fase2 };
}

/** Submete o Formulário inicial (cria Card na 1ª Fase ativa). Devolve o Card criado. */
async function submeter(
  pipeId: string,
  campoId: string,
  valor: string,
  chave: string,
): Promise<Ident> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: chave,
    valores: { [campoId]: valor },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Ident;
}

/** Injeta um Card numa Fase específica pelo migrator (não há movimentação na 2.9). Reusa a versão publicada. */
async function injetarCardNaFase(pipeId: string, phaseId: string, chave: string): Promise<void> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const form = await db.form.findFirst({
    where: { pipeId, context: 'PIPE_INITIAL' },
    select: { id: true, publishedVersion: true },
  });
  const versao = await db.formVersion.findFirst({
    where: { formId: form!.id, version: form!.publishedVersion! },
    select: { id: true },
  });
  await db.card.create({
    data: {
      orgId: ORG_A,
      pipeId,
      phaseId,
      formId: form!.id,
      formVersionId: versao!.id,
      idempotencyKey: chave,
      valores: {},
    },
  });
}

/** Injeta um Card com `createdAt` EXPLÍCITO (para provar o desempate por `id` sob createdAt empatado). */
async function injetarCardComData(
  pipeId: string,
  phaseId: string,
  chave: string,
  createdAt: Date,
): Promise<void> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const form = await db.form.findFirst({
    where: { pipeId, context: 'PIPE_INITIAL' },
    select: { id: true, publishedVersion: true },
  });
  const versao = await db.formVersion.findFirst({
    where: { formId: form!.id, version: form!.publishedVersion! },
    select: { id: true },
  });
  await db.card.create({
    data: {
      orgId: ORG_A,
      pipeId,
      phaseId,
      formId: form!.id,
      formVersionId: versao!.id,
      idempotencyKey: chave,
      valores: {},
      createdAt,
    },
  });
}

async function conceder(pipeId: string, membershipId: string, role: string): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, { membershipId, role });
  expect(res.status).toBe(201);
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
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

interface KanbanResp {
  poder: string;
  capacidades: { ler: boolean; operar: boolean; gerenciar: boolean };
  fases: { id: string; name: string; totalCards: number }[];
}
interface PaginaResp {
  cards: { id: string; phaseId: string }[];
  proximoCursor: string | null;
}

describe('Kanban: Cards agrupados por Fase (SC-291)', () => {
  it('devolve as colunas na ordem das Fases, com a contagem de Cards; Fase sem Card → coluna vazia (0)', async () => {
    const { pipeId, campo, fase1, fase2 } = await pipeComDuasFases('2.9 kanban');
    // 2 Cards na 1ª Fase (via submissão real); 1 injetado na 2ª (não há movimentação).
    await submeter(pipeId, campo.id, 'a', 'k1');
    await submeter(pipeId, campo.id, 'b', 'k2');
    await injetarCardNaFase(pipeId, fase2, 'inj-1');

    const kb = (await (await req('GET', `/pipes/${pipeId}/kanban`, ANA)).json()) as KanbanResp;
    expect(kb.fases.map((f) => f.id)).toEqual([fase1, fase2]); // ordem por position
    expect(kb.fases[0]!.totalCards).toBe(2);
    expect(kb.fases[1]!.totalCards).toBe(1);
    expect(kb.poder).toBe('gerenciar'); // ANA é Admin da Org
    expect(kb.capacidades).toEqual({ ler: true, operar: true, gerenciar: true });
    expect(JSON.stringify(kb)).not.toContain(ORG_A); // orgId nunca cruza a fronteira
  });
});

describe('Kanban: coluna paginada por cursor determinístico (SC-291, NFR-3/4)', () => {
  it('pagina os Cards de uma Fase por cursor, sem sobreposição, em ordem estável', async () => {
    const { pipeId, campo, fase1 } = await pipeComDuasFases('2.9 paginacao');
    await submeter(pipeId, campo.id, '1', 'p1');
    await submeter(pipeId, campo.id, '2', 'p2');
    await submeter(pipeId, campo.id, '3', 'p3');

    const url = `/pipes/${pipeId}/kanban/phases/${fase1}/cards`;
    const pg1 = (await (await req('GET', `${url}?limite=2`, ANA)).json()) as PaginaResp;
    expect(pg1.cards).toHaveLength(2);
    expect(pg1.proximoCursor).not.toBeNull();

    const pg2 = (await (
      await req('GET', `${url}?limite=2&cursor=${pg1.proximoCursor}`, ANA)
    ).json()) as PaginaResp;
    expect(pg2.cards).toHaveLength(1); // 3 Cards, 2+1
    expect(pg2.proximoCursor).toBeNull(); // fim

    const ids = [...pg1.cards, ...pg2.cards].map((c) => c.id);
    expect(new Set(ids).size).toBe(3); // sem sobreposição entre páginas
  });

  it('coluna sem Card → página vazia; a lista NÃO expõe valores (payload enxuto)', async () => {
    const { pipeId, campo, fase1, fase2 } = await pipeComDuasFases('2.9 coluna vazia');
    await submeter(pipeId, campo.id, 'x', 'e1');
    const pgVazia = (await (
      await req('GET', `/pipes/${pipeId}/kanban/phases/${fase2}/cards`, ANA)
    ).json()) as PaginaResp;
    expect(pgVazia.cards).toHaveLength(0);

    const pg1 = await (
      await req('GET', `/pipes/${pipeId}/kanban/phases/${fase1}/cards`, ANA)
    ).json();
    expect(JSON.stringify(pg1)).not.toContain('valores'); // enxuto: sem valores na lista
  });
});

describe('espaço operacional do Card: detalhe (SC-292/293)', () => {
  it('abre o Card com valores, Fase atual e capacidades; Card fora do Pipe → 404', async () => {
    const { pipeId, campo, fase1 } = await pipeComDuasFases('2.9 detalhe');
    const card = await submeter(pipeId, campo.id, 'Cliente X', 'd1');

    const det = (await (await req('GET', `/pipes/${pipeId}/cards/${card.id}`, ANA)).json()) as {
      card: { id: string; phaseId: string; faseNome: string; valores: Record<string, unknown> };
      poder: string;
      capacidades: { ler: boolean; operar: boolean; gerenciar: boolean };
    };
    expect(det.card.id).toBe(card.id);
    expect(det.card.phaseId).toBe(fase1);
    expect(det.card.faseNome).toBe('A Fazer');
    expect(det.card.valores[campo.id]).toBe('Cliente X');
    expect(det.capacidades).toEqual({ ler: true, operar: true, gerenciar: true });

    // Card de OUTRO Pipe → 404 não-enumerante.
    const { pipeId: outro } = await pipeComDuasFases('2.9 outro pipe');
    expect((await req('GET', `/pipes/${outro}/cards/${card.id}`, ANA)).status).toBe(404);
  });

  it('VIEWER concedido vê o detalhe com só leitura (capacidades sem flags operacionais)', async () => {
    const { pipeId, campo } = await pipeComDuasFases('2.9 detalhe viewer');
    const card = await submeter(pipeId, campo.id, 'y', 'dv1');
    await conceder(pipeId, MEMBERSHIP_BRUNO_A, 'VIEWER');

    const det = (await (await req('GET', `/pipes/${pipeId}/cards/${card.id}`, BRUNO)).json()) as {
      poder: string;
      capacidades: { ler: boolean; operar: boolean; gerenciar: boolean };
    };
    expect(det.poder).toBe('ler');
    expect(det.capacidades).toEqual({ ler: true, operar: false, gerenciar: false });
  });
});

describe('bordas de paginação e validação de entrada (Edge R1/R2/R3, SC-295)', () => {
  it('empate de createdAt: pagina por id (desempate estável), sem pular nem repetir', async () => {
    const { pipeId, fase1 } = await pipeComDuasFases('2.9 empate createdAt');
    const t = new Date('2026-01-01T00:00:00.000Z'); // MESMO createdAt para os dois Cards
    await injetarCardComData(pipeId, fase1, 'tie-a', t);
    await injetarCardComData(pipeId, fase1, 'tie-b', t);

    const url = `/pipes/${pipeId}/kanban/phases/${fase1}/cards`;
    const pg1 = (await (await req('GET', `${url}?limite=1`, ANA)).json()) as PaginaResp;
    expect(pg1.cards).toHaveLength(1);
    expect(pg1.proximoCursor).not.toBeNull();
    const pg2 = (await (
      await req('GET', `${url}?limite=1&cursor=${pg1.proximoCursor}`, ANA)
    ).json()) as PaginaResp;
    expect(pg2.cards).toHaveLength(1);
    // Dois Cards distintos, sem sobreposição, mesmo com createdAt idêntico.
    expect(new Set([pg1.cards[0]!.id, pg2.cards[0]!.id]).size).toBe(2);
  });

  it('borda de página EXATA (total == limite): uma página, proximoCursor null (sem página-fantasma)', async () => {
    const { pipeId, campo, fase1 } = await pipeComDuasFases('2.9 pagina exata');
    await submeter(pipeId, campo.id, '1', 'x1');
    await submeter(pipeId, campo.id, '2', 'x2');
    const pg = (await (
      await req('GET', `/pipes/${pipeId}/kanban/phases/${fase1}/cards?limite=2`, ANA)
    ).json()) as PaginaResp;
    expect(pg.cards).toHaveLength(2);
    expect(pg.proximoCursor).toBeNull(); // exatamente 2, sem próxima página vazia
  });

  it('entrada inválida → 400 (limite 0/negativo/não-numérico; cursor não-UUID)', async () => {
    const { pipeId, fase1 } = await pipeComDuasFases('2.9 entrada invalida');
    const base = `/pipes/${pipeId}/kanban/phases/${fase1}/cards`;
    expect((await req('GET', `${base}?limite=0`, ANA)).status).toBe(400);
    expect((await req('GET', `${base}?limite=-1`, ANA)).status).toBe(400);
    expect((await req('GET', `${base}?limite=abc`, ANA)).status).toBe(400);
    expect((await req('GET', `${base}?cursor=lixo`, ANA)).status).toBe(400);
  });

  it('Kanban de Pipe sem Card → 200 com colunas de totalCards 0 (estado vazio honesto)', async () => {
    const { pipeId, fase1, fase2 } = await pipeComDuasFases('2.9 kanban vazio');
    const kb = (await (await req('GET', `/pipes/${pipeId}/kanban`, ANA)).json()) as KanbanResp;
    expect(kb.fases.map((f) => f.id)).toEqual([fase1, fase2]);
    expect(kb.fases.every((f) => f.totalCards === 0)).toBe(true);
  });
});
