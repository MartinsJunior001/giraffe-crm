import { Module } from '@nestjs/common';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';

/**
 * Módulo do domínio Database (Épico 3, Story 3.1). Espelha `PipesModule` na forma; entidade DISTINTA.
 * Depende do contexto de Organização e do Prisma (providos por `ContextModule`/`DbModule` globais) e
 * do guard de autorização global (`AuthzModule`) — não os re-registra.
 */
@Module({
  controllers: [DatabasesController],
  providers: [DatabasesService],
})
export class DatabasesModule {}
