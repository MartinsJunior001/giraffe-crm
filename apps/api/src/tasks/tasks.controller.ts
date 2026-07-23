import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Requer } from '../kernel/authz/requer.decorator';
import {
  parseCriarTarefa,
  parseEditarTarefa,
  parseResponsavel,
  parseVinculoCard,
  validarIdRota,
} from './tasks.dto';
import { type TarefaVisao, TasksService } from './tasks.service';
import { type TarefaLeituraVisao, TasksReadService } from './tasks-read.service';

/**
 * API INTERNA das Tarefas (Story 5.1). `@Requer('ler','Pipe')` é a guarda GROSSA (o subject é o Pipe dono); a
 * guarda FINA (operar o Pipe para mutar; ler para consultar) vive no serviço via `pipe-authz` (DBT-AUTHZ-01) —
 * sem tocar o guard/`ability.ts` (C3 congelado). `orgId` NUNCA vem da rota/corpo.
 *
 * Criação → **201**; transições/edições/atribuições → **200** (não criam recurso). Nenhuma rota de exclusão
 * (o runtime não tem GRANT de DELETE em `Task`; arquivar/concluir = state).
 */
@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly read: TasksReadService,
  ) {}

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.CREATED)
  @Post('pipes/:pipeId/tasks')
  criar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<TarefaVisao> {
    return this.tasks.criar(validarIdRota(pipeId, 'pipeId'), parseCriarTarefa(body));
  }

  @Requer('ler', 'Pipe')
  @Get('pipes/:pipeId/tasks')
  listar(
    @Param('pipeId') pipeId: string,
    @Query('incluirArquivadas') incluirArquivadas?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ): Promise<{ tarefas: TarefaLeituraVisao[]; total: number }> {
    return this.read.listar(validarIdRota(pipeId, 'pipeId'), {
      incluirArquivadas: incluirArquivadas === 'true',
      take: take !== undefined ? Number(take) : undefined,
      skip: skip !== undefined ? Number(skip) : undefined,
    });
  }

  @Requer('ler', 'Pipe')
  @Get('tasks/:taskId')
  obter(@Param('taskId') taskId: string): Promise<TarefaLeituraVisao> {
    return this.read.obter(validarIdRota(taskId, 'taskId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Patch('tasks/:taskId')
  editar(@Param('taskId') taskId: string, @Body() body: unknown): Promise<TarefaVisao> {
    return this.tasks.editar(validarIdRota(taskId, 'taskId'), parseEditarTarefa(body));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put('tasks/:taskId/responsavel')
  atribuirResponsavel(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
  ): Promise<TarefaVisao> {
    return this.tasks.atribuirResponsavel(
      validarIdRota(taskId, 'taskId'),
      parseResponsavel(body).responsavelMembershipId,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put('tasks/:taskId/card')
  vincularCard(@Param('taskId') taskId: string, @Body() body: unknown): Promise<TarefaVisao> {
    return this.tasks.vincularCard(validarIdRota(taskId, 'taskId'), parseVinculoCard(body).cardId);
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('tasks/:taskId/complete')
  concluir(@Param('taskId') taskId: string): Promise<TarefaVisao> {
    return this.tasks.concluir(validarIdRota(taskId, 'taskId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('tasks/:taskId/reopen')
  reabrir(@Param('taskId') taskId: string): Promise<TarefaVisao> {
    return this.tasks.reabrir(validarIdRota(taskId, 'taskId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('tasks/:taskId/archive')
  arquivar(@Param('taskId') taskId: string): Promise<TarefaVisao> {
    return this.tasks.arquivar(validarIdRota(taskId, 'taskId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('tasks/:taskId/restore')
  restaurar(@Param('taskId') taskId: string): Promise<TarefaVisao> {
    return this.tasks.restaurar(validarIdRota(taskId, 'taskId'));
  }
}
