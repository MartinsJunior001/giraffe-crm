import { Module } from '@nestjs/common';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';
import { DatabaseGrantsController } from './grants/database-grants.controller';
import { DatabaseGrantsService } from './grants/database-grants.service';

/**
 * Módulo do domínio Database (Épico 3). Espelha `PipesModule` na forma; entidade DISTINTA. Story 3.1:
 * ciclo de vida e catálogo (`DatabasesController`/`DatabasesService`). Story 3.2: concessão de papel por
 * Database (`DatabaseGrantsController`/`DatabaseGrantsService`) — registrada aqui, como `PipesModule` faz
 * com as concessões de Pipe. Depende do contexto de Organização e do Prisma (providos por `ContextModule`/
 * `DbModule` globais) e do guard de autorização global (`AuthzModule`) — não os re-registra.
 */
@Module({
  controllers: [DatabasesController, DatabaseGrantsController],
  providers: [DatabasesService, DatabaseGrantsService],
})
export class DatabasesModule {}
