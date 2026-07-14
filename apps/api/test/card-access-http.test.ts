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
 * Acesso, Responsável e concessões de Card (Story 2.10) pela porta da frente: HTTP real, banco real. Prova a
 * autorização NO NÍVEL DO CARD — atribuição de Responsável (exige acesso operacional prévio do alvo — SC-2101; não
 * amplia acesso — SC-2102), concessão direta escopada a UM Card (Observador × operacional — SC-2103/2104), o
 * modificador "restrito ao próprio" (Responsável/concessão acessam; creator/histórico NÃO — SC-2105) e os eventos
 * `CardHistory` correspondentes. Escreve na Org A (fixture ADMIN); limpa os Pipes criados por id (cascata).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (única Org ativa → contexto sem ambiguidade)
// Eva pertence a DUAS Orgs ativas → NÃO serve como principal de requisição (contexto ambíguo); só como ALVO.
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
const MEMBERSHIP_EVA_A = 'a1a1a1a1-0000-0000-0000-000000000003';
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

/** Pipe com 1 Fase + Campo TEXT publicado. Devolve pipeId e o Campo. */
async function pipeComForm(nome: string): Promise<{ pipeId: string; campo: Ident }> {
  const pipeId = await criarPipe(nome);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' })).status).toBe(201);
  const campoRes = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  expect(campoRes.status).toBe(201);
  const campo = (await campoRes.json()) as Ident;
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);
  return { pipeId, campo };
}

/** Submete o Formulário inicial como `conta` (cria Card na 1ª Fase). O submissor vira o `creator` do Card. */
async function submeter(
  pipeId: string,
  campoId: string,
  chave: string,
  conta = ANA,
): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, conta, {
    idempotencyKey: chave,
    valores: { [campoId]: 'x' },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

async function concederPapel(
  pipeId: string,
  membershipId: string,
  role: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, { membershipId, role, ...extras });
  expect(res.status).toBe(201);
}

/** Tipos de evento do Histórico de um Card (para provar que o evento entra na mesma transação). */
async function tiposDeHistorico(cardId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const eventos = await db.cardHistory.findMany({
    where: { cardId },
    orderBy: { createdAt: 'asc' },
    select: { type: true },
  });
  return eventos.map((e) => e.type);
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

interface RespView {
  cardId: string;
  membershipId: string;
  state: string;
}
interface GrantView {
  membershipId: string;
  podeLer: boolean;
  podeOperar: boolean;
  podeMover: boolean;
  state: string;
}

describe('Responsável: atribuição, troca, remoção e eventos (SC-2101/2102)', () => {
  it('atribui a um alvo com acesso operacional; escreve RESPONSAVEL_ASSIGNED na mesma transação', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 resp atribui');
    const card = await submeter(pipeId, campo.id, 'r1');
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER'); // Bruno passa a operar o Pipe

    const res = await req('PUT', `/cards/${card}/responsavel`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RespView).membershipId).toBe(MEMBERSHIP_BRUNO_A);

    const ver = (await (await req('GET', `/cards/${card}/responsavel`, ANA)).json()) as RespView;
    expect(ver.membershipId).toBe(MEMBERSHIP_BRUNO_A);
    expect(await tiposDeHistorico(card)).toEqual(['CREATED', 'RESPONSAVEL_ASSIGNED']);
    expect(JSON.stringify(ver)).not.toContain(ORG_A); // orgId fora da fronteira
  });

  it('SC-2101: atribuir a quem NÃO tem acesso operacional ao Card → 400 (não concede acesso)', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 resp sem acesso');
    const card = await submeter(pipeId, campo.id, 'r2');
    // Eva não tem papel no Pipe nem concessão → sem acesso ao Card.
    const res = await req('PUT', `/cards/${card}/responsavel`, ANA, {
      membershipId: MEMBERSHIP_EVA_A,
    });
    expect(res.status).toBe(400);
  });

  it('reatribuir a MESMA pessoa é idempotente (sem novo evento); trocar gera RESPONSAVEL_CHANGED', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 resp troca');
    const card = await submeter(pipeId, campo.id, 'r3');
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER');
    await concederPapel(pipeId, MEMBERSHIP_EVA_A, 'MEMBER');

    expect(
      (await req('PUT', `/cards/${card}/responsavel`, ANA, { membershipId: MEMBERSHIP_BRUNO_A }))
        .status,
    ).toBe(200);
    // Idempotente: reatribuir a Bruno não adiciona evento.
    expect(
      (await req('PUT', `/cards/${card}/responsavel`, ANA, { membershipId: MEMBERSHIP_BRUNO_A }))
        .status,
    ).toBe(200);
    expect(await tiposDeHistorico(card)).toEqual(['CREATED', 'RESPONSAVEL_ASSIGNED']);

    // Trocar para Eva: CHANGED, e só UM Responsável ativo.
    expect(
      (await req('PUT', `/cards/${card}/responsavel`, ANA, { membershipId: MEMBERSHIP_EVA_A }))
        .status,
    ).toBe(200);
    const ver = (await (await req('GET', `/cards/${card}/responsavel`, ANA)).json()) as RespView;
    expect(ver.membershipId).toBe(MEMBERSHIP_EVA_A);
    expect(await tiposDeHistorico(card)).toEqual([
      'CREATED',
      'RESPONSAVEL_ASSIGNED',
      'RESPONSAVEL_CHANGED',
    ]);
  });

  it('remover é idempotente: 1ª vez removido=true (+evento), 2ª vez removido=false (sem evento)', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 resp remove');
    const card = await submeter(pipeId, campo.id, 'r4');
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER');
    await req('PUT', `/cards/${card}/responsavel`, ANA, { membershipId: MEMBERSHIP_BRUNO_A });

    const del1 = await req('DELETE', `/cards/${card}/responsavel`, ANA);
    expect(del1.status).toBe(200);
    expect((await del1.json()) as { removido: boolean }).toEqual({ removido: true });
    // Sem Responsável, o GET responde 200 com corpo vazio (null) — não há atribuição ativa.
    const verVazio = await req('GET', `/cards/${card}/responsavel`, ANA);
    expect(verVazio.status).toBe(200);
    expect((await verVazio.text()).trim()).toBe('');

    const del2 = await req('DELETE', `/cards/${card}/responsavel`, ANA);
    expect((await del2.json()) as { removido: boolean }).toEqual({ removido: false });
    expect(await tiposDeHistorico(card)).toEqual([
      'CREATED',
      'RESPONSAVEL_ASSIGNED',
      'RESPONSAVEL_REMOVED',
    ]);
  });
});

