import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { PinoLogger } from 'nestjs-pino';
import { AUTH, type Auth } from '../auth/auth.tokens';
import { PrismaService } from '../db/prisma.service';
import { withAccountContext, withTenantContext } from '../db/tenant-context';
import {
  NOTIFICATION_REALTIME,
  type NotificationRealtimePort,
} from '../../notifications/realtime/notification-realtime.port';
import { persistirOrganizacaoAtiva } from './persistir-preferencia';

/** Uma Organização que a conta pode escolher. `papel` vem da MESMA Membership que concede o acesso. */
export interface OrganizacaoElegivel {
  id: string;
  nome: string;
  papel: 'ADMIN' | 'MEMBER' | 'GUEST';
}

export interface OrganizacoesVisao {
  /** Organização ativa AGORA (resolvida), ou `null` quando ainda não há escolha válida. */
  atual: string | null;
  organizacoes: OrganizacaoElegivel[];
}

/**
 * Troca explícita de Organização (Story 1.9).
 *
 * A 1.3 deixou esta fronteira declarada em comentário — *"a escolha explícita é da Story 1.9"* — e
 * deixou o campo `AuthSession.activeOrganizationId` existindo **sem nenhum leitor**. Este serviço é
 * o que fecha isso: escreve a escolha, e o `OrgContextResolver` passa a lê-la como PEDIDO.
 *
 * **O invariante que este arquivo não pode quebrar:** a sessão guarda PREFERÊNCIA, a Membership é a
 * AUTORIDADE. Nada aqui concede acesso — a escrita só registra uma escolha que será reconferida, a
 * cada requisição, contra a Membership ATIVA. Se isso se inverter algum dia, suspender uma
 * Membership deixará de tirar o acesso de alguém, que é exatamente o buraco que a 1.3 fechou.
 */
