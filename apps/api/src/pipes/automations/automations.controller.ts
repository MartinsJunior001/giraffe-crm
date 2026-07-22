import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import {
  AutomationLifecycleService,
  type VersaoDetalhe,
  type VersaoResumo,
} from './automation-lifecycle.service';
import {
  type AutomationResumoVisao,
  AutomationsService,
  type AutomationVisao,
} from './automations.service';
import {
  parseCriarAutomacao,
  parseDuplicarAutomacao,
  parseEditarAutomacao,
  validarUuidDeRota,
  validarVersaoDeRota,
} from './dto/automations.dto';

/**
 * Superfície de API INTERNA da Automação, aninhada no Pipe proprietário. Story 4.1: criar/listar/obter
 * (modelo e referências). Story 4.2: editar/ativar/desativar/arquivar/restaurar/duplicar e o histórico de
 * versões congeladas — a GESTÃO do ciclo de vida.
 *
 * O caminho `pipes/:pipeId/automations` **é** o vínculo RN-100 ("exatamente um Pipe"). Nenhuma rota recebe
 * `orgId`. `@Requer('ler', 'Automacao')` é a guarda **GROSSA** (deny-by-default, AD-9): apenas deixa o
 * principal chegar ao serviço. A autoridade **FINA** — Admin da Org/Admin do Pipe administram, Membro só
 * lê, Convidado não acessa (D4.3) — decide no serviço via `pipe-authz.ts` (DBT-AUTHZ-01, C3 congelado), que
 * é também quem devolve **404 não-enumerante** a quem não alcança o Pipe. Por isso a guarda grossa é `ler`
 * mesmo nas escritas: fosse `administrar`, um Membro receberia 403 no guard e o formato do erro revelaria a
 * existência do Pipe antes de a autoridade fina poder responder 404.
 *
 * **Sem rota de exclusão:** "não há exclusão definitiva" (D4.3) — arquivar é `state`. E não é só ausência
 * de rota: o runtime não tem GRANT de DELETE em `Automation`.
 */
@Controller('pipes/:pipeId/automations')
export class AutomationsController {
  constructor(
    private readonly automations: AutomationsService,
    private readonly lifecycle: AutomationLifecycleService,
  ) {}

  @Requer('ler', 'Automacao')
  @Post()
  async criar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<AutomationVisao> {
    const { name, quando, condicoes, entao, idempotencyKey } = parseCriarAutomacao(body);
    return this.automations.criar(
      validarUuidDeRota(pipeId, 'pipeId'),
      name,
      { quando, condicoes, entao },
      idempotencyKey,
    );
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

  // ── Story 4.2 — gestão do ciclo de vida ─────────────────────────────────────────────────────────

  @Requer('ler', 'Automacao')
  @Patch(':automationId')
  async editar(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
    @Body() body: unknown,
  ): Promise<AutomationVisao> {
    return this.lifecycle.editar(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
      parseEditarAutomacao(body),
    );
  }

  @Requer('ler', 'Automacao')
  @Post(':automationId/activate')
  @HttpCode(200)
  async ativar(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationVisao> {
    return this.lifecycle.ativar(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
    );
  }

  @Requer('ler', 'Automacao')
  @Post(':automationId/deactivate')
  @HttpCode(200)
  async desativar(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationVisao> {
    return this.lifecycle.desativar(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
    );
  }

  @Requer('ler', 'Automacao')
  @Post(':automationId/archive')
  @HttpCode(200)
  async arquivar(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationVisao> {
    return this.lifecycle.arquivar(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
    );
  }

  @Requer('ler', 'Automacao')
  @Post(':automationId/restore')
  @HttpCode(200)
  async restaurar(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationVisao> {
    return this.lifecycle.restaurar(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
    );
  }

  @Requer('ler', 'Automacao')
  @Post(':automationId/duplicate')
  async duplicar(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
    @Body() body: unknown,
  ): Promise<AutomationVisao> {
    const { name, idempotencyKey } = parseDuplicarAutomacao(body);
    return this.lifecycle.duplicar(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
      name,
      idempotencyKey,
    );
  }

  @Requer('ler', 'Automacao')
  @Get(':automationId/versions')
  async listarVersoes(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
  ): Promise<VersaoResumo[]> {
    return this.lifecycle.listarVersoes(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
    );
  }

  @Requer('ler', 'Automacao')
  @Get(':automationId/versions/:version')
  async obterVersao(
    @Param('pipeId') pipeId: string,
    @Param('automationId') automationId: string,
    @Param('version') version: string,
  ): Promise<VersaoDetalhe> {
    return this.lifecycle.obterVersao(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(automationId, 'automationId'),
      validarVersaoDeRota(version),
    );
  }
}
