import { resolve } from 'node:path';

// Os testes de isolamento falam com um PostgreSQL REAL — é a única forma de provar que as
// policies existem no banco, e não apenas no arquivo de migration. Carregar o `.env` aqui
// é o que permite `pnpm test` rodar sem exportar variáveis à mão.
//
// A ausência do arquivo NÃO é silenciada: em CI as variáveis vêm do ambiente, e se
// DATABASE_URL não existir em lugar nenhum, os testes de RLS falham — de propósito.
// Um banco indisponível deve aparecer como suíte vermelha, nunca como suíte "pulada".
//
// Usamos `process.cwd()` (o Vitest roda a partir de `apps/api`) e não `import.meta.url`:
// o tsconfig da API compila para CommonJS, onde `import.meta` não existe — o `pnpm typecheck`
// rejeita, e com razão.
for (const envFile of [
  resolve(process.cwd(), '.env'), // apps/api/.env
  resolve(process.cwd(), '../../.env'), // raiz do monorepo
]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* arquivo ausente — segue com o ambiente do processo */
  }
}
