import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../cards.dto';
import { parseMovimentacao } from './card-movement.dto';
import { type MovimentacaoVisao, CardMovementService } from './card-movement.service';

/**
 * Movimentação do Card entre Fases (Story 2.14), API INTERNA. Rota sob `cards/:cardId` — o Pipe dono é resolvido do
 * Card no servidor. `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (MOVER o Card — `exigirMoverCard`,
 * 2.10/2.14) vive no serviço, com o Card carregado.
 *
 * Mover é uma TRANSIÇÃO (não criação de recurso) → **200**. Idempotente: mover para a Fase atual devolve o Card sem
 * novo evento (no-op — D4); bloqueio de preflight (ciclo não-aberto / Fase arquivada / outro Pipe / confirmação
 * ausente) ou conflito de concorrência → **409**; Somente leitura/Observador → **403**; sem acesso → **404**.
 * Nenhuma parte da requisição informa `orgId`/`phaseId` de origem — a origem é lida do Card sob contexto.
 */
@Controller('cards/:cardId')
export class CardMovementController {
  constructor(private readonly movimentacao: CardMovementService) {}

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('move')
  async mover(@Param('cardId') cardId: string, @Body() body: unknown): Promise<MovimentacaoVisao> {
    const dto = parseMovimentacao(body);
    return this.movimentacao.mover(validarIdRota(cardId, 'cardId'), dto);
  }
}
