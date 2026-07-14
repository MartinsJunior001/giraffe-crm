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
 * Submissão interna do Formulário inicial (Story 2.7) pela porta da frente: HTTP real, banco real. Ana é ADMIN
 * da Org A. Prova: submeter cria um Card na 1ª Fase ativa com a versão publicada congelada; idempotência (retry
 * = mesmo Card); validação dos valores (Campo desconhecido/tipo errado → 400); gate (não publicado → 409); e
 * que o Formulário inicial só CRIA (nunca preenche existente).
 */

const ANA = '11111111-1111-1111-1111-111111111111';
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
interface CampoResp {
  id: string;
  typeConfig: { options?: { id: string; label: string }[] };
}
interface CardResp {
  id: string;
  pipeId: string;
  phaseId: string;
  formId: string;
  formVersionId: string;
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

async function adicionarCampo(pipeId: string, corpo: unknown): Promise<CampoResp> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, corpo);
  expect(res.status).toBe(201);
  return (await res.json()) as CampoResp;
}

const url = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** Conta linhas reais no banco (via migrator, contexto Org A) — para provar atomicidade e a trilha AD-13. */
async function contarCards(formId: string): Promise<number> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.card.count({ where: { formId } });
}
async function contarEventos(cardId: string, type: string): Promise<number> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.cardHistory.count({ where: { cardId, type } });
}

/** Pipe com 1 Fase ativa + 1 Campo TEXT publicado. Devolve pipeId, phaseId e o Campo. */
async function pipePublicado(
  nome: string,
): Promise<{ pipeId: string; phaseId: string; campo: CampoResp }> {
  const pipeId = await criarPipe(nome);
  const phaseId = await criarFase(pipeId, 'Triagem');
  const campo = await adicionarCampo(pipeId, { label: 'Nome', type: 'TEXT_SHORT' });
  expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);
  return { pipeId, phaseId, campo };
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
}, 30000); // o boot do Nest concorre com a compilação a frio; 10s default é apertado

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(
      migrator,
      { orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      semLog,
    );
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('submeter cria Card (SC-271)', () => {
  it('cria um Card na 1ª Fase ativa, com a versão publicada e os valores validados', async () => {
    const { pipeId, phaseId, campo } = await pipePublicado('2.7 submeter');
    const res = await req('POST', `${url(pipeId)}/submit`, ANA, {
      idempotencyKey: 'k-1',
      valores: { [campo.id]: 'Ana' },
    });
    expect(res.status).toBe(201);
    const card = (await res.json()) as CardResp;
    expect(card.pipeId).toBe(pipeId);
    expect(card.phaseId).toBe(phaseId); // nasce na 1ª Fase ativa
    expect(typeof card.formVersionId).toBe('string'); // referencia a versão congelada
    expect(card.valores).toEqual({ [campo.id]: 'Ana' });
    expect(await contarEventos(card.id, 'CREATED')).toBe(1); // AD-13: evento na MESMA transação do Card
  });

  it('idempotência: retry com a MESMA chave devolve o MESMO Card; chave nova cria outro', async () => {
    const { pipeId, campo } = await pipePublicado('2.7 idempotência');
    const corpo = { idempotencyKey: 'k-repetida', valores: { [campo.id]: 'X' } };
    const c1 = (await (await req('POST', `${url(pipeId)}/submit`, ANA, corpo)).json()) as CardResp;
    const c2 = (await (await req('POST', `${url(pipeId)}/submit`, ANA, corpo)).json()) as CardResp;
    expect(c2.id).toBe(c1.id); // não duplicou

    const c3 = (await (
      await req('POST', `${url(pipeId)}/submit`, ANA, {
        idempotencyKey: 'k-outra',
        valores: { [campo.id]: 'Y' },
      })
    ).json()) as CardResp;
    expect(c3.id).not.toBe(c1.id); // chave diferente = Card diferente
  });

  it('valida os valores: Campo desconhecido e tipo errado → 400', async () => {
    const { pipeId, campo } = await pipePublicado('2.7 validação');
    expect(
      (
        await req('POST', `${url(pipeId)}/submit`, ANA, {
          idempotencyKey: 'k-desc',
          valores: { '00000000-0000-0000-0000-000000000000': 'x' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('POST', `${url(pipeId)}/submit`, ANA, {
          idempotencyKey: 'k-tipo',
          valores: { [campo.id]: 123 }, // TEXT espera string
        })
      ).status,
    ).toBe(400);
  });

  it('Seleção: só um id de opção existente é aceito (por id, nunca rótulo)', async () => {
    const pipeId = await criarPipe('2.7 seleção');
    await criarFase(pipeId, 'Triagem');
    const campo = await adicionarCampo(pipeId, {
      label: 'Prioridade',
      type: 'SELECT_SINGLE',
      options: ['Alta', 'Baixa'],
    });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);
    const opId = campo.typeConfig.options![0]!.id;

    expect(
      (
        await req('POST', `${url(pipeId)}/submit`, ANA, {
          idempotencyKey: 'k-sel-ok',
          valores: { [campo.id]: opId },
        })
      ).status,
    ).toBe(201);
    // o rótulo não é aceito no lugar do id
    expect(
      (
        await req('POST', `${url(pipeId)}/submit`, ANA, {
          idempotencyKey: 'k-sel-bad',
          valores: { [campo.id]: 'Alta' },
        })
      ).status,
    ).toBe(400);
  });
});

describe('gate de publicação (SC-274)', () => {
  it('Formulário inicial NÃO publicado não recebe submissão → 409', async () => {
    const pipeId = await criarPipe('2.7 não publicado');
    await criarFase(pipeId, 'Triagem');
    await adicionarCampo(pipeId, { label: 'Nome', type: 'TEXT_SHORT' }); // materializa, mas não publica
    expect(
      (await req('POST', `${url(pipeId)}/submit`, ANA, { idempotencyKey: 'k-np', valores: {} }))
        .status,
    ).toBe(409);
  });

  it('Formulário inicial inexistente → 404; idempotencyKey ausente → 400', async () => {
    const pipeId = await criarPipe('2.7 sem form');
    expect(
      (await req('POST', `${url(pipeId)}/submit`, ANA, { idempotencyKey: 'k', valores: {} }))
        .status,
    ).toBe(404);
    const { pipeId: p2 } = await pipePublicado('2.7 sem chave');
    expect((await req('POST', `${url(p2)}/submit`, ANA, { valores: {} })).status).toBe(400);
  });
});

describe('definição congelada — AD-12 (SC-271)', () => {
  it('republicar NÃO muda o Card já criado; uma submissão nova usa a versão publicada corrente', async () => {
    const pipeId = await criarPipe('2.7 congelamento');
    await criarFase(pipeId, 'Triagem');
    const campoA = await adicionarCampo(pipeId, { label: 'A', type: 'TEXT_SHORT' });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201); // v1: só A

    const card1 = (await (
      await req('POST', `${url(pipeId)}/submit`, ANA, {
        idempotencyKey: 'freeze',
        valores: { [campoA.id]: 'x' },
      })
    ).json()) as CardResp;
    const fv1 = card1.formVersionId;

    // Evolui o rascunho e REPUBLICA: v2 ganha o Campo B.
    const campoB = await adicionarCampo(pipeId, { label: 'B', type: 'TEXT_SHORT' });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201); // v2: A + B

    // Re-submeter a MESMA chave devolve o Card já criado, com a versão v1 INALTERADA (congelado).
    const card1bis = (await (
      await req('POST', `${url(pipeId)}/submit`, ANA, {
        idempotencyKey: 'freeze',
        valores: { [campoA.id]: 'x' },
      })
    ).json()) as CardResp;
    expect(card1bis.id).toBe(card1.id);
    expect(card1bis.formVersionId).toBe(fv1); // NÃO migrou para v2

    // Uma submissão NOVA usa a versão corrente (v2): só ela aceita um valor para o Campo B (inexistente em v1).
    const res2 = await req('POST', `${url(pipeId)}/submit`, ANA, {
      idempotencyKey: 'fresh',
      valores: { [campoB.id]: 'y' },
    });
    expect(res2.status).toBe(201);
    const card2 = (await res2.json()) as CardResp;
    expect(card2.formVersionId).not.toBe(fv1); // referencia v2, a publicada corrente
  });
});

describe('1ª Fase ativa entre várias (SC-271)', () => {
  it('o Card nasce na Fase de MENOR position (a 1ª ativa), não em qualquer/última', async () => {
    const pipeId = await criarPipe('2.7 multi-fase');
    const faseA = await criarFase(pipeId, 'Primeira'); // position 1 (append ao final da ordem ativa)
    const faseB = await criarFase(pipeId, 'Segunda'); // position 2
    const campo = await adicionarCampo(pipeId, { label: 'Nome', type: 'TEXT_SHORT' });
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);

    const card = (await (
      await req('POST', `${url(pipeId)}/submit`, ANA, {
        idempotencyKey: 'k-mf',
        valores: { [campo.id]: 'Ana' },
      })
    ).json()) as CardResp;
    expect([faseA, faseB]).toContain(card.phaseId);
    expect(card.phaseId).toBe(faseA); // a 1ª ativa (menor position), não a última — exercita o orderBy
  });
});

