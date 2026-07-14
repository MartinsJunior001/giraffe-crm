import { Body, Controller, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { type CardVisao, CardSubmissionService } from './card-submission.service';
import { parseSubmissao, validarIdRota } from './cards.dto';

/**
 * Submissão interna do Formulário inicial (Story 2.7), API INTERNA. A rota fica sob `pipes/:pipeId` (o Card
 * nasce do Pipe). `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (OPERAR o Pipe — Viewer não submete;
 * sem acesso → 404; não publicado → 409) vive no `CardSubmissionService`.
 *
 * `submit` **cria** um Card → **201**. Idempotente: um retry com a mesma `idempotencyKey` devolve o MESMO Card
 * (não cria um segundo). Não há rota que preencha um Card existente pelo Formulário inicial (D3.3).
 */
@Controller('pipes/:pipeId')
export class CardsController {
  constructor(private readonly submissao: CardSubmissionService) {}

  @Requer('ler', 'Pipe')
  @Post('forms/initial/submit')
  async submeter(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<CardVisao> {
    const dto = parseSubmissao(body);
    return this.submissao.submeter(validarIdRota(pipeId, 'pipeId'), dto);
  }
}
