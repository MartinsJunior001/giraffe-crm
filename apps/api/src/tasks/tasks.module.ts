import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskOverdueService } from './task-overdue.service';
import { TaskFilesController } from './files/task-files.controller';

/**
 * Módulo do domínio Tarefa (Épico 5, Story 5.1). Entidade DISTINTA (não reusa Card/Registro). Reusa a
 * AUTORIZAÇÃO por Pipe importando as funções PURAS de `../pipes/pipe-authz` (não serviços de DI) — por isso NÃO
 * importa `PipesModule` (sem acoplamento de módulo nem ciclo). Depende do contexto de Organização e do Prisma
 * (globais via `ContextModule`/`DbModule`) e do guard de autorização global (`AuthzModule`).
 *
 * `TaskOverdueService` é o mecanismo temporal do Evento "Tarefa atrasada" (invocável; driver contínuo
 * deferido — `DEB-5-1-OVERDUE-DRIVER`), exportado para consumidores futuros (5.7).
 *
 * `TaskFilesController` (anexo geral de Tarefa) consome a capacidade compartilhada de arquivos (3.7) via o
 * `FilesService` GLOBAL (`FilesModule.register`, `global: true`) — sem importar `FilesModule`; a autz de anexo é
 * roteada por `FileAuthzDispatcher` (branch TASK → `pipe-authz`) e a trilha por `FileEventDispatcher` (→ `TaskHistory`).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [TasksController, TaskFilesController],
  providers: [TasksService, TasksReadService, TaskOverdueService],
  exports: [TaskOverdueService],
})
export class TasksModule {}
