import type { PinoLogger } from 'nestjs-pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import { LoginFailureService, MAX_FALHAS } from '../src/kernel/auth/login-failure.service';
import { ConfigValidationError, loadEnv } from '../src/kernel/config/env';
import type { PrismaService } from '../src/kernel/db/prisma.service';

/**
 * Rotação do segredo do HMAC — D6.
 *
 * O problema que a rotação cria, e que estes testes existem para fechar: o segredo deriva TODAS as
 * chaves do contador de falhas. Trocá-lo muda todas de uma vez — e, sem sobreposição, os contadores
 * de quem está sob ataque **naquele instante** viram órfãos. O atacante ganharia 5 tentativas novas
 * de graça, exatamente durante uma operação de segurança.
 *
 * A sobreposição resolve isso mantendo a chave anterior em **leitura**: as falhas registradas sob
 * ela seguem contando até a janela delas expirar.
 */

const eventos: Record<string, unknown>[] = [];
const logger = {
  warn: (dados: Record<string, unknown>) => eventos.push(dados),
  info: () => {},
  error: () => {},
} as unknown as PinoLogger;

const SEGREDO_ATUAL = 'segredo-atual-de-teste-com-mais-de-32-caracteres';
const SEGREDO_ANTERIOR = 'segredo-anterior-de-teste-com-mais-de-32-caracteres';

/** Identificadores próprios deste arquivo — a suíte roda os arquivos em paralelo. */
const ALVO = 'alvo-rotacao@exemplo.test';
const OUTRO = 'outro-rotacao@exemplo.test';

let prisma: PrismaClient;
let servico: LoginFailureService;

/** Liga a sobreposição: o serviço passa a ler a chave antiga além da atual. */
function comRotacaoEmCurso(): void {
  process.env.LOGIN_HMAC_PREVIOUS_SECRET = SEGREDO_ANTERIOR;
  process.env.LOGIN_HMAC_PREVIOUS_KEY_VERSION = '1';
}

/** Desliga a sobreposição — o estado depois que a chave antiga é aposentada. */
function semRotacao(): void {
  delete process.env.LOGIN_HMAC_PREVIOUS_SECRET;
  delete process.env.LOGIN_HMAC_PREVIOUS_KEY_VERSION;
}

/**
 * Simula falhas registradas ANTES da rotação: elas foram gravadas sob a chave derivada do segredo
 * que, hoje, é o "anterior". É o estado real de um ataque em curso no momento da troca.
 */
async function falhasSobAChaveAntiga(identificador: string, quantas: number): Promise<void> {
  const atual = process.env.LOGIN_HMAC_SECRET;
  process.env.LOGIN_HMAC_SECRET = SEGREDO_ANTERIOR; // o que era "atual" quando aquelas falhas ocorreram
  semRotacao();
  try {
    for (let i = 0; i < quantas; i++) await servico.registrarFalha(identificador);
  } finally {
    process.env.LOGIN_HMAC_SECRET = atual;
  }
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente: a rotação é testada contra PostgreSQL real.');
  }
  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.$connect();
  servico = new LoginFailureService(prisma as unknown as PrismaService, logger);
});

afterAll(async () => {
  await limparTudo();
  await prisma.$disconnect();
});

/** Apaga as linhas deste arquivo sob AS DUAS chaves — a atual e a anterior. */
async function limparTudo(): Promise<void> {
  comRotacaoEmCurso();
  for (const id of [ALVO, OUTRO]) await servico.limpar(id);
  semRotacao();
}

beforeEach(async () => {
  eventos.length = 0;
  process.env.LOGIN_HMAC_SECRET = SEGREDO_ATUAL;
  process.env.LOGIN_HMAC_KEY_VERSION = '2';
  await limparTudo();
});

afterEach(() => {
  semRotacao();
});

