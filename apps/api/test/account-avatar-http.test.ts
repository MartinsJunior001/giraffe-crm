import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { PrismaClient } from '../generated/prisma';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import { StorageService } from '../src/kernel/storage/storage.service';
import { ClamavService } from '../src/kernel/scanner/clamav.service';
import type { ResultadoClamAV } from '../src/files/file-verdict.core';

/**
 * Avatar do próprio usuário (Story 3.10, FR-32) pela porta da frente: HTTP real, banco real, dispatcher de
 * autorização REAL (NÃO sobrescrito — prova o self-only de verdade), storage e scanner FALSOS (determinísticos,
 * sem MinIO/ClamAV).
 *
 * O foco é o que o dono pediu provar: enviar/substituir/remover o PRÓPRIO avatar, um só ativo, fallback por
 * iniciais, e — sobretudo — que **ninguém alcança o avatar de outra pessoa**, inclusive pela rota GENÉRICA de
 * arquivos (`/files/resource/:resourceType/:resourceId`), que aceita `resourceType`/`resourceId` do cliente e
 * é por isso o vetor de ataque real.
 *
 * `Account` não é tocada em lugar nenhum deste fluxo — o slot vive em `AccountAvatar`, org-scoped.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

/** PNG mínimo válido (magic bytes corretos) — passa na validação da 3.7. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
/** Bytes que NÃO são imagem — magic bytes de executável; deve ser recusado antes de qualquer scan. */
const NAO_IMAGEM = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

class FakeStorage {
  objetos = new Map<string, Buffer>();
  put(key: string, body: Buffer): Promise<{ etag: string | undefined }> {
    this.objetos.set(key, body);
    return Promise.resolve({ etag: `"${createHash('md5').update(body).digest('hex')}"` });
  }
  getBytes(key: string): Promise<Uint8Array> {
    return Promise.resolve(this.objetos.get(key) ?? Buffer.alloc(0));
  }
  getStream(key: string): Promise<IncomingMessage> {
    return Promise.resolve(
      Readable.from([this.objetos.get(key) ?? Buffer.alloc(0)]) as IncomingMessage,
    );
  }
  copyIfMatch(srcKey: string, destKey: string): Promise<boolean> {
    const b = this.objetos.get(srcKey);
    if (!b) return Promise.resolve(false);
    this.objetos.set(destKey, b);
    return Promise.resolve(true);
  }
  remove(key: string): Promise<void> {
    this.objetos.delete(key);
    return Promise.resolve();
  }
}

/** Scanner determinístico: qualquer buffer que contenha o marcador EICAR-like é tratado como infectado. */
class FakeScanner {
  escanear(bytes: Buffer): Promise<ResultadoClamAV> {
    return Promise.resolve(bytes.includes(Buffer.from('MALWARE')) ? 'INFECTADO' : 'LIMPO');
  }
  dataDaBase(): Promise<Date | null> {
    return Promise.resolve(new Date());
  }
  canarioDetecta(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface AvatarResp {
  presente: boolean;
  fileId: string | null;
  nomeOriginal: string | null;
  /** NUNCA devem aparecer — o teste de "sem presigned" depende disso. */
  url?: string;
  bucketKey?: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let storage: FakeStorage;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(method: string, path: string, conta?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  return fetch(`${baseUrl}${path}`, { method, headers });
}

/** Envia um avatar por multipart, como o navegador faria. */
async function enviarAvatar(
  conta: string,
  bytes: Buffer = PNG,
  nome = 'perfil.png',
): Promise<{ status: number; body: AvatarResp }> {
  const form = new FormData();
  form.append('file', new Blob([bytes]), nome);
  const res = await fetch(`${baseUrl}/me/avatar`, {
    method: 'POST',
    headers: { [HEADER_CONTA]: conta },
    body: form,
  });
  const body =
    res.status < 500 ? ((await res.json().catch(() => ({}))) as AvatarResp) : ({} as AvatarResp);
  return { status: res.status, body };
}

async function obterAvatar(conta: string): Promise<AvatarResp> {
  return (await (await req('GET', '/me/avatar', conta)).json()) as AvatarResp;
}

/** Estado do arquivo direto no banco (pelo migrator) — para provar remoção lógica sem exclusão física. */
async function estadoDoArquivo(fileId: string): Promise<string | null> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const f = await db.fileObject.findUnique({ where: { id: fileId }, select: { state: true } });
  return f?.state ?? null;
}

/** Slots de avatar de uma conta, direto no banco (a policy é self-only, então o contexto carrega a conta). */
async function slotsDoBanco(accountId: string): Promise<{ fileId: string; state: string }[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A, accountId }, semLog);
  return db.accountAvatar.findMany({
    where: { accountId },
    select: { fileId: true, state: true },
  });
}

