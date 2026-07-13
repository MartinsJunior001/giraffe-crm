/**
 * Provisionamento seguro do PRIMEIRO tenant (tech-2).
 *
 * Cria, de forma idempotente e fail-closed, a primeira Organização e seu primeiro Admin:
 * Organization (raiz do tenant) + Account (identidade global) + Membership ADMIN ACTIVE + AuthCredential
 * (hash gerado pelo PRÓPRIO Better Auth). Não há autocadastro (`disableSignUp: true`) e o painel de
 * convites é WAVE 2 (Épico 8); logo, o 1º Org+Admin entra por esta rotina de OPS controlada, com o papel
 * `migrator` — nunca pela superfície HTTP de runtime.
 *
 * Segurança:
 * - **Sem bypass de RLS.** `Organization`/`Membership` têm FORCE RLS; a inserção define o contexto
 *   (`set_config('app.current_org_id', …, true)`) e roda pelo migrator, como o `seed.sql`. O `orgId` é
 *   DETERMINÍSTICO a partir do slug (UUIDv5) — sem isso, o migrator (sujeito à policy `org_select`) não
 *   conseguiria sequer detectar uma Organização já existente para ser idempotente.
 * - **Sem senha padrão.** Ausência de senha → gerar forte e imprimir uma vez, ou falhar. Nunca um valor
 *   conhecido (filosofia do `00-roles.sql`).
 * - **Sem segredo em log.** Senha, hash e `DATABASE_URL` nunca aparecem; e-mail (PII) é mascarado.
 * - **Não sobrescreve credencial existente.** Um Admin real pode já ter trocado a senha.
 *
 * O núcleo puro (validação/slug/máscara/id) é exportado para teste de unidade; `provisionarTenant`
 * recebe `prisma` e `hashSenha` por injeção para teste de integração contra PostgreSQL real.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Namespace fixo (UUID) do provisionamento de tenant — base do UUIDv5 determinístico por slug. */
const NAMESPACE_TENANT = 'a7c3e1d2-5b64-4f8a-9c2e-1f0a3b5d7e90';

