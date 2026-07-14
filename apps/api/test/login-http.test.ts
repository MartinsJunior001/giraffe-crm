import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { LoginFailureService, MAX_FALHAS } from '../src/kernel/auth/login-failure.service';
import { G2_MAX, ROTA_LOGIN } from '../src/kernel/auth/auth.factory';
import { PrismaClient } from '../generated/prisma';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { PinoLogger } from 'nestjs-pino';

/**
 * Login pela porta da frente: `AppModule` REAL, HTTP real, PostgreSQL real.
 *
 * O que este arquivo prova, e os testes de unidade não podiam provar: que o G1 está de fato ligado
 * ao fluxo de login (não apenas correto isoladamente), que a rejeição não enumera contas, e que o
 * `SessaoPrincipalProvider` de verdade substituiu o provider que negava tudo.
 */

const SENHA = 'senha-de-desenvolvimento-123';
const SENHA_ERRADA = 'senha-obviamente-errada-999';

/** Contas do seed. Ver o cabeçalho de `prisma/seed.sql` para o papel de cada uma. */
const ANA = 'ana@exemplo.test'; // ACTIVE só na Org A
const EVA = 'eva@exemplo.test'; // ACTIVE nas Orgs A e B
const DANI = 'dani@exemplo.test'; // nenhuma Membership
const INEXISTENTE = 'nao-existe-jamais@exemplo.test';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient;
let falhas: LoginFailureService;

const semLog = { warn: () => {}, info: () => {}, error: () => {} } as unknown as PinoLogger;

async function login(
  email: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  });
}

