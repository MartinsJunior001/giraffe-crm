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
 * Gestão da Automação pela porta da frente: HTTP real, `AppModule` de produção, banco real (Story 4.2).
 *
 * Prova os ACs de D4.3: transições idempotentes/atômicas com estado inválido → 409; edição-de-ativa cria
 * nova versão (snapshot congelado e não corrompido); duplicar cria identidade nova sem herdar versões/estado;
 * autoridade — Admin gerencia, Membro só lê (403 ao mutar), Convidado não gerencia (403/404), sem acesso →
 * 404 não-enumerante; idempotência de duplicação.
 *
 * **Regra de ouro (TEST-ISO-01):** todos os atores são contas DESCARTÁVEIS (`randomUUID`) com Membership
 * ACTIVE na **Org C** — nunca reusar Ana/Bruno/Carla num `membership.create` persistente.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

const adminConta = randomUUID(); // ADMIN da Org C → gerencia qualquer Pipe
const adminMemb = randomUUID();
const membroConta = randomUUID(); // MEMBER da Org, com PipeGrant MEMBER → lê, não gerencia
const membroMemb = randomUUID();
const guestConta = randomUUID(); // GUEST da Org, com PipeGrant VIEWER → lê, não gerencia
const guestMemb = randomUUID();
const estranhoConta = randomUUID(); // MEMBER da Org SEM grant no Pipe → 404 não-enumerante
const estranhoMemb = randomUUID();

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

const CONFIG = {
  quando: { tipo: 'CARD_CRIADO' },
  condicoes: [],
  entao: [{ tipo: 'MOVER_CARD', parametros: {} }],
};

interface AutoResp {
  id: string;
  pipeId: string;
  name: string;
  state: 'INACTIVE' | 'ACTIVE' | 'ARCHIVED';
  activeVersion: number | null;
  quando: unknown;
  condicoes: unknown;
  entao: unknown;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let pipeId: string;
const automacoesCriadas: string[] = [];

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

/** Cria uma Automação (pelo Admin) e devolve a resposta. */
async function novaAutomacao(nome = 'auto'): Promise<AutoResp> {
  const res = await req('POST', `/pipes/${pipeId}/automations`, adminConta, {
    name: nome,
    ...CONFIG,
  });
  expect(res.status).toBe(201);
  const a = (await res.json()) as AutoResp;
  automacoesCriadas.push(a.id);
  return a;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `al-admin-${adminConta}@exemplo.test`, name: 'Admin Org C' },
      { id: membroConta, email: `al-membro-${membroConta}@exemplo.test`, name: 'Membro' },
      { id: guestConta, email: `al-guest-${guestConta}@exemplo.test`, name: 'Convidado' },
      { id: estranhoConta, email: `al-estr-${estranhoConta}@exemplo.test`, name: 'Estranho' },
    ],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: membroMemb, accountId: membroConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: guestMemb, accountId: guestConta, orgId: ORG_C, role: 'GUEST', state: 'ACTIVE' },
      { id: estranhoMemb, accountId: estranhoConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  const pipe = await dbC.pipe.create({
    data: { orgId: ORG_C, name: `pipe-4-2-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipeId = pipe.id;
  // Membro → PipeGrant MEMBER (lê a config, não gerencia); Convidado → VIEWER (teto do GUEST).
  await dbC.pipeGrant.createMany({
    data: [
      { orgId: ORG_C, pipeId, membershipId: membroMemb, role: 'MEMBER', state: 'ACTIVE' },
      { orgId: ORG_C, pipeId, membershipId: guestMemb, role: 'VIEWER', state: 'ACTIVE' },
    ],
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
}, 30000);

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    if (automacoesCriadas.length > 0) {
      await dbC.automation.deleteMany({ where: { id: { in: automacoesCriadas } } }).catch(() => {});
    }
    if (pipeId) {
      await dbC.automation.deleteMany({ where: { pipeId } }).catch(() => {});
      await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
    }
    await dbC.membership
      .deleteMany({ where: { id: { in: [adminMemb, membroMemb, guestMemb, estranhoMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [adminConta, membroConta, guestConta, estranhoConta] } } })
      .catch(() => {});
    await migrator.$disconnect();
  }
  await app?.close();
});

describe('AC-2 — transições atômicas, idempotentes e com estado inválido → 409', () => {
  it('ativar: INACTIVE → ACTIVE e congela a versão 1', async () => {
    const a = await novaAutomacao();
    expect(a.state).toBe('INACTIVE');
    expect(a.activeVersion).toBeNull();

    const res = await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta);
    expect(res.status).toBe(200);
    const ativa = (await res.json()) as AutoResp;
    expect(ativa.state).toBe('ACTIVE');
    expect(ativa.activeVersion).toBe(1);

    const versoes = (await (
      await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, adminConta)
    ).json()) as { version: number }[];
    expect(versoes).toHaveLength(1);
    expect(versoes[0]?.version).toBe(1);
  });

  it('ativar de novo é idempotente (mesmo estado, sem nova versão)', async () => {
    const a = await novaAutomacao();
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta);
    const seg = await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta);
    expect(seg.status).toBe(200);
    expect(((await seg.json()) as AutoResp).activeVersion).toBe(1);

    const versoes = (await (
      await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, adminConta)
    ).json()) as unknown[];
    expect(versoes).toHaveLength(1); // não proliferou versão
  });

  it('arquivar uma ATIVA a desativa automaticamente (vai a ARCHIVED); restaurar volta a INACTIVE', async () => {
    const a = await novaAutomacao();
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta);

    const arq = await req('POST', `/pipes/${pipeId}/automations/${a.id}/archive`, adminConta);
    expect(arq.status).toBe(200);
    expect(((await arq.json()) as AutoResp).state).toBe('ARCHIVED');

    const rest = await req('POST', `/pipes/${pipeId}/automations/${a.id}/restore`, adminConta);
    expect(rest.status).toBe(200);
    expect(((await rest.json()) as AutoResp).state).toBe('INACTIVE'); // sempre INACTIVE
  });

  it('ativar um ARQUIVADO é inválido → 409 (restaure antes)', async () => {
    const a = await novaAutomacao();
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/archive`, adminConta);
    const res = await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta);
    expect(res.status).toBe(409);
  });

  it('desativar uma ATIVA → INACTIVE; desativar de novo é idempotente', async () => {
    const a = await novaAutomacao();
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta);
    const d1 = await req('POST', `/pipes/${pipeId}/automations/${a.id}/deactivate`, adminConta);
    expect(d1.status).toBe(200);
    expect(((await d1.json()) as AutoResp).state).toBe('INACTIVE');
    const d2 = await req('POST', `/pipes/${pipeId}/automations/${a.id}/deactivate`, adminConta);
    expect(d2.status).toBe(200);
  });
});

