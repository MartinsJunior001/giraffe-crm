import { Controller, Get, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { MembershipRole } from '../../generated/prisma';
import { Requer } from '../kernel/authz/requer.decorator';
import { RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';

/**
 * O que a Organização do contexto expõe. Sem PII, sem contagem, sem campo "de brinde".
 *
 * `papel` é o `MembershipRole` efetivo do requisitante NESTA Organização — já resolvido no contexto
 * (Story 1.6). A casca (Story 1.7) o usa para adaptar a navegação e mostrar o contexto atual. Não é
 * PII e não concede nada por si: a autorização real continua sendo do servidor (deny-by-default).
 */
interface OrganizacaoAtual {
  id: string;
  name: string;
  slug: string;
  papel: MembershipRole;
}

/**
 * Escopo do Painel Administrativo (Story 8.1). Deliberadamente MENOR que `OrganizacaoAtual`: sem
 * `papel`, porque quem chega aqui já passou pela guarda de Admin — repetir o papel na resposta
 * insinuaria que a UI deveria conferi-lo de novo, e é justamente essa checagem no cliente que esta
 * rota existe para eliminar.
 */
interface EscopoAdministrativo {
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

  // Primeiro consumidor concreto do substrato de autorização (Story 1.6): ler a própria Organização
  // exige a ability `ler` sobre `Organizacao`. Toda Membership ativa a possui (piso), então nenhuma
  // regressão — mas a rota passa a provar, sobre HTTP, que o `AuthzGuard` roda como APP_GUARD e
  // concede corretamente. Sem `@Requer`, a autorização de AÇÃO não se aplicaria a ela.
  @Requer('ler', 'Organizacao')
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

    // `papel` vem do contexto já resolvido (1.6), não de nova consulta — a mesma Membership que
    // decide a Organização decide o papel.
    return { ...org, papel: contexto.papel };
  }

  /**
   * Escopo administrativo da Organização atual (Story 8.1) — a GUARDA do Painel Administrativo.
   *
   * `@Requer('administrar', 'Organizacao')` é a fronteira: a ability que a 1.6 concede **apenas ao
   * ADMIN** (`ability.factory.ts`). MEMBER e GUEST batem no `AuthzGuard` (APP_GUARD,
   * deny-by-default) e recebem 403 sem que este handler chegue a executar.
   *
   * **Por que esta rota existe, em vez de a web decidir pelo `papel` de `/current`.** Aquele campo é
   * dado de APRESENTAÇÃO — serve para adaptar a navegação. Usá-lo como fronteira faria a segurança
   * do Painel depender de um valor transportado até o cliente. Aqui a negação é do SERVIDOR, e a
   * casca web apenas reflete o que ele respondeu (NFR-37).
   *
   * **Membership suspensa ou encerrada não chega aqui**, e isso não é código desta Story: o
   * `OrgContextResolver` (1.3) só resolve contexto com Membership ACTIVE, e sem contexto o
   * `TenantContextGuard` nega antes. A 8.1 acrescenta o TESTE que prova que continua valendo pela
   * porta do Painel.
   *
   * **Super Admin da Plataforma não obtém acesso implícito** (INV-ADMIN-01), também por construção:
   * `PapelEfetivo` é `MembershipRole` e não existe papel de Plataforma no substrato — não há ramo a
   * bloquear, há um caminho que nunca foi aberto.
   *
   * Como em `/current`, **nenhum identificador vem do cliente**: sem parâmetro de rota, sem query,
   * sem corpo. Não há superfície por onde ampliar escopo ou descobrir outra Organização.
   */
  @Requer('administrar', 'Organizacao')
  @Get('admin-scope')
  async adminScope(): Promise<EscopoAdministrativo> {
    const contexto = this.requestContext.obter();
    const db = withTenantContext(this.prisma, contexto, this.logger);

    const org = await db.organization.findUnique({
      where: { id: contexto.orgId },
      select: { id: true, name: true, slug: true },
    });

    if (!org) throw new NotFoundException();

    // Só a PRÓPRIA Organização. Sem contagem, sem agregado, sem "resumo": a 8.1 é casca e guarda, e
    // qualquer número aqui seria dado fictício (INV-ADMIN-02) ou cálculo duplicado de E7.
    return org;
  }
}
