import { BadRequestException, Body, Controller, Param, Patch } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { validarIdRota } from '../cards/cards.dto';
import { type ModoFormularioFaseVisao, PhaseFormConfigService } from './phase-form-config.service';

/**
 * Configuração do MODO do Formulário de Fase (Story 2.15), API INTERNA. `@Requer('ler','Pipe')` é a guarda GROSSA;
 * a guarda FINA (GERENCIAR o Pipe) vive no serviço. É UPDATE de config → 200.
 */
@Controller('pipes/:pipeId/phases/:phaseId/form')
export class PhaseFormConfigController {
  constructor(private readonly config: PhaseFormConfigService) {}

  @Requer('ler', 'Pipe')
  @Patch('mode')
  async definirModo(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Body() body: unknown,
  ): Promise<ModoFormularioFaseVisao> {
    const modo = parseModo(body);
    return this.config.definirModo(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(phaseId, 'phaseId'),
      modo,
    );
  }
}

/** Valida o corpo do modo: `requisitoEntrada`/`requisitoSaida` opcionais e booleanos (PATCH parcial). */
function parseModo(body: unknown): { requisitoEntrada?: boolean; requisitoSaida?: boolean } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  const out: { requisitoEntrada?: boolean; requisitoSaida?: boolean } = {};
  for (const chave of ['requisitoEntrada', 'requisitoSaida'] as const) {
    const v = dados[chave];
    if (v !== undefined) {
      if (typeof v !== 'boolean') throw new BadRequestException(`${chave} deve ser booleano`);
      out[chave] = v;
    }
  }
  return out;
}
