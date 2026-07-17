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

  // GUARDA fail-closed: só se reverte a migration do TOPO da pilha. Quando o `.down.sql` mais
  // recente não corresponde à migration mais nova de `prisma/migrations`, o "mais recente
  // disponível" é uma migration DO MEIO — revertê-la derrubaria tabelas por baixo das migrations
  // posteriores (FKs órfãs, histórico inconsistente) exatamente como o comentário acima descreve.
  // Isso acontece quando novas migrations entram sem o seu `.down.sql`: o rollback correto passa a
  // NÃO EXISTIR, e a resposta honesta é recusar com a lacuna nomeada, não reverter a coisa errada.
  const migrationsAplicaveis = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[0-9]{14}_/.test(e.name))
    .map((e) => e.name)
    .sort();
  const maisNovaDaPilha = migrationsAplicaveis[migrationsAplicaveis.length - 1];
  const alvoResolvido = (
    nomeExplicito
      ? (disponiveis.find((f) => f.startsWith(nomeExplicito)) ?? nomeExplicito)
      : disponiveis[disponiveis.length - 1]
  ).replace(/\.down\.sql$/, '');

  if (maisNovaDaPilha !== undefined && alvoResolvido !== maisNovaDaPilha) {
    console.error(
      `[db] rollback RECUSADO: o alvo "${alvoResolvido}" não é a migration do topo da pilha ` +
        `("${maisNovaDaPilha}"). Reverter uma migration do meio derrubaria o schema por baixo ` +
        `das posteriores. Se falta o arquivo prisma/rollback/${maisNovaDaPilha}.down.sql, ` +
        `escreva-o antes — não há rollback seguro sem ele.`,
    );
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

/** O nome da migration (o diretório) a partir do arquivo de rollback. */
function nomeDaMigration(caminhoDown) {
  const nome = caminhoDown
    .split('/')
    .pop()
    .replace(/\.down\.sql$/, '');

  // O `nome` é interpolado por string no `DELETE FROM "_prisma_migrations"` (o `db execute` do
  // Prisma não parametriza). O valor vem de um nome de arquivo no repositório, não de entrada de
  // usuário — mas um arquivo com aspa no nome quebraria/injetaria o SQL. Validar contra o padrão de
  // migration do Prisma (14 dígitos + `_` + minúsculas) recusa qualquer coisa fora dele antes de
  // interpolar. Defesa em profundidade num comando administrativo destrutivo.
  if (!/^[0-9]{14}_[a-z0-9_]+$/.test(nome)) {
    console.error(`[db] nome de migration inválido: "${nome}". Rollback abortado.`);
    process.exit(1);
  }

  return nome;
}

/**
 * Devolve os PASSOS de uma ação — cada passo é uma invocação do CLI do Prisma.
 *
 * `rollback` tem dois, e o segundo não é opcional: ver abaixo.
 */
function comandos(action, alvo) {
  switch (action) {
    case 'deploy':
      return [{ args: ['migrate', 'deploy'] }];
    case 'status':
      return [{ args: ['migrate', 'status'] }];

    // Marca uma migration FALHA (estado failed em `_prisma_migrations`, ex.: P3018 no meio da
    // aplicação) como REVERTIDA, para que o `deploy` seguinte a REAPLIQUE do zero. Use SOMENTE depois
    // de (a) remediar a causa da falha e (b) provar o estado físico — nenhum objeto parcial da
    // migration existe (rollback transacional completo). NUNCA marca como `--applied`: isso mentiria
    // que o schema foi criado. O Prisma exige que a migration esteja em estado FAILED (senão P3012).
    case 'resolve-rolled-back': {
      if (!alvo || !/^\d{14}_[a-z0-9_]+$/i.test(alvo)) {
        console.error(
          '[db] resolve-rolled-back exige o NOME da migration falha (ex.: 20260712000000_init_tenancy_rls).',
        );
        return undefined;
      }
      return [{ args: ['migrate', 'resolve', '--rolled-back', alvo] }];
    }

    case 'seed':
      return [
        {
          args: ['db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/seed.sql'],
        },
      ];

    // ⚠️ DESTRUTIVO. Existe para que o rollback seja uma capacidade EXERCITADA, e não uma
    // frase no documento — a hora de descobrir que ele não funciona não é durante o incidente.
    case 'rollback': {
      const arquivo = arquivoDeRollback(alvo);
      const nome = nomeDaMigration(arquivo);

      return [
        // 1. Desfaz o schema.
        { args: ['db', 'execute', '--schema', 'prisma/schema.prisma', '--file', arquivo] },

        // 2. Remove a migration do HISTÓRICO.
        //
        // Sem este passo, o rollback é uma armadilha: o `down.sql` derruba as tabelas, mas a linha em
        // `_prisma_migrations` continua dizendo "aplicada". O `deploy` seguinte responde "No pending
        // migrations to apply", com **exit 0** — e o banco fica sem as tabelas enquanto a ferramenta
        // afirma que está tudo certo. Reproduzido em banco descartável, e é o tipo de defeito que só
        // aparece com DUAS migrations: descobre-se no incidente em que se recorreu ao rollback.
        //
        // Não dá para usar `migrate resolve --rolled-back`: ele só aceita migration em estado
        // FAILED (`P3012`). O Prisma não oferece comando para des-aplicar uma migration que deu
        // certo, então a linha sai por SQL.
        //
        // Isto vive AQUI, e não dentro de cada `down.sql`, porque num arquivo escrito à mão alguém
        // esqueceria — e a armadilha voltaria calada.
        {
          args: ['db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
          stdin: `DELETE FROM "_prisma_migrations" WHERE migration_name = '${nome}';`,
        },
      ];
    }
    default:
      return undefined;
  }
}

const ACOES = ['deploy', 'status', 'seed', 'rollback', 'resolve-rolled-back'];

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
const passos = comandos(action, process.argv[3]);

if (!passos) {
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

// Os passos rodam em SEQUÊNCIA e o primeiro que falhar aborta os seguintes. No rollback isso
// importa: se o `down.sql` falhar, marcar a migration como revertida no histórico seria mentir
// sobre o estado do banco.
for (const passo of passos) {
  const result = spawnSync(process.execPath, [prismaCli, ...passo.args], {
    // O CLI do Prisma lê DATABASE_URL; aqui ela é o MIGRATOR, só neste subprocesso.
    env: { ...process.env, DATABASE_URL: migrationUrl },
    input: passo.stdin,
    // Com `input`, o stdin não pode ser herdado — os demais fluxos continuam visíveis.
    stdio: passo.stdin === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });

  // Falha ao SPAWNAR (ENOENT, EACCES) não produz `status`: sem isto, o processo saía 1 sem
  // imprimir nada. Migration que falha em silêncio é a pior classe de falha que existe aqui.
  if (result.error) {
    console.error(`[db] não foi possível executar o CLI do Prisma: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exitCode = 0;
