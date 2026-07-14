import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../kernel/db/prisma.service';

/** Destino resolvido de uma rota pública: a Organização e o Formulário. Nunca vem do cliente. */
export interface DestinoPublico {
  orgId: string;
  formId: string;
}

/**
 * Resolve o tenant de uma submissão pública a partir do `publicId` opaco (Story 2.8) — ANTES de haver contexto.
 *
 * `PublicFormRoute` é GLOBAL e SEM RLS por definição (como `Account`): resolver o tenant não pode depender do
 * `current_org_id()` que ainda não existe. A consulta roda no **client raiz** (sem `withTenantContext`), pelo
 * `publicId` único. Uma rota inexistente ou revogada (`active=false`) devolve `null` — o chamador responde
 * **404 uniforme** (não enumera, não revela existência). O `publicId` é opaco e aleatório, não adivinhável.
 *
 * NUNCA aceita `orgId`/`formId` do cliente: o destino sai daqui. O chamador então entra em
 * `withTenantContext(orgId)` e RELÊ o `Form` sob RLS para validar publicação/opt-in/versão antes de escrever.
 */
@Injectable()
export class PublicRouteResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolver(publicId: string): Promise<DestinoPublico | null> {
    if (typeof publicId !== 'string' || publicId.length === 0) return null;
    const rota = await this.prisma.publicFormRoute.findUnique({
      where: { publicId },
      select: { orgId: true, formId: true, active: true },
    });
    if (!rota || !rota.active) return null; // inexistente ou revogada → 404 uniforme no chamador
    return { orgId: rota.orgId, formId: rota.formId };
  }
}
