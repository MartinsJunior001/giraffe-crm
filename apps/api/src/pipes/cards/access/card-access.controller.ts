import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import {
  type ConcessaoVisao,
  type ResponsavelVisao,
  CardAccessService,
} from './card-access.service';
import { parseAtribuirResponsavel, parseCapacidades, validarIdRota } from './card-access.dto';

/**
 * Acesso, Responsável e concessões de Card (Story 2.10), API INTERNA. Rotas sob `cards/:cardId` — o Pipe dono é
 * resolvido do Card no servidor (nunca vem do cliente). `@Requer('ler','Pipe')` é a guarda GROSSA (baseline de
 * acesso a Pipe); a guarda FINA vive no `CardAccessService` (DBT-AUTHZ-01, C3 congelado): atribuir/remover
 * Responsável exige OPERAR o Card; conceder/revogar/listar exige GERENCIAR o Pipe. Sem acesso ao Card → 404
 * não-enumerante.
 *
 * `PUT` (idempotente) para atribuir Responsável e conceder acesso: são "definir o estado" (o Responsável único; a
 * concessão de uma pessoa). `DELETE` para remover/revogar é transição de `state` (soft), devolve 200 — o runtime
 * nem tem GRANT de DELETE; `DELETE` é só o verbo HTTP.
 */
@Controller('cards/:cardId')
export class CardAccessController {
  constructor(private readonly acesso: CardAccessService) {}

  // ── Responsável ──────────────────────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Get('responsavel')
  async verResponsavel(@Param('cardId') cardId: string): Promise<ResponsavelVisao | null> {
    return this.acesso.verResponsavel(validarIdRota(cardId, 'cardId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put('responsavel')
  async atribuirResponsavel(
    @Param('cardId') cardId: string,
    @Body() body: unknown,
  ): Promise<ResponsavelVisao> {
    const { membershipId } = parseAtribuirResponsavel(body);
    return this.acesso.atribuirResponsavel(validarIdRota(cardId, 'cardId'), membershipId);
  }

  @Requer('ler', 'Pipe')
  @Delete('responsavel')
  async removerResponsavel(@Param('cardId') cardId: string): Promise<{ removido: boolean }> {
    return this.acesso.removerResponsavel(validarIdRota(cardId, 'cardId'));
  }

  // ── Concessão direta ─────────────────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Get('grants')
  async listarConcessoes(@Param('cardId') cardId: string): Promise<ConcessaoVisao[]> {
    return this.acesso.listarConcessoes(validarIdRota(cardId, 'cardId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put('grants/:membershipId')
  async conceder(
    @Param('cardId') cardId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ): Promise<ConcessaoVisao> {
    const caps = parseCapacidades(body);
    return this.acesso.conceder(validarIdRota(cardId, 'cardId'), {
      membershipId: validarIdRota(membershipId, 'membershipId'),
      ...caps,
    });
  }

  @Requer('ler', 'Pipe')
  @Delete('grants/:membershipId')
  async revogar(
    @Param('cardId') cardId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<{ revogado: boolean }> {
    return this.acesso.revogar(
      validarIdRota(cardId, 'cardId'),
      validarIdRota(membershipId, 'membershipId'),
    );
  }
}
