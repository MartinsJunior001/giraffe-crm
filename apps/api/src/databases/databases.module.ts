import { Module } from '@nestjs/common';
import { PipesModule } from '../pipes/pipes.module';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';
import { DatabaseFormPublicationController } from './forms/database-form-publication.controller';
import { DatabaseFormsController } from './forms/database-forms.controller';
import { DatabaseGrantsController } from './grants/database-grants.controller';
import { DatabaseGrantsService } from './grants/database-grants.service';

/**
 * Módulo do domínio Database (Épico 3). Espelha `PipesModule` na forma; entidade DISTINTA. Story 3.1:
 * ciclo de vida e catálogo (`DatabasesController`/`DatabasesService`). Story 3.2: concessão de papel por
 * Database (`DatabaseGrantsController`/`DatabaseGrantsService`) — registrada aqui, como `PipesModule` faz
 * com as concessões de Pipe. Story 3.3: Formulário de Database (`DatabaseFormsController`/
 * `DatabaseFormPublicationController`) — montam/evoluem/publicam o schema **reutilizando o Form Builder
 * canônico** (`FormsService`/`FieldsService`/`FormPublicationService`, exportados por `PipesModule`), sem
 * segundo builder; a autorização é roteada por `form-authz` para `database-authz`. Por isso importa
 * `PipesModule` (relação unidirecional Databases→Pipes; `database-authz` é função pura, sem ciclo de DI).
 * Depende do contexto de Organização e do Prisma (providos por `ContextModule`/`DbModule` globais) e do guard
 * de autorização global (`AuthzModule`) — não os re-registra.
 */
@Module({
  imports: [PipesModule],
  controllers: [
    DatabasesController,
    DatabaseGrantsController,
    DatabaseFormsController,
    DatabaseFormPublicationController,
  ],
  providers: [DatabasesService, DatabaseGrantsService],
})
export class DatabasesModule {}