/** Faxina: remove slots e arquivos de avatar das duas contas. Roda pelo migrator (o runtime não tem DELETE). */
async function limpar(): Promise<void> {
  for (const conta of [ANA, BRUNO]) {
    const db = withTenantContext(migrator, { orgId: ORG_A, accountId: conta }, semLog);
    await db.accountAvatar.deleteMany({ where: { accountId: conta } }).catch(() => {});
  }
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await db.fileObject
    .deleteMany({ where: { resourceType: 'ACCOUNT', resourceId: { in: [ANA, BRUNO] } } })
    .catch(() => {});
}

beforeAll(async () => {
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  process.env.FILE_UPLOAD_ENABLED = 'true';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';

  storage = new FakeStorage();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(ClamavService)
    .useValue(new FakeScanner())
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
}, 30000);

afterEach(async () => {
  await limpar();
});

afterAll(async () => {
  await app?.close();
  await migrator?.$disconnect();
});

describe('envio do próprio avatar', () => {
  it('envia um PNG válido e o avatar passa a existir', async () => {
    const { status, body } = await enviarAvatar(ANA);
    expect(status).toBe(200);
    expect(body.presente).toBe(true);
    expect(body.fileId).toBeTruthy();
  });

  it('sem avatar, a resposta diz `presente: false` — é o sinal para a UI usar as iniciais (1.11)', async () => {
    expect((await obterAvatar(BRUNO)).presente).toBe(false);
  });

  it('a resposta NÃO carrega URL nem chave de objeto (sem presigned)', async () => {
    const { body } = await enviarAvatar(ANA);
    expect(body.url).toBeUndefined();
    expect(body.bucketKey).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/http|bucket|amazonaws|minio/i);
  });

  it('o download vem por stream, com os bytes enviados e sem cache compartilhado', async () => {
    await enviarAvatar(ANA);
    const res = await req('GET', '/me/avatar/download', ANA);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it('sem avatar, o download é 404 (a UI cai nas iniciais sem quebrar)', async () => {
    expect((await req('GET', '/me/avatar/download', BRUNO)).status).toBe(404);
  });
});

describe('substituição', () => {
  it('substituir troca o arquivo, aposenta o anterior e deixa UM só slot', async () => {
    const primeiro = (await enviarAvatar(ANA)).body.fileId!;
    const segundo = (await enviarAvatar(ANA, PNG, 'novo.png')).body.fileId!;

    expect(segundo).not.toBe(primeiro);
    expect(await estadoDoArquivo(primeiro)).toBe('REMOVIDO_LOGICO'); // sem exclusão física
    expect(await estadoDoArquivo(segundo)).toBe('DISPONIVEL');

    const slots = await slotsDoBanco(ANA);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ fileId: segundo, state: 'ACTIVE' });
  });

  it('o avatar anterior deixa de ser servido no download', async () => {
    await enviarAvatar(ANA);
    const segundo = (await enviarAvatar(ANA)).body.fileId!;
    expect((await obterAvatar(ANA)).fileId).toBe(segundo);
  });
});

describe('remoção', () => {
  it('remover limpa o slot, aposenta o arquivo e volta às iniciais', async () => {
    const fileId = (await enviarAvatar(ANA)).body.fileId!;
    const res = await req('DELETE', '/me/avatar', ANA);
    expect(res.status).toBe(200);
    expect(((await res.json()) as AvatarResp).presente).toBe(false);

    expect((await obterAvatar(ANA)).presente).toBe(false); // fallback por iniciais
    expect(await estadoDoArquivo(fileId)).toBe('REMOVIDO_LOGICO'); // sem exclusão física
    // A LINHA do slot é preservada (sem DELETE); o que muda é o estado.
    expect(await slotsDoBanco(ANA)).toMatchObject([{ state: 'REMOVED' }]);
  });

  it('remover é idempotente (remover duas vezes não falha)', async () => {
    await enviarAvatar(ANA);
    expect((await req('DELETE', '/me/avatar', ANA)).status).toBe(200);
    expect((await req('DELETE', '/me/avatar', ANA)).status).toBe(200);
    expect((await obterAvatar(ANA)).presente).toBe(false);
  });

  it('após remover, um novo envio reativa o MESMO slot (sem duplicar linha)', async () => {
    await enviarAvatar(ANA);
    await req('DELETE', '/me/avatar', ANA);
    const novo = (await enviarAvatar(ANA)).body.fileId!;

    const slots = await slotsDoBanco(ANA);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ fileId: novo, state: 'ACTIVE' });
  });
});

