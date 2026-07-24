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
import { TaskOverdueService } from '../src/tasks/task-overdue.service';

/**
 * Mecanismo temporal do Evento "Tarefa atrasada" (Story 5.1, gate §1535), banco real. Prova a EMISSÃO
 * IDEMPOTENTE da ocorrência canônica: ≤1 por (taskId, versão do prazo); sem duplicar por reprocessamento;
 * alterar o prazo (bump da versão) permite nova ocorrência; concluir/arquivar antes do scan impede a emissão;
 * prazo no futuro/ausente não emite. NÃO persiste `atrasada` (só a ocorrência).
 */

const ANA = '11111111-1111-1111-1111-111111111111';
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
let overdue: TaskOverdueService;
const pipesCriados: string[] = [];
const migratorUrl = process.env.MIGRATION_DATABASE_URL;
const PASSADO = () => new Date(Date.now() - 3600_000).toISOString();
const FUTURO = () => new Date(Date.now() + 3600_000).toISOString();

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
  const pipe = (await (await req('POST', '/pipes', ANA, { name: nome })).json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

async function criarTarefa(pipeId: string, body: unknown): Promise<string> {
  const t = (await (await req('POST', `/pipes/${pipeId}/tasks`, ANA, body)).json()) as Ident;
  return t.id;
}

async function ocorrencias(taskId: string): Promise<{ dueVersion: number }[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.taskOverdueOccurrence.findMany({
    where: { taskId },
    orderBy: { dueVersion: 'asc' },
    select: { dueVersion: true },
  });
}

/** Story 5.7 — Eventos canônicos `TASK_OVERDUE` (outbox do motor) da Tarefa, emitidos same-tx com a ocorrência. */
async function eventosOverdue(taskId: string): Promise<number> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.domainEvent.count({
    where: { eventType: 'TASK_OVERDUE', resourceType: 'TASK', resourceId: taskId },
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
  overdue = app.get(TaskOverdueService);
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
}, 30000);

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.task.deleteMany({ where: { pipeId: { in: pipesCriados } } });
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('emissão idempotente (AC3)', () => {
  it('Tarefa vencida → 1 ocorrência; reprocessar NÃO duplica (idempotência por taskId+dueVersion)', async () => {
    const pipeId = await criarPipe('5.1 scan idem');
    const taskId = await criarTarefa(pipeId, { title: 'Vencida', dueAt: PASSADO() });

    expect(await overdue.escanearOrg(ORG_A)).toBeGreaterThanOrEqual(1);
    const dep1 = await ocorrencias(taskId);
    expect(dep1).toEqual([{ dueVersion: 0 }]);

    // Story 5.7: o Evento canônico TASK_OVERDUE nasceu same-tx com a ocorrência (AD-13) — exatamente 1.
    expect(await eventosOverdue(taskId)).toBe(1);

    // Reprocessa (retry/atraso do scheduler) → nenhuma NOVA ocorrência NEM novo Evento para esta Tarefa.
    await overdue.escanearOrg(ORG_A);
    await overdue.escanearOrg(ORG_A);
    expect(await ocorrencias(taskId)).toEqual([{ dueVersion: 0 }]);
    expect(await eventosOverdue(taskId)).toBe(1); // idempotente: re-scan não re-emite
  });

  it('alterar o prazo BUMPA a versão → nova ocorrência possível na versão nova', async () => {
    const pipeId = await criarPipe('5.1 scan versao');
    const taskId = await criarTarefa(pipeId, { title: 'V', dueAt: PASSADO() });
    await overdue.escanearOrg(ORG_A);
    expect(await ocorrencias(taskId)).toEqual([{ dueVersion: 0 }]);

    // Novo prazo (ainda vencido, valor distinto) → dueVersion 1. Nova ocorrência na versão 1.
    expect((await req('PATCH', `/tasks/${taskId}`, ANA, { dueAt: PASSADO() })).status).toBe(200);
    await overdue.escanearOrg(ORG_A);
    expect(await ocorrencias(taskId)).toEqual([{ dueVersion: 0 }, { dueVersion: 1 }]);
  });

  it('concluir ANTES do scan impede a emissão; arquivar idem', async () => {
    const pipeId = await criarPipe('5.1 scan concluir');
    const concluida = await criarTarefa(pipeId, { title: 'C', dueAt: PASSADO() });
    const arquivada = await criarTarefa(pipeId, { title: 'A', dueAt: PASSADO() });
    expect((await req('POST', `/tasks/${concluida}/complete`, ANA)).status).toBe(200);
    expect((await req('POST', `/tasks/${arquivada}/archive`, ANA)).status).toBe(200);

    await overdue.escanearOrg(ORG_A);
    expect(await ocorrencias(concluida)).toEqual([]);
    expect(await ocorrencias(arquivada)).toEqual([]);
  });

  it('prazo no FUTURO ou AUSENTE → nunca emite', async () => {
    const pipeId = await criarPipe('5.1 scan futuro');
    const futura = await criarTarefa(pipeId, { title: 'F', dueAt: FUTURO() });
    const semPrazo = await criarTarefa(pipeId, { title: 'S' });
    await overdue.escanearOrg(ORG_A);
    expect(await ocorrencias(futura)).toEqual([]);
    expect(await ocorrencias(semPrazo)).toEqual([]);
  });
});
