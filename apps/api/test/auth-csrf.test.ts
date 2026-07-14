import { beforeEach, describe, expect, it } from 'vitest';
import type { PinoLogger } from 'nestjs-pino';
import { criarAuth } from '../src/kernel/auth/auth.factory';
import type { LoginFailureService } from '../src/kernel/auth/login-failure.service';
import type { PrismaService } from '../src/kernel/db/prisma.service';

/**
 * A allowlist de origens confiáveis (CSRF).
 *
 * O Better Auth recusa requisições cuja `Origin` não esteja na lista — é o que impede um site
 * terceiro de disparar login ou logout no navegador de quem está autenticado.
 *
 * O default é apenas o `baseURL` (a própria API). Como quem faz login é o navegador, a partir da Web
 * em outra porta, o default rejeitaria **todo** login vindo do front. Descobrimos isso no container
 * de produção: no ambiente de teste a checagem de origem é relaxada, e a suíte passava sem nunca
 * encostar nela. Por isso este teste olha para a CONFIGURAÇÃO — é o que o ambiente de teste permite
 * afirmar honestamente. O comportamento HTTP real está provado contra o container, em
 * `gates/1-4/summary.md`.
 */

const prismaFalso = {} as unknown as PrismaService;
const falhasFalso = {} as unknown as LoginFailureService;
// A config do rate limit só toca o logger DENTRO do `consume` (caminho de erro); construir o auth não o
// invoca. Um objeto vazio basta para estes testes de configuração.
const loggerFalso = {} as unknown as PinoLogger;

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
  process.env.BETTER_AUTH_URL = 'http://localhost:3001';
  process.env.LOGIN_HMAC_SECRET = 'y'.repeat(32);
  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
});

describe('trustedOrigins', () => {
  it('é a MESMA allowlist do CORS — não uma segunda lista', () => {
    // Duas listas divergiriam com o tempo, e a que ninguém revisa é a que acaba autorizando a origem
    // errada.
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://app.exemplo.test';

    const auth = criarAuth(prismaFalso, falhasFalso, loggerFalso);

    expect(auth.options.trustedOrigins).toEqual([
      'http://localhost:3000',
      'https://app.exemplo.test',
    ]);
  });

  it('inclui a origem da Web — sem isso, todo login do front seria recusado', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

    const auth = criarAuth(prismaFalso, falhasFalso, loggerFalso);

    expect(auth.options.trustedOrigins).toContain('http://localhost:3000');
  });

  it('NÃO inclui origem fora da allowlist', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

    const auth = criarAuth(prismaFalso, falhasFalso, loggerFalso);

    expect(auth.options.trustedOrigins).not.toContain('https://site-malicioso.test');
    // E não há curinga: um `*` aqui anularia a proteção inteira.
    expect(auth.options.trustedOrigins).not.toContain('*');
  });
});

describe('cadastro aberto', () => {
  it('`/sign-up/email` está DESLIGADO', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

    const auth = criarAuth(prismaFalso, falhasFalso, loggerFalso);

    // Ligar `emailAndPassword` habilita o cadastro junto. Esta Story entrega LOGIN; contas entram
    // por convite do Admin (Épico 8). Deixar ligado publicaria autocadastro na internet por descuido
    // de configuração — sem verificação de e-mail e sem dono.
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });
});
