import { Module } from '@nestjs/common';
import { FieldsController } from './forms/fields.controller';
import { FieldsService } from './forms/fields.service';
import { FormsController } from './forms/forms.controller';
import { FormsService } from './forms/forms.service';
import { FormPublicationController } from './forms/publication.controller';
import { FormPublicationService } from './forms/publication.service';
import { CardsController } from './cards/cards.controller';
import { CardSubmissionService } from './cards/card-submission.service';
import { PublicSubmissionController } from './public-submissions/public-submission.controller';
import { PublicSubmissionService } from './public-submissions/public-submission.service';
import { PublicRouteResolver } from './public-submissions/public-route.resolver';
import { PublicRateLimit } from './public-submissions/public-rate-limit';
import { TriageController } from './public-submissions/triage.controller';
import { TriageService } from './public-submissions/triage.service';
import { PublicConfigController } from './public-submissions/public-config.controller';
import { PublicConfigService } from './public-submissions/public-config.service';
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
 * resolução "config do Pipe" (`pipe-authz`). Story 2.5: evolução segura de Campos
 * (`FieldsController`/`FieldsService`) — editar/arquivar/restaurar e o ciclo de opções, reusando os
 * localizadores (`form-locate`) e a mesma autorização fina. Story 2.6: ciclo de publicação
 * (`FormPublicationController`/`FormPublicationService`) — publicar congela o rascunho num `FormVersion`
 * imutável e versionado; despublicar/ler estado e histórico. Story 2.7: submissão interna
 * (`CardsController`/`CardSubmissionService`) — submeter o Formulário inicial publicado cria um `Card` na 1ª
 * Fase ativa + evento `CardHistory`, atomicamente; ativa o poder "Membro OPERA Cards" (`exigirOperarPipe`).
 * Depende de `PrismaService` (DbModule global) e
 * `RequestContext` (ContextModule global). O `AuthzGuard`/`TenantContextGuard` já são globais no AppModule;
 * este módulo só registra os controllers e serviços.
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
    PublicSubmissionController,
    TriageController,
    PublicConfigController,
  ],
  providers: [
    PipesService,
    PipeGrantsService,
    PhasesService,
    FormsService,
    FieldsService,
    FormPublicationService,
    CardSubmissionService,
    PublicSubmissionService,
    PublicRouteResolver,
    PublicRateLimit,
    TriageService,
    PublicConfigService,
  ],
})
export class PipesModule {}
