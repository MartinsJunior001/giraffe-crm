import { ForbiddenException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import {
  type AuditoriaEventoVisao,
  type LinhaEventoAuditoria,
  montarLogAuditoria,
  projetarEvento,
  SELECT_EVENTO_AUDITORIA,
} from './audit-projection';
import { type FiltrosAuditoria, LIMITE_MAX_AUDITORIA } from './audit.dto';

type Db = ReturnType<typeof withTenantContext>;

/** Uma página da Auditoria, com o cursor determinístico para a próxima. */
export interface PaginaAuditoria {
  eventos: AuditoriaEventoVisao[];
  proximoCursor: string | null;
}

/**
 * Consulta da **Auditoria administrativa** (Story 8.8) — read-side puro que PROJETA sobre o evento
 * canônico `MembershipEvent` (8.4/8.5/8.6). **Sem schema/migration/GRANT novo**: o runtime já tem
 * `SELECT` em `MembershipEvent` (append-only; sem UPDATE/DELETE — a trilha é imutável pelo banco).
 * Nenhum substrato de eventos novo é criado (AD-11: sem abstração especulativa; o único produtor com
 * tabela própria hoje é o ciclo de Membership — o catálogo mais amplo do épico é gate/consumidor futuro).
 *
 * **Autorização = Admin ATIVO da Org.** A rota exige `administrar Organizacao` (guard grosso — a ability
 * que a 1.6 concede SÓ ao ADMIN; MEMBER/GUEST e o Super Admin da Plataforma não têm essa ability → 403
 * sem executar o handler). Aqui, defesa em profundidade: o papel do contexto (Membership ACTIVE) reconfere
 * ADMIN. Guard/`ability.ts` intocados (C3 congelado).
 *
 * **Isolamento por Org.** TODA query passa por `withTenantContext` — a RLS escopa por `orgId =
 * current_org_id()`. Não há um único `where orgId` manual, e nenhum `orgId` vem do cliente. Evento de
 * outra Organização é invisível (0 linhas).
 *
 * **Projeção allowlist (AD-30) + minimização (D-4).** Só referências mínimas + metadados saem
 * (`audit-projection.ts`). `orgId` e chaves internas fora da fronteira; nenhum segredo/token/sessão/
 * e-mail/corpo HTTP (não existem na tabela). Filtros são fail-closed no DTO.
 *
 * **O acesso à Auditoria é auditado** (`AUDIT_LOG_VIEWED`): log estruturado (Pino) SANITIZADO, registrando
 * QUE alguém consultou (ator, Org, filtros, paginação, contagem) — **nunca o conteúdo listado**. Não é uma
 * tabela: o AC não exige consultabilidade do próprio acesso, então persistir seria sobre-construir (D-4).
 */
@Injectable()
export class AuditReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Uma página da Auditoria. Ordena por `[occurredAt DESC, id DESC]` (mais recente primeiro; ordem
   * cronológica DETERMINÍSTICA — o `id` único desempata timestamps iguais). Paginação por **cursor**
   * (o `id` da última linha; teto rígido 100). Registra `AUDIT_LOG_VIEWED` ao final.
   */
  async consultar(filtros: FiltrosAuditoria): Promise<PaginaAuditoria> {
    const { contexto, db } = this.ctx();
    // Defesa em profundidade: a rota já exige `administrar Organizacao` (Admin da Org). Se, por regressão,
    // um não-Admin chegasse aqui, o papel do contexto (Membership ACTIVE) ainda barra → 403.
    if (contexto.papel !== 'ADMIN') throw new ForbiddenException();

    const pagina = await this.buscar(db, filtros);
    this.registrarAcesso(contexto, filtros, pagina.eventos.length);
    return pagina;
  }

  /** Monta o `where`, pagina por cursor e projeta (allowlist). `resultado` que exclua SUCESSO → vazio (só
   * eventos de SUCESSO são persistidos hoje; BLOQUEADA/FALHA são write-side futuro, sem linhas). */
  private async buscar(db: Db, filtros: FiltrosAuditoria): Promise<PaginaAuditoria> {
    if (filtros.resultado !== null && filtros.resultado !== 'SUCESSO') {
      return { eventos: [], proximoCursor: null };
    }

    const where: Prisma.MembershipEventWhereInput = {};
    if (filtros.operacao !== null) where.type = filtros.operacao;
    if (filtros.ator !== null) where.actorId = filtros.ator;
    if (filtros.alvo !== null) where.membershipId = filtros.alvo;
    if (filtros.de !== null || filtros.ate !== null) {
      where.occurredAt = {
        ...(filtros.de !== null ? { gte: filtros.de } : {}),
        ...(filtros.ate !== null ? { lte: filtros.ate } : {}),
      };
    }

    const limite = Math.min(Math.max(filtros.limite, 1), LIMITE_MAX_AUDITORIA);
    const take = limite + 1; // +1 sonda para saber se há próxima página
    const linhas = (await db.membershipEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: SELECT_EVENTO_AUDITORIA,
      take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })) as LinhaEventoAuditoria[];

    const temMais = linhas.length === take;
    const janela = temMais ? linhas.slice(0, limite) : linhas;
    const proximoCursor = temMais ? (janela[janela.length - 1]?.id ?? null) : null;
    return { eventos: janela.map(projetarEvento), proximoCursor };
  }

  /** `AUDIT_LOG_VIEWED` — sanitizado, sem copiar os resultados (só a CONTAGEM da página). */
  private registrarAcesso(
    contexto: ContextoOrganizacional,
    filtros: FiltrosAuditoria,
    resultados: number,
  ): void {
    this.logger.info(
      montarLogAuditoria({
        actorId: contexto.accountId,
        orgId: contexto.orgId,
        filtros: {
          categoria: filtros.categoria,
          operacao: filtros.operacao,
          resultado: filtros.resultado,
          ator: filtros.ator,
          tipoAlvo: filtros.tipoAlvo,
          alvo: filtros.alvo,
          de: filtros.de ? filtros.de.toISOString() : null,
          ate: filtros.ate ? filtros.ate.toISOString() : null,
        },
        paginacao: { cursor: filtros.cursor, limite: filtros.limite },
        resultados,
      }),
      'auditoria',
    );
  }
}
