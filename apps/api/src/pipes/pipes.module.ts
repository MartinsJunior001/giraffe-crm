import { Module } from '@nestjs/common';
import { FormsController } from './forms/forms.controller';
import { FormsService } from './forms/forms.service';
import { PipeGrantsController } from './grants/pipe-grants.controller';
import { PipeGrantsService } from './grants/pipe-grants.service';
import { PhasesController } from './phases/phases.controller';
import { PhasesService } from './phases/phases.service';
import { PipesController } from './pipes.controller';
import { PipesService } from './pipes.service';

/**
 * Domínio Pipes. Story 2.1: catálogo e ciclo de vida (`PipesController`/`PipesService`). Story 2.2:
 * concessão de papel por Pipe (`PipeGrantsController`/`PipeGrantsService`). Story 2.3: Fases do Pipe
 * (`PhasesController`/`PhasesService`), onde o poder por papel de Pipe deixa de ser dormente. Story 2.4:
 * domínio Formulário (`FormsController`/`FormsService`) — catálogo canônico de Campos e montagem, reusando a
 * resolução "config do Pipe" (`pipe-authz`). Depende de `PrismaService` (DbModule global) e `RequestContext`
 * (ContextModule global). O `AuthzGuard`/`TenantContextGuard` já são globais no AppModule; este módulo só
 * registra os controllers e serviços.
 */
@Module({
  controllers: [PipesController, PipeGrantsController, PhasesController, FormsController],
  providers: [PipesService, PipeGrantsService, PhasesService, FormsService],
})
export class PipesModule {}
