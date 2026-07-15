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
 * Formulário de Fase e bloqueio de transição (Story 2.15) pela porta da frente: HTTP real, banco real. Prova:
 *   CA1 — requisito de ENTRADA com Campo obrigatório faltando bloqueia a movimentação (409); o Card permanece na
 *         origem, sem `MOVED`, e NADA é persistido em `CardPhaseValues` (sem movimentação parcial — CA2);
 *   CA2 — requisito de entrada satisfeito: os valores são persistidos na MESMA transação da movimentação (200 +
 *         `phaseId` novo + `MOVED` + valores legíveis na Fase destino);
 *   CA3 — requisito de SAÍDA valida os valores JÁ PERSISTIDOS da Fase de origem ANTES de mover (409 quando faltam;
 *         200 depois de salvá-los);
 *   CA4 — salvar valores (`POST .../values`) NÃO move o Card; a correção posterior gera evento antes/depois
 *         (`PHASE_VALUES_SAVED` → `PHASE_VALUES_CORRECTED`) e os valores persistem;
 *   e a concorrência não devolve 500.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
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
interface MoveView {
  id: string;
  phaseId: string;
  lifecycleState: string;
}
interface ValoresView {
  cardId: string;
  phaseId: string;
  valores: Record<string, unknown>;
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

/** Pipe com DUAS Fases ativas + Formulário inicial publicado e um Card submetido (nasce na 1ª Fase = origem). */
async function pipeComCardEFases(
  nome: string,
): Promise<{ pipeId: string; cardId: string; faseOrigemId: string; faseDestinoId: string }> {
  const pipeId = await criarPipe(nome);
  const faseOrigemId = await criarFase(pipeId, 'A Fazer');
  const faseDestinoId = await criarFase(pipeId, 'Fazendo');
  const campoRes = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  expect(campoRes.status).toBe(201);
  const campo = (await campoRes.json()) as Ident;
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);
  const sub = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: `${nome}-1`,
    valores: { [campo.id]: 'x' },
  });
  expect(sub.status).toBe(201);
  return { pipeId, cardId: ((await sub.json()) as Ident).id, faseOrigemId, faseDestinoId };
}

/**
 * Configura o Formulário de Fase da `phaseId`: adiciona 1 Campo TEXT_SHORT obrigatório, seta o MODO (entrada/saída)
 * e publica. Devolve o `fieldId` (para montar `valoresDeFase`).
 */
async function configurarFormularioDeFase(
  pipeId: string,
  phaseId: string,
  modo: { requisitoEntrada?: boolean; requisitoSaida?: boolean },
): Promise<string> {
  const campoRes = await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields`, ANA, {
    label: 'Justificativa',
    type: 'TEXT_SHORT',
  });
  expect(campoRes.status).toBe(201);
  const fieldId = ((await campoRes.json()) as Ident).id;
  const pat = await req('PATCH', `/pipes/${pipeId}/phases/${phaseId}/form/fields/${fieldId}`, ANA, {
    required: true,
  });
  expect(pat.status).toBe(200);
  const modoRes = await req('PATCH', `/pipes/${pipeId}/phases/${phaseId}/form/mode`, ANA, modo);
  expect(modoRes.status).toBe(200);
  expect((await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/publish`, ANA)).status).toBe(
    201,
  );
  return fieldId;
}

async function tiposDeHistorico(cardId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const eventos = await db.cardHistory.findMany({
    where: { cardId },
    orderBy: { createdAt: 'asc' },
    select: { type: true },
  });
  return eventos.map((e) => e.type);
}

async function faseAtual(cardId: string): Promise<string> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const card = await db.card.findUniqueOrThrow({
    where: { id: cardId },
    select: { phaseId: true },
  });
  return card.phaseId;
}

async function lerValores(cardId: string, phaseId: string): Promise<Record<string, unknown>> {
  const res = await req('GET', `/cards/${cardId}/phases/${phaseId}/values`, ANA);
  expect(res.status).toBe(200);
  return ((await res.json()) as ValoresView).valores;
}

const mover = (cardId: string, body: unknown) => req('POST', `/cards/${cardId}/move`, ANA, body);

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

describe('CA1: requisito de ENTRADA com obrigatório faltando bloqueia — sem movimentação parcial', () => {
  it('mover sem os valoresDeFase obrigatórios → 409; Card na origem; sem MOVED; nada persistido', async () => {
    const { pipeId, cardId, faseOrigemId, faseDestinoId } = await pipeComCardEFases('2.15 ca1');
    await configurarFormularioDeFase(pipeId, faseDestinoId, { requisitoEntrada: true });

    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(res.status).toBe(409);

    expect(await faseAtual(cardId)).toBe(faseOrigemId); // permanece na origem
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED']); // sem MOVED
    expect(await lerValores(cardId, faseDestinoId)).toEqual({}); // nada gravado em CardPhaseValues
  });
});

