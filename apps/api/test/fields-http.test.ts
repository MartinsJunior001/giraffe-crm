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
 * Evolução segura de Campos (Story 2.5) pela porta da frente: HTTP real, `AppModule` de produção, banco real.
 * Ana é ADMIN da Org A. Cada teste cria o SEU Pipe (id único) → cada Formulário é isolado, asserções de
 * ordem/identidade são exatas.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
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
interface OpcaoResp {
  id: string;
  label: string;
  position: number;
  state: 'ACTIVE' | 'ARCHIVED';
}
interface CampoResp {
  id: string;
  formId: string;
  label: string;
  type: string;
  help: string | null;
  typeConfig: { options?: OpcaoResp[] };
  defaultValue: unknown;
  state: 'ACTIVE' | 'ARCHIVED';
  position?: unknown;
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

async function adicionarCampo(pipeId: string, corpo: unknown): Promise<CampoResp> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, corpo);
  expect(res.status).toBe(201);
  return (await res.json()) as CampoResp;
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
});

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

describe('editar Campo (SC-251 / SC-252)', () => {
  it('edita label/help/defaultValue e preserva id, type e ordem', async () => {
    const pipeId = await criarPipe('2.5 editar');
    const campo = await adicionarCampo(pipeId, { label: 'Nome', type: 'TEXT_SHORT' });

    const res = await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${campo.id}`, ANA, {
      label: 'Nome completo',
      help: 'como no documento',
      defaultValue: 'padrão',
    });
    expect(res.status).toBe(200);
    const editado = (await res.json()) as CampoResp;
    expect(editado.id).toBe(campo.id); // identidade estável
    expect(editado.label).toBe('Nome completo');
    expect(editado.help).toBe('como no documento');
    expect(editado.defaultValue).toBe('padrão');
    expect(editado.type).toBe('TEXT_SHORT'); // type inalterado
    expect(editado.position).toBeUndefined(); // position não sai no payload
  });

  it('rejeita editar `type` (400) — imutável na 2.5', async () => {
    const pipeId = await criarPipe('2.5 type imutável');
    const campo = await adicionarCampo(pipeId, { label: 'X', type: 'TEXT_SHORT' });
    const res = await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${campo.id}`, ANA, {
      type: 'NUMBER',
    });
    expect(res.status).toBe(400);
  });

  it('rejeita `typeConfig`/`options` cru no editar (anti-mass-assignment, 400)', async () => {
    const pipeId = await criarPipe('2.5 anti-mass');
    const campo = await adicionarCampo(pipeId, { label: 'X', type: 'TEXT_SHORT' });
    for (const corpo of [
      { typeConfig: { options: [] } },
      { options: ['a'] },
      { state: 'ARCHIVED' },
    ]) {
      expect(
        (await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${campo.id}`, ANA, corpo))
          .status,
      ).toBe(400);
    }
  });

  it('rejeita chave benigna desconhecida (allowlist estrita, 400) — não ignora em silêncio', async () => {
    const pipeId = await criarPipe('2.5 allowlist');
    const campo = await adicionarCampo(pipeId, { label: 'X', type: 'TEXT_SHORT' });
    const res = await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${campo.id}`, ANA, {
      label: 'Y',
      apelido: 'inesperado', // chave fora de {label, help, defaultValue}
    });
    expect(res.status).toBe(400);
  });

  it('limpa help e defaultValue com null', async () => {
    const pipeId = await criarPipe('2.5 limpar');
    const campo = await adicionarCampo(pipeId, {
      label: 'X',
      type: 'TEXT_SHORT',
      help: 'ajuda',
    });
    const res = await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${campo.id}`, ANA, {
      help: null,
      defaultValue: null,
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as CampoResp;
    expect(j.help).toBeNull();
    expect(j.defaultValue).toBeNull();
  });

  it('404 ao editar Campo inexistente ou de outro Formulário', async () => {
    const pipeId = await criarPipe('2.5 editar 404');
    const outro = await criarPipe('2.5 editar 404 outro');
    const campo = await adicionarCampo(outro, { label: 'X', type: 'TEXT_SHORT' });
    // Campo existe, mas não é do `pipeId` → 404 não-enumerante.
    expect(
      (await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${campo.id}`, ANA, { label: 'Y' }))
        .status,
    ).toBe(404);
  });
});

