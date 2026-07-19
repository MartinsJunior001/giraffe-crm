import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import {
  type AutomationResumoVisao,
  AutomationsService,
  type AutomationVisao,
} from './automations.service';
import { parseCriarAutomacao, validarUuidDeRota } from './dto/automations.dto';

/**
 * Modelo da Automação (Story 4.1), superfície de API INTERNA, aninhada no Pipe proprietário.
 *
 * O caminho `pipes/:pipeId/automations` **é** o vínculo RN-100 ("exatamente um Pipe"): a Automação não
 * escolhe seu Pipe por um campo do corpo — ela nasce dentro dele. Nenhuma rota recebe `orgId`.
 *
 * `@Requer('ler', 'Automacao')` é a guarda **GROSSA** (deny-by-default, AD-9): ela apenas deixa o
 * principal chegar ao serviço. A autoridade **FINA** — Admin da Org/Admin do Pipe administram, Membro
 * só lê, Convidado não acessa (D4.3) — decide no serviço via `pipe-authz.ts` (DBT-AUTHZ-01), que é
 * também quem devolve **404 não-enumerante** a quem não alcança o Pipe. Por isso a guarda grossa é
 * `ler` mesmo na criação: fosse `administrar`, um Membro receberia 403 no guard e o formato do erro
 * revelaria a existência do Pipe antes de a autoridade fina poder responder 404.
 *
 * **Sem rota de edição, de estado ou de exclusão:** editar e transicionar são a 4.2; excluir não existe
 * (D4.3). E não é só ausência de rota — o runtime não tem GRANT de UPDATE nem de DELETE em
 * `Automation`, então qualquer uma delas bateria em `permission denied` no banco.
 */
@Controller('pipes/:pipeId/automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Requer('ler', 'Automacao')
  @Post()
  async criar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<AutomationVisao> {
    const { name, quando, condicoes, entao } = parseCriarAutomacao(body);
    return this.automations.criar(validarUuidDeRota(pipeId, 'pipeId'), name, {
      quando,
      condicoes,
      entao,
    });
  }

  @Requer('ler', 'Automacao')
  @Get()
  async listar(@Param('pipeId') pipeId: string): Promise<AutomationResumoVisao[]> {
    return this.automations.listar(validarUuidDeRota(pipeId, 'pipeId'));
  }

  @Requer('ler', 'Automacao')
  @Get(':automationId')
  async obter(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationVisao> {
    return this.automations.obter(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
    );
  }
}
