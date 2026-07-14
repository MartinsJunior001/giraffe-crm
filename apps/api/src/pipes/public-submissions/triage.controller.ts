import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { validarIdRota } from './public-submissions.dto';
import { type SubmissaoPendenteVisao, TriageService } from './triage.service';

/**
 * Triagem das submissões públicas (Story 2.8), API INTERNA autenticada. Sob `pipes/:pipeId`. `@Requer('ler',
 * 'Pipe')` é a guarda GROSSA; a guarda FINA (capacidade "Revisar submissões públicas") vive no `TriageService`
 * (Admin da Org implícito; demais por concessão; sem acesso 404; sem a capacidade 403).
 *
 * Aprovar cria 1 Card → **201**; rejeitar é mudança de estado → **200**.
 */
@Controller('pipes/:pipeId/public-submissions')
export class TriageController {
  constructor(private readonly triagem: TriageService) {}

  @Requer('ler', 'Pipe')
  @Get()
  async listar(@Param('pipeId') pipeId: string): Promise<SubmissaoPendenteVisao[]> {
    return this.triagem.listarPendentes(validarIdRota(pipeId, 'pipeId'));
  }

  @Requer('ler', 'Pipe')
  @Post(':submissaoId/approve')
  async aprovar(
    @Param('pipeId') pipeId: string,
    @Param('submissaoId') submissaoId: string,
  ): Promise<{ ok: true; cardId: string }> {
    return this.triagem.aprovar(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(submissaoId, 'submissaoId'),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post(':submissaoId/reject')
  async rejeitar(
    @Param('pipeId') pipeId: string,
    @Param('submissaoId') submissaoId: string,
  ): Promise<{ ok: true }> {
    return this.triagem.rejeitar(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(submissaoId, 'submissaoId'),
    );
  }
}