describe('arquivar / restaurar Campo (SC-253)', () => {
  it('arquiva e restaura, idempotente, sem falso denied', async () => {
    const pipeId = await criarPipe('2.5 arquivar');
    const campo = await adicionarCampo(pipeId, { label: 'X', type: 'TEXT_SHORT' });

    const arq = await req('POST', `/pipes/${pipeId}/forms/initial/fields/${campo.id}/archive`, ANA);
    expect(arq.status).toBe(200);
    expect(((await arq.json()) as CampoResp).state).toBe('ARCHIVED');
    // idempotente: arquivar de novo → 200 (não 404/erro).
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${campo.id}/archive`, ANA)).status,
    ).toBe(200);

    const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields/${campo.id}/restore`, ANA);
    expect(res.status).toBe(200);
    expect(((await res.json()) as CampoResp).state).toBe('ACTIVE');
    // restaurar já-ativo é idempotente.
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${campo.id}/restore`, ANA)).status,
    ).toBe(200);
  });

  it('restaura o Campo ao FINAL da ordem ativa, não à posição original (SC-253)', async () => {
    const pipeId = await criarPipe('2.5 restaurar ao final');
    const a = await adicionarCampo(pipeId, { label: 'A', type: 'TEXT_SHORT' });
    const b = await adicionarCampo(pipeId, { label: 'B', type: 'TEXT_SHORT' });
    const c = await adicionarCampo(pipeId, { label: 'C', type: 'TEXT_SHORT' });

    // Arquiva o primeiro (A) e depois o restaura: ele deve voltar ao FIM da ordem ativa, não à frente.
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${a.id}/archive`, ANA)).status,
    ).toBe(200);
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${a.id}/restore`, ANA)).status,
    ).toBe(200);

    // GET do Formulário lista os ativos por ordem crescente de posição → [B, C, A].
    const form = (await (await req('GET', `/pipes/${pipeId}/forms/initial`, ANA)).json()) as {
      fields: CampoResp[];
    };
    const ativos = form.fields.filter((f) => f.state === 'ACTIVE').map((f) => f.id);
    expect(ativos).toEqual([b.id, c.id, a.id]);
  });
});

describe('concorrência no ciclo de opções (H1 / invariante 12 — sem lost update silencioso)', () => {
  it('duas adições concorrentes: cada resposta é 200 (aplicada) ou 409 (conflito); nada some', async () => {
    const pipeId = await criarPipe('2.5 concorrência opções');
    const campo = await adicionarCampo(pipeId, {
      label: 'Prioridade',
      type: 'SELECT_SINGLE',
      options: ['Base'],
    });
    const url = `/pipes/${pipeId}/forms/initial/fields/${campo.id}`;

    // Disparadas em paralelo, ambas partem do MESMO estado inicial ({Base}). Sob a guarda otimista, ou
    // serializam (as duas 200) ou uma perde a corrida e recebe 409 — NUNCA um 200 cuja opção desaparece.
    const [r1, r2] = await Promise.all([
      req('POST', `${url}/options`, ANA, { label: 'B' }),
      req('POST', `${url}/options`, ANA, { label: 'C' }),
    ]);
    const status = [r1.status, r2.status];
    for (const s of status) expect([200, 409]).toContain(s);
    const aplicadas = status.filter((s) => s === 200).length;
    expect(aplicadas).toBeGreaterThanOrEqual(1);

    // Invariante 12: o estado final contém EXATAMENTE as opções cujas requisições retornaram 200, mais a
    // inicial 'Base'. Um lost update silencioso (200 cuja escrita foi sobrescrita) quebraria esta contagem.
    const form = (await (await req('GET', `/pipes/${pipeId}/forms/initial`, ANA)).json()) as {
      fields: CampoResp[];
    };
    const alvo = form.fields.find((f) => f.id === campo.id)!;
    expect(alvo.typeConfig.options!.length).toBe(1 + aplicadas);
  });
});

describe('ciclo de opções de Seleção (SC-255 / SC-256)', () => {
  async function campoSelecao(pipeId: string): Promise<CampoResp> {
    return adicionarCampo(pipeId, {
      label: 'Prioridade',
      type: 'SELECT_SINGLE',
      options: ['Alta', 'Baixa'],
    });
  }

  it('adiciona, renomeia (id estável), reordena, arquiva e remove opção', async () => {
    const pipeId = await criarPipe('2.5 opções');
    const campo = await campoSelecao(pipeId);
    const url = `/pipes/${pipeId}/forms/initial/fields/${campo.id}`;
    const [alta, baixa] = campo.typeConfig.options!;

    // adicionar
    const add = await req('POST', `${url}/options`, ANA, { label: 'Média' });
    expect(add.status).toBe(200);
    const comMedia = (await add.json()) as CampoResp;
    expect(comMedia.typeConfig.options!.map((o) => o.label)).toEqual(['Alta', 'Baixa', 'Média']);
    const media = comMedia.typeConfig.options!.find((o) => o.label === 'Média')!;

    // renomear preserva id
    const ren = await req('PATCH', `${url}/options/${alta!.id}`, ANA, { label: 'Altíssima' });
    expect(ren.status).toBe(200);
    const renJson = (await ren.json()) as CampoResp;
    const renamed = renJson.typeConfig.options!.find((o) => o.id === alta!.id)!;
    expect(renamed.label).toBe('Altíssima'); // id estável, label novo

    // reordenar: Média para o início
    const reo = await req('POST', `${url}/options/${media.id}/reorder`, ANA, {
      afterOptionId: null,
    });
    expect(reo.status).toBe(200);
    const reoJson = (await reo.json()) as CampoResp;
    expect(reoJson.typeConfig.options![0]!.id).toBe(media.id);
    expect(reoJson.typeConfig.options!.map((o) => o.position)).toEqual([1, 2, 3]); // reindexado

    // arquivar opção (preserva rótulo)
    const arq = await req('POST', `${url}/options/${baixa!.id}/archive`, ANA);
    expect(arq.status).toBe(200);
    expect(
      ((await arq.json()) as CampoResp).typeConfig.options!.find((o) => o.id === baixa!.id)!.state,
    ).toBe('ARCHIVED');

    // remover opção (é UPDATE do typeConfig)
    const rem = await req('POST', `${url}/options/${media.id}/remove`, ANA);
    expect(rem.status).toBe(200);
    expect(
      ((await rem.json()) as CampoResp).typeConfig.options!.some((o) => o.id === media.id),
    ).toBe(false);
  });

  it('operação de opção em Campo NÃO-Seleção → 400', async () => {
    const pipeId = await criarPipe('2.5 opção não-seleção');
    const campo = await adicionarCampo(pipeId, { label: 'Texto', type: 'TEXT_SHORT' });
    expect(
      (
        await req('POST', `/pipes/${pipeId}/forms/initial/fields/${campo.id}/options`, ANA, {
          label: 'X',
        })
      ).status,
    ).toBe(400);
  });

  it('opção inexistente → 404; label vazio → 400', async () => {
    const pipeId = await criarPipe('2.5 opção 404/400');
    const campo = await campoSelecao(pipeId);
    const url = `/pipes/${pipeId}/forms/initial/fields/${campo.id}`;
    expect(
      (
        await req('PATCH', `${url}/options/${'00000000-0000-0000-0000-000000000000'}`, ANA, {
          label: 'X',
        })
      ).status,
    ).toBe(404);
    expect((await req('POST', `${url}/options`, ANA, { label: '   ' })).status).toBe(400);
  });
});

describe('Formulário de Fase (SC-257 — mesma evolução por phase.pipeId)', () => {
  it('edita e arquiva Campo do Formulário de Fase', async () => {
    const pipeId = await criarPipe('2.5 fase');
    const faseRes = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'Triagem' });
    expect(faseRes.status).toBe(201);
    const phaseId = ((await faseRes.json()) as Ident).id;

    const add = await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields`, ANA, {
      label: 'Origem',
      type: 'TEXT_SHORT',
    });
    expect(add.status).toBe(201);
    const campo = (await add.json()) as CampoResp;

    const ed = await req(
      'PATCH',
      `/pipes/${pipeId}/phases/${phaseId}/form/fields/${campo.id}`,
      ANA,
      { label: 'Canal de origem' },
    );
    expect(ed.status).toBe(200);
    expect(((await ed.json()) as CampoResp).label).toBe('Canal de origem');

    expect(
      (await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields/${campo.id}/archive`, ANA))
        .status,
    ).toBe(200);
  });

  it('INV-FORM-01 sob evolução (RN-054): arquivar Campo do inicial não afeta o de Fase', async () => {
    const pipeId = await criarPipe('2.5 INV-FORM-01');
    const faseRes = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'Fase' });
    const phaseId = ((await faseRes.json()) as Ident).id;

    const campoIni = await adicionarCampo(pipeId, { label: 'Inicial', type: 'TEXT_SHORT' });
    const addFase = await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields`, ANA, {
      label: 'De Fase',
      type: 'TEXT_SHORT',
    });
    const campoFase = (await addFase.json()) as CampoResp;

    // Arquiva o Campo do INICIAL.
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${campoIni.id}/archive`, ANA))
        .status,
    ).toBe(200);

    // O Formulário de Fase é INTOCADO: seu Campo continua ACTIVE e presente.
    const fase = await req('GET', `/pipes/${pipeId}/phases/${phaseId}/form`, ANA);
    const faseForm = (await fase.json()) as { fields: CampoResp[] };
    const aindaLa = faseForm.fields.find((c) => c.id === campoFase.id);
    expect(aindaLa).toBeDefined();
    expect(aindaLa!.state).toBe('ACTIVE');
  });
});
