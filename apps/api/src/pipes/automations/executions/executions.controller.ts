import { Controller, Get, Param, Query } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarUuidDeRota } from '../dto/automations.dto';
import type { ExecucaoDetalheVisao } from './execution-view';
import { ExecutionsReadService, type PaginaExecucoes } from './executions-read.service';
import { parseCursor, parseFiltrosExecucoes, parseLimite } from './executions.dto';

/**
 * Trilha de Execuções (Story 4.8), API INTERNA — **somente leitura**. A aba "Execuções" das Automações de um
 * Pipe: `AutomationExecution` (4.6) + `AutomationActionResult` + metadados de cadeia (4.7), sanitizados (AD-30).
 *
 * Segmento estático **`automation-executions`** (não `automations/…`) de propósito: evita a colisão de rota com
 * `pipes/:pipeId/automations/:automationId` do `AutomationsController` (o segmento `executions` seria capturado
 * como `:automationId`). `@Requer('ler','Automacao')` é a guarda **GROSSA** (deny-by-default); a autoridade
 * **FINA** — operar o Pipe (Admin da Org/Admin do Pipe/Membro; Viewer/Convidado 403; sem acesso 404
 * não-enumerante) e o escopo do Membro restrito — decide no serviço (`pipe-authz.ts`, DBT-AUTHZ-01; C3 congelado).
 * GET apenas: read-side puro, sem mutação/reexecução/efeito colateral.
 */
@Controller('pipes/:pipeId/automation-executions')
export class ExecutionsController {
  constructor(private readonly execucoes: ExecutionsReadService) {}

  /** Lista as Execuções do Pipe, com filtros (`?estado=&eventType=&de=&ate=`) e cursor (`?cursor=&limite=`). */
  @Requer('ler', 'Automacao')
  @Get()
  async listar(
    @Param('pipeId') pipeId: string,
    @Query('cursor') cursor?: string,
    @Query('limite') limite?: string,
    @Query('estado') estado?: string,
    @Query('eventType') eventType?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ): Promise<PaginaExecucoes> {
    return this.execucoes.listar(
      validarUuidDeRota(pipeId, 'pipeId'),
      parseFiltrosExecucoes({ estado, eventType, de, ate }),
      parseCursor(cursor),
      parseLimite(limite),
    );
  }

  /** Detalhe de uma Execução: resumo + Ações (ordem configurada, estados) + cadeia. 404 não-enumerante. */
  @Requer('ler', 'Automacao')
  @Get(':executionId')
  async obter(
    @Param('pipeId') pipeId: string,
    @Param('executionId') executionId: string,
  ): Promise<ExecucaoDetalheVisao> {
    return this.execucoes.obter(
      validarUuidDeRota(pipeId, 'pipeId'),
      validarUuidDeRota(executionId, 'executionId'),
    );
  }
}
