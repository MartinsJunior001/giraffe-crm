import { Module } from '@nestjs/common';
import { FieldsController } from './forms/fields.controller';
import { FieldsService } from './forms/fields.service';
import { FormsController } from './forms/forms.controller';
import { FormsService } from './forms/forms.service';
import { FormPublicationController } from './forms/publication.controller';
import { FormPublicationService } from './forms/publication.service';
import { CardsController } from './cards/cards.controller';
import { CardSubmissionService } from './cards/card-submission.service';
import { KanbanController } from './cards/kanban.controller';
import { KanbanReadService } from './cards/kanban-read.service';
import { CardAccessController } from './cards/access/card-access.controller';
import { CardAccessService } from './cards/access/card-access.service';
import { CardLifecycleController } from './cards/lifecycle/card-lifecycle.controller';
import { CardFilesController } from './cards/files/card-files.controller';
import { CardLifecycleService } from './cards/lifecycle/card-lifecycle.service';
import { CardMovementController } from './cards/movement/card-movement.controller';
import { CardMovementService } from './cards/movement/card-movement.service';
import { CardHistoryController } from './cards/history/card-history.controller';
import { CardHistoryReadService } from './cards/history/card-history-read.service';
import { PhaseValuesController } from './cards/phase-values/phase-values.controller';
import { PhaseValuesService } from './cards/phase-values/phase-values.service';
import { PhaseFormConfigController } from './forms/phase-form-config.controller';
import { PhaseFormConfigService } from './forms/phase-form-config.service';
import { CardPhaseEntryController } from './cards/phase-entry/card-phase-entry.controller';
import { CardPhaseEntryReadService } from './cards/phase-entry/card-phase-entry-read.service';
import { PublicSubmissionController } from './public-submissions/public-submission.controller';
import { PublicSubmissionService } from './public-submissions/public-submission.service';
import { PublicRouteResolver } from './public-submissions/public-route.resolver';
import { PublicRateLimit } from './public-submissions/public-rate-limit';
import { TriageController } from './public-submissions/triage.controller';
import { TriageService } from './public-submissions/triage.service';
import { PublicConfigController } from './public-submissions/public-config.controller';
import { PublicConfigService } from './public-submissions/public-config.service';
import { PublicUploadSizeGuard } from './public-submissions/public-upload-size.guard';
import { PipeGrantsController } from './grants/pipe-grants.controller';
import { PipeGrantsService } from './grants/pipe-grants.service';
import { PhasesController } from './phases/phases.controller';
import { PhasesService } from './phases/phases.service';
import { PhaseMilestonesController } from './phases/milestones/phase-milestones.controller';
import { PhaseMilestonesService } from './phases/milestones/phase-milestones.service';
import { AutomationsController } from './automations/automations.controller';
import { AutomationsService } from './automations/automations.service';
import { AutomationLifecycleService } from './automations/automation-lifecycle.service';
import { AutomationEngineService } from './automations/engine/automation-engine.service';
import { PipesController } from './pipes.controller';
import { PipesService } from './pipes.service';

