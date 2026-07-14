import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../cards.dto';
import { type CicloVidaVisao, CardLifecycleService } from './card-lifecycle.service';

/**
 * Ciclo de vida do Card (Story 2.11), API INTERNA. Rotas sob `cards/:cardId` — o Pipe dono é resolvido do Card no
 * servidor. `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (OPERAR o Card — 2.10) vive no serviço.
 *
 * Cada rota é uma TRANSIÇÃO de estado (não criação de recurso) → **200**. Idempotente: pedir a transição para o
 * estado em que já se está devolve o Card sem novo evento; transição inválida a partir do estado atual → **409**.
 * Nenhuma toca `phaseId` (movimentação é a 2.14) — o runtime nem tem GRANT de UPDATE dessa coluna.
 */
@Controller('cards/:cardId')
export class CardLifecycleController {
  constructor(private readonly ciclo: CardLifecycleService) {}

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('finalize')
  finalizar(@Param('cardId') cardId: string): Promise<CicloVidaVisao> {
    return this.ciclo.finalizar(validarIdRota(cardId, 'cardId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('reopen')
  reabrir(@Param('cardId') cardId: string): Promise<CicloVidaVisao> {
    return this.ciclo.reabrir(validarIdRota(cardId, 'cardId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('archive')
  arquivar(@Param('cardId') cardId: string): Promise<CicloVidaVisao> {
    return this.ciclo.arquivar(validarIdRota(cardId, 'cardId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('restore')
  restaurar(@Param('cardId') cardId: string): Promise<CicloVidaVisao> {
    return this.ciclo.restaurar(validarIdRota(cardId, 'cardId'));
  }
}