describe('a rotação não pode zerar o limite', () => {
  it('as falhas da chave ANTIGA continuam contando durante a sobreposição', async () => {
    await falhasSobAChaveAntiga(ALVO, MAX_FALHAS);

    comRotacaoEmCurso();

    // A vítima estava sob ataque e o limite tinha sido atingido. A rotação aconteceu no meio. Se a
    // chave anterior não fosse consultada, este `estaBloqueado` diria `false` — e o atacante
    // recomeçaria do zero.
    expect(await servico.estaBloqueado(ALVO)).toBe(true);
  });

  it('falhas SOMAM entre as versões: 3 antigas + 2 novas bloqueiam', async () => {
    await falhasSobAChaveAntiga(ALVO, 3);

    comRotacaoEmCurso();

    const quarta = await servico.registrarFalha(ALVO);
    expect(quarta.bloqueado).toBe(false);
    expect(quarta.count).toBe(4); // 3 antigas + 1 nova

    const quinta = await servico.registrarFalha(ALVO);
    expect(quinta.count).toBe(MAX_FALHAS);
    expect(quinta.bloqueado).toBe(true);
  });

  it('a falha NOVA é gravada na versão ATUAL, não na antiga', async () => {
    comRotacaoEmCurso();
    await servico.registrarFalha(ALVO);

    const [chaveAtual, chaveAnterior] = servico.chavesDe(ALVO);

    const linhas = await prisma.$queryRaw<{ key: string; keyVersion: number }[]>`
      SELECT "key", "keyVersion" FROM "LoginFailure" WHERE "key" = ANY(${servico.chavesDe(ALVO)}::text[])
    `;

    // Uma linha só, na chave atual, carimbada com a versão atual.
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.key).toBe(chaveAtual);
    expect(linhas[0]?.keyVersion).toBe(2);
    expect(chaveAnterior).not.toBe(chaveAtual);
  });

  it('o sucesso limpa as DUAS versões', async () => {
    await falhasSobAChaveAntiga(ALVO, 3);
    comRotacaoEmCurso();
    await servico.registrarFalha(ALVO);

    await servico.limpar(ALVO);

    // Se `limpar` só apagasse a chave atual, a contagem antiga sobreviveria: o usuário legítimo
    // acertaria a senha e continuaria bloqueado até a janela antiga expirar.
    expect(await servico.estaBloqueado(ALVO)).toBe(false);

    const linhas = await prisma.$queryRaw<{ key: string }[]>`
      SELECT "key" FROM "LoginFailure" WHERE "key" = ANY(${servico.chavesDe(ALVO)}::text[])
    `;
    expect(linhas).toHaveLength(0);
  });

  it('expirada a janela, a contagem antiga deixa de valer (sem esperar 15 minutos)', async () => {
    await falhasSobAChaveAntiga(ALVO, MAX_FALHAS);
    comRotacaoEmCurso();
    expect(await servico.estaBloqueado(ALVO)).toBe(true);

    // Envelhece a janela da chave ANTIGA. É este o momento em que ela pode ser aposentada com
    // segurança — e não antes.
    const chaves = servico.chavesDe(ALVO);
    await prisma.$executeRaw`
      UPDATE "LoginFailure" SET "windowStart" = now() - interval '16 minutes'
      WHERE "key" = ANY(${chaves}::text[])
    `;

    expect(await servico.estaBloqueado(ALVO)).toBe(false);
  });

  it('aposentar a chave anterior DEPOIS da janela não desbloqueia ninguém indevidamente', async () => {
    await falhasSobAChaveAntiga(ALVO, MAX_FALHAS);

    // A operação removeu `LOGIN_HMAC_PREVIOUS_SECRET` do ambiente.
    semRotacao();

    // A contagem antiga deixa de ser vista — e é exatamente por isso que a remoção só pode acontecer
    // depois de decorrida a janela. Antes disso, seria uma anistia silenciosa.
    expect(await servico.estaBloqueado(ALVO)).toBe(false);

    // E o contador atual começa do zero, coerente: 5 falhas novas voltam a bloquear.
    for (let i = 0; i < MAX_FALHAS; i++) await servico.registrarFalha(ALVO);
    expect(await servico.estaBloqueado(ALVO)).toBe(true);
  });

  it('a rotação não contamina outro identificador', async () => {
    await falhasSobAChaveAntiga(ALVO, MAX_FALHAS);
    comRotacaoEmCurso();

    expect(await servico.estaBloqueado(OUTRO)).toBe(false);
  });
});

describe('PII: nem o e-mail, nem o segredo', () => {
  it('nenhuma das duas chaves contém o e-mail, e o log não vaza identificador', async () => {
    await falhasSobAChaveAntiga(ALVO, 1);
    comRotacaoEmCurso();
    await servico.registrarFalha(ALVO);

    const linhas = await prisma.$queryRaw<{ key: string }[]>`SELECT "key" FROM "LoginFailure"`;
    const tudo = JSON.stringify(linhas);

    expect(tudo).not.toContain(ALVO);
    expect(tudo).not.toContain('exemplo.test');
    for (const chave of servico.chavesDe(ALVO)) expect(chave).toMatch(/^[0-9a-f]{64}$/);

    const log = JSON.stringify(eventos);
    expect(log).not.toContain(ALVO);
    expect(log).not.toContain(SEGREDO_ATUAL);
    expect(log).not.toContain(SEGREDO_ANTERIOR);
    for (const chave of servico.chavesDe(ALVO)) expect(log).not.toContain(chave);
  });

  it('duas INSTÂNCIAS com a mesma configuração derivam a MESMA chave', async () => {
    // O contador é compartilhado porque a chave é determinística: mesmo segredo, mesmo
    // identificador, mesma chave. Se a derivação carregasse qualquer estado local (um salt por
    // processo, por exemplo), cada réplica teria o próprio contador e o limite efetivo seria N×.
    const outraInstancia = new LoginFailureService(prisma as unknown as PrismaService, logger);

    expect(outraInstancia.chaveDe(ALVO)).toBe(servico.chaveDe(ALVO));

    comRotacaoEmCurso();
    expect(outraInstancia.chavesDe(ALVO)).toEqual(servico.chavesDe(ALVO));
  });
});

