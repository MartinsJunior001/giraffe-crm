/**
 * Semeia CREDENCIAIS de desenvolvimento para as contas do `seed.sql`.
 *
 * Existe como script Node, e não como SQL, por uma razão: o hash de senha precisa ser gerado pelo
 * **próprio algoritmo do Better Auth**. Escrever o hash à mão em SQL exigiria reimplementar a
 * derivação — e uma reimplementação que divergisse em um parâmetro produziria credenciais que
 * simplesmente não autenticam, ou pior, que autenticam com segurança menor do que a configurada.
 *
 * O cadastro está DESLIGADO na aplicação (`disableSignUp: true`): num CRM B2B, autocadastro aberto
 * é uma superfície que ninguém pediu. Contas entram por convite do Admin (Épico 8). Este script é o
 * equivalente de desenvolvimento a esse convite.
 *
 * Senhas FICTÍCIAS, em domínio de teste (`.test`, RFC 2606, não roteável). Nenhum dado real.
 */
import { resolve } from 'node:path';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '../generated/prisma/index.js';

// O `.env` da raiz, como faz o `db-migrate.mjs`. Ausência não é silenciada: sem `DATABASE_URL`, o
// script falha logo abaixo — e falhar é o certo. Semear "sem banco" seria fingir que semeou.
for (const arquivo of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try {
    process.loadEnvFile(arquivo);
  } catch {
    /* ausente — segue com o ambiente do processo (é o caso do CI) */
  }
}

/**
 * **Trava de produção.** Este script grava uma senha CONHECIDA (está logo abaixo, no repositório) em
 * contas. Rodá-lo contra um ambiente real criaria contas com credencial pública — e o seed é um
 * comando manual, a um `pnpm db:seed` de distância de ser executado contra o banco errado.
 *
 * Falha alto e cedo, antes de abrir conexão. Não existe flag para forçar: se um dia for preciso
 * semear em produção, isso é uma decisão de arquitetura, não uma variável de ambiente.
 */
if (process.env.NODE_ENV === 'production') {
  throw new Error('seed de credenciais é proibido em produção: ele grava uma senha conhecida.');
}

/** A mesma para todas as contas de dev. Não é segredo: está no repositório, de propósito. */
const SENHA_DEV = 'senha-de-desenvolvimento-123';

/** As contas do `seed.sql`. Ver o cabeçalho de lá para o papel de cada uma nos testes. */
const CONTAS = [
  '11111111-1111-1111-1111-111111111111', // Ana   — ACTIVE só na Org A
  '22222222-2222-2222-2222-222222222222', // Bruno — ACTIVE na Org A, SUSPENDED na Org B
  '33333333-3333-3333-3333-333333333333', // Carla — ACTIVE só na Org B
  '44444444-4444-4444-4444-444444444444', // Dani  — nenhuma Membership
  '55555555-5555-5555-5555-555555555555', // Eva   — ACTIVE nas Orgs A e B
];

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  // Cita o NOME da variável, nunca o valor: a URL carrega senha.
  throw new Error('DATABASE_URL ausente — impossível semear credenciais.');
}

const prisma = new PrismaClient({ datasourceUrl: url });

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? 'seed-only-secret-'.padEnd(48, 'x'),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  user: { modelName: 'Account' },
  account: { modelName: 'AuthCredential' },
  session: { modelName: 'AuthSession' },
  verification: { modelName: 'AuthVerification' },
});

const ctx = await auth.$context;
const hash = await ctx.password.hash(SENHA_DEV);

for (const userId of CONTAS) {
  const existente = await prisma.authCredential.findFirst({
    where: { userId, providerId: 'credential' },
  });

  if (existente) {
    await prisma.authCredential.update({ where: { id: existente.id }, data: { password: hash } });
    continue;
  }

  await prisma.authCredential.create({
    data: {
      id: crypto.randomUUID(),
      // No provedor `credential`, o Better Auth usa o próprio id do usuário como `accountId`.
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hash,
      updatedAt: new Date(),
    },
  });
}

await prisma.$disconnect();
console.log(`Credenciais semeadas para ${CONTAS.length} contas (senha de desenvolvimento).`);
