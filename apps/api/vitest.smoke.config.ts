import { defineConfig } from 'vitest/config';

/**
 * Config do smoke REAL de arquivos (T001b) — coleta SÓ `*.smoke.ts`, que exercitam MinIO/ClamAV NO AR
 * (`StorageService` SigV4, `ClamavService` INSTREAM). Fica fora do `include` (`*.test.ts`) do `vitest.config.ts`
 * para que `pnpm test` (db-only, sem MinIO/ClamAV) não os colete. Rodado por `pnpm --filter @giraffe/api
 * test:smoke`, no job isolado do CI e na suíte de arquivos local (override `docker-compose.dev-files.yml`).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.smoke.ts'],
    setupFiles: ['test/setup-env.ts'],
    // Scan real de ClamAV e roundtrip de rede folgam sob carga; teto generoso como no config principal.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
