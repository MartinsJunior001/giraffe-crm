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
 * Submissão PÚBLICA e triagem (Story 2.8) pela porta da frente: HTTP real, banco real. Prova o fluxo completo
 * (habilitar acesso público → submeter sem autenticação → triar) e as propriedades de segurança: resposta só
 * confirmação (sem vazamento), tenant resolvido pelo publicId (nunca do cliente), 404 uniforme para link
 * inválido/revogado, TRIAGE não cria Card / DIRECT cria 1 (origem PUBLIC), idempotência, Arquivo bloqueado e
 * rate limit.
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
interface CampoResp {
  id: string;
}
interface EstadoPublico {
  publicEnabled: boolean;
  publicMode: string;
  publicId: string | null;
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

/** Submissão PÚBLICA: sem cabeçalho de conta (não autenticada). */
const submitPublico = (publicId: string, body: unknown) =>
  req('POST', `/public/forms/${publicId}/submit`, undefined, body);

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
const urlForm = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

/** Pipe com Fase + Campo TEXT publicado. Devolve pipeId e o Campo. */
async function pipePublicado(nome: string): Promise<{ pipeId: string; campo: CampoResp }> {
  const pipeId = await criarPipe(nome);
  await criarFase(pipeId, 'Triagem');
  const campo = await adicionarCampo(pipeId, { label: 'Nome', type: 'TEXT_SHORT' });
  expect((await req('POST', `${urlForm(pipeId)}/publish`, ANA)).status).toBe(201);
  return { pipeId, campo };
}
async function habilitarPublico(pipeId: string, mode: 'TRIAGE' | 'DIRECT'): Promise<string> {
  const res = await req('POST', `${urlForm(pipeId)}/public/enable`, ANA, { mode });
  expect(res.status).toBe(200);
  const est = (await res.json()) as EstadoPublico;
  expect(est.publicEnabled).toBe(true);
  expect(typeof est.publicId).toBe('string');
  return est.publicId!;
}

async function contarCards(pipeId: string): Promise<number> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.card.count({ where: { pipeId } });
}
/** Conta Eventos canônicos CARD_CREATED (Story 4.3) do Pipe — prova CA2 (só a conversão emite). */
async function contarCardCreated(pipeId: string): Promise<number> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.domainEvent.count({ where: { pipeId, eventType: 'CARD_CREATED' } });
}
async function contarSubmissoes(pipeId: string, state?: string): Promise<number> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const form = await db.form.findFirst({
    where: { pipeId, context: 'PIPE_INITIAL' },
    select: { id: true },
  });
  if (!form) return 0;
  return db.submissaoPublica.count({
    where: { formId: form.id, ...(state ? { state: state as never } : {}) },
  });
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

