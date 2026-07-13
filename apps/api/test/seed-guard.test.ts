import { describe, expect, it } from 'vitest';
// @ts-expect-error — módulo .mjs sem tipos; o contrato é simples e está coberto aqui.
import { verificarDestinoSeed } from '../prisma/seed-guard.mjs';

/**
 * A trava do seed de credenciais. Ele grava uma senha CONHECIDA — rodá-lo contra um banco real
 * criaria contas com credencial pública, e o seed é um comando manual a um `db:seed` de distância do
 * banco errado.
 */

const LOCAL = 'postgresql://u:p@127.0.0.1:5434/giraffe';
const IPV6 = 'postgresql://u:p@[::1]:5434/giraffe';
const LOCALHOST = 'postgresql://u:p@localhost:5434/giraffe';
const DOCKER = 'postgresql://u:p@db:5432/giraffe';
const REMOTO = 'postgresql://u:p@db.producao.interna:5432/giraffe';

describe('produção é barreira dura', () => {
  it('NODE_ENV=production é recusado, mesmo com host local', () => {
    expect(() =>
      verificarDestinoSeed({ nodeEnv: 'production', url: LOCAL, allowNonLocal: false }),
    ).toThrow(/produção/i);
  });

  it('o opt-in de host NÃO vence a proibição de produção', () => {
    // ALLOW_NONLOCAL_DEV_SEED libera hosts não-locais, mas a barreira de produção vem antes e não
    // tem override. Um operador não pode "forçar" um seed em produção.
    expect(() =>
      verificarDestinoSeed({ nodeEnv: 'production', url: LOCAL, allowNonLocal: true }),
    ).toThrow(/produção/i);
  });
});

describe('hosts locais passam', () => {
  it('127.0.0.1', () => {
    expect(verificarDestinoSeed({ nodeEnv: 'development', url: LOCAL, allowNonLocal: false })).toBe(
      '127.0.0.1',
    );
  });

  it('localhost', () => {
    expect(verificarDestinoSeed({ nodeEnv: undefined, url: LOCALHOST, allowNonLocal: false })).toBe(
      'localhost',
    );
  });

  it('::1 (IPv6 entre colchetes na URL)', () => {
    expect(verificarDestinoSeed({ nodeEnv: 'test', url: IPV6, allowNonLocal: false })).toBe('::1');
  });
});

describe('hosts NÃO-locais exigem opt-in explícito', () => {
  it('host Docker (`db`) sem opt-in é recusado', () => {
    expect(() =>
      verificarDestinoSeed({ nodeEnv: 'development', url: DOCKER, allowNonLocal: false }),
    ).toThrow(/não é local/i);
  });

  it('host Docker COM opt-in passa', () => {
    expect(verificarDestinoSeed({ nodeEnv: 'development', url: DOCKER, allowNonLocal: true })).toBe(
      'db',
    );
  });

  it('host remoto sem opt-in é recusado', () => {
    expect(() =>
      verificarDestinoSeed({ nodeEnv: 'development', url: REMOTO, allowNonLocal: false }),
    ).toThrow(/não é local/i);
  });
});

describe('a mensagem de erro não vaza segredo', () => {
  it('cita o host, nunca o usuário ou a senha da URL', () => {
    try {
      verificarDestinoSeed({
        nodeEnv: 'development',
        url: 'postgresql://usuario_secreto:senha_secreta@remoto.test:5432/db',
        allowNonLocal: false,
      });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      const msg = (erro as Error).message;
      expect(msg).toContain('remoto.test');
      expect(msg).not.toContain('usuario_secreto');
      expect(msg).not.toContain('senha_secreta');
    }
  });
});
