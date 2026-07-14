import { Module } from '@nestjs/common';
import { PipeGrantsController } from './grants/pipe-grants.controller';
import { PipeGrantsService } from './grants/pipe-grants.service';
import { PipesController } from './pipes.controller';
import { PipesService } from './pipes.service';

/**
 * Domínio Pipes. Story 2.1: catálogo e ciclo de vida (`PipesController`/`PipesService`). Story 2.2:
 * concessão de papel por Pipe (`PipeGrantsController`/`PipeGrantsService`). Depende de `PrismaService`
 * (DbModule global) e `RequestContext` (ContextModule global). O `AuthzGuard`/`TenantContextGuard` já
 * são globais no AppModule; este módulo só registra os controllers e serviços do domínio.
 */
@Module({
  controllers: [PipesController, PipeGrantsController],
  providers: [PipesService, PipeGrantsService],
})
export class PipesModule {}
