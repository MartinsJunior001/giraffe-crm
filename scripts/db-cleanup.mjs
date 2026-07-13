// Coleta de lixo dos contadores antiabuso — `LoginFailure` (G1) e `RateLimit` (G2).
//
// Por que existe: uma linha só some, hoje, quando o dono do identificador loga com sucesso. Um
// ataque de *spray* com muitos identificadores distintos que nunca autenticam grava uma linha por
// identificador que nunca é apagada — crescimento sem limite. Esta rotina apaga o que JÁ EXPIROU.
//
// Roda com o papel de RUNTIME (`DATABASE_URL`), que tem `DELETE` nas duas tabelas — não com o do
// migrator. É a mesma query do `LoginFailureService.limparExpirados`; este script é o gancho
// operacional (cron do Coolify) enquanto não há scheduler na aplicação (débito D-05).
//
// Determinístico e idempotente: rodar duas vezes apaga 0 na segunda. Só toca o que está FORA da
// janela de 15 min — um contador ainda válido (ataque em curso) jamais é removido.
//
// Uso: node scripts/db-cleanup.mjs   (ou `pnpm --filter @giraffe/api db:cleanup`)

import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../apps/api/generated/prisma/index.js';

const JANELA_MS = 15 * 60 * 1000;

// Carrega `.env` (cwd e raiz do repositório), como faz o `db-migrate.mjs`: sem isto, rodar o
// comando local sem `DATABASE_URL` já exportada falharia por ausência da variável. Arquivo ausente
// não é erro — em CI/produção as variáveis vêm do ambiente.
const repoEnv = fileURLToPath(new URL('../.env', import.meta.url));
for (const envFile of [`${process.cwd()}/.env`, repoEnv]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* arquivo ausente — segue com o ambiente do processo */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  // Cita o NOME da variável, nunca o valor: a URL carrega senha.
  console.error('[cleanup] DATABASE_URL ausente — impossível limpar contadores.');
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url });

try {
  const inicioValido = new Date(Date.now() - JANELA_MS);
  const corteRateLimit = BigInt(Date.now() - JANELA_MS); // RateLimit.lastRequest é epoch ms

  const loginFailure = await prisma.$executeRaw`
    DELETE FROM "LoginFailure" WHERE "windowStart" < ${inicioValido}
  `;
  const rateLimit = await prisma.$executeRaw`
    DELETE FROM "RateLimit" WHERE "lastRequest" < ${corteRateLimit}
  `;

  console.log(`[cleanup] LoginFailure: ${loginFailure} · RateLimit: ${rateLimit} (expirados)`);
} finally {
  await prisma.$disconnect();
}
