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
// Serializado por advisory lock (D-05): se outra execução já roda a coleta, esta PULA em vez de
// disputar as mesmas linhas. Lock de TRANSAÇÃO (`pg_try_advisory_xact_lock`) — adquirido e liberado na
// mesma conexão, cai sozinho no commit. Falha real do banco NÃO é silenciosa: o erro sobe e o processo
// sai com código != 0.
//
// Uso: node scripts/db-cleanup.mjs   (ou `pnpm --filter @giraffe/api db:cleanup`)

import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../apps/api/generated/prisma/index.js';

const JANELA_MS = 15 * 60 * 1000;

// A MESMA chave usada em `LoginFailureService.limparExpiradosComLock` (`CHAVE_LOCK_CLEANUP`). As duas
// superfícies precisam disputar o mesmo advisory lock, então o valor é idêntico nos dois lugares.
const CHAVE_LOCK_CLEANUP = 427050006n;

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
  const resultado = await prisma.$transaction(async (tx) => {
    const trava =
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${CHAVE_LOCK_CLEANUP}::bigint) AS "obtido"`;
    if (trava[0]?.obtido !== true) {
      return { pulado: true };
    }

    const inicioValido = new Date(Date.now() - JANELA_MS);
    const corteRateLimit = BigInt(Date.now() - JANELA_MS); // RateLimit.lastRequest é epoch ms

    const loginFailure = await tx.$executeRaw`
      DELETE FROM "LoginFailure" WHERE "windowStart" < ${inicioValido}
    `;
    const rateLimit = await tx.$executeRaw`
      DELETE FROM "RateLimit" WHERE "lastRequest" < ${corteRateLimit}
    `;
    return { pulado: false, loginFailure, rateLimit };
  });

  if (resultado.pulado) {
    console.log('[cleanup] pulado — outra execução detém o lock da coleta.');
  } else {
    console.log(
      `[cleanup] LoginFailure: ${resultado.loginFailure} · RateLimit: ${resultado.rateLimit} (expirados)`,
    );
  }
} finally {
  await prisma.$disconnect();
}