const SENHA_MIN = 12; // mais forte que o minPasswordLength (8) do Better Auth, por ser Admin.
const SENHA_MAX = 128; // limite do Better Auth.

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** UUIDv5 (SHA-1, RFC 4122) — determinístico: mesmo nome + namespace → mesmo UUID. */
export function uuidV5(nome, namespaceUuid) {
  const ns = Buffer.from(namespaceUuid.replaceAll('-', ''), 'hex');
  const bytes = createHash('sha1')
    .update(ns)
    .update(Buffer.from(nome, 'utf8'))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Id determinístico da Organização a partir do slug — habilita idempotência sob RLS. */
export function idOrganizacaoParaSlug(slug) {
  return uuidV5(`org:${slug}`, NAMESPACE_TENANT);
}

/** Deriva um slug kebab-case de um nome (remove acentos, normaliza separadores). */
export function derivarSlug(nome) {
  return String(nome ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Mascara um e-mail para saída (PII): `ana@x.test` → `a***@x.test`. */
export function mascararEmail(email) {
  const s = String(email ?? '');
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  return `${s[0]}***${s.slice(at)}`;
}

/** Gera uma senha forte aleatória (base64url, sem padding) para o caso "senha não fornecida". */
export function gerarSenhaForte() {
  return randomBytes(24).toString('base64url');
}

/**
 * Valida e normaliza a entrada ANTES de qualquer escrita. Lança `Error` sanitizado (nunca inclui a
 * senha) em qualquer violação — fail-closed.
 * @returns {{ orgNome: string, orgSlug: string, adminEmail: string, adminNome: string, adminSenha: string }}
 */
export function validarEntradaProvisionamento(entrada) {
  const orgNome = String(entrada?.orgNome ?? '').trim();
  const adminNome = String(entrada?.adminNome ?? '').trim();
  const adminEmail = String(entrada?.adminEmail ?? '')
    .trim()
    .toLowerCase();
  const adminSenha = entrada?.adminSenha;

  if (!orgNome) throw new Error('provisionamento: orgNome é obrigatório.');
  if (!adminNome) throw new Error('provisionamento: adminNome é obrigatório.');
  if (!adminEmail) throw new Error('provisionamento: adminEmail é obrigatório.');
  if (!RE_EMAIL.test(adminEmail)) throw new Error('provisionamento: adminEmail inválido.');

  const orgSlug = entrada?.orgSlug
    ? String(entrada.orgSlug).trim().toLowerCase()
    : derivarSlug(orgNome);
  if (!RE_SLUG.test(orgSlug)) {
    throw new Error('provisionamento: orgSlug inválido (esperado kebab-case a-z0-9).');
  }

  if (typeof adminSenha !== 'string' || adminSenha.length === 0) {
    throw new Error('provisionamento: adminSenha é obrigatória (nenhuma senha padrão é usada).');
  }
  // Reporta só o COMPRIMENTO permitido, nunca a senha.
  if (adminSenha.length < SENHA_MIN) {
    throw new Error(`provisionamento: adminSenha curta demais (mínimo ${SENHA_MIN} caracteres).`);
  }
  if (adminSenha.length > SENHA_MAX) {
    throw new Error(`provisionamento: adminSenha longa demais (máximo ${SENHA_MAX} caracteres).`);
  }

  return { orgNome, orgSlug, adminEmail, adminNome, adminSenha };
}

/**
 * Provisiona o tenant de forma idempotente. Recebe `prisma` (cliente do papel migrator) e `hashSenha`
 * (do Better Auth) por injeção. O hash é calculado FORA da transação (scrypt é lento; não segurar a
 * transação aberta). As escritas em Organization/Membership rodam COM contexto de RLS.
 *
 * Idempotência vale para reexecuções **sequenciais** (o caso de uma rotina de ops manual). Duas
 * execuções **concorrentes** do mesmo slug colidem no unique de `Organization`; a transação inteira faz
 * rollback (fail-closed, sem escrita parcial) — não há corrupção, apenas uma das duas falha.
 *
 * @param {{ prisma: import('../generated/prisma/index.js').PrismaClient,
 *           hashSenha: (senha: string) => Promise<string>,
 *           entrada: object, gerarId?: () => string }} deps
 * @returns {Promise<{ orgId: string, accountId: string, slug: string, emailMascarado: string,
 *                     criou: { organization: boolean, account: boolean, membership: boolean, credential: boolean } }>}
 */
export async function provisionarTenant({ prisma, hashSenha, entrada, gerarId = randomUUID }) {
  const dados = validarEntradaProvisionamento(entrada); // fail-closed: lança antes de qualquer escrita
  const orgId = idOrganizacaoParaSlug(dados.orgSlug);
  const hash = await hashSenha(dados.adminSenha); // fora da transação

  return prisma.$transaction(async (tx) => {
    const criou = { organization: false, account: false, membership: false, credential: false };

    // Contexto de RLS por transação (transação-local: `true`). Sem isto, os INSERTs abaixo em
    // Organization/Membership seriam NEGADOS pela policy — é o que habilita, não um bypass.
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;

    // Account: identidade GLOBAL (sem RLS), idempotente por e-mail.
    let account = await tx.account.findUnique({ where: { email: dados.adminEmail } });
    if (!account) {
      account = await tx.account.create({
        data: { id: gerarId(), email: dados.adminEmail, name: dados.adminNome },
      });
      criou.account = true;
    }
    const accountId = account.id;

    // Organization: idempotente por id determinístico (contexto já é este id → policy satisfeita).
    const orgExistente = await tx.organization.findUnique({ where: { id: orgId } });
    if (!orgExistente) {
      await tx.organization.create({
        data: { id: orgId, name: dados.orgNome, slug: dados.orgSlug },
      });
      criou.organization = true;
    }

    // Membership: idempotente por (accountId, orgId). Papel único (AD-7): ADMIN ACTIVE.
    const vinculo = await tx.membership.findUnique({
      where: { accountId_orgId: { accountId, orgId } },
    });
    if (!vinculo) {
      await tx.membership.create({
        data: { id: gerarId(), accountId, orgId, role: 'ADMIN', state: 'ACTIVE' },
      });
      criou.membership = true;
    }

    // Credencial: cria SE ausente. NUNCA sobrescreve (um Admin real pode já ter trocado a senha).
    const credExistente = await tx.authCredential.findFirst({
      where: { userId: accountId, providerId: 'credential' },
    });
    if (!credExistente) {
      await tx.authCredential.create({
        data: {
          id: gerarId(),
          // No provedor `credential`, o Better Auth usa o próprio id do usuário como `accountId`.
          accountId,
          providerId: 'credential',
          userId: accountId,
          password: hash,
          updatedAt: new Date(),
        },
      });
      criou.credential = true;
    }

    return {
      orgId,
      accountId,
      slug: dados.orgSlug,
      emailMascarado: mascararEmail(dados.adminEmail),
      criou,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CLI de ops. Só roda quando o arquivo é executado diretamente (não ao ser importado pelo teste).
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

  // Migrator: único papel que pode INSERIR em Organization (o runtime tem só SELECT/UPDATE).
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    throw new Error('MIGRATION_DATABASE_URL ausente — o provisionamento usa o papel migrator.');
  }

  // Senha: fornecida OU gerada forte e impressa UMA vez. Nunca um valor padrão.
  let senha = process.env.PROVISION_ADMIN_PASSWORD;
  let senhaGerada = false;
  if (!senha) {
    senha = gerarSenhaForte();
    senhaGerada = true;
  }

  const entrada = {
    orgNome: process.env.PROVISION_ORG_NAME,
    orgSlug: process.env.PROVISION_ORG_SLUG, // opcional (derivado do nome se ausente)
    adminEmail: process.env.PROVISION_ADMIN_EMAIL,
    adminNome: process.env.PROVISION_ADMIN_NAME,
    adminSenha: senha,
  };

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
    const r = await provisionarTenant({
      prisma,
      hashSenha: (s) => ctx.password.hash(s),
      entrada,
    });
    // Resumo SANITIZADO — nunca a senha (salvo a gerada, uma vez), o hash ou a DATABASE_URL.
    console.log(
      `Tenant provisionado: org "${r.slug}" (${r.orgId}); admin ${r.emailMascarado}. ` +
        `Criados: ${JSON.stringify(r.criou)}.`,
    );
    if (senhaGerada && r.criou.credential) {
      console.log(
        '\n⚠️  Senha do Admin gerada automaticamente (mostrada UMA vez — troque no primeiro acesso):\n' +
          `    ${senha}\n`,
      );
    } else if (senhaGerada) {
      console.log('(Credencial já existia; a senha gerada NÃO foi aplicada.)');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mainCli();
}
