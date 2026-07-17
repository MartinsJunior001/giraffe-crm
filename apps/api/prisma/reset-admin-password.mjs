/**
 * reset-admin-password.mjs — RESET CONTROLADO da senha do Admin do STAGING (Better Auth).
 *
 * Atualiza SOMENTE a credencial de senha (`AuthCredential`) do Account por e-mail, com um hash gerado
 * pelo PRÓPRIO Better Auth (`ctx.password.hash`, o mesmo do provisionamento). NÃO recria o tenant: não
 * cria Account, Organization nem Membership; não toca papéis de banco, Chatwoot ou produção. Nunca
 * imprime o hash, a `DATABASE_URL` nem outro segredo; o e-mail (PII) sai mascarado.
 *
 * GUARDA DE AMBIENTE: recusa qualquer e-mail que não seja do domínio de staging
 * (`@staging.giraffedev.cloud`) — impede resetar contas de produção/outros ambientes por engano.
 *
 * A função `resetarSenhaAdmin` é PURA (recebe `prisma`/`hashSenha` por injeção) para teste de
 * integração. O CLI só roda quando o arquivo é executado diretamente.
 */
import { pathToFileURL } from 'node:url';
import { gerarSenhaForte, mascararEmail } from './provision-tenant.mjs';

const SENHA_MIN = 12; // igual ao provisionamento — mais forte que o mínimo do Better Auth.
const SENHA_MAX = 128;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMINIO_STAGING = '@staging.giraffedev.cloud';

/**
 * Reseta a senha do Admin (só a credencial). Lança `Error` sanitizado (nunca a senha/hash) — fail-closed.
 * NÃO cria nada: se a conta ou a credencial não existir, falha (o tenant NÃO é recriado aqui).
 * @returns {Promise<{ emailMascarado: string, accountId: string }>}
 */
export async function resetarSenhaAdmin({ prisma, hashSenha, email, senha }) {
  const alvo = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!RE_EMAIL.test(alvo)) throw new Error('reset: e-mail inválido.');
  if (!alvo.endsWith(DOMINIO_STAGING)) {
    throw new Error(`reset: recusado — só e-mails ${DOMINIO_STAGING} (guarda de staging).`);
  }
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) {
    throw new Error(`reset: senha curta demais (mínimo ${SENHA_MIN} caracteres).`);
  }
  if (senha.length > SENHA_MAX) {
    throw new Error(`reset: senha longa demais (máximo ${SENHA_MAX} caracteres).`);
  }

  const account = await prisma.account.findUnique({ where: { email: alvo } });
  if (!account)
    throw new Error('reset: conta não encontrada (este script NÃO cria conta nem tenant).');

  const cred = await prisma.authCredential.findFirst({
    where: { userId: account.id, providerId: 'credential' },
  });
  if (!cred) throw new Error('reset: credencial de senha não encontrada para a conta.');

  const hash = await hashSenha(senha); // scrypt é lento — fora de qualquer transação.
  await prisma.authCredential.update({ where: { id: cred.id }, data: { password: hash } });

  return { emailMascarado: mascararEmail(alvo), accountId: account.id };
}

/**
 * PREFLIGHT fail-closed — roda ANTES de gerar/aplicar qualquer senha. Prova que o DESTINO REAL da
 * conexão (o `MIGRATION_DATABASE_URL` que o migrate/reset usam) tem o schema aplicado (`Account` e
 * `AuthCredential` existem) E o Account do Admin. Assim, se o reset apontar para o banco/schema errado
 * (P2021), ele aborta SEM gerar senha — nunca uma senha órfã, nunca uma credencial num destino errado.
 * @returns {Promise<{ database: string, schema: string }>}
 */
export async function preflightReset({ prisma, email }) {
  const alvo = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!RE_EMAIL.test(alvo)) throw new Error('preflight: e-mail inválido.');
  if (!alvo.endsWith(DOMINIO_STAGING)) {
    throw new Error(`preflight: recusado — só e-mails ${DOMINIO_STAGING} (guarda de staging).`);
  }
  const linhas = await prisma.$queryRaw`
    select
      (to_regclass('public."Account"') is not null) as tem_account,
      (to_regclass('public."AuthCredential"') is not null) as tem_cred,
      current_database() as database,
      current_schema() as schema`;
  const chk = Array.isArray(linhas) ? linhas[0] : undefined;
  if (!chk || !chk.tem_account || !chk.tem_cred) {
    throw new Error(
      `preflight: schema NÃO visível no destino (database=${chk?.database ?? '?'}, ` +
        `schema=${chk?.schema ?? '?'}): Account=${chk?.tem_account ?? '?'} ` +
        `AuthCredential=${chk?.tem_cred ?? '?'}. Divergência de banco — rode diagnose-db-target.sh. ` +
        `NENHUMA senha gerada.`,
    );
  }
  const account = await prisma.account.findUnique({ where: { email: alvo } });
  if (!account) {
    throw new Error('preflight: Account do Admin não existe no destino — NENHUMA senha gerada.');
  }
  return { database: chk.database, schema: chk.schema };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CLI de ops (não roda ao ser importado pelo teste).
// ─────────────────────────────────────────────────────────────────────────────────────────────────
async function mainCli() {
  const { resolve } = await import('node:path');
  for (const arquivo of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    try {
      process.loadEnvFile(arquivo);
    } catch {
      /* ausente — segue com o ambiente do processo */
    }
  }

  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL ausente — o reset usa o papel migrator.');
  const email = process.env.RESET_ADMIN_EMAIL;
  if (!email) throw new Error('RESET_ADMIN_EMAIL ausente — informe o e-mail do Admin (staging).');

  const [{ betterAuth }, { prismaAdapter }, { PrismaClient }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('../generated/prisma/index.js'),
  ]);

  const prisma = new PrismaClient({ datasourceUrl: url });
  const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET ?? 'provision-only-secret-'.padEnd(48, 'x'),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    user: { modelName: 'Account' },
    account: { modelName: 'AuthCredential' },
    session: { modelName: 'AuthSession' },
    verification: { modelName: 'AuthVerification' },
  });
  const ctx = await auth.$context;

  try {
    // PREFLIGHT fail-closed ANTES de gerar a senha: schema + Account do Admin no destino REAL.
    const pf = await preflightReset({ prisma, email });
    console.log(`preflight OK — destino database=${pf.database} schema=${pf.schema}.`);

    // Só AGORA gera/lê a senha (fornecida OU forte, impressa UMA vez). Nunca antes do preflight.
    let senha = process.env.RESET_ADMIN_PASSWORD;
    let senhaGerada = false;
    if (!senha) {
      senha = gerarSenhaForte();
      senhaGerada = true;
    }

    const r = await resetarSenhaAdmin({
      prisma,
      hashSenha: (s) => ctx.password.hash(s),
      email,
      senha,
    });
    console.log(
      `Senha do Admin RESETADA: ${r.emailMascarado} (${r.accountId}). Tenant NÃO recriado.`,
    );
    if (senhaGerada) {
      console.log(
        '\n⚠️  Nova senha gerada (mostrada UMA vez — troque no primeiro acesso):\n' +
          `    ${senha}\n`,
      );
    } else {
      console.log('(Senha fornecida via RESET_ADMIN_PASSWORD aplicada.)');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mainCli();
}