/** Extrai o cookie de sessão para reusá-lo nas requisições autenticadas. */
function cookieDe(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

/**
 * Identificador sintético, exclusivo DESTA execução.
 *
 * O sufixo aleatório não é enfeite. Sem ele, `spray-0@exemplo.test` é o mesmo em toda rodada da
 * suíte, e o contador de falhas do G1 — que vive no banco, de propósito — **acumula entre execuções**:
 * depois de cinco rodadas o identificador chega bloqueado, e um teste que fala sobre o G2 passa a
 * receber 429 do G1, na primeira requisição, por um motivo que não é o que ele afirma medir.
 *
 * Aconteceu de verdade aqui. Cada e-mail devolvido é registrado para ser limpo no `afterAll`.
 */
const EXECUCAO = randomUUID().slice(0, 8);
const sinteticos = new Set<string>();

function sintetico(nome: string): string {
  const id = `${nome}-${EXECUCAO}@exemplo.test`;
  sinteticos.add(id);
  return id;
}

/**
 * Zera o contador do G2 (rate limit nativo, por IP+rota) **DESTE arquivo**.
 *
 * Necessário porque TODOS os testes deste arquivo saem do loopback, e o G2 corta em 20 solicitações
 * por 15 minutos. Sem isto, o 21º request do arquivo — qualquer um — levaria 429, e os testes
 * seguintes falhariam por um motivo que não é o que eles afirmam medir. O teste do G2 abaixo é o
 * único que o exercita de propósito.
 *
 * Este arquivo NÃO usa proxy confiável (de propósito: os testes D5 provam que um X-Forwarded-For
 * forjado é ignorado). Logo o IP do balde é o do peer loopback, cuja forma varia por ambiente
 * (`::1`, `127.0.0.1`, ou o IPv6 expandido `0000:...:0000`). Por isso a limpeza casa pelo SUFIXO da
 * rota — mas **exclui a faixa reservada de documentação `203.0.113.*` (TEST-NET-3, RFC 5737)**, que
 * pertence às suítes de contagem exata (ex.: `rate-limit-native`, que usa um IP único dessa faixa via
 * proxy confiável). Sem essa exclusão, este `beforeEach` zerava o contador do vizinho no meio de uma
 * contagem, sob execução PARALELA no CI, e o fazia falhar de forma não-determinística.
 */
async function limparRateLimit(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "RateLimit"
    WHERE "key" LIKE ${'%' + ROTA_LOGIN} AND "key" NOT LIKE ${'203.0.113.%'}
  `;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';

  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.$connect();
  falhas = new LoginFailureService(prisma as unknown as PrismaService, semLog);

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  // Inclui os sintéticos: sem isso, o contador do G1 deles sobreviveria para envenenar a próxima
  // execução da suíte.
  for (const id of [ANA, EVA, DANI, INEXISTENTE, ...sinteticos]) await falhas.limpar(id);
  await limparRateLimit();
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Cada teste começa com os contadores DESTE arquivo zerados — G1 e G2.
  for (const id of [ANA, EVA, DANI, INEXISTENTE]) await falhas.limpar(id);
  await limparRateLimit();
});

describe('login (caminho positivo)', () => {
  it('credenciais válidas ⇒ 200 e sessão', async () => {
    const res = await login(ANA, SENHA);

    expect(res.status).toBe(200);
    expect(cookieDe(res)).toMatch(/session/i);
  });

  it('a sessão vira IDENTIDADE: a rota de domínio para de responder 401', async () => {
    // Esta é a Story inteira do lado da autorização. Antes da 1.4, `/organizations/current`
    // respondia 401 para todo mundo, porque o `PrincipalProvider` devolvia sempre `null`.
    const cookie = cookieDe(await login(ANA, SENHA));

    const res = await fetch(`${baseUrl}/organizations/current`, { headers: { cookie } });

    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id: ORG_A });
  });

  it('sem cookie, a mesma rota continua 401', async () => {
    const res = await fetch(`${baseUrl}/organizations/current`);
    expect(res.status).toBe(401);
  });

  it('cookie adulterado ⇒ 401, não 500', async () => {
    const res = await fetch(`${baseUrl}/organizations/current`, {
      headers: { cookie: 'better-auth.session_token=lixo.assinatura-invalida' },
    });

    // Sessão inválida é AUSÊNCIA de identidade, não erro do servidor.
    expect(res.status).toBe(401);
  });
});

describe('resolução inicial da Organização', () => {
  it('conta SEM Membership ativa: autentica, mas não obtém Organização (FR-414)', async () => {
    // Dani tem conta e senha, e nenhum vínculo. O login FUNCIONA — ela é uma pessoa válida — mas ela
    // não entra em Organização nenhuma. É o "estado autenticado sem Organização" do AC3: não é erro
    // de credencial, e tratá-lo como tal mentiria para o usuário.
    const res = await login(DANI, SENHA);
    expect(res.status).toBe(200);

    const cookie = cookieDe(res);
    const org = await fetch(`${baseUrl}/organizations/current`, { headers: { cookie } });

    // 403 (autenticado, sem Organização) — e não 401 (não sei quem você é).
    expect(org.status).toBe(403);
  });

  it('múltiplas Organizações ativas exigem escolha EXPLÍCITA (FR-416)', async () => {
    const cookie = cookieDe(await login(EVA, SENHA));

    const semEscolha = await fetch(`${baseUrl}/organizations/current`, { headers: { cookie } });
    expect(semEscolha.status).toBe(403); // não adivinha

    const comEscolha = await fetch(`${baseUrl}/organizations/current`, {
      headers: { cookie, 'x-org-id': ORG_B },
    });
    expect(comEscolha.status).toBe(200);
    expect((await comEscolha.json()) as { id: string }).toMatchObject({ id: ORG_B });
  });

  it('pedir Organização alheia ⇒ 403, mesmo autenticado (FR-418)', async () => {
    // A sessão diz quem a pessoa É. Ela não diz o que a pessoa PODE. Quem decide continua sendo a
    // Membership ativa — o `OrgContextResolver` da 1.3, que não mudou uma linha.
    const cookie = cookieDe(await login(ANA, SENHA));

    const res = await fetch(`${baseUrl}/organizations/current`, {
      headers: { cookie, 'x-org-id': ORG_B },
    });

    expect(res.status).toBe(403);
  });
});

describe('enumeração — a rejeição não pode dizer quem existe', () => {
  it('senha errada e conta inexistente são INDISTINGUÍVEIS', async () => {
    const existente = await login(ANA, SENHA_ERRADA);
    const inexistente = await login(INEXISTENTE, SENHA_ERRADA);

    // Mesmo status.
    expect(existente.status).toBe(inexistente.status);

    // Mesmo corpo. Se um dissesse "usuário não encontrado" e o outro "senha inválida", um atacante
    // mapearia a base inteira de e-mails sem jamais acertar uma senha.
    expect(await existente.text()).toBe(await inexistente.text());
  });

  it('o corpo do erro não confirma a existência da conta', async () => {
    const corpo = await (await login(INEXISTENTE, SENHA_ERRADA)).text();

    expect(corpo.toLowerCase()).not.toMatch(/not found|não encontrad|does not exist|no such user/);
  });

  it('o tempo dos dois caminhos fica na mesma ordem de grandeza', async () => {
    // Responder a mesma mensagem não basta: se "conta não existe" fosse muito mais rápido (por não
    // ter hash de senha a verificar), o relógio viraria o oráculo que a mensagem escondeu.
    const medir = async (email: string) => {
      const t0 = performance.now();
      await login(email, SENHA_ERRADA);
      return performance.now() - t0;
    };

    // Três medições de cada, tomando a MEDIANA — uma única amostra é ruído de agendador.
    const mediana = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const tExistente = mediana([await medir(ANA), await medir(ANA), await medir(ANA)]);
    const tInexistente = mediana([
      await medir(INEXISTENTE),
      await medir(INEXISTENTE),
      await medir(INEXISTENTE),
    ]);

    // O limite é frouxo de propósito: o que se quer excluir é uma diferença de ORDEM DE GRANDEZA
    // (ex.: 1ms vs 120ms), que é o que um atacante consegue explorar pela rede. Um limite apertado
    // aqui produziria um teste instável, e teste instável é teste que a equipe aprende a ignorar.
    //
    // O piso de comparação é 5ms (não 1ms): sobre uma base de 1-2ms, um hiccup de GC/agendador em CI
    // contencionado dispararia a razão sem que houvesse diferença real. O que importa é que os dois
    // caminhos rodam o mesmo hash — provado de fato pelo corpo idêntico nos testes acima; este é o
    // reforço temporal, deliberadamente tolerante.
    const razao =
      Math.max(tExistente, tInexistente) / Math.max(5, Math.min(tExistente, tInexistente));
    expect(razao).toBeLessThan(10);
  });
});

describe('G1 — falhas por identificador', () => {
  it(`a ${MAX_FALHAS + 1}ª tentativa é 429 — MESMO com a senha correta`, async () => {
    for (let i = 0; i < MAX_FALHAS; i++) {
      const r = await login(ANA, SENHA_ERRADA);
      expect(r.status).toBe(401);
    }

    // A senha agora está CERTA. E ainda assim é negada: o bloqueio é verificado ANTES de conferir a
    // senha. Se fosse depois, bastaria ao atacante acertar na tentativa seguinte à quinta, e o
    // limite não limitaria nada.
    const res = await login(ANA, SENHA);

    expect(res.status).toBe(429);
    expect(res.headers.get('x-retry-after')).toBeTruthy();
  });

  it('o 429 do G1 não revela se a conta existe', async () => {
    for (let i = 0; i < MAX_FALHAS; i++) await login(INEXISTENTE, SENHA_ERRADA);

    const res = await login(INEXISTENTE, SENHA_ERRADA);

    // Uma conta INEXISTENTE também é limitada. Se só contas reais fossem bloqueadas, o 429 seria o
    // oráculo de enumeração que a mensagem neutra tentou fechar.
    expect(res.status).toBe(429);
  });

  it('o sucesso limpa o contador do identificador (G4)', async () => {
    for (let i = 0; i < MAX_FALHAS - 1; i++) await login(ANA, SENHA_ERRADA);

    const ok = await login(ANA, SENHA);
    expect(ok.status).toBe(200);

    // Zerado: a 5ª falha depois do sucesso não bloqueia (seria a 1ª da nova contagem).
    expect(await falhas.estaBloqueado(ANA)).toBe(false);
  });

  it('o limite de uma conta NÃO derruba outra', async () => {
    for (let i = 0; i < MAX_FALHAS; i++) await login(ANA, SENHA_ERRADA);

    // Eva não tem nada com isso. Se o contador fosse por IP (e não por identificador), ela cairia
    // junto — e um atacante derrubaria uma empresa inteira estourando o limite de um único e-mail.
    const res = await login(EVA, SENHA);
    expect(res.status).toBe(200);
  });

  it('rajada CONCORRENTE contra uma conta: no máximo 5 senhas chegam a ser verificadas', async () => {
    // O ataque real, e o que o desenho anterior NÃO continha. Antes, o bloqueio era um SELECT no
    // `before` e o incremento vinha no `after`, depois da verificação de senha — com o hash lento no
    // meio ALARGANDO a janela. Uma rajada simultânea lia toda o contador baixo, passava toda, e só
    // então incrementava: dezenas de senhas verificadas contra uma conta cujo limite é 5.
    //
    // Um 401 significa "a senha foi verificada" (e falhou); um 429, "barrado antes de tocar a senha".
    // Com a decisão atômica no `before`, no máximo 5 requisições chegam ao 401.
    const alvo = sintetico('rajada');
    const N = 15; // < 20 para isolar o G1 do G2 (limite por IP)

    const respostas = await Promise.all(Array.from({ length: N }, () => login(alvo, SENHA_ERRADA)));
    const status = respostas.map((r) => r.status);

    const verificadas = status.filter((s) => s === 401).length;
    const barradas = status.filter((s) => s === 429).length;

    expect(verificadas).toBeLessThanOrEqual(MAX_FALHAS); // ≤ 5 senhas verificadas
    expect(verificadas + barradas).toBe(N); // toda requisição foi 401 ou 429
    expect(barradas).toBeGreaterThanOrEqual(N - MAX_FALHAS); // ≥ 10 barradas
  });
});

describe('G2 — solicitações por IP (rate limiter nativo)', () => {
  it(`a ${G2_MAX + 1}ª solicitação do MESMO IP é 429, com X-Retry-After`, async () => {
    // O identificador MUDA a cada tentativa — de propósito. Assim nenhuma delas acumula no contador
    // do G1, e o 429 que aparecer só pode ter vindo do limite por ORIGEM.
    //
    // É o G2 que cobre o ataque que o G1 não vê: uma lista de mil e-mails, uma senha comum em cada,
    // nenhuma conta chegando perto de 5 falhas.
    for (let i = 0; i < G2_MAX; i++) {
      const r = await login(sintetico(`spray-${i}`), SENHA_ERRADA);
      expect(r.status).not.toBe(429);
    }

    const excedente = await login(sintetico(`spray-${G2_MAX}`), SENHA_ERRADA);

    expect(excedente.status).toBe(429);
    expect(excedente.headers.get('x-retry-after')).toBeTruthy();
  });

  it('o login bem-sucedido NÃO zera o contador do IP (G4)', async () => {
    // A regra ratificada: o sucesso limpa o contador do IDENTIFICADOR, e só ele.
    //
    // Se o sucesso também zerasse o G2, o atacante intercalaria um login válido da própria conta a
    // cada 19 tentativas e pulverizaria a base para sempre, sem nunca estourar o limite de origem.
    for (let i = 0; i < G2_MAX - 1; i++) {
      await login(sintetico(`spray2-${i}`), SENHA_ERRADA);
    }

    const ok = await login(ANA, SENHA); // 20ª solicitação — e ela FUNCIONA
    expect(ok.status).toBe(200);

    // 21ª: o contador de origem seguiu contando por cima do sucesso.
    const excedente = await login(sintetico('spray2-final'), SENHA_ERRADA);
    expect(excedente.status).toBe(429);
  });

  it('o contador vive no BANCO: sobrevive ao reinício do processo', async () => {
    // `storage: 'memory'` (o padrão do Better Auth) perderia a contagem a cada restart — e o atacante
    // zeraria o limite esperando o container reciclar. Aqui derrubamos e subimos a aplicação de
    // verdade, e a contagem continua de onde parou.
    for (let i = 0; i < G2_MAX; i++) {
      await login(sintetico(`restart-${i}`), SENHA_ERRADA);
    }

    const reiniciada = await NestFactory.create(AppModule, { logger: false });
    await reiniciada.listen(0);
    const outraUrl = await reiniciada.getUrl();

    try {
      const res = await fetch(`${outraUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: sintetico('restart-final'), password: SENHA_ERRADA }),
      });

      // Processo novo, contador antigo: 429 na primeira requisição que ele atende.
      expect(res.status).toBe(429);
    } finally {
      await reiniciada.close();
    }
  });

  it('duas INSTÂNCIAS compartilham o limite (não é 2× o limite)', async () => {
    // Com contador em memória, duas réplicas dariam 20 tentativas CADA — o limite efetivo dobraria,
    // e com N réplicas seria N×. Aqui as duas instâncias sobem ao mesmo tempo e dividem o mesmo
    // orçamento de 20, porque a contagem está no banco.
    const segunda = await NestFactory.create(AppModule, { logger: false });
    await segunda.listen(0);
    const urlB = await segunda.getUrl();

    try {
      // 10 na instância A…
      for (let i = 0; i < 10; i++) await login(sintetico(`multi-a-${i}`), SENHA_ERRADA);

      // …e 10 na instância B. Somadas, são exatamente as 20 do G2.
      for (let i = 0; i < 10; i++) {
        await fetch(`${urlB}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: sintetico(`multi-b-${i}`), password: SENHA_ERRADA }),
        });
      }

      // A 21ª é barrada — em QUALQUER uma das duas.
      const res = await login(sintetico('multi-final'), SENHA_ERRADA);
      expect(res.status).toBe(429);
    } finally {
      await segunda.close();
    }
  });
});

describe('FR-403 — a senha jamais aparece nos logs', () => {
  it('nem no login que falha, nem no que tem sucesso, a senha em claro é registrada', async () => {
    // A senha viaja no corpo da requisição. Se qualquer ponto do pipeline serializasse esse corpo num
    // log (um pino-http mal configurado, um catch que loga o request), a senha vazaria para o arquivo
    // de log — que costuma ter retenção longa e leitura ampla. Aqui subimos uma instância com o log
    // LIGADO, capturamos TUDO que ela escreve, e provamos que a senha não está lá.
    const nivelAnterior = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info'; // a instância padrão do arquivo é 'silent'; aqui queremos o log real

    const capturado: string[] = [];
    const stdoutReal = process.stdout.write.bind(process.stdout);
    const stderrReal = process.stderr.write.bind(process.stderr);
    const capturar =
      (real: typeof stdoutReal) =>
      (chunk: unknown, ...resto: unknown[]): boolean => {
        capturado.push(typeof chunk === 'string' ? chunk : String(chunk));
        return (real as (...args: unknown[]) => boolean)(chunk, ...resto);
      };
    (process.stdout as { write: unknown }).write = capturar(stdoutReal);
    (process.stderr as { write: unknown }).write = capturar(stderrReal);

    let comLog: INestApplication | undefined;
    try {
      // SEM `logger: false`: queremos o pino-http de verdade emitindo o log de cada requisição.
      comLog = await NestFactory.create(AppModule);
      await comLog.listen(0);
      const url = await comLog.getUrl();

      const post = (email: string, password: string) =>
        fetch(`${url}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

      await post(sintetico('fr403-falha'), SENHA_ERRADA); // caminho de erro (401)
      await post(ANA, SENHA); // caminho de sucesso (200)

      // pino-http registra na conclusão da resposta; um respiro garante o flush do log da resposta.
      await new Promise((r) => setTimeout(r, 100));

      const tudo = capturado.join('');

      // Guarda contra falso-positivo: se a captura viesse vazia (pino escrevendo direto no fd),
      // o `not.toContain` passaria sem ter olhado nada. Exigimos evidência de que HOUVE log.
      expect(tudo.length).toBeGreaterThan(0);
      expect(tudo).toContain('giraffe-api'); // o `base` do pino — prova que capturamos o log da app

      // O essencial: nenhuma das senhas em claro está no que foi logado.
      expect(tudo).not.toContain(SENHA);
      expect(tudo).not.toContain(SENHA_ERRADA);
    } finally {
      (process.stdout as { write: unknown }).write = stdoutReal;
      (process.stderr as { write: unknown }).write = stderrReal;
      process.env.LOG_LEVEL = nivelAnterior;
      await comLog?.close();
    }
  });
});

