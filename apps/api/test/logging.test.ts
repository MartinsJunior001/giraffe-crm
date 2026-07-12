import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { isHealthProbe } from '../src/app.module';

const req = (url: string) => ({ url }) as IncomingMessage;

describe('isHealthProbe (autoLogging.ignore)', () => {
  it('silencia apenas os probes de liveness/readiness', () => {
    expect(isHealthProbe(req('/health'))).toBe(true);
    expect(isHealthProbe(req('/ready'))).toBe(true);
    // Query string não deve escapar do filtro.
    expect(isHealthProbe(req('/health?probe=docker'))).toBe(true);
  });

  it('NÃO silencia nenhuma outra rota (erros e tráfego real continuam logados)', () => {
    expect(isHealthProbe(req('/'))).toBe(false);
    expect(isHealthProbe(req('/status'))).toBe(false);
    // Prefixo parecido não pode ser confundido com o probe.
    expect(isHealthProbe(req('/healthcheck'))).toBe(false);
    expect(isHealthProbe(req('/health/details'))).toBe(false);
    expect(isHealthProbe(req(''))).toBe(false);
  });
});
