// Migration e seed como ETAPA CONTROLADA (AD-17/AD-32) — nunca no boot de um container.
//
// A razão de existir deste script: as migrations rodam com o papel DONO do schema
// (`giraffe_migrator`), enquanto a aplicação roda com um papel sem privilégio
// (`giraffe_app`). O Prisma CLI lê a conexão de `DATABASE_URL`, então aqui a
// substituímos pela `MIGRATION_DATABASE_URL` só para o subprocesso — o runtime nunca
// recebe a credencial do dono.
//
// Uso: node scripts/db-migrate.mjs <deploy|status|seed>

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMMANDS = {
  deploy: ['migrate', 'deploy'],
  status: ['migrate', 'status'],
  seed: ['db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/seed.sql'],
  // ⚠️ DESTRUTIVO. Existe para que o rollback seja uma capacidade EXERCITADA, e não uma
  // frase no documento — a hora de descobrir que ele não funciona não é durante o incidente.
  rollback: [
    'db',
    'execute',
    '--schema',
    'prisma/schema.prisma',
    '--file',
    'prisma/rollback/20260712000000_init_tenancy_rls.down.sql',
  ],
};

// Carrega `.env` (cwd e raiz do repositório) — o Prisma CLI faria isso sozinho, mas nós
// precisamos de MIGRATION_DATABASE_URL *antes* de invocá-lo. Ausência do arquivo não é
// erro: em CI as variáveis vêm do ambiente.
const repoEnv = fileURLToPath(new URL('../.env', import.meta.url));

for (const envFile of [`${process.cwd()}/.env`, repoEnv]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* arquivo ausente — segue com o ambiente do processo */
  }
}

const action = process.argv[2] ?? 'deploy';
const args = COMMANDS[action];

if (!args) {
  console.error(`[db] ação desconhecida: "${action}". Use: ${Object.keys(COMMANDS).join(' | ')}`);
  process.exit(1);
}

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) {
  // Falha honesta e sanitizada: cita o NOME da variável, nunca um valor (a URL tem senha).
  console.error(
    '[db] MIGRATION_DATABASE_URL ausente: configure o papel dono do schema (ver .env.example).',
  );
  process.exit(1);
}

// Chamamos o entrypoint JS do Prisma com o próprio Node, em vez de spawnar `pnpm`.
// Duas razões: `shell: true` concatenaria os argumentos sem escapar, e no Windows o
// binário é um `.cmd`, que o Node se recusa a executar sem shell (correção de segurança
// do CVE-2024-27980). Resolver o módulo elimina os dois problemas e vale em toda plataforma.
const requireFromCwd = createRequire(pathToFileURL(`${process.cwd()}/`));

let prismaCli;
try {
  prismaCli = requireFromCwd.resolve('prisma/build/index.js');
} catch {
  console.error('[db] CLI do Prisma não encontrado: rode `pnpm install` em apps/api.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [prismaCli, ...args], {
  // O CLI do Prisma lê DATABASE_URL; aqui ela é o MIGRATOR, só neste subprocesso.
  env: { ...process.env, DATABASE_URL: migrationUrl },
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