describe('configuração da rotação: falha no boot, não em silêncio', () => {
  const base = {
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:3001',
    LOGIN_HMAC_SECRET: SEGREDO_ATUAL,
  };

  it('segredo ausente impede o boot (não há default)', () => {
    // Um default aqui seria um segredo público: as chaves de todo mundo seriam deriváveis por quem
    // lesse o repositório.
    const semSegredo: Record<string, string> = { ...base };
    delete semSegredo.LOGIN_HMAC_SECRET;

    expect(() => loadEnv({ ...semSegredo, NODE_ENV: 'production' })).toThrow(ConfigValidationError);
  });

  it('segredo curto demais impede o boot', () => {
    expect(() => loadEnv({ ...base, LOGIN_HMAC_SECRET: 'curto' })).toThrow(ConfigValidationError);
  });

  it('meia rotação (segredo sem versão) impede o boot', () => {
    expect(() => loadEnv({ ...base, LOGIN_HMAC_PREVIOUS_SECRET: SEGREDO_ANTERIOR })).toThrow(
      /juntas/,
    );
  });

  it('segredo anterior IGUAL ao atual impede o boot', () => {
    // Seria a mesma chave derivada duas vezes: a linha entraria duas vezes na soma e o usuário
    // bloquearia com 3 falhas em vez de 5 — um bug de disponibilidade que ninguém entenderia.
    expect(() =>
      loadEnv({
        ...base,
        LOGIN_HMAC_PREVIOUS_SECRET: SEGREDO_ATUAL,
        LOGIN_HMAC_PREVIOUS_KEY_VERSION: '1',
        LOGIN_HMAC_KEY_VERSION: '2',
      }),
    ).toThrow(/contada duas vezes/);
  });

  it('versão anterior igual à atual impede o boot', () => {
    expect(() =>
      loadEnv({
        ...base,
        LOGIN_HMAC_PREVIOUS_SECRET: SEGREDO_ANTERIOR,
        LOGIN_HMAC_PREVIOUS_KEY_VERSION: '2',
        LOGIN_HMAC_KEY_VERSION: '2',
      }),
    ).toThrow(/irrastreável/);
  });

  it('a mensagem de erro cita o NOME da variável, nunca o valor', () => {
    try {
      loadEnv({ ...base, LOGIN_HMAC_SECRET: 'curto-demais-mas-secreto' });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain('LOGIN_HMAC_SECRET');
      expect(mensagem).not.toContain('curto-demais-mas-secreto');
    }
  });

  it('variável VAZIA é ausência, não valor inválido', () => {
    // `LOGIN_HMAC_PREVIOUS_SECRET=` (sem valor) é o estado normal fora de uma rotação: é assim que
    // ela aparece no `.env.example` e é assim que o Compose a repassa quando não está definida.
    //
    // Se a string vazia contasse como "presente", ela reprovaria no `min(32)` — e quem copiasse o
    // `.env.example` receberia, no boot, uma reclamação sobre um segredo curto demais que jamais
    // definiu. O Compose reproduziu exatamente isso.
    const env = loadEnv({
      ...base,
      LOGIN_HMAC_PREVIOUS_SECRET: '',
      LOGIN_HMAC_PREVIOUS_KEY_VERSION: '',
    });

    expect(env.LOGIN_HMAC_PREVIOUS_SECRET).toBeUndefined();
    expect(env.LOGIN_HMAC_PREVIOUS_KEY_VERSION).toBeUndefined();
  });

  it('a rotação bem configurada passa', () => {
    expect(() =>
      loadEnv({
        ...base,
        LOGIN_HMAC_KEY_VERSION: '2',
        LOGIN_HMAC_PREVIOUS_SECRET: SEGREDO_ANTERIOR,
        LOGIN_HMAC_PREVIOUS_KEY_VERSION: '1',
      }),
    ).not.toThrow();
  });
});
