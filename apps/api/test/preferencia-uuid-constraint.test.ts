import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `AuthSession.activeOrganizationId` é coluna **`uuid`** — e é o BANCO que garante isso (Story 1.9).
 *
 * Este arquivo existe por causa de um erro real cometido durante a implementação: havia um teste HTTP
 * chamado "preferência MALFORMADA" que, no corpo, gravava `NULL`. Ele passava/falhava por motivos que
 * nada tinham a ver com o nome, e teria envelhecido como falsa evidência de um cenário inexistente.
 *
 * A pergunta certa não era "como o código trata uma preferência malformada?", e sim **"esse estado
 * pode existir?"**. Não pode: o PostgreSQL recusa a gravação. Provado aqui, uma vez, no nível certo —
 * e é por isso que o `OrgContextResolver` NÃO tem ramo para preferência malformada. Escrever esse
 * tratamento seria lógica para um caso impossível, sugerindo ao próximo leitor que ele ocorre.
 *
 * A validação de formato **permanece** para o `x-org-id`, que vem do cliente e pode ser qualquer
 * coisa. As duas entradas têm garantias diferentes porque têm origens diferentes.
 */

const migratorUrl = process.env.MIGRATION_DATABASE_URL;
let prisma: PrismaClient;

beforeAll(async () => {
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: este teste exige PostgreSQL.');
  prisma = new PrismaClient({ datasourceUrl: migratorUrl });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('a coluna da preferência é uuid, e o banco impõe isso', () => {
  it('o tipo declarado é `uuid` e aceita NULL', async () => {
    const [coluna] = await prisma.$queryRaw<{ udt_name: string; is_nullable: string }[]>`
      SELECT udt_name, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'AuthSession' AND column_name = 'activeOrganizationId'`;

    expect(coluna?.udt_name).toBe('uuid');
    // NULL é o estado legítimo "ainda não escolheu" — e é o default até a primeira troca.
    expect(coluna?.is_nullable).toBe('YES');
  });

  it('gravar um valor sintaticamente inválido é RECUSADO pelo PostgreSQL', async () => {
    // Parametrizado (tagged template), não interpolado: o valor é dado, nunca SQL. O erro esperado é
    // de TIPO, vindo do banco — não uma validação de aplicação que alguém possa remover amanhã.
    await expect(
      prisma.$executeRaw`UPDATE "AuthSession" SET "activeOrganizationId" = ${'nao-e-uuid'}::uuid`,
    ).rejects.toThrow(/invalid input syntax for type uuid|22P02/i);
  });

  it('NULL é aceito — é o estado "sem escolha", não um erro', async () => {
    // Não deve lançar. Sem linhas de sessão, o `UPDATE` simplesmente não afeta nada.
    await expect(
      prisma.$executeRaw`UPDATE "AuthSession" SET "activeOrganizationId" = NULL WHERE false`,
    ).resolves.toBeTypeOf('number');
  });
});