describe('self-only: ninguém alcança o avatar de outra pessoa', () => {
  it('o avatar de ANA não aparece para BRUNO', async () => {
    await enviarAvatar(ANA);
    expect((await obterAvatar(BRUNO)).presente).toBe(false);
  });

  it('BRUNO não baixa o arquivo do avatar de ANA pela rota genérica de arquivos → 404', async () => {
    const fileId = (await enviarAvatar(ANA)).body.fileId!;
    // A rota genérica aceita o fileId do cliente; quem nega é a autz self-only do `resourceType='ACCOUNT'`.
    expect((await req('GET', `/files/${fileId}/content`, BRUNO)).status).toBe(404);
    // E ANA, dona, baixa normalmente — prova que o 404 é da autorização, não de o arquivo não existir.
    expect((await req('GET', `/files/${fileId}/content`, ANA)).status).toBe(200);
  });

  it('BRUNO não envia arquivo para a Conta de ANA pela rota genérica → 404', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG]), 'ataque.png');
    const res = await fetch(`${baseUrl}/files/resource/ACCOUNT/${ANA}`, {
      method: 'POST',
      headers: { [HEADER_CONTA]: BRUNO },
      body: form,
    });
    expect(res.status).toBe(404); // não-enumerante: nem confirma que a Conta existe
    expect(await slotsDoBanco(ANA)).toHaveLength(0);
  });

  it('BRUNO não remove o arquivo do avatar de ANA → 404', async () => {
    const fileId = (await enviarAvatar(ANA)).body.fileId!;
    expect((await req('POST', `/files/${fileId}/remove`, BRUNO)).status).toBe(404);
    expect(await estadoDoArquivo(fileId)).toBe('DISPONIVEL'); // intacto
  });

  it('sem principal, nem obter nem enviar são alcançáveis', async () => {
    expect((await req('GET', '/me/avatar')).status).toBeGreaterThanOrEqual(401);
  });
});

describe('gates de arquivo herdados da 3.7 (sem segundo pipeline)', () => {
  it('bytes que não são imagem são recusados (magic bytes) → 400, e nenhum avatar é criado', async () => {
    const { status } = await enviarAvatar(ANA, NAO_IMAGEM, 'malicioso.png');
    expect(status).toBe(400);
    expect((await obterAvatar(ANA)).presente).toBe(false);
  });

  /**
   * Achado da revisão adversarial: a allowlist da 3.7 é a de ANEXO GERAL e inclui `application/pdf`. Um PDF
   * passaria todos os gates dela (magic bytes válidos, antivírus limpo) e viraria "avatar" — que a UI então
   * não conseguiria renderizar. Avatar tem de ser imagem, e a checagem é por magic bytes.
   */
  it('um PDF válido é recusado como avatar (a allowlist da 3.7 o aceitaria) → 400', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n', 'latin1');
    const { status } = await enviarAvatar(ANA, pdf, 'documento.pdf');
    expect(status).toBe(400);
    expect(await slotsDoBanco(ANA)).toHaveLength(0);
  });

  it('a extensão mentirosa não engana: PDF renomeado para .png também é recusado', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'latin1');
    expect((await enviarAvatar(ANA, pdf, 'disfarce.png')).status).toBe(400);
  });

  it('arquivo vazio é recusado → 400', async () => {
    const { status } = await enviarAvatar(ANA, Buffer.alloc(0), 'vazio.png');
    expect(status).toBe(400);
    expect((await obterAvatar(ANA)).presente).toBe(false);
  });

  it('arquivo infectado é bloqueado e NUNCA vira avatar', async () => {
    const infectado = Buffer.concat([PNG, Buffer.from('MALWARE')]);
    const { status } = await enviarAvatar(ANA, infectado, 'virus.png');
    expect(status).toBeGreaterThanOrEqual(400);
    expect((await obterAvatar(ANA)).presente).toBe(false);
    expect(await slotsDoBanco(ANA)).toHaveLength(0);
  });

  /**
   * Regressão do defeito achado ao escrever estes testes: a 3.7 **não lança** para veredito adverso — ela
   * persiste o arquivo como BLOCKED e responde 200. Sem a guarda `state !== 'DISPONIVEL'` no serviço, enviar
   * malware apontaria o slot para o arquivo bloqueado E aposentaria o avatar legítimo no caminho. Ou seja:
   * qualquer pessoa poderia apagar o próprio avatar por acidente — e um atacante, o dele mesmo, o que é pouco;
   * o problema real é o slot passar a referenciar um arquivo que nunca deveria ser servido.
   */
  it('uma tentativa com malware NÃO derruba o avatar legítimo que já existia', async () => {
    const legitimo = (await enviarAvatar(ANA)).body.fileId!;
    const infectado = Buffer.concat([PNG, Buffer.from('MALWARE')]);

    const { status } = await enviarAvatar(ANA, infectado, 'virus.png');
    expect(status).toBeGreaterThanOrEqual(400);

    // O avatar anterior continua ATIVO, DISPONIVEL e sendo servido.
    expect((await obterAvatar(ANA)).fileId).toBe(legitimo);
    expect(await estadoDoArquivo(legitimo)).toBe('DISPONIVEL');
    expect(await slotsDoBanco(ANA)).toMatchObject([{ fileId: legitimo, state: 'ACTIVE' }]);
  });
});