describe('acesso público e submissão (SC-281/282)', () => {
  it('TRIAGE: submeter NÃO cria Card; a resposta é só confirmação (sem dado interno)', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 triagem');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');

    const res = await submitPublico(publicId, { valores: { [campo.id]: 'Externo' } });
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo).toEqual({ ok: true }); // NADA além de confirmação: sem id, sem cardId, sem orgId
    expect(JSON.stringify(corpo)).not.toContain(pipeId);
    expect(JSON.stringify(corpo)).not.toContain(campo.id);

    expect(await contarCards(pipeId)).toBe(0); // triagem não cria Card
    expect(await contarSubmissoes(pipeId, 'PENDING')).toBe(1); // criou a submissão pendente
    // Story 4.3 (CA2): triagem PENDENTE não cria Card ⇒ NÃO emite CARD_CREATED. Só a aprovação emite.
    expect(await contarCardCreated(pipeId)).toBe(0);
  });

  it('DIRECT: submeter cria exatamente 1 Card (origem PUBLIC)', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 direto');
    const publicId = await habilitarPublico(pipeId, 'DIRECT');

    expect((await submitPublico(publicId, { valores: { [campo.id]: 'Ana' } })).status).toBe(201);
    expect(await contarCards(pipeId)).toBe(1);
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const card = await db.card.findFirst({ where: { pipeId }, select: { origin: true } });
    expect(card?.origin).toBe('PUBLIC');
    expect(await contarSubmissoes(pipeId, 'CONVERTED')).toBe(1);
  });

  it('link inválido, revogado ou não habilitado → 404 uniforme', async () => {
    // Formato inválido de publicId → 404.
    expect((await submitPublico('curto', { valores: {} })).status).toBe(404);
    // Formato plausível, inexistente → 404.
    expect((await submitPublico('a'.repeat(32), { valores: {} })).status).toBe(404);

    // Habilitar, revogar e então submeter → 404.
    const { pipeId, campo } = await pipePublicado('2.8 revogado');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');
    expect((await submitPublico(publicId, { valores: { [campo.id]: 'x' } })).status).toBe(201);
    expect((await req('POST', `${urlForm(pipeId)}/public/revoke`, ANA)).status).toBe(200);
    expect((await submitPublico(publicId, { valores: { [campo.id]: 'x' } })).status).toBe(404);
  });

  it('idempotência: mesma idempotencyKey pública não cria 2ª submissão', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 idem');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');
    const corpo = { valores: { [campo.id]: 'x' }, idempotencyKey: 'ext-1' };
    expect((await submitPublico(publicId, corpo)).status).toBe(201);
    expect((await submitPublico(publicId, corpo)).status).toBe(201);
    expect(await contarSubmissoes(pipeId, 'PENDING')).toBe(1); // não duplicou
  });

  it('Arquivo é bloqueado no canal público (AD-28, defesa) → 400 genérico', async () => {
    // A publicação (2.6) já barra FILE (gate AD-28), então um snapshot publicado nunca tem FILE pela via normal.
    // Aqui INJETAMOS um snapshot com FILE (via migrator) para provar a DEFESA do canal público mesmo assim.
    const { pipeId } = await pipePublicado('2.8 arquivo'); // publica v1 (TEXT)
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');

    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const form = await db.form.findFirst({
      where: { pipeId, context: 'PIPE_INITIAL' },
      select: { id: true },
    });
    const fileFieldId = randomUUID();
    const snap = {
      formId: form!.id,
      fields: [{ id: fileFieldId, type: 'FILE', label: 'Anexo', typeConfig: {} }],
    };
    await db.formVersion.create({
      data: { orgId: ORG_A, formId: form!.id, version: 2, snapshot: snap, revision: 'r2-file' },
    });
    await db.form.updateMany({ where: { id: form!.id }, data: { publishedVersion: 2 } });

    const res = await submitPublico(publicId, { valores: { [fileFieldId]: 'algum-arquivo' } });
    expect(res.status).toBe(400);
    expect(await contarSubmissoes(pipeId)).toBe(0);
  });
});

describe('triagem (SC-285/286)', () => {
  it('aprovar cria 1 Card (origem PUBLIC); rejeitar preserva sem Card', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 aprovar');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');
    await submitPublico(publicId, { valores: { [campo.id]: 'Aprovar' } });
    await submitPublico(publicId, { valores: { [campo.id]: 'Rejeitar' }, idempotencyKey: 'r1' });

    const pend = (await (
      await req('GET', `/pipes/${pipeId}/public-submissions`, ANA)
    ).json()) as Ident[];
    expect(pend.length).toBe(2);

    const aprov = await req(
      'POST',
      `/pipes/${pipeId}/public-submissions/${pend[0]!.id}/approve`,
      ANA,
    );
    expect(aprov.status).toBe(201);
    expect(await contarCards(pipeId)).toBe(1);
    // Story 4.3 (CA2): a conversão APROVADA emite CARD_CREATED na MESMA transação do Card.
    expect(await contarCardCreated(pipeId)).toBe(1);

    const rej = await req('POST', `/pipes/${pipeId}/public-submissions/${pend[1]!.id}/reject`, ANA);
    expect(rej.status).toBe(200);
    expect(await contarCards(pipeId)).toBe(1); // rejeitar não cria Card
    expect(await contarSubmissoes(pipeId, 'REJECTED')).toBe(1); // preservada
    // Rejeitar NÃO cria Card ⇒ NÃO emite novo CARD_CREATED (segue 1, do aprovado).
    expect(await contarCardCreated(pipeId)).toBe(1);
  });

  it('aprovar de novo uma submissão já convertida NÃO cria 2º Card (409, idempotente)', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 reaprovar');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');
    await submitPublico(publicId, { valores: { [campo.id]: 'x' } });
    const pend = (await (
      await req('GET', `/pipes/${pipeId}/public-submissions`, ANA)
    ).json()) as Ident[];
    const id = pend[0]!.id;

    expect(
      (await req('POST', `/pipes/${pipeId}/public-submissions/${id}/approve`, ANA)).status,
    ).toBe(201);
    // 2ª aprovação: submissão já CONVERTED → 409, sem 2º Card.
    expect(
      (await req('POST', `/pipes/${pipeId}/public-submissions/${id}/approve`, ANA)).status,
    ).toBe(409);
    expect(await contarCards(pipeId)).toBe(1);
  });
});

