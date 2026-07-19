import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/kernel/db/prisma.service';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Vínculo Card↔Registro N–N (Story 3.9) pela porta da frente: HTTP real, banco real. Prova o contrato do dono:
 * N–N, idempotência, desvínculo determinístico, autz DUPLA (operar Card + operar Database), o vínculo NÃO concede
 * acesso, cross-tenant 404, eventos LINKED/UNLINKED nos DOIS históricos com o mesmo correlationId, projeção sem
 * vazamento. Atores descartáveis (Org C).
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN só na Org A (cross-tenant)
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const adminConta = randomUUID();
const adminMemb = randomUUID();
// Usuário que OPERA o Card (Membro do Pipe) mas NÃO tem acesso ao Database do Registro.
const soCardConta = randomUUID();
const soCardMemb = randomUUID();

let pipeId = '';
let dbId = '';
let cardId = '';
let card2Id = '';
let recordId = '';
let record2Id = '';

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
interface Vinculo {
  id: string;
  cardId: string;
  recordId: string;
  state: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
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

function db() {
  return withTenantContext(migrator, { orgId: ORG_C }, semLog);
}

/** Cria um Card no Pipe (submete o Formulário inicial publicado). */
async function criarCard(chave: string): Promise<string> {
  const sub = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, adminConta, {
    idempotencyKey: chave,
    valores: {},
  });
  expect(sub.status).toBe(201);
  return ((await sub.json()) as Ident).id;
}
/** Cria um Registro no Database. */
async function criarRegistro(chave: string): Promise<string> {
  const r = await req('POST', `/databases/${dbId}/records`, adminConta, {
    idempotencyKey: chave,
    valores: {},
  });
  expect(r.status).toBe(201);
  return ((await r.json()) as Ident).id;
}

async function tiposHistoricoCard(
  id: string,
): Promise<{ type: string; correlationId: string | null }[]> {
  return db().cardHistory.findMany({
    where: { cardId: id },
    select: { type: true, correlationId: true },
    orderBy: { createdAt: 'asc' },
  });
}
async function tiposHistoricoRecord(
  id: string,
): Promise<{ type: string; correlationId: string | null }[]> {
  return db().recordHistory.findMany({
    where: { recordId: id },
    select: { type: true, correlationId: true },
    orderBy: { createdAt: 'asc' },
  });
}
async function linksAtivos(where: object): Promise<number> {
  return db().cardRecordLink.count({ where: { ...where, state: 'ACTIVE' } });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `crl-admin-${adminConta}@x.test`, name: 'Admin' },
      { id: soCardConta, email: `crl-socard-${soCardConta}@x.test`, name: 'Só Card' },
    ],
  });
  const dbC = db();
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: soCardMemb, accountId: soCardConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  // Pipe + Fase + Form inicial publicado (Admin da Org opera qualquer Pipe).
  pipeId = (
    (await (await req('POST', '/pipes', adminConta, { name: '3.9 links' })).json()) as Ident
  ).id;
  await req('POST', `/pipes/${pipeId}/phases`, adminConta, { name: 'A Fazer' });
  await req('POST', `/pipes/${pipeId}/forms/initial/fields`, adminConta, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  await req('POST', `/pipes/${pipeId}/forms/initial/publish`, adminConta);

  // Database + Form publicado.
  dbId = randomUUID();
  await dbC.database.create({ data: { id: dbId, orgId: ORG_C, name: '3.9 base' } });
  await req('POST', `/databases/${dbId}/form/fields`, adminConta, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  await req('POST', `/databases/${dbId}/form/publish`, adminConta);

  // Concede ao "só Card" o poder de OPERAR o Pipe (MEMBER do Pipe), sem tocar o Database.
  await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
    membershipId: soCardMemb,
    role: 'MEMBER',
  });

  cardId = await criarCard('c1');
  card2Id = await criarCard('c2');
  recordId = await criarRegistro('r1');
  record2Id = await criarRegistro('r2');
}, 60000);