@Injectable()
export class OrganizacaoAtivaService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    // Story 5.5 — a troca de Org ativa encerra as inscrições de tempo real da Org anterior (AC2). Port
    // TÉCNICO transversal (sinal genérico "revalide"/"revogue por canal"), injetado por token global e
    // OPCIONAL: sem o gateway, a troca segue idêntica. O adapter (gateway) vive em `notifications/`; aqui
    // só se fala com a interface (nenhuma regra de negócio de Notificação entra no kernel).
    @Optional()
    @Inject(NOTIFICATION_REALTIME)
    private readonly realtime?: NotificationRealtimePort,
  ) {}

  /**
   * Organizações elegíveis = Memberships **ACTIVE** da própria conta. Nunca enumera outra coisa.
   *
   * Lê por `withAccountContext`: sem contexto de Organização, a policy da 1.2 permite exatamente
   * isto — a conta lê as PRÓPRIAS Memberships e só elas. É o único caminho de leitura que existe
   * antes de haver Org ativa, e é por isso que ele existe.
   */
  async listar(accountId: string, atual: string | null): Promise<OrganizacoesVisao> {
    const db = withAccountContext(this.prisma, accountId, this.logger);
    const ativas = await db.membership.findMany({
      where: { accountId, state: 'ACTIVE' },
      select: { orgId: true, role: true },
      orderBy: { orgId: 'asc' },
    });

    // `atual` é a preferência **validada contra a lista elegível**, não o valor cru da sessão.
    //
    // Não pode vir do `RequestContext`: esta rota dispensa contexto de propósito (quem tem duas
    // Memberships e ainda não escolheu não TEM contexto, e é justamente quem mais precisa da lista).
    // E não pode ser a preferência crua: ela envelhece — apontar como "atual" uma Organização cuja
    // Membership foi revogada faria a UI destacar um acesso que o servidor já não concede.
    //
    // Filtrar pela lista elegível resolve os dois: `null` significa "nenhuma escolha válida em
    // vigor", que é exatamente o estado em que a UI deve exigir escolha.
    const elegiveis = new Set(ativas.map((m) => m.orgId));
    const atualValida = atual !== null && elegiveis.has(atual) ? atual : null;

    return {
      atual: atualValida,
      organizacoes: await Promise.all(ativas.map((m) => this.comNome(m.orgId, m.role))),
    };
  }

  /**
   * Lê o NOME da Organização sob o contexto DELA — e não por join a partir do contexto de conta.
   *
   * A policy `org_select` exige `id = current_org_id()`. Sob `withAccountContext` não há Organização
   * ativa, `current_org_id()` é NULL, e **nenhuma comparação com NULL é verdadeira**: um join para
   * `Organization` a partir dali não devolve linha nenhuma — silenciosamente, porque a RLS filtra em
   * vez de lançar. Foi exatamente assim que este método falhou na primeira execução, com a Membership
   * existindo e a consulta voltando vazia.
   *
   * A saída NÃO é afrouxar a policy. É entrar no contexto de cada Organização — o que é legítimo
   * precisamente porque a Membership ACTIVE naquela Organização já foi verificada logo acima; é a
   * mesma autorização que o `OrgContextResolver` concederia para uma requisição normal.
   *
   * O custo é uma consulta por Organização elegível. É aceitável porque o número de Memberships
   * ativas de uma pessoa é pequeno por natureza, e porque a alternativa seria abrir a leitura de
   * `Organization` fora do contexto — trocar um invariante de isolamento por uma economia de I/O.
   */
  private async comNome(
    orgId: string,
    papel: 'ADMIN' | 'MEMBER' | 'GUEST',
  ): Promise<OrganizacaoElegivel> {
    const db = withTenantContext(this.prisma, { orgId }, this.logger);
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    // Nome ausente não pode derrubar a listagem: o `id` é o que permite trocar, e é ele que importa
    // para a decisão. Um fallback honesto é melhor que um 500 por causa de um rótulo.
    return { id: orgId, nome: org?.name ?? '—', papel };
  }

  /**
   * Troca a Organização ativa. Revalida no servidor e só então persiste.
   *
   * **404 uniforme** para inexistente, sem Membership e Membership inativa. Distinguir os três
   * entregaria um oráculo de existência de Organizações: quem tem um `orgId` qualquer descobriria,
   * pelo código de status, se ele corresponde a uma Organização real. O usuário legítimo não perde
   * nada com o 404 — ele escolhe da lista que o próprio servidor lhe deu.
   *
   * **TOCTOU:** a validação e a escrita não são atômicas entre si, e não precisam ser. Se a
   * Membership for revogada entre uma e outra, o pior resultado possível é uma preferência morta
   * gravada na sessão — e preferência morta **não concede acesso**: a próxima requisição a confere
   * contra a Membership ATIVA, não encontra, descarta e reaplica as regras. A janela de TOCTOU aqui
   * não produz privilégio; produz, no máximo, um 403 na requisição seguinte.
   */
  async trocar(
    req: IncomingMessage,
    accountId: string,
    orgId: string,
  ): Promise<OrganizacaoElegivel> {
    const db = withAccountContext(this.prisma, accountId, this.logger);
    // Só a Membership aqui — sem join para `Organization`, que a policy `org_select` bloquearia sob
    // contexto de conta (ver `comNome`). O nome vem depois, no contexto da própria Organização.
    const membership = await db.membership.findFirst({
      where: { accountId, orgId, state: 'ACTIVE' },
      select: { role: true },
    });

    if (!membership) {
      // Log com motivo (é evento de segurança e precisa ser investigável); resposta sem motivo.
      this.logger.warn(
        { event: 'org.troca_negada', accountId, orgId },
        'troca de Organização negada — sem Membership ativa',
      );
      throw new NotFoundException();
    }

    // A Org ativa ANTERIOR (para revogar a inscrição de tempo real dela). Lida da sessão validada no
    // servidor, ANTES da persistência sobrescrever. Best-effort: falha aqui não impede a troca.
    const anterior = await this.orgAtivaAtual(req);

    await this.persistirPreferencia(req, accountId, orgId);

    // Story 5.5 (AC2): a troca encerra as inscrições anteriores — revoga o canal de tempo real da Org
    // anterior do usuário (o cliente reabre o socket já na nova Org). Só quando havia outra Org ativa.
    if (anterior && anterior !== orgId) this.realtime?.revogarCanal(anterior, accountId);

    this.logger.info({ event: 'org.trocada', accountId, orgId }, 'Organização ativa trocada');
    return this.comNome(orgId, membership.role);
  }

  /** A Organização ativa persistida na sessão desta requisição (ou `null`). Resolvida no servidor. */
  private async orgAtivaAtual(req: IncomingMessage): Promise<string | null> {
    try {
      const sessao = await this.auth.api.getSession({ headers: paraHeaders(req.headers) });
      const atual = (sessao?.session as { activeOrganizationId?: string | null } | undefined)
        ?.activeOrganizationId;
      return atual ?? null;
    } catch {
      return null; // best-effort: sem a Org anterior, apenas não revogamos (a troca segue).
    }
  }

  /**
   * Persiste a escolha na SESSÃO AUTENTICADA EXATA — e em nenhuma outra.
   *
   * O mecanismo concreto (API oficial do Better Auth × escrita direta) é decidido em
   * `persistir-preferencia.ts`, que documenta o porquê. O que este serviço garante, seja qual for o
   * mecanismo, é o escopo: a sessão alvo é a que veio nos headers desta requisição, resolvida pelo
   * próprio Better Auth. Um `orgId` de corpo jamais escolhe QUAL sessão é alterada.
   */
  private async persistirPreferencia(
    req: IncomingMessage,
    accountId: string,
    orgId: string,
  ): Promise<void> {
    await persistirOrganizacaoAtiva(this.auth, this.prisma, req, accountId, orgId);
  }
}

/** Headers do Node → `Headers` do padrão web, preservando repetições (mesmo critério da 1.4/1.9). */
function paraHeaders(brutos: IncomingMessage['headers']): Headers {
  const headers = new Headers();
  for (const [chave, valor] of Object.entries(brutos)) {
    if (Array.isArray(valor)) valor.forEach((v) => headers.append(chave, v));
    else if (valor !== undefined) headers.append(chave, valor);
  }
  return headers;
}