describe('IP: só do proxy confiável (D5)', () => {
  it('X-Forwarded-For forjado NÃO contorna o G2 — o ataque direto ao limite por origem', async () => {
    // Este é O teste do D5, e ele já pegou o defeito real: o `getIp()` do Better Auth honra um
    // `X-Forwarded-For` de valor único quando não há proxy confiável configurado. Com o header
    // vencendo, o atacante trocava de "IP" a cada requisição, cada uma caía num contador novo, e o
    // G2 NUNCA disparava — o limite por origem era pura decoração.
    //
    // Hoje quem resolve o IP é o `AuthController`, a partir do socket (ver `client-ip.ts`). Aqui
    // cada tentativa chega com um IP forjado diferente — e todas caem no mesmo contador.
    for (let i = 0; i < G2_MAX; i++) {
      const r = await login(sintetico(`forjado-${i}`), SENHA_ERRADA, {
        'x-forwarded-for': `203.0.113.${i}`,
      });
      expect(r.status).not.toBe(429);
    }

    const res = await login(sintetico('forjado-final'), SENHA_ERRADA, {
      'x-forwarded-for': '198.51.100.77',
    });

    expect(res.status).toBe(429);
  });

  it('header encaminhado sintaticamente inválido não derruba o servidor', async () => {
    // Lixo em `X-Forwarded-For` deve ser ignorado como qualquer outro header não confiável — não
    // virar 500 (que seria um DoS de uma linha: manda lixo, derruba o login).
    const res = await login(ANA, SENHA, { 'x-forwarded-for': 'não-é-um-ip, ,,, 999.999.999.999' });

    expect(res.status).toBe(200);
  });

  it('o G1 conta o identificador mesmo com o IP forjado variando', async () => {
    // O G1 não depende de IP nenhum: ele conta falhas por CONTA. Trocar de "IP" a cada tentativa não
    // dá ao atacante um orçamento novo de 5 falhas contra a mesma vítima.
    for (let i = 0; i < MAX_FALHAS; i++) {
      await login(ANA, SENHA_ERRADA, { 'x-forwarded-for': `203.0.113.${i}` });
    }

    const res = await login(ANA, SENHA, { 'x-forwarded-for': '203.0.113.99' });
    expect(res.status).toBe(429);
  });
});
