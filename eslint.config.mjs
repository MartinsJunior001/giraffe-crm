// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Flat config (ESLint 9 + typescript-eslint 8). Lint sintático (sem type-aware)
// para setup rápido e determinístico no esqueleto — evidência: typescript-eslint quickstart.
export default tseslint.config(
  {
    // Só artefatos gerados e scaffolding entram aqui. Arquivos de configuração do projeto
    // (eslint/vitest/next/postcss) SÃO lintados: um glob como `**/*.config.*` também
    // engoliria código de aplicação futuro (ex.: `src/kernel/config/database.config.ts`).
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/build/**',
      'apps/web/next-env.d.ts',
      // Prisma Client gerado: artefato de build, reescrito a cada `prisma generate`.
      'apps/api/generated/**',
      // Tooling / documentação / scaffolding — não é código da aplicação
      'docs/**',
      '_bmad/**',
      '_bmad-output/**',
      'skills/**',
      'specs/**',
      '.specify/**',
      '.github/**',
      '.vscode/**',
      '.agent/**',
      '.agents/**',
      '.codex/**',
      // Scaffolding do agente: skills, settings e WORKTREES. Os worktrees são cópias completas do
      // repositório (inclusive o protótipo HTML legado sob `docs/`, cujo `docs/**` só casa na raiz) —
      // sem este ignore, o ESLint lintaria essas cópias transitórias como se fossem código da aplicação.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TS já verifica identificadores; `no-undef` é redundante e ruidoso em TS.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // ESM em Node: globals de runtime SEM os de CommonJS. `require`, `module`, `exports` e
    // `__dirname` não existem num `.mjs` — declará-los mascararia um erro real.
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.nodeBuiltin,
    },
  },
  {
    // CommonJS de verdade: aqui `require`/`module`/`exports` são legítimos.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
);