describe('CA2: requisito de ENTRADA satisfeito persiste os valores na MESMA transação', () => {
  it('mover com valoresDeFase válidos → 200; phaseId destino; MOVED; valores legíveis na destino', async () => {
    const { pipeId, cardId, faseDestinoId } = await pipeComCardEFases('2.15 ca2');
    const fieldId = await configurarFormularioDeFase(pipeId, faseDestinoId, {
      requisitoEntrada: true,
    });

    const res = await mover(cardId, {
      destinoPhaseId: faseDestinoId,
      confirmado: true,
      valoresDeFase: { [fieldId]: 'motivo do avanço' },
    });
    expect(res.status).toBe(200);
    const v = (await res.json()) as MoveView;
    expect(v.phaseId).toBe(faseDestinoId);
    expect(JSON.stringify(v)).not.toContain(ORG_A); // orgId fora da fronteira

    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'MOVED']);
    expect(await lerValores(cardId, faseDestinoId)).toEqual({ [fieldId]: 'motivo do avanço' });
  });

  it('valoresDeFase com tipo inválido (não-string em TEXT_SHORT) → 400, Card não se move', async () => {
    const { pipeId, cardId, faseOrigemId, faseDestinoId } =
      await pipeComCardEFases('2.15 ca2 tipo');
    const fieldId = await configurarFormularioDeFase(pipeId, faseDestinoId, {
      requisitoEntrada: true,
    });
    const res = await mover(cardId, {
      destinoPhaseId: faseDestinoId,
      confirmado: true,
      valoresDeFase: { [fieldId]: 123 },
    });
    expect(res.status).toBe(400);
    expect(await faseAtual(cardId)).toBe(faseOrigemId);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED']);
  });
});

describe('CA3: requisito de SAÍDA valida os valores persistidos da origem antes de mover', () => {
  it('sem valores de saída salvos → 409; após salvá-los → move 200', async () => {
    const { pipeId, cardId, faseOrigemId, faseDestinoId } = await pipeComCardEFases('2.15 ca3');
    const fieldId = await configurarFormularioDeFase(pipeId, faseOrigemId, {
      requisitoSaida: true,
    });

    // Origem exige saída, mas nada foi salvo ainda → bloqueio.
    const bloqueado = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(bloqueado.status).toBe(409);
    expect(await faseAtual(cardId)).toBe(faseOrigemId);

    // Salva os valores de saída na Fase de origem (não move — CA4).
    const salvar = await req('POST', `/cards/${cardId}/phases/${faseOrigemId}/values`, ANA, {
      valores: { [fieldId]: 'concluído' },
    });
    expect(salvar.status).toBe(200);
    expect(await faseAtual(cardId)).toBe(faseOrigemId); // salvar NÃO moveu

    // Agora a saída está satisfeita → move.
    const ok = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as MoveView).phaseId).toBe(faseDestinoId);
  });
});

describe('CA4: salvar não move; correção gera evento antes/depois; valores persistem', () => {
  it('POST values grava sem transição; nova gravação vira PHASE_VALUES_CORRECTED; valor corrente é o último', async () => {
    const { pipeId, cardId, faseOrigemId } = await pipeComCardEFases('2.15 ca4');
    const fieldId = await configurarFormularioDeFase(pipeId, faseOrigemId, {
      requisitoSaida: true,
    });

    const salvar1 = await req('POST', `/cards/${cardId}/phases/${faseOrigemId}/values`, ANA, {
      valores: { [fieldId]: 'primeiro' },
    });
    expect(salvar1.status).toBe(200);
    expect(await faseAtual(cardId)).toBe(faseOrigemId); // sem movimentação
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'PHASE_VALUES_SAVED']);

    const salvar2 = await req('POST', `/cards/${cardId}/phases/${faseOrigemId}/values`, ANA, {
      valores: { [fieldId]: 'corrigido' },
    });
    expect(salvar2.status).toBe(200);
    expect(await tiposDeHistorico(cardId)).toEqual([
      'CREATED',
      'PHASE_VALUES_SAVED',
      'PHASE_VALUES_CORRECTED', // antes/depois: a linha anterior é o "antes", a nova o "depois"
    ]);
    expect(await lerValores(cardId, faseOrigemId)).toEqual({ [fieldId]: 'corrigido' }); // corrente = último
  });
});

describe('concorrência: dois moves com entrada válida — nunca 500, um só MOVED', () => {
  it('dois moves concorrentes para o mesmo destino → sem 500; exatamente 1 MOVED', async () => {
    const { pipeId, cardId, faseDestinoId } = await pipeComCardEFases('2.15 corrida');
    const fieldId = await configurarFormularioDeFase(pipeId, faseDestinoId, {
      requisitoEntrada: true,
    });
    const corpo = {
      destinoPhaseId: faseDestinoId,
      confirmado: true,
      valoresDeFase: { [fieldId]: 'ok' },
    };
    const [a, b] = await Promise.all([mover(cardId, corpo), mover(cardId, corpo)]);
    const status = [a.status, b.status];
    expect(status).not.toContain(500);
    expect(status.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(status.every((s) => s === 200 || s === 409)).toBe(true);
    expect((await tiposDeHistorico(cardId)).filter((t) => t === 'MOVED')).toHaveLength(1);
  });
});
