import { afterEach, describe, expect, it } from 'vitest';
import { ConfigValidationError, getEnv, loadEnv, parseCorsOrigins } from '../src/kernel/config/env';

const validBase = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  LOG_LEVEL: 'info',
} as NodeJS.ProcessEnv;

describe('loadEnv (validação server-side / fail-fast)', () => {
  it('aceita configuração válida e aplica defaults', () => {
    const env = loadEnv({ CORS_ALLOWED_ORIGINS: 'http://localhost:3000' } as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe('info');
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
