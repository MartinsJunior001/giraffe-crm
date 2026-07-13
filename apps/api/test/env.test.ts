import { afterEach, describe, expect, it } from 'vitest';
import { ConfigValidationError, getEnv, loadEnv, parseCorsOrigins } from '../src/kernel/config/env';

const DB_URL = 'postgresql://giraffe_app:pw@localhost:5434/giraffe?schema=public';

/** Segredos FICTÍCIOS, no comprimento mínimo que o schema exige. Não são credenciais. */
const SEGREDO = 'a'.repeat(64);

/**
 * O mínimo OBRIGATÓRIO para o ambiente ser válido.
 *
 * A Story 1.4 acrescentou os segredos de sessão e do HMAC do contador de falhas. Eles entram aqui
 * — e não ganham um default — porque um default para segredo é a pior espécie de conveniência: a
 * aplicação sobe, parece funcionar, e todo mundo em produção compartilha a mesma chave.
 */
const obrigatorias = {
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: DB_URL,
  BETTER_AUTH_SECRET: SEGREDO,
  BETTER_AUTH_URL: 'http://localhost:3001',
  LOGIN_HMAC_SECRET: SEGREDO,
} as NodeJS.ProcessEnv;

const validBase = {
  ...obrigatorias,
  NODE_ENV: 'test',
  API_PORT: '3001',
  LOG_LEVEL: 'info',
} as NodeJS.ProcessEnv;

describe('loadEnv (validação server-side / fail-fast)', () => {
  it('aceita configuração válida e aplica defaults', () => {
    const env = loadEnv({ ...obrigatorias } as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe('info');
    // Sem proxy confiável declarado, o IP vem do socket — o default SEGURO (D5). Um default
    // permissivo aqui (confiar em X-Forwarded-For) faria o limite por IP nascer contornável.
    expect(env.TRUSTED_PROXY_IPS).toBe('');
    expect(env.LOGIN_HMAC_KEY_VERSION).toBe(1);
  });

  it('falha honestamente quando CORS_ALLOWED_ORIGINS está ausente', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrowError(ConfigValidationError);
    try {
      loadEnv({} as NodeJS.ProcessEnv);
    } catch (err) {
      const e = err as ConfigValidationError;
      expect(e.issues.some((i) => i.includes('CORS_ALLOWED_ORIGINS'))).toBe(true);
    }
  });

  it('mensagem de erro NÃO vaza o valor fornecido (sanitizada)', () => {
    const secretish = 'super-secret-value-1234';
    try {
      loadEnv({ CORS_ALLOWED_ORIGINS: 'http://ok', API_PORT: secretish } as NodeJS.ProcessEnv);
      throw new Error('deveria ter falhado');
    } catch (err) {
      const e = err as ConfigValidationError;
      expect(e.message).not.toContain(secretish);
    }
  });

  it('parseCorsOrigins limpa e separa origens', () => {
    expect(parseCorsOrigins('http://a , http://b ,')).toEqual(['http://a', 'http://b']);
  });

  it('rejeita API_PORT inválida', () => {
    expect(() => loadEnv({ ...validBase, API_PORT: 'abc' })).toThrowError(ConfigValidationError);
  });

  it('exige DATABASE_URL — sem banco, a API não sobe', () => {
    const semBanco = { ...validBase };
    delete semBanco.DATABASE_URL;

    expect(() => loadEnv(semBanco)).toThrowError(ConfigValidationError);
    try {
      loadEnv(semBanco);
    } catch (err) {
      expect((err as ConfigValidationError).issues.some((i) => i.includes('DATABASE_URL'))).toBe(
        true,
      );
    }
  });

  it('rejeita DATABASE_URL que não seja PostgreSQL', () => {
    // Apontar para outro banco por engano (ou por variável trocada) faria o RLS —
    // que é a garantia de isolamento desta Story — simplesmente não existir.
    expect(() => loadEnv({ ...validBase, DATABASE_URL: 'mysql://x/y' })).toThrowError(
      ConfigValidationError,
    );
  });

  it('a mensagem de erro NUNCA imprime a DATABASE_URL (a senha está nela)', () => {
    const comSenha = 'postgresql://giraffe_app:SENHA_SECRETA_123@db:5432/giraffe';
    try {
      // Força a falha por outro campo, com a URL válida presente no ambiente.
      loadEnv({ ...validBase, DATABASE_URL: comSenha, API_PORT: 'abc' });
      throw new Error('deveria ter falhado');
    } catch (err) {
      const e = err as ConfigValidationError;
      expect(e.message).not.toContain('SENHA_SECRETA_123');
      expect(e.message).not.toContain(comSenha);
    }
  });

  it('NÃO expõe MIGRATION_DATABASE_URL ao runtime', () => {
    // A credencial do DONO do schema não pode estar ao alcance do processo da aplicação:
    // quem é dono ignora as policies quando bem entende. Migration é etapa separada.
    const env = loadEnv({
      ...validBase,
      MIGRATION_DATABASE_URL: 'postgresql://giraffe_migrator:pw@localhost:5434/giraffe',
    } as NodeJS.ProcessEnv);

    expect(env).not.toHaveProperty('MIGRATION_DATABASE_URL');
  });

  it('valida múltiplas configurações distintas na mesma execução (sem estado global)', () => {
    // Um cache em variável de módulo faria a 2ª e a 3ª chamadas devolverem o resultado
    // da 1ª — os testes passariam pelo motivo errado. Cada chamada precisa ser independente.
    const producao = loadEnv({ ...validBase, NODE_ENV: 'production', LOG_LEVEL: 'warn' });
    expect(producao.NODE_ENV).toBe('production');
    expect(producao.LOG_LEVEL).toBe('warn');

    const desenvolvimento = loadEnv({ ...validBase, NODE_ENV: 'development', API_PORT: '4000' });
    expect(desenvolvimento.NODE_ENV).toBe('development');
    expect(desenvolvimento.API_PORT).toBe(4000);

    // A configuração anterior não pode ter contaminado esta.
    expect(desenvolvimento.LOG_LEVEL).toBe('info');
    expect(producao.API_PORT).toBe(3001);
  });
});

describe('getEnv (leitura de process.env, sem memoização)', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it('reflete o process.env atual a cada chamada', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'info';
    expect(getEnv().LOG_LEVEL).toBe('info');

    // Se getEnv() memoizasse, esta segunda leitura devolveria 'info' — e o teste
    // passaria acreditando ter exercitado uma configuração que nunca foi aplicada.
    process.env.LOG_LEVEL = 'debug';
    expect(getEnv().LOG_LEVEL).toBe('debug');
  });

  it('falha fail-fast quando o process.env está incompleto', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    expect(() => getEnv()).toThrowError(ConfigValidationError);
  });
});