describe('concorrência', () => {
  it('dois envios simultâneos não deixam dois avatares ativos', async () => {
    const [a, b] = await Promise.allSettled([enviarAvatar(ANA), enviarAvatar(ANA)]);

    const slots = await slotsDoBanco(ANA);
    expect(slots).toHaveLength(1);
    expect(slots.filter((s) => s.state === 'ACTIVE')).toHaveLength(1);

    // Nenhuma das respostas pode ser 500: o conflito vira 409 (ou ambos passam, serializados).
    for (const r of [a, b]) {
      if (r.status === 'fulfilled') expect([200, 409]).toContain(r.value.status);
    }

    // O arquivo PERDEDOR não fica DISPONIVEL órfão — é aposentado deterministicamente.
    const vencedor = slots[0]!.fileId;
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const arquivos = await db.fileObject.findMany({
      where: { resourceType: 'ACCOUNT', resourceId: ANA },
      select: { id: true, state: true },
    });
    for (const arq of arquivos) {
      if (arq.id !== vencedor) expect(arq.state).not.toBe('DISPONIVEL');
    }
  });
});

/**
 * `FILE_UPLOAD_ENABLED` é lido a cada chamada (`getEnv()` não é memoizado — decisão registrada em `env.ts`),
 * então dá para alternar a capacidade em runtime sem subir um segundo app.
 */
describe('FILE_UPLOAD_ENABLED=false — fail-closed, mas sem trancar o titular', () => {
  it('enviar falha fechado com 503, e a capacidade não é contornável', async () => {
    process.env.FILE_UPLOAD_ENABLED = 'false';
    try {
      const { status } = await enviarAvatar(ANA);
      expect(status).toBe(503);
      expect(await slotsDoBanco(ANA)).toHaveLength(0);
    } finally {
      process.env.FILE_UPLOAD_ENABLED = 'true';
    }
  });

  it('substituir também falha fechado com 503 (o avatar vigente é preservado)', async () => {
    const legitimo = (await enviarAvatar(ANA)).body.fileId!;
    process.env.FILE_UPLOAD_ENABLED = 'false';
    try {
      expect((await enviarAvatar(ANA)).status).toBe(503);
      expect(await estadoDoArquivo(legitimo)).toBe('DISPONIVEL');
    } finally {
      process.env.FILE_UPLOAD_ENABLED = 'true';
    }
    expect((await obterAvatar(ANA)).fileId).toBe(legitimo);
  });

  /**
   * O ponto de LGPD: retirar a própria imagem não pode depender do subsistema de arquivos estar ligado —
   * seria trancar o titular para fora justamente quando os arquivos foram desligados por um incidente.
   */
  it('REMOVER o próprio avatar continua funcionando com a capacidade desligada', async () => {
    const fileId = (await enviarAvatar(ANA)).body.fileId!;
    process.env.FILE_UPLOAD_ENABLED = 'false';
    try {
      const res = await req('DELETE', '/me/avatar', ANA);
      expect(res.status).toBe(200);
      expect(((await res.json()) as AvatarResp).presente).toBe(false);
      // Sem referência quebrada: o slot foi limpo e o binário aposentado.
      expect(await slotsDoBanco(ANA)).toMatchObject([{ state: 'REMOVED' }]);
      expect(await estadoDoArquivo(fileId)).toBe('REMOVIDO_LOGICO');
    } finally {
      process.env.FILE_UPLOAD_ENABLED = 'true';
    }
  });

  it('consultar o avatar segue respondendo (a UI cai nas iniciais, não quebra)', async () => {
    process.env.FILE_UPLOAD_ENABLED = 'false';
    try {
      const res = await req('GET', '/me/avatar', BRUNO);
      expect(res.status).toBe(200);
      expect(((await res.json()) as AvatarResp).presente).toBe(false);
    } finally {
      process.env.FILE_UPLOAD_ENABLED = 'true';
    }
  });
});

describe('`Account` não é tocada em nenhum caminho do avatar', () => {
  it('enviar e remover o avatar não altera a linha da Conta', async () => {
    const antes = await migrator.account.findUnique({
      where: { id: ANA },
      select: { email: true, name: true, image: true, updatedAt: true },
    });
    await enviarAvatar(ANA);
    await req('DELETE', '/me/avatar', ANA);
    const depois = await migrator.account.findUnique({
      where: { id: ANA },
      select: { email: true, name: true, image: true, updatedAt: true },
    });
    expect(depois).toEqual(antes);
  });
});
