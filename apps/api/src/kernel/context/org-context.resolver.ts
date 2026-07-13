import { ForbiddenException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../db/prisma.service';
import { withAccountContext } from '../db/tenant-context';
import type { ContextoOrganizacional } from './request-context';

/**
 * Forma canônica de um UUID — hex e hífens, sem checar versão/variante (os ids do seed não são v4).
 *
 * A flag `i` aceita maiúsculas porque o guard normaliza para minúsculas ANTES de chegar aqui. Sem
 * essa normalização, a regex aprovaria `AAAA...` e a comparação com a Membership (`===`, byte a
 * byte, contra o que o PostgreSQL devolve — sempre minúsculo) reprovaria: 403 para um membro
 * legítimo, e um `context.denied` espúrio contaminando o único sinal de segurança da Story.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A ÚNICA autoridade sobre qual Organização está no contexto.
 *
 * A Story 1.2 entregou o isolamento imposto pelo banco e registrou, em comentário e no README, a
 * fronteira que deixava aberta: `withTenantContext` **confia** no `orgId` que recebe. A RLS impõe
 * o isolamento ENTRE Organizações; ela não decide A QUAL o requisitante pertence. Um handler que
 * fizesse `withTenantContext(prisma, { orgId: req.header('x-org-id') })` teria acesso integral a
 * um tenant alheio — e a RLS funcionaria perfeitamente o tempo todo, porque faria exatamente o
 * que lhe pediram.
 *
 * Este resolvedor é quem fecha isso. O `orgId` do cliente é, no máximo, um PEDIDO; a autoridade é
 * a Membership.
 */
@Injectable()
export class OrgContextResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Resolve o contexto a partir das Memberships ATIVAS da conta.
   *
   * `orgIdPedido` é o que veio do cliente (header/rota). Ele nunca é fonte de autoridade: ou casa
   * com uma Membership ativa, ou a requisição é rejeitada. Jamais é "corrigido em silêncio" —
   * corrigir em silêncio ensina o cliente a mandar qualquer coisa e ainda esconde a tentativa.
   */
  async resolver(accountId: string, orgIdPedido?: string): Promise<ContextoOrganizacional> {
    // Rejeita o que é sintaticamente inválido. Note o que esta guarda NÃO é: ela não protege o
    // banco de injeção — o `orgIdPedido` nunca entra em query nenhuma (a consulta abaixo filtra
    // por `accountId`; o pedido só é comparado em memória, no `some()`). Quem protege o banco são
    // as queries parametrizadas do Prisma.
    //
    // O que ela faz é rejeitar cedo e com o motivo CERTO: sem ela, um `orgId` malformado cairia no
    // `some()`, não casaria com nada, e seria auditado como "sem Membership ativa na Organização
    // pedida" — um evento de tentativa de acesso cruzado, quando na verdade foi um cliente com um
    // bug de formatação. Um sinal de segurança que confunde as duas coisas é um sinal que ninguém
    // consegue usar.
    if (orgIdPedido !== undefined && !UUID.test(orgIdPedido)) {
      this.negar(accountId, orgIdPedido, 'orgId malformado');
    }

    // A policy da Story 1.2 permite exatamente isto: sem contexto de Organização, a conta lê as
    // PRÓPRIAS Memberships e só elas. É o único caminho de leitura que existe antes de haver Org
    // ativa — e é por isso que ele existe.
    const db = withAccountContext(this.prisma, accountId, this.logger);
    const ativas = await db.membership.findMany({
      where: { accountId, state: 'ACTIVE' },
      // `role` alimenta o papel efetivo do contexto (Story 1.6): a autoridade sobre o que o
      // principal pode fazer vem da MESMA Membership que decide a QUAL Organização ele pertence.
      select: { orgId: true, role: true },
    });

    // `state != ACTIVE` NÃO concede contexto. A Story 1.2 deixou `MembershipState` sem efeito
    // sobre acesso e registrou a dívida; ela é paga aqui, no exato ponto em que a Membership vira
    // autoridade. Suspender alguém sem tirar-lhe o acesso é um botão que não faz nada.
    if (ativas.length === 0) {
      this.negar(accountId, orgIdPedido, 'nenhuma Membership ativa');
    }

    if (orgIdPedido === undefined) {
      if (ativas.length > 1) {
        // Escolher uma por conta própria seria a plataforma decidindo em nome do usuário — e
        // decidindo errado metade das vezes, em silêncio. A escolha explícita é da Story 1.9.
        this.negar(accountId, orgIdPedido, 'múltiplas Organizações e nenhuma indicada');
      }
      const unica = ativas[0]!;
      this.permitir(accountId, unica.orgId);
      return { orgId: unica.orgId, accountId, papel: unica.role };
    }

    // `find`, não `some`: além de decidir se é permitida, precisamos do PAPEL daquela Membership —
    // é ele que vira o teto de autorização (Story 1.6).
    const permitida = ativas.find((m) => m.orgId === orgIdPedido);
    if (!permitida) {
      this.negar(accountId, orgIdPedido, 'sem Membership ativa na Organização pedida');
    }

    this.permitir(accountId, orgIdPedido);
    return { orgId: orgIdPedido, accountId, papel: permitida.role };
  }

  private permitir(accountId: string, orgId: string): void {
    this.logger.info({ event: 'context.resolved', accountId, orgId }, 'contexto resolvido');
  }

  /**
   * Negação é evento de SEGURANÇA — registrada, contável, visível. Um 403 mudo é um 403 que
   * ninguém investiga.
   *
   * O corpo da resposta não carrega o motivo: dizer "você não é membro DESTA Organização"
   * confirma que ela existe. O motivo vai para o log; para o cliente vai só a negação.
   */
  private negar(accountId: string, orgIdPedido: string | undefined, motivo: string): never {
    this.logger.warn(
      { event: 'context.denied', accountId, orgIdPedido: orgIdPedido ?? null, motivo },
      'contexto organizacional negado',
    );
    throw new ForbiddenException();
  }
}
