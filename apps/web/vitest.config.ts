import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Plugin React: transforma JSX/TSX dos testes de componente (Story 1.7). Não afeta os testes .ts
  // de lógica pura (sem JSX, é no-op).
  plugins: [react()],
  test: {
    // Padrão `node` (os testes de lógica da 1.5 dependem disso). Os testes de componente declaram
    // `// @vitest-environment jsdom` no topo do arquivo — isolando o DOM a quem precisa.
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    // Registra os matchers do jest-dom (toHaveAttribute, toBeInTheDocument, ...).
    setupFiles: ['./test/setup.ts'],
  },
  // Resolve o alias `@/` do tsconfig para que os testes possam importar módulos-fonte que o usam.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