describe('concorrência da conversão — nunca 500, nunca 2 Cards (SC-286)', () => {
  it('duas aprovações SIMULTÂNEAS da mesma submissão → 1 Card; a perdedora é 201 idempotente ou 409, nunca 500', async () => {
    // Regressão do Achado 1 (classe Edge-H1 da 2.7): o Card.create colide no @@unique antes da guarda de estado;
    // sem tratar P2002/P2028, a 2ª aprovação estouraria 500. Aqui a corrida é REAL (Promise.all), não sequencial.
    const { pipeId, campo } = await pipePublicado('2.8 aprovar concorrente');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');
    await submitPublico(publicId, { valores: { [campo.id]: 'x' } });
    const pend = (await (
      await req('GET', `/pipes/${pipeId}/public-submissions`, ANA)
    ).json()) as Ident[];
    const id = pend[0]!.id;

    const rotaApprove = `/pipes/${pipeId}/public-submissions/${id}/approve`;
    const [a, b] = await Promise.all([
      req('POST', rotaApprove, ANA),
      req('POST', rotaApprove, ANA),
    ]);
    const status = [a.status, b.status].sort();
    expect(status.every((s) => s === 201 || s === 409)).toBe(true); // nunca 500
    expect(status).toContain(201); // pelo menos uma venceu
    expect(await contarCards(pipeId)).toBe(1); // exatamente 1 Card
  });

  it('duas submissões DIRECT SIMULTÂNEAS com a MESMA idempotencyKey → 1 Card, 1 submissão, nunca 500', async () => {
    // Regressão do Achado 2: dedup por P2002 na submissão + conversão concorrente do mesmo submissaoId.
    const { pipeId, campo } = await pipePublicado('2.8 direto concorrente');
    const publicId = await habilitarPublico(pipeId, 'DIRECT');
    const corpo = { valores: { [campo.id]: 'x' }, idempotencyKey: 'dup-1' };

    const [a, b] = await Promise.all([
      submitPublico(publicId, corpo),
      submitPublico(publicId, corpo),
    ]);
    expect([a.status, b.status].every((s) => s === 201 || s === 409)).toBe(true); // nunca 500
    expect([a.status, b.status]).toContain(201);
    expect(await contarSubmissoes(pipeId)).toBe(1); // dedup: 1 submissão
    expect(await contarCards(pipeId)).toBe(1); // 1 Card
  });
});

interface EstadoConfig extends EstadoPublico {
  publicId: string | null;
}

describe('config: rotação e rate limit (SC-281/288)', () => {
  it('rotacionar troca o publicId: o antigo deixa de resolver (404), o novo resolve (201)', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 rotacao');
    const antigo = await habilitarPublico(pipeId, 'TRIAGE');
    expect((await submitPublico(antigo, { valores: { [campo.id]: 'x' } })).status).toBe(201);

    const est = (await (
      await req('POST', `${urlForm(pipeId)}/public/rotate`, ANA)
    ).json()) as EstadoConfig;
    const novo = est.publicId!;
    expect(typeof novo).toBe('string');
    expect(novo).not.toBe(antigo); // identificador realmente rotacionado

    // O antigo foi revogado (não resolve mais); o novo resolve.
    expect((await submitPublico(antigo, { valores: { [campo.id]: 'x' } })).status).toBe(404);
    expect((await submitPublico(novo, { valores: { [campo.id]: 'x' } })).status).toBe(201);
  });

  it('rate limit: acima do teto por (IP, publicId) → 429 (baseline antiabuso, fail-closed)', async () => {
    const { pipeId, campo } = await pipePublicado('2.8 rate limit');
    const publicId = await habilitarPublico(pipeId, 'TRIAGE');
    const corpo = { valores: { [campo.id]: 'x' } };

    // TETO = 20 por janela: as 20 primeiras passam (201), a 21ª é barrada (429). Todas do mesmo IP+publicId.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await submitPublico(publicId, corpo)).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true); // as 20 primeiras
    expect(statuses[20]).toBe(429); // a 21ª estoura o teto
  });
});
