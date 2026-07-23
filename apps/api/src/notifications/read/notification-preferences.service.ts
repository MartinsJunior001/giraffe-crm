import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import {
  metadadosDoTipo,
  resolverPreferenciaEfetiva,
  validarSetPreferencia,
} from './notification-type-registry';
import type { PreferenciaVisao } from './notifications-read.dto';

type Db = ReturnType<typeof withTenantContext>;

/**
 * Preferências de Notificação por tipo, do PRÓPRIO usuário (Story 5.4, R6). Ler/setar a preferência de
 * `(usuário-na-Org, tipo)`; silenciar altera as ENTREGAS FUTURAS e o que as superfícies exibem/contam — NUNCA
 * apaga Notificações anteriores (a preferência é read-side; o histórico é imutável). A precedência efetiva
 * (obrigatório › override › padrão) e a validação por tipo vivem no núcleo puro `notification-type-registry`.
 *
 * Autorização: piso `@Requer('ler','Organizacao')`; a fina é "só a MINHA preferência" — o `membershipId` é o do
 * PRINCIPAL autenticado (resolvido sob RLS, nunca do cliente). `orgId` fora da fronteira; toda query por
 * `withTenantContext`. GRANT column-scoped (`enabled`) — setar é UPSERT, sem DELETE.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  private async membershipDoPrincipal(db: Db, contexto: ContextoOrganizacional): Promise<string> {
    const membership = await db.membership.findFirst({
      where: { accountId: contexto.accountId },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException();
    return membership.id;
  }

  private projetar(type: string, override: boolean | undefined): PreferenciaVisao {
    const meta = metadadosDoTipo(type);
    return {
      type,
      enabled: resolverPreferenciaEfetiva(type, override),
      podeDesativar: meta.podeDesativar,
      obrigatorio: meta.obrigatorio,
      padrao: meta.padraoHabilitado,
    };
  }

  /**
   * Lê as preferências EFETIVAS do próprio usuário. Cobre os tipos com override explícito do usuário (o catálogo
   * canônico de tipos é a 5.6 — sem produtores concretos na Fase 1, sem override o resultado é honestamente
   * vazio). Cada item traz o efetivo + os metadados (padrão/desativável/obrigatório).
   */
  async listar(): Promise<PreferenciaVisao[]> {
    const { contexto, db } = this.ctx();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const overrides = await db.notificationPreference.findMany({
      where: { membershipId },
      select: { type: true, enabled: true },
      orderBy: { type: 'asc' },
    });
    return overrides.map((o) => this.projetar(o.type, o.enabled));
  }

  /**
   * Seta a preferência do próprio usuário para um tipo (UPSERT column-scoped `enabled`). Silenciar
   * (`enabled=false`) um tipo obrigatório/não-desativável ou `type` malformado → 400 (núcleo puro, fail-closed).
   * Afeta o FUTURO (não apaga histórico). Idempotente por natureza (mesmo valor reescreve a mesma linha).
   */
  async setar(type: string, enabled: boolean): Promise<PreferenciaVisao> {
    const { contexto, db } = this.ctx();
    const erro = validarSetPreferencia(type, enabled);
    if (erro) throw new BadRequestException(erro);

    const membershipId = await this.membershipDoPrincipal(db, contexto);
    await db.notificationPreference.upsert({
      where: { orgId_membershipId_type: { orgId: contexto.orgId, membershipId, type } },
      create: { orgId: contexto.orgId, membershipId, type, enabled },
      update: { enabled }, // column-scoped: só `enabled` (+`updatedAt` automático)
    });
    return this.projetar(type, enabled);
  }
}
