// Preflight de banco para a suíte local (DEB-ENV-TEST-REPRODUZIVEL).
//
// A suíte da API roda contra um PostgreSQL REAL. Quando o `.env` local aponta para um banco que não
// existe, não está no ar, ou tem credenciais que não batem (ex.: um banco provisionado por outra
// lane), o `vitest` devolve dezenas de falhas cujo texto não diz a causa — e já custou horas de
// caça ao "bug" que era, na verdade, um `P1000: Authentication failed`.
//
// Este preflight roda ANTES da suíte (via `pnpm test:local`) e transforma essa classe de erro numa
// mensagem única e acionável. Não é usado no caminho do CI (o CI provisiona o próprio banco); é a
// rede de segurança do desenvolvedor. Read-only: só faz `db:status`, nunca migra, semeia ou apaga.

import { spawnSync } from 'node:child_process';

const AZUL = '\x1b[36m';
const VERMELHO = '\x1b[31m';
const RESET = '\x1b[0m';

console.log(`${AZUL}[preflight]${RESET} verificando o banco de teste antes da suíte…`);

// `db:status` do @giraffe/api usa a mesma DATABASE_URL/MIGRATION_DATABASE_URL que a suíte usaria.
// Se autentica e o schema está aplicado, sai 0; qualquer P1000/P1001/schema ausente sai != 0.
const r = spawnSync('pnpm', ['--filter', '@giraffe/api', 'db:status'], {
  stdio: 'pipe',
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`;

if (r.status === 0) {
  console.log(`${AZUL}[preflight]${RESET} banco OK — migrations aplicadas. Seguindo para a suíte.`);
  process.exit(0);
}

// Diagnóstico honesto por causa, sem vazar a URL (que carrega senha).
let causa = 'o banco de teste não está pronto';
if (/P1000|Authentication failed/i.test(saida)) {
  causa =
    'as credenciais do seu .env NÃO batem com o PostgreSQL no ar (P1000). ' +
    'Provavelmente o .env aponta para um banco de OUTRA lane.';
} else if (/P1001|Can't reach|ECONNREFUSED/i.test(saida)) {
  causa = 'nenhum PostgreSQL está acessível na DATABASE_URL do seu .env (P1001).';
} else if (/migrate|pending|not yet been applied|drift/i.test(saida)) {
  causa = 'o banco está no ar, mas as migrations não foram aplicadas.';
}

console.error(`\n${VERMELHO}[preflight] BLOQUEADO:${RESET} ${causa}\n`);
console.error(
  'A suíte NÃO foi executada — rodá-la agora só produziria falhas cuja causa é o banco,',
);
console.error(
  'não o código. Para um banco descartável e reprodutível (ver apps/api/.env.test.example):\n',
);
console.error(
  '  cp apps/api/.env.test.example .env         # ajuste a porta se 5434 estiver ocupada',
);
console.error('  docker compose up -d db                    # PostgreSQL 16 (bootstrap de papéis)');
console.error('  pnpm --filter @giraffe/api db:migrate      # aplica as migrations');
console.error('  pnpm --filter @giraffe/api db:seed         # fixtures de leitura');
console.error('  pnpm test:local                            # roda o preflight + a suíte serial\n');
console.error('Detalhe do db:status (sanitizado):');
console.error(
  saida
    .split('\n')
    .filter((l) => /P10\d\d|migrat|schema|error/i.test(l))
    .map((l) => l.replace(/postgresql:\/\/[^\s"']+/g, 'postgresql://<sanitizado>'))
    .slice(0, 6)
    .join('\n') || '  (sem detalhe adicional)',
);
process.exit(1);
