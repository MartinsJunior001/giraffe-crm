import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  // Resolve o alias `@/` do tsconfig para que os testes possam importar módulos-fonte que o usam
  // (ex.: `proxy.ts` importa `@/lib/session`). Espelha `paths` do tsconfig.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