describe('Concessão direta: Observador × operacional, escopo por Card (SC-2103/2104)', () => {
  it('concessão operacional abre operar SÓ naquele Card; revogar fecha; ambos idempotentes', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 concessao escopo');
    const cardA = await submeter(pipeId, campo.id, 'cA');
    const cardB = await submeter(pipeId, campo.id, 'cB');
    // Bruno é Membro RESTRITO ao próprio: sem concessão, não acessa Card que não é seu.
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER', { restritoAoProprio: true });
    expect((await req('GET', `/cards/${cardA}/responsavel`, BRUNO)).status).toBe(404);

    // Concede acesso operacional a Bruno APENAS no Card A.
    const g = await req('PUT', `/cards/${cardA}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, {
      podeOperar: true,
    });
    expect(g.status).toBe(200);
    const gv = (await g.json()) as GrantView;
    expect(gv).toMatchObject({
      podeLer: true,
      podeOperar: true,
      podeMover: false,
      state: 'ACTIVE',
    });

    expect((await req('GET', `/cards/${cardA}/responsavel`, BRUNO)).status).toBe(200); // opera A
    expect((await req('GET', `/cards/${cardB}/responsavel`, BRUNO)).status).toBe(404); // NÃO vaza p/ B

    // Revoga → volta a 404; revogar de novo é idempotente.
    const r1 = await req('DELETE', `/cards/${cardA}/grants/${MEMBERSHIP_BRUNO_A}`, ANA);
    expect((await r1.json()) as { revogado: boolean }).toEqual({ revogado: true });
    expect((await req('GET', `/cards/${cardA}/responsavel`, BRUNO)).status).toBe(404);
    const r2 = await req('DELETE', `/cards/${cardA}/grants/${MEMBERSHIP_BRUNO_A}`, ANA);
    expect((await r2.json()) as { revogado: boolean }).toEqual({ revogado: false });
  });

  it('Observador (só leitura) recebe 403 ao tentar operar — distinto de 404 (sem acesso nenhum)', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 observador');
    const card = await submeter(pipeId, campo.id, 'obs');
    // Bruno NÃO tem papel no Pipe. Concessão de Observador (podeOperar=false) dá SÓ leitura ao Card.
    const g = await req('PUT', `/cards/${card}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, {
      podeOperar: false,
    });
    expect(g.status).toBe(200);
    expect(((await g.json()) as GrantView).podeOperar).toBe(false);
    // Tem leitura (não é 404), mas não opera (403) — a operação exige operar.
    expect((await req('GET', `/cards/${card}/responsavel`, BRUNO)).status).toBe(403);
  });

  it('podeMover exige podeOperar (400); com ambos, o DADO da capacidade é guardado', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 mover');
    const card = await submeter(pipeId, campo.id, 'mv');
    expect(
      (
        await req('PUT', `/cards/${card}/grants/${MEMBERSHIP_EVA_A}`, ANA, {
          podeOperar: false,
          podeMover: true,
        })
      ).status,
    ).toBe(400);
    const g = await req('PUT', `/cards/${card}/grants/${MEMBERSHIP_EVA_A}`, ANA, {
      podeOperar: true,
      podeMover: true,
    });
    expect(g.status).toBe(200);
    expect(((await g.json()) as GrantView).podeMover).toBe(true);
  });

  it('conceder/listar acesso exige GERENCIAR o Pipe: Membro (operar) → 403; sem acesso → 404', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 concessao authz');
    const card = await submeter(pipeId, campo.id, 'ca');
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER'); // opera, não gerencia
    expect(
      (await req('PUT', `/cards/${card}/grants/${MEMBERSHIP_EVA_A}`, BRUNO, { podeOperar: true }))
        .status,
    ).toBe(403);
    expect((await req('GET', `/cards/${card}/grants`, BRUNO)).status).toBe(403);

    // Num Pipe onde Bruno NÃO tem grant nenhum, listar/conceder → 404 não-enumerante (não vaza existência).
    const outro = await pipeComForm('2.10 concessao authz 404');
    const card2 = await submeter(outro.pipeId, outro.campo.id, 'ca2');
    expect((await req('GET', `/cards/${card2}/grants`, BRUNO)).status).toBe(404);
  });
});