describe('AC-4 — edição de Automação ATIVA cria nova versão; snapshot não corrompe as anteriores', () => {
  it('editar-enquanto-ativa congela a v2 e avança activeVersion; a v1 permanece intacta', async () => {
    const a = await novaAutomacao();
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta); // v1

    const edit = await req('PATCH', `/pipes/${pipeId}/automations/${a.id}`, adminConta, {
      entao: [{ tipo: 'FINALIZAR_CARD', parametros: {} }],
    });
    expect(edit.status).toBe(200);
    const editada = (await edit.json()) as AutoResp;
    expect(editada.activeVersion).toBe(2); // novas avaliações usam a nova versão

    const versoes = (await (
      await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, adminConta)
    ).json()) as { version: number }[];
    expect(versoes.map((v) => v.version)).toEqual([1, 2]);

    // A v1 congelada preserva a config ORIGINAL (MOVER_CARD), não a editada.
    const v1 = (await (
      await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions/1`, adminConta)
    ).json()) as { snapshot: { entao: { tipo: string }[] } };
    expect(v1.snapshot.entao[0]?.tipo).toBe('MOVER_CARD');
    const v2 = (await (
      await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions/2`, adminConta)
    ).json()) as { snapshot: { entao: { tipo: string }[] } };
    expect(v2.snapshot.entao[0]?.tipo).toBe('FINALIZAR_CARD');
  });

  it('editar uma INATIVA reescreve o rascunho SEM criar versão', async () => {
    const a = await novaAutomacao();
    const edit = await req('PATCH', `/pipes/${pipeId}/automations/${a.id}`, adminConta, {
      name: 'renomeada',
    });
    expect(edit.status).toBe(200);
    expect(((await edit.json()) as AutoResp).name).toBe('renomeada');
    const versoes = (await (
      await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, adminConta)
    ).json()) as unknown[];
    expect(versoes).toHaveLength(0); // nada rodando ⇒ nada a congelar
  });

  it('editar uma ARQUIVADA → 409 AUTOMACAO_ARQUIVADA (restaure antes)', async () => {
    const a = await novaAutomacao();
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/archive`, adminConta);
    const edit = await req('PATCH', `/pipes/${pipeId}/automations/${a.id}`, adminConta, {
      name: 'x',
    });
    expect(edit.status).toBe(409);
    expect((await edit.json()) as { motivo?: string }).toMatchObject({
      motivo: 'AUTOMACAO_ARQUIVADA',
    });
  });

  it('editar com config inválida (entao vazio) → 400 fail-closed', async () => {
    const a = await novaAutomacao();
    const edit = await req('PATCH', `/pipes/${pipeId}/automations/${a.id}`, adminConta, {
      entao: [],
    });
    expect(edit.status).toBe(400);
  });
});

describe('AC-3 — duplicar: nova identidade, só config, nasce INACTIVE, sem versões', () => {
  it('a cópia recebe id novo e nome editável, nasce INACTIVE e não herda versões nem estado ativo', async () => {
    const a = await novaAutomacao('original');
    await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, adminConta); // v1, ACTIVE

    const dup = await req('POST', `/pipes/${pipeId}/automations/${a.id}/duplicate`, adminConta, {
      name: 'a cópia',
    });
    expect(dup.status).toBe(201);
    const copia = (await dup.json()) as AutoResp;
    automacoesCriadas.push(copia.id);

    expect(copia.id).not.toBe(a.id); // nova identidade
    expect(copia.name).toBe('a cópia'); // nome editável
    expect(copia.state).toBe('INACTIVE'); // nasce inativa
    expect(copia.activeVersion).toBeNull(); // não herdou a versão ativa
    expect(copia.entao).toEqual(a.entao); // só a config foi copiada

    const versoes = (await (
      await req('GET', `/pipes/${pipeId}/automations/${copia.id}/versions`, adminConta)
    ).json()) as unknown[];
    expect(versoes).toHaveLength(0); // não copia Execuções nem versões
  });

  it('duplicar sem nome usa "Cópia de …"', async () => {
    const a = await novaAutomacao('Fonte');
    const dup = await req('POST', `/pipes/${pipeId}/automations/${a.id}/duplicate`, adminConta, {});
    expect(dup.status).toBe(201);
    const copia = (await dup.json()) as AutoResp;
    automacoesCriadas.push(copia.id);
    expect(copia.name).toBe('Cópia de Fonte');
  });

  it('duplicar é idempotente por idempotencyKey (retry devolve a MESMA cópia)', async () => {
    const a = await novaAutomacao('idem');
    const chave = randomUUID();
    const d1 = await req('POST', `/pipes/${pipeId}/automations/${a.id}/duplicate`, adminConta, {
      idempotencyKey: chave,
    });
    expect(d1.status).toBe(201);
    const c1 = (await d1.json()) as AutoResp;
    automacoesCriadas.push(c1.id);

    const d2 = await req('POST', `/pipes/${pipeId}/automations/${a.id}/duplicate`, adminConta, {
      idempotencyKey: chave,
    });
    expect(d2.status).toBe(201);
    const c2 = (await d2.json()) as AutoResp;
    expect(c2.id).toBe(c1.id); // não duplicou de novo
  });
});

describe('AC-5 — autoridade D4.3: quem gerencia, quem só lê, quem não acessa', () => {
  it('Membro do Pipe LÊ versões (200) mas NÃO ativa/edita/duplica (403)', async () => {
    const a = await novaAutomacao();
    expect(
      (await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, membroConta)).status,
    ).toBe(200);
    expect(
      (await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, membroConta)).status,
    ).toBe(403);
    expect(
      (await req('PATCH', `/pipes/${pipeId}/automations/${a.id}`, membroConta, { name: 'x' }))
        .status,
    ).toBe(403);
    expect(
      (await req('POST', `/pipes/${pipeId}/automations/${a.id}/duplicate`, membroConta, {})).status,
    ).toBe(403);
  });

  it('Convidado (VIEWER concedido) LÊ mas não gerencia → 403 ao ativar', async () => {
    const a = await novaAutomacao();
    expect(
      (await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, guestConta)).status,
    ).toBe(200);
    expect(
      (await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, guestConta)).status,
    ).toBe(403);
  });

  it('sem acesso ao Pipe → 404 não-enumerante (nunca 403, que confirmaria a existência)', async () => {
    const a = await novaAutomacao();
    expect(
      (await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`, estranhoConta)).status,
    ).toBe(404);
    expect(
      (await req('GET', `/pipes/${pipeId}/automations/${a.id}/versions`, estranhoConta)).status,
    ).toBe(404);
  });

  it('sem identidade → 401/403, nunca 200', async () => {
    const a = await novaAutomacao();
    expect([401, 403]).toContain(
      (await req('POST', `/pipes/${pipeId}/automations/${a.id}/activate`)).status,
    );
  });
});
