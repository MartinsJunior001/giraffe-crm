import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SolicitacoesController } from './solicitacoes.controller';
import { SolicitacoesService } from './solicitacoes.service';
import { SolicitacoesReadService } from './solicitacoes-read.service';
import { SolicitacaoFilesController } from './files/solicitacao-files.controller';

/**
 * Módulo do domínio Solicitação (Épico 5, Story 5.2). Twin do `TasksModule` (5.1) SEM o mecanismo temporal —
 * não há `TaskOverdueService` equivalente (a 5.2 não tem prazo/atrasada/scheduler). Entidade DISTINTA (não
 * reusa Card/Registro/Task). Reusa a AUTORIZAÇÃO por Pipe importando as funções PURAS de `../pipes/pipe-authz`
 * (não serviços de DI) — por isso NÃO importa `PipesModule` (sem acoplamento de módulo nem ciclo). Depende do
 * contexto de Organização e do Prisma (globais via `ContextModule`/`DbModule`) e do guard de autorização
 * global (`AuthzModule`).
 *
 * `SolicitacaoFilesController` (anexo geral de Solicitação) consome a capacidade compartilhada de arquivos
 * (3.7) via o `FilesService` GLOBAL (`FilesModule.register`, `global: true`) — sem importar `FilesModule`; a
 * autz de anexo é roteada por `FileAuthzDispatcher` (branch SOLICITACAO → `pipe-authz`) e a trilha por
 * `FileEventDispatcher` (→ `SolicitacaoHistory`).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [SolicitacoesController, SolicitacaoFilesController],
  providers: [SolicitacoesService, SolicitacoesReadService],
})
export class SolicitacoesModule {}