describe('Restrito ao próprio: creator NÃO concede; Responsável atual concede (SC-2105)', () => {
  it('o creator restrito NÃO acessa o Card que criou (autoria ≠ acesso)', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 creator');
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER', { restritoAoProprio: true });
    // Bruno (restrito) submete: vira creator do Card, mas isso não lhe dá acesso ao Card.
    const card = await submeter(pipeId, campo.id, 'cr', BRUNO);
    expect((await req('GET', `/cards/${card}/responsavel`, BRUNO)).status).toBe(404);
  });

  it('ser Responsável atual concede operar mesmo sem concessão direta (branch do "próprio")', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 responsavel branch');
    const card = await submeter(pipeId, campo.id, 'rb'); // criado por ANA
    await concederPapel(pipeId, MEMBERSHIP_BRUNO_A, 'MEMBER', { restritoAoProprio: true });
    // Para tornar Bruno Responsável, ele precisa de acesso prévio: concede-se direta e temporariamente.
    expect(
      (await req('PUT', `/cards/${card}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, { podeOperar: true }))
        .status,
    ).toBe(200);
    expect(
      (await req('PUT', `/cards/${card}/responsavel`, ANA, { membershipId: MEMBERSHIP_BRUNO_A }))
        .status,
    ).toBe(200);
    // Remove a concessão direta: agora o ÚNICO caminho de acesso de Bruno é ser Responsável atual.
    expect((await req('DELETE', `/cards/${card}/grants/${MEMBERSHIP_BRUNO_A}`, ANA)).status).toBe(
      200,
    );
    expect((await req('GET', `/cards/${card}/responsavel`, BRUNO)).status).toBe(200);
  });
});

describe('Não-enumeração e entrada inválida', () => {
  it('Card inexistente → 404; membershipId/cardId não-UUID → 400', async () => {
    const { pipeId, campo } = await pipeComForm('2.10 bordas');
    const card = await submeter(pipeId, campo.id, 'bd');
    expect(
      (await req('GET', `/cards/${'ffffffff-ffff-ffff-ffff-ffffffffffff'}/responsavel`, ANA))
        .status,
    ).toBe(404);
    expect(
      (await req('PUT', `/cards/lixo/responsavel`, ANA, { membershipId: MEMBERSHIP_BRUNO_A }))
        .status,
    ).toBe(400);
    expect((await req('PUT', `/cards/${card}/grants/lixo`, ANA, { podeOperar: true })).status).toBe(
      400,
    );
    expect(
      (await req('PUT', `/cards/${card}/responsavel`, ANA, { membershipId: 'nao-uuid' })).status,
    ).toBe(400);
  });
});
