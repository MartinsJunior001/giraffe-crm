import { ForbiddenException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import { OrgContextResolver } from '../src/kernel/context/org-context.resolver';
import type { PrismaService } from '../src/kernel/db/prisma.service';

/**
 * O resolvedor contra um PostgreSQL REAL.
 *
 * A Story 1.2 provou que o banco isola Organizações. Ela NÃO provou quem decide a qual
 * Organização o requisitante pertence — e `withTenantContext` confia cegamente no `orgId` que
 * recebe. Este arquivo cobre exatamente essa fronteira: a Membership é a autoridade, o header do
 * cliente é apenas um pedido.
 *
 * Mockar o banco aqui destruiria o teste: a leitura das próprias Memberships só é possível
 * porque a policy da Story 1.2 a permite. Um mock provaria o mock.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // existe, mas ninguém do seed é membro
const ANA = '11111111-1111-1111-1111-111111111111'; // ACTIVE só na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // ACTIVE na Org A, SUSPENDED na Org B
const DANI = '44444444-4444-4444-4444-444444444444'; // nenhuma Membership
const EVA = '55555555-5555-5555-5555-555555555555'; // ACTIVE nas Orgs A e B

/** Evento capturado, para provar que a negação é observável — não um 403 mudo. */
interface Evento {
  readonly nivel: 'info' | 'warn';
  readonly dados: Record<string, unknown>;
}

let eventos: Evento[] = [];

const logger = {
  info: (dados: Record<string, unknown>) => eventos.push({ nivel: 'info', dados }),
  warn: (dados: Record<string, unknown>) => eventos.push({ nivel: 'warn', dados }),
  debug: () => {},
} as unknown as PinoLogger;

const databaseUrl = process.env.DATABASE_URL;

let prisma: PrismaClient;
let resolver: OrgContextResolver;

beforeAll(async () => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ausente: os testes de contexto exigem um PostgreSQL real.');
  }
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();

  // O resolvedor só usa o client como client. Construí-lo direto — em vez de subir o container
  // de DI inteiro — mantém este arquivo focado na REGRA, não na fiação.
  resolver = new OrgContextResolver(prisma as unknown as PrismaService, logger);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

/** Isola os eventos de cada teste. */
function limparEventos(): void {
  eventos = [];
}

describe('o contexto vem da Membership, não do cliente', () => {
  it('resolve a única Organização ativa quando nada é pedido', async () => {
    limparEventos();

    const contexto = await resolver.resolver(ANA);

    expect(contexto).toEqual({ orgId: ORG_A, accountId: ANA });
    expect(eventos).toContainEqual(
      expect.objectContaining({
        nivel: 'info',
        dados: expect.objectContaining({ event: 'context.resolved', orgId: ORG_A }),
      }),
    );
  });

  it('honra o pedido quando ele CASA com uma Membership ativa', async () => {
    const contexto = await resolver.resolver(EVA, ORG_B);

    expect(contexto).toEqual({ orgId: ORG_B, accountId: EVA });
  });
});

describe('negação', () => {
  it('conta SEM Membership nenhuma não obtém contexto', async () => {
    await expect(resolver.resolver(DANI)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Organização pedida em que a conta NÃO é membro é negada', async () => {
    // Ana é membro da Org A. Pedir a Org B é exatamente a tentativa de cross-tenant que a RLS,
    // sozinha, NÃO impediria: ela obedeceria ao contexto que lhe fosse entregue.
    await expect(resolver.resolver(ANA, ORG_B)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Organização que existe, mas sem vínculo, é negada como qualquer outra', async () => {
    // A Org C existe de verdade. A resposta é a mesma de uma Org inexistente — de propósito:
    // distinguir "não existe" de "existe e você não entra" transforma o 403 em um oráculo que
    // enumera Organizações alheias.
    await expect(resolver.resolver(ANA, ORG_C)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Membership SUSPENDED não concede contexto', async () => {
    // A dívida que a Story 1.2 registrou: `MembershipState` existia e não tinha efeito nenhum
    // sobre acesso. Suspender alguém sem lhe tirar o acesso é um botão que não faz nada.
    //
    // Bruno TEM vínculo na Org B — só que suspenso. Se o resolvedor filtrasse apenas por
    // `accountId`, este pedido passaria.
    await expect(resolver.resolver(BRUNO, ORG_B)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('e a Membership suspensa também não conta como "única Organização"', async () => {
    // Consequência do mesmo filtro, pelo outro lado: sem pedido, Bruno resolve para a Org A —
    // a suspensa não entra na contagem nem é escolhida por eliminação.
    const contexto = await resolver.resolver(BRUNO);

    expect(contexto.orgId).toBe(ORG_A);
  });

  it('múltiplas Organizações ativas SEM indicação é negado, não adivinhado', async () => {
    // Eva é ACTIVE nas Orgs A e B. Escolher uma por conta própria seria a plataforma decidindo
    // pelo usuário — e decidindo errado metade das vezes, em silêncio, com dados de outro
    // tenant na tela. A escolha explícita é da Story 1.9.
    await expect(resolver.resolver(EVA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('orgId malformado é rejeitado ANTES do banco (403, não 500)', async () => {
    // `'não-é-uuid'::uuid` estoura erro de driver, que vira 500 — e um 500 num caminho de
    // autorização é uma resposta que não diz "negado", diz "quebrei". Além disso, entregar
    // texto arbitrário do cliente ao banco é o hábito que precede a injeção.
    await expect(resolver.resolver(ANA, 'nao-e-um-uuid')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await expect(resolver.resolver(ANA, '\'; DROP TABLE "Membership"; --')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // E a tabela continua lá.
    const vivas = await prisma.$queryRaw<{ existe: boolean }[]>`
      SELECT to_regclass('public."Membership"') IS NOT NULL AS existe`;
    expect(vivas[0]?.existe).toBe(true);
  });
});

describe('a negação é observável', () => {
  it('registra context.denied com o motivo — e sem o corpo dizer nada ao cliente', async () => {
    limparEventos();

    await expect(resolver.resolver(ANA, ORG_B)).rejects.toBeInstanceOf(ForbiddenException);

    const negacao = eventos.find((e) => e.dados['event'] === 'context.denied');

    // Um 403 que ninguém consegue contar é um ataque que ninguém percebe.
    expect(negacao).toBeDefined();
    expect(negacao?.nivel).toBe('warn');
    expect(negacao?.dados).toMatchObject({ accountId: ANA, orgIdPedido: ORG_B });
    expect(negacao?.dados['motivo']).toMatch(/sem Membership ativa/i);
  });

  it('o motivo fica no log e NÃO na resposta', async () => {
    // O corpo do 403 é o padrão do Nest ("Forbidden"), sem motivo. Dizer "você não é membro
    // DESTA Organização" confirmaria, para quem chutou o id, que ela existe.
    const erro = await resolver.resolver(ANA, ORG_B).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(JSON.stringify((erro as ForbiddenException).getResponse())).not.toMatch(
      /Membership|ativa|motivo/i,
    );
  });
});
