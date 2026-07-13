// Migration e seed como ETAPA CONTROLADA (AD-17/AD-32) — nunca no boot de um container.
//
// A razão de existir deste script: as migrations rodam com o papel DONO do schema
// (`giraffe_migrator`), enquanto a aplicação roda com um papel sem privilégio
// (`giraffe_app`). O Prisma CLI lê a conexão de `DATABASE_URL`, então aqui a
// substituímos pela `MIGRATION_DATABASE_URL` só para o subprocesso — o runtime nunca
// recebe a credencial do dono.
//
// Uso: node scripts/db-migrate.mjs <deploy|status|seed|rollback> [migration]
//   pnpm db:migrate | pnpm db:status | pnpm db:seed | pnpm db:rollback

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR_ROLLBACK = 'prisma/rollback';

/**
 * Resolve QUAL migration reverter. O padrão é a mais recente — reverter é desfazer o último
 * passo, não o primeiro.
 *
 * O caminho já foi fixo no código, apontando sempre para a migration inicial. Bastaria uma
 * segunda migration para que `rollback` derrubasse as tabelas base POR BAIXO da mais nova, e
 * o histórico do Prisma ficasse inconsistente com o schema. Num incidente, é o tipo de
 * comando que se roda sem reler.
 */
function arquivoDeRollback(nomeExplicito) {
  if (!existsSync(DIR_ROLLBACK)) {
    console.error(`[db] diretório ${DIR_ROLLBACK} não existe.`);
    process.exit(1);
  }

  const disponiveis = readdirSync(DIR_ROLLBACK)
    .filter((f) => f.endsWith('.down.sql'))
    .sort(); // timestamp no prefixo => ordem lexicográfica == ordem cronológica

  if (disponiveis.length === 0) {
    console.error(`[db] nenhum arquivo *.down.sql em ${DIR_ROLLBACK}.`);
    process.exit(1);
  }

  if (nomeExplicito) {
    const alvo = disponiveis.find((f) => f.startsWith(nomeExplicito));
    if (!alvo) {
      console.error(
        `[db] rollback "${nomeExplicito}" não encontrado. Disponíveis: ${disponiveis.join(', ')}`,
      );
      process.exit(1);
    }
    return `${DIR_ROLLBACK}/${alvo}`;
  }

  const maisRecente = disponiveis[disponiveis.length - 1];
  console.error(`[db] revertendo a migration mais recente: ${maisRecente}`);
  return `${DIR_ROLLBACK}/${maisRecente}`;
}

function comandos(action, alvo) {
  switch (action) {
    case 'deploy':
      return ['migrate', 'deploy'];
    case 'status':
      return ['migrate', 'status'];
    case 'seed':
      return ['db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/seed.sql'];
    // ⚠️ DESTRUTIVO. Existe para que o rollback seja uma capacidade EXERCITADA, e não uma
    // frase no documento — a hora de descobrir que ele não funciona não é durante o incidente.
    case 'rollback':
      return [
        'db',
        'execute',
        '--schema',
        'prisma/schema.prisma',
        '--file',
        arquivoDeRollback(alvo),
      ];
    default:
      return undefined;
  }
}

const ACOES = ['deploy', 'status', 'seed', 'rollback'];

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
const args = comandos(action, process.argv[3]);

if (!args) {
  console.error(`[db] ação desconhecida: "${action}". Use: ${ACOES.join(' | ')}`);
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

// Falha ao SPAWNAR (ENOENT, EACCES) não produz `status`: sem isto, o processo saía 1 sem
// imprimir nada. Migration que falha em silêncio é a pior classe de falha que existe aqui.
if (result.error) {
  console.error(`[db] não foi possível executar o CLI do Prisma: ${result.error.message}`);
  process.exit(1);
}

process.exitCode = result.status ?? 1;