/**
 * Domínio Pipes. Story 2.1: catálogo e ciclo de vida (`PipesController`/`PipesService`). Story 2.2:
 * concessão de papel por Pipe (`PipeGrantsController`/`PipeGrantsService`). Story 2.3: Fases do Pipe
 * (`PhasesController`/`PhasesService`), onde o poder por papel de Pipe deixa de ser dormente. Story 2.4:
 * domínio Formulário (`FormsController`/`FormsService`) — catálogo canônico de Campos e montagem, reusando a
 * resolução "config do Pipe" (`pipe-authz`). Story 2.5: evolução segura de Campos
 * (`FieldsController`/`FieldsService`) — editar/arquivar/restaurar e o ciclo de opções, reusando os
 * localizadores (`form-locate`) e a mesma autorização fina. Story 2.6: ciclo de publicação
 * (`FormPublicationController`/`FormPublicationService`) — publicar congela o rascunho num `FormVersion`
 * imutável e versionado; despublicar/ler estado e histórico. Story 2.7: submissão interna
 * (`CardsController`/`CardSubmissionService`) — submeter o Formulário inicial publicado cria um `Card` na 1ª
 * Fase ativa + evento `CardHistory`, atomicamente; ativa o poder "Membro OPERA Cards" (`exigirOperarPipe`).
 * Story 2.9: Kanban e espaço operacional do Card (`KanbanController`/`KanbanReadService`) — leitura dos Cards
 * agrupados por Fase (colunas paginadas por cursor) e o detalhe do Card com as capacidades efetivas; SEM
 * migration/GRANT novo (movimentação é 2.14). Story 2.10: acesso, Responsável e concessões de Card
 * (`CardAccessController`/`CardAccessService`) — atribuir/remover Responsável (exige OPERAR o Card; alvo já com
 * acesso operacional) e conceder/revogar acesso direto a um Card (exige GERENCIAR o Pipe), tudo com evento
 * `CardHistory` na mesma transação; a resolução de acesso NO CARD (`resolverAcessoNoCard`) compõe papel-de-Pipe +
 * concessão direta + "restrito ao próprio" + Responsável-atual (`pipe-authz`). Fecha o DBT-2.2-ROLE-DORMENTE.
 * Story 2.11: ciclo de vida do Card (`CardLifecycleController`/`CardLifecycleService`) — finalizar/reabrir/
 * arquivar/restaurar (estados ATIVO/FINALIZADO/ARQUIVADO), transições atômicas, idempotentes e auditadas em
 * `CardHistory`, com o 1º GRANT de UPDATE em `Card` **column-scoped** (só o estado; `phaseId`/movimentação segue
 * sem UPDATE — 2.14). Story 2.12: marcos por Fase e override por Card
 * (`PhaseMilestonesController`/`PhaseMilestonesService` — config de prazos por Fase, "config do Pipe";
 * `CardPhaseEntryController`/`CardPhaseEntryReadService` — leitura da base temporal do Card). A referência de
 * entrada (`CardPhaseEntry`, append-only imutável) é gravada na criação do Card pelo helper compartilhado
 * `registrarEntradaNaFase`, na MESMA transação (submissão interna 2.7 e conversão pública 2.8); o snapshot da
 * config congela os marcos na entrada (D-OA1=A — sem recálculo retroativo silencioso). Story 2.14: movimentação
 * do Card entre Fases (`CardMovementController`/`CardMovementService`) — o 2º UPDATE de `Card` em runtime,
 * column-scoped a `phaseId`; mover exige `exigirMoverCard` (operar + `podeMover`), roda o preflight puro
 * (`transition-preflight`) e, sem bloqueio, faz UPDATE `phaseId` + reentrada (`CardPhaseEntry`, origin=MOVE, via
 * `registrarEntradaNaFase`) + evento `MOVED` atomicamente. Depende de `PrismaService`
 * (DbModule global) e `RequestContext` (ContextModule global). O `AuthzGuard`/`TenantContextGuard` já são globais
 * no AppModule; este módulo só registra os controllers e serviços.
 */
@Module({
  controllers: [
    PipesController,
    PipeGrantsController,
    PhasesController,
    FormsController,
    FieldsController,
    FormPublicationController,
    CardsController,
    KanbanController,
    CardAccessController,
    CardLifecycleController,
    CardMovementController,
    CardHistoryController,
    PhaseValuesController,
    PhaseFormConfigController,
    CardPhaseEntryController,
    PhaseMilestonesController,
    PublicSubmissionController,
    TriageController,
    PublicConfigController,
    CardFilesController,
    AutomationsController,
  ],
  providers: [
    PipesService,
    PipeGrantsService,
    PhasesService,
    FormsService,
    FieldsService,
    FormPublicationService,
    CardSubmissionService,
    KanbanReadService,
    CardAccessService,
    CardLifecycleService,
    CardMovementService,
    CardHistoryReadService,
    PhaseValuesService,
    PhaseFormConfigService,
    CardPhaseEntryReadService,
    PhaseMilestonesService,
    PublicSubmissionService,
    PublicRouteResolver,
    PublicRateLimit,
    TriageService,
    PublicConfigService,
    PublicUploadSizeGuard,
    AutomationsService,
    AutomationLifecycleService,
    AutomationEngineService,
  ],
  // Story 3.3: o Form Builder é canônico (INV-FORM-01). Estes serviços são exportados para que o módulo
  // Databases (que importa PipesModule) monte/evolua/publique o Formulário de Database SEM um segundo builder.
  // A autorização é roteada por contexto em `form-authz` (Database → `database-authz`, função pura; sem ciclo).
  exports: [FormsService, FieldsService, FormPublicationService],
})
export class PipesModule {}
