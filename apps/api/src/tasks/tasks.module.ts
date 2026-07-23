import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskOverdueService } from './task-overdue.service';

/**
 * Módulo do domínio Tarefa (Épico 5, Story 5.1). Entidade DISTINTA (não reusa Card/Registro). Reusa a
 * AUTORIZAÇÃO por Pipe importando as funções PURAS de `../pipes/pipe-authz` (não serviços de DI) — por isso NÃO
 * importa `PipesModule` (sem acoplamento de módulo nem ciclo). Depende do contexto de Organização e do Prisma
 * (globais via `ContextModule`/`DbModule`) e do guard de autorização global (`AuthzModule`).
 *
 * `TaskOverdueService` é o mecanismo temporal do Evento "Tarefa atrasada" (invocável; driver contínuo
 * deferido — `DEB-5-1-OVERDUE-DRIVER`), exportado para consumidores futuros (5.7).
 */
@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksReadService, TaskOverdueService],
  exports: [TaskOverdueService],
})
export class TasksModule {}
