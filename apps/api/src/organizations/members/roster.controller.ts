import { Controller, Get, Query } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import {
  type RosterConvitesVisao,
  type RosterMembrosVisao,
  RosterReadService,
} from './roster-read.service';
import { parseConsultaConvites, parseConsultaMembros } from './roster.dto';

/**
 * **Roster de membros e Convites (Story 8.7)** — leitura do painel administrativo. Controller/serviço
 * DEDICADOS de leitura; **não** toca o write-side de `invites/` nem as rotas de mutação de `members/`.
 *
 * **Nenhum `orgId` vem do cliente** — a Organização é a do contexto resolvido no servidor. As rotas só
 * recebem filtros/paginação na query string (allowlist fail-closed no DTO).
 *
 * **Guardas (grossas) e autoridade fina:**
 *  - `GET /organizations/members` → `@Requer('ler','Organizacao')` (piso de toda Membership ativa). O
 *    serviço decide a projeção: Admin (plena), Membro (reduzida), **Convidado → 403**.
 *  - `GET /organizations/invites` → `@Requer('administrar','Organizacao')` — **só Admin** (MEMBER/GUEST
 *    batem no `AuthzGuard`, deny-by-default). O serviço reforça por defesa em profundidade.
 */
@Controller('organizations')
export class RosterController {
  constructor(private readonly roster: RosterReadService) {}

  @Requer('ler', 'Organizacao')
  @Get('members')
  async listarMembros(@Query() query: unknown): Promise<RosterMembrosVisao> {
    return this.roster.listarMembros(parseConsultaMembros(query));
  }

  @Requer('administrar', 'Organizacao')
  @Get('invites')
  async listarConvites(@Query() query: unknown): Promise<RosterConvitesVisao> {
    return this.roster.listarConvites(parseConsultaConvites(query));
  }
}
