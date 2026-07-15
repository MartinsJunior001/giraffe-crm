import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    // Testes de integração HTTP fazem um login REAL (hashing de senha do better-auth ~2s) + setup
    // multi-etapa + transação interativa. O default de 5s do Vitest é apertado demais e estoura de forma
    // FLAKY — sobretudo na execução serial (`test:ci`), em que a suíte inteira roda num único worker sob
    // carga sustentada. Elevamos o teto para dar folga determinística (os testes levam ~5s no pior caso).
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