describe('concorrência de idempotência — não duplica (SC-272, H1)', () => {
  it('N submissões simultâneas da MESMA chave = 1 Card + 1 evento; toda resposta com corpo traz o mesmo id', async () => {
    const { pipeId, campo } = await pipePublicado('2.7 concorrência');
    const corpo = { idempotencyKey: 'k-corrida', valores: { [campo.id]: 'v' } };

    // Dispara em paralelo — a corrida real (INSERT × INSERT no índice único), não retries sequenciais.
    const respostas = await Promise.all(
      Array.from({ length: 6 }, () => req('POST', `${url(pipeId)}/submit`, ANA, corpo)),
    );
    const status = respostas.map((r) => r.status);
    // Nenhum 500: sob contenção, ou 201 (Card, novo ou já existente) ou 409 (repita) — o fix do H1.
    expect(status.every((s) => s === 201 || s === 409)).toBe(true);

    const corpos = (await Promise.all(
      respostas.filter((r) => r.status === 201).map((r) => r.json()),
    )) as CardResp[];
    expect(corpos.length).toBeGreaterThan(0);
    const ids = new Set(corpos.map((c) => c.id));
    expect(ids.size).toBe(1); // todas as respostas bem-sucedidas apontam o MESMO Card

    const cardId = corpos[0]!.id;
    const formId = corpos[0]!.formId;
    expect(await contarCards(formId)).toBe(1); // 1 submissão lógica ⇒ 1 Card (sem duplicata)
    expect(await contarEventos(cardId, 'CREATED')).toBe(1); // atomicidade: 1 Card ⟺ 1 evento (AD-13)
  });
});