afterAll(async () => {
  if (migrator) {
    const dbC = db();
    await dbC.cardRecordLink
      .deleteMany({ where: { orgId: ORG_C, cardId: { in: [cardId, card2Id] } } })
      .catch(() => {});
    await dbC.database.deleteMany({ where: { id: dbId } }).catch(() => {});
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
    await dbC.membership
      .deleteMany({ where: { id: { in: [adminMemb, soCardMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [adminConta, soCardConta] } } })
      .catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

const linkRota = (c: string) => `/cards/${c}/record-links`;

describe('N–N, idempotência, desvínculo (AC1–AC8)', () => {
  it('vincula (201); Card com vários Registros; Registro em vários Cards; par não duplica (idempotente)', async () => {
    const v1 = await req('POST', linkRota(cardId), adminConta, { recordId });
    expect(v1.status).toBe(201);
    const vinculo = (await v1.json()) as Vinculo;
    expect(vinculo.state).toBe('ACTIVE');
    expect(JSON.stringify(vinculo)).not.toContain(ORG_C); // orgId/correlationId não vazam
    expect(vinculo).not.toHaveProperty('correlationId');

    // Card com múltiplos Registros.
    expect((await req('POST', linkRota(cardId), adminConta, { recordId: record2Id })).status).toBe(
      201,
    );
    // Registro em múltiplos Cards.
    expect((await req('POST', linkRota(card2Id), adminConta, { recordId })).status).toBe(201);

    // Par já vinculado → idempotente: devolve o MESMO vínculo, sem 2º ativo.
    const dup = await req('POST', linkRota(cardId), adminConta, { recordId });
    expect(dup.status).toBe(201);
    expect(((await dup.json()) as Vinculo).id).toBe(vinculo.id);
    expect(await linksAtivos({ cardId, recordId })).toBe(1);
  });

  it('lista por Card e por Registro (só referências)', async () => {
    const porCard = (await (await req('GET', linkRota(cardId), adminConta)).json()) as Vinculo[];
    expect(porCard.map((v) => v.recordId).sort()).toEqual([recordId, record2Id].sort());
    const porRec = (await (
      await req('GET', `/databases/${dbId}/records/${recordId}/card-links`, adminConta)
    ).json()) as Vinculo[];
    expect(porRec.map((v) => v.cardId).sort()).toEqual([cardId, card2Id].sort());
  });

  it('desvincula (removido:true); repetir é idempotente (removido:false); re-vincular cria novo ativo', async () => {
    const rm = await req('DELETE', `${linkRota(cardId)}/${record2Id}`, adminConta);
    expect(rm.status).toBe(200);
    expect((await rm.json()) as { removido: boolean }).toEqual({ removido: true });
    expect(await linksAtivos({ cardId, recordId: record2Id })).toBe(0);

    // Idempotente: desvincular de novo → removido:false, determinístico.
    const rm2 = await req('DELETE', `${linkRota(cardId)}/${record2Id}`, adminConta);
    expect(rm2.status).toBe(200);
    expect((await rm2.json()) as { removido: boolean }).toEqual({ removido: false });

    // Re-vincular o mesmo par → novo vínculo ATIVO (o índice parcial liberou o slot).
    expect((await req('POST', linkRota(cardId), adminConta, { recordId: record2Id })).status).toBe(
      201,
    );
    expect(await linksAtivos({ cardId, recordId: record2Id })).toBe(1);
  });
});

describe('eventos correlacionados nos dois históricos (AC12/13)', () => {
  it('LINKED aparece no Histórico do Card E do Registro com o MESMO correlationId', async () => {
    const c = await criarCard('c-evt');
    const r = await criarRegistro('r-evt');
    expect((await req('POST', linkRota(c), adminConta, { recordId: r })).status).toBe(201);

    const evC = (await tiposHistoricoCard(c)).find((e) => e.type === 'LINKED');
    const evR = (await tiposHistoricoRecord(r)).find((e) => e.type === 'LINKED');
    expect(evC).toBeDefined();
    expect(evR).toBeDefined();
    expect(evC!.correlationId).not.toBeNull();
    expect(evC!.correlationId).toBe(evR!.correlationId); // mesmo correlationId nos dois lados

    // UNLINKED idem.
    await req('DELETE', `${linkRota(c)}/${r}`, adminConta);
    const unC = (await tiposHistoricoCard(c)).find((e) => e.type === 'UNLINKED');
    const unR = (await tiposHistoricoRecord(r)).find((e) => e.type === 'UNLINKED');
    expect(unC?.correlationId).toBe(unR?.correlationId);
    // A criação do Card (CREATED) permanece — append-only.
    expect((await tiposHistoricoCard(c)).map((e) => e.type)).toContain('CREATED');
  });
});

describe('autorização DUPLA — o vínculo não concede acesso (AC10/11/14)', () => {
  it('quem opera só o Card (sem acesso ao Database) NÃO vincula → 404; e não lê o Registro nem seu histórico', async () => {
    // "só Card" opera o Pipe (MEMBER concedido) mas não tem grant no Database → vincular exige os DOIS → 404.
    expect((await req('POST', linkRota(cardId), soCardConta, { recordId })).status).toBe(404);
    // E não acessa o Registro nem o Histórico do Registro (autz independente).
    expect((await req('GET', `/databases/${dbId}/records/${recordId}`, soCardConta)).status).toBe(
      404,
    );
    expect(
      (await req('GET', `/databases/${dbId}/records/${recordId}/history`, soCardConta)).status,
    ).toBe(404);
    // Mas lista os vínculos DO CARD (tem ler o Card) — só a referência recordId, sem conteúdo do Registro.
    const r = await req('GET', linkRota(cardId), soCardConta);
    expect(r.status).toBe(200);
  });

  it('cross-tenant (Ana/Org A) → 404 não-enumerante; sem principal → 401', async () => {
    expect((await req('POST', linkRota(cardId), ANA, { recordId })).status).toBe(404);
    expect((await req('POST', linkRota(cardId), undefined, { recordId })).status).toBe(401);
    // Registro de outra Org (uuid aleatório, invisível sob RLS) → 404.
    expect(
      (await req('POST', linkRota(cardId), adminConta, { recordId: randomUUID() })).status,
    ).toBe(404);
  });
});

describe('concorrência e fronteira do banco (AC6/9/16/19)', () => {
  it('vínculos concorrentes do MESMO par não criam duplicata (índice parcial + P2002→idempotente)', async () => {
    const c = await criarCard('c-conc');
    const r = await criarRegistro('r-conc');
    const resultados = await Promise.all(
      Array.from({ length: 6 }, () => req('POST', linkRota(c), adminConta, { recordId: r })),
    );
    // Nenhum 500; todos idempotentes/ok (201) ou 409 sob contenção — nunca erro interno.
    for (const res of resultados) expect([201, 409]).toContain(res.status);
    // Exatamente UM vínculo ATIVO do par (o banco impôs a unicidade, não a aplicação).
    expect(await linksAtivos({ cardId: c, recordId: r })).toBe(1);
  });

  it('GRANT: o runtime (giraffe_app) NÃO tem DELETE em CardRecordLink; RLS isola cross-tenant', async () => {
    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl).toBeTruthy();
    const appClient = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      const appC = withTenantContext(appClient, { orgId: ORG_C }, semLog);
      // Desvincular é state=REMOVED; DELETE é negado pelo GRANT (fase vermelha — sem exclusão física).
      await expect(appC.cardRecordLink.deleteMany({ where: { cardId } })).rejects.toThrow(
        /permission denied/i,
      );
      // RLS: o mesmo runtime, sob contexto de OUTRA Org, não enxerga os vínculos da Org C.
      const appA = withTenantContext(
        appClient,
        { orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        semLog,
      );
      expect(await appA.cardRecordLink.count({ where: { cardId } })).toBe(0);
    } finally {
      await appClient.$disconnect();
    }
  });
});

describe('atomicidade — rollback total quando a escrita de um evento falha (contrato #20 / teste obrigatório #15)', () => {
  it('falha na 2ª escrita de história desfaz o vínculo E o 1º evento (mesma fronteira transacional)', async () => {
    // Card e Registro DEDICADOS (sem LINKED prévio) — a asserção de "nada persistiu" fica inequívoca.
    const cardAtom = await criarCard('atom-c');
    const recordAtom = await criarRegistro('atom-r');

    // Injeta falha DETERMINÍSTICA na escrita do RecordHistory (a 2ª história), DENTRO da MESMA tx
    // interativa do serviço — sem tocar o código de produção. O `tx` real é preservado (definirContextoOrg,
    // cardRecordLink.create, cardHistory.create seguem funcionando); só `recordHistory.create` passa a rejeitar.
    const prisma = app.get(PrismaService);
    const original = prisma.$transaction.bind(prisma) as (...a: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation(((
      arg: unknown,
      opts: unknown,
    ) => {
      if (typeof arg !== 'function') return original(arg, opts);
      return original((tx: Record<string, unknown>) => {
        const txProxy = new Proxy(tx, {
          get(alvo, prop) {
            if (prop === 'recordHistory') {
              return new Proxy(alvo.recordHistory as object, {
                get(rt, rp) {
                  if (rp === 'create')
                    return () => Promise.reject(new Error('falha injetada: RecordHistory.create'));
                  return (rt as Record<string, unknown>)[rp as string];
                },
              });
            }
            return (alvo as Record<string, unknown>)[prop as string];
          },
        });
        return (arg as (t: unknown) => Promise<unknown>)(txProxy);
      }, opts);
    }) as typeof prisma.$transaction);

    try {
      const res = await req('POST', linkRota(cardAtom), adminConta, { recordId: recordAtom });
      // A falha não é P2002/P2028 (conflito) → o serviço a propaga → 5xx (não 201, não 409 idempotente).
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      spy.mockRestore();
    }

    // ROLLBACK TOTAL: nada da operação persistiu — nem vínculo, nem UM dos históricos (sem evento órfão,
    // sem estado divergente entre Card e Registro).
    expect(await linksAtivos({ cardId: cardAtom, recordId: recordAtom })).toBe(0);
    expect(await db().cardRecordLink.count({ where: { cardId: cardAtom } })).toBe(0);
    const chLinked = await db().cardHistory.count({ where: { cardId: cardAtom, type: 'LINKED' } });
    const rhLinked = await db().recordHistory.count({
      where: { recordId: recordAtom, type: 'LINKED' },
    });
    expect(chLinked).toBe(0); // o 1º evento (CardHistory) foi desfeito junto com o vínculo
    expect(rhLinked).toBe(0); // o 2º nunca chegou a persistir
    expect(chLinked).toBe(rhLinked); // consistência: nenhum lado ficou com LINKED órfão

    // CONTROLE: sem a falha, o MESMO par vincula normalmente (prova que o rollback foi causado pela falha
    // injetada, não por indisponibilidade do par) — e os DOIS históricos ganham o LINKED.
    const ok = await req('POST', linkRota(cardAtom), adminConta, { recordId: recordAtom });
    expect(ok.status).toBe(201);
    expect(await linksAtivos({ cardId: cardAtom, recordId: recordAtom })).toBe(1);
    expect((await tiposHistoricoCard(cardAtom)).some((e) => e.type === 'LINKED')).toBe(true);
    expect((await tiposHistoricoRecord(recordAtom)).some((e) => e.type === 'LINKED')).toBe(true);
  });
});
