import { Controller, Get, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';

/** O que a Organização do contexto expõe. Sem PII, sem contagem, sem campo "de brinde". */
interface OrganizacaoAtual {
  id: string;
  name: string;
  slug: string;
}

/**
 * Consumidor CONCRETO do contexto organizacional — a razão de o kernel de contexto existir.
 *
 * Sem ele, `kernel/context/` seria abstração especulativa, proibida pela Constitution II. Com
 * ele, a Story tem a demonstração vertical que o épico pede: sem contexto ⇒ rejeitado; com
 * contexto ⇒ enxerga a própria Organização e apenas ela.
 *
 * Note o que este controller NÃO faz: ele não recebe `orgId` nenhum. Não há parâmetro de rota,
 * não há query, não há corpo. A Organização vem do contexto resolvido no servidor — não existe
 * caminho pelo qual o cliente influencie qual Organização será lida.
 */
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  @Get('current')
  async current(): Promise<OrganizacaoAtual> {
    // `obter()` LANÇA se não houver contexto. Não há `?.`, não há default, não há fallback — é
    // essa ausência de rede que garante que o handler não roda sem contexto.
    const contexto = this.requestContext.obter();

    const db = withTenantContext(this.prisma, contexto, this.logger);

    const org = await db.organization.findUnique({
      where: { id: contexto.orgId },
      select: { id: true, name: true, slug: true },
    });

    // Defesa em profundidade: o guard já provou que existe Membership ativa nesta Organização.
    // Se ainda assim o banco não a devolve, algo está errado o bastante para NÃO improvisar —
    // 404 sanitizado, sem dizer o que aconteceu.
    if (!org) throw new NotFoundException();

    return org;
  }
}
