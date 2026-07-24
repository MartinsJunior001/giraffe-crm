import { Module } from '@nestjs/common';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { EmailTemplatesController } from './templates/email-templates.controller';
import { EmailTemplatesService } from './templates/email-templates.service';

/**
 * Módulo do domínio E-mail (Épico 6, Story 6.1) — o modelo canônico outbound + Composer. Entidade DISTINTA
 * (não reusa Card/Tarefa). Reusa a AUTORIZAÇÃO por Card importando as funções PURAS de `../pipes/pipe-authz`
 * (não serviços de DI) — por isso NÃO importa `PipesModule` (sem acoplamento de módulo nem ciclo). Depende
 * do contexto de Organização e do Prisma (globais) e do guard de autorização global.
 *
 * SEM envio real: o pipeline de envio/estados honestos/porta de provedor é a Story 6.4 (gate AD-28/OQ-28).
 */
@Module({
  controllers: [EmailsController, EmailTemplatesController],
  providers: [EmailsService, EmailTemplatesService],
})
export class EmailsModule {}
