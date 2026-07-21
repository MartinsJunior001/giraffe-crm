import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../kernel/db/prisma.service';

/**
 * Resolve o tenant do aceite a partir do HASH do token (Story 8.3) — ANTES de haver contexto de
 * Organização. Gêmeo funcional do `PublicRouteResolver` da 2.8.
 *
 * `InviteRoute` é GLOBAL e SEM RLS por definição (como `Account`/`PublicFormRoute`): resolver o tenant
 * não pode depender do `current_org_id()` que ainda não existe. A consulta roda no **client raiz** (sem
 * `withTenantContext`), pela PK `tokenHash`. Um hash inexistente devolve `null` → **404 uniforme** no
 * chamador (não enumera, não revela existência).
 *
 * NUNCA aceita `orgId` do cliente: o destino sai daqui. E é só uma DICA — o serviço então entra em
 * `withTenantContext(orgId)` e **RELÊ o `Invite` sob RLS**, que é a AUTORIDADE. Uma rota apontando para
 * a Organização errada (envenenada/obsoleta) não concede nada: o relê sob RLS não acha o Convite → 404.
 */
@Injectable()
export class InviteRouteResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolverOrg(tokenHash: string): Promise<string | null> {
    if (typeof tokenHash !== 'string' || tokenHash.length === 0) return null;
    const rota = await this.prisma.inviteRoute.findUnique({
      where: { tokenHash },
      select: { orgId: true },
    });
    return rota?.orgId ?? null;
  }
}
