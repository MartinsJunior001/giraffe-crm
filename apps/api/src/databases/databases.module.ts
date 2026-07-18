import { Module } from '@nestjs/common';
import { PipesModule } from '../pipes/pipes.module';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';
import { DatabaseFormPublicationController } from './forms/database-form-publication.controller';
import { DatabaseFormsController } from './forms/database-forms.controller';
import { DatabaseGrantsController } from './grants/database-grants.controller';
import { DatabaseGrantsService } from './grants/database-grants.service';
import { RecordHistoryController } from './records/history/record-history.controller';
import { RecordHistoryReadService } from './records/history/record-history-read.service';
import { RecordLifecycleService } from './records/record-lifecycle.service';
import { RecordsController } from './records/records.controller';
import { RecordsReadService } from './records/records-read.service';
import { RecordsService } from './records/records.service';

/**
 * Módulo do domínio Database (Épico 3). Espelha `PipesModule` na forma; entidade DISTINTA. Story 3.1:
 * ciclo de vida e catálogo (`DatabasesController`/`DatabasesService`). Story 3.2: concessão de papel por
 * Database (`DatabaseGrantsController`/`DatabaseGrantsService`) — registrada aqui, como `PipesModule` faz
 * com as concessões de Pipe. Story 3.3: Formulário de Database (`DatabaseFormsController`/
 * `DatabaseFormPublicationController`) — montam/evoluem/publicam o schema **reutilizando o Form Builder
 * canônico** (`FormsService`/`FieldsService`/`FormPublicationService`, exportados por `PipesModule`), sem
 * segundo builder; a autorização é roteada por `form-authz` para `database-authz`. Por isso importa
 * `PipesModule` (relação unidirecional Databases→Pipes; `database-authz` é função pura, sem ciclo de DI).
 * Story 3.4: ciclo de vida do Registro (`RecordsController`/`RecordsService`/`RecordLifecycleService`) —
 * materializa `Record`/`RecordHistory` **reutilizando `submission.ts` (2.7)** para validar contra o snapshot da
 * `FormVersion` publicada do Formulário de Database; autz por `exigirOperarDatabase` (acorda o MEMBER dormente).
 * Story 3.5: visualização/tabela de Registros (`RecordsReadService`) — leitura pura. Story 3.6: Histórico do
 * Registro (`RecordHistoryController`/`RecordHistoryReadService`) — read-side puro sobre `RecordHistory`
 * (append-only), espelho do Histórico do Card (2.17); autz pelo acesso ATUAL ao Database dono (`exigirLerDatabase`).
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
    RecordsController,
    RecordHistoryController,
  ],
  providers: [
    DatabasesService,
    DatabaseGrantsService,
    RecordsService,
    RecordLifecycleService,
    RecordsReadService,
    RecordHistoryReadService,
  ],
})
export class DatabasesModule {}
