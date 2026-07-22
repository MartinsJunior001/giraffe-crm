import { Body, Controller, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Requer } from '../../kernel/authz/requer.decorator';
import { exigirUuid, parseAlterarPapel } from './membership-role.dto';
import { type AlteracaoPapelVisao, MembershipRoleService } from './membership-role.service';
import { type TransicaoEstadoVisao, MembershipStateService } from './membership-state.service';

/**
 * Administração de Membros da Organização (Épico 8). Story 8.4: alteração de papel.
 *
 * **A fronteira grossa é `@Requer('administrar', 'Organizacao')`** — a ability que a 1.6 concede APENAS
 * ao ADMIN da Org (`ability.factory.ts`). MEMBER/GUEST batem no `AuthzGuard` (deny-by-default) e recebem
 * 403 sem que o handler execute. A autoridade FINA (último Admin, step-up, alvo ativo) vive no serviço,
 * sem tocar o guard/`ability.ts` (C3 congelado) — mesmo padrão de `pipe-authz`/`database-authz`.
 *
 * **Nenhum `orgId` vem do cliente.** A Organização é a do contexto resolvido no servidor; a rota só
 * recebe o `membershipId` do alvo (na Org corrente por RLS) e o novo papel no corpo.
 *
 * **Step-up (D-1):** o handler passa os headers ao serviço, que resolve a sessão pelo Better Auth (1.12)
 * — a identidade e a janela de step-up vêm SEMPRE da sessão validada, nunca do corpo.
 */
@Controller('organizations/members')
export class MembersController {
  constructor(
    private readonly membershipRole: MembershipRoleService,
    private readonly membershipState: MembershipStateService,
  ) {}

  @Requer('administrar', 'Organizacao')
  @Patch(':membershipId/role')
  async alterarPapel(
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() req: ExpressRequest,
  ): Promise<AlteracaoPapelVisao> {
    const id = exigirUuid(membershipId);
    const { role } = parseAlterarPapel(body);
    return this.membershipRole.alterarPapel(id, role, req.headers);
  }

  /**
   * Suspensão da Membership (Story 8.5). Transição de ESTADO (`ACTIVE → SUSPENDED`), não de papel — a
   * rota não recebe corpo (o alvo é o `membershipId` na Org corrente por RLS; nenhum `orgId` do cliente).
   * `200` (transição, como arquivar/restaurar no resto do domínio), não `201`. Step-up e autoridade
   * resolvidos no serviço a partir da sessão validada.
   */
  @Requer('administrar', 'Organizacao')
  @Post(':membershipId/suspend')
  @HttpCode(200)
  async suspender(
    @Param('membershipId') membershipId: string,
    @Req() req: ExpressRequest,
  ): Promise<TransicaoEstadoVisao> {
    const id = exigirUuid(membershipId);
    return this.membershipState.suspender(id, req.headers);
  }

  /** Reativação da Membership (Story 8.5). `SUSPENDED → ACTIVE`, papel preservado, sem restauração. */
  @Requer('administrar', 'Organizacao')
  @Post(':membershipId/reactivate')
  @HttpCode(200)
  async reativar(
    @Param('membershipId') membershipId: string,
    @Req() req: ExpressRequest,
  ): Promise<TransicaoEstadoVisao> {
    const id = exigirUuid(membershipId);
    return this.membershipState.reativar(id, req.headers);
  }
}
