import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getEnv } from '../kernel/config/env';
import { OrganizationsController } from './organizations.controller';
import { MembersController } from './members/members.controller';
import { MembershipRoleService } from './members/membership-role.service';
import { MembershipStateService } from './members/membership-state.service';
import { FakeTransactionalEmailAdapter } from './invites/fake-transactional-email.adapter';
import { InviteAcceptController } from './invites/invite-accept.controller';
import { InviteAcceptRateLimit } from './invites/invite-accept-rate-limit';
import { InviteAcceptService } from './invites/invite-accept.service';
import { InviteRateLimit } from './invites/invite-rate-limit';
import { InviteRouteResolver } from './invites/invite-route.resolver';
import { InvitesController } from './invites/invites.controller';
import { InvitesService } from './invites/invites.service';
import { LogInviteAcceptedNotificationAdapter } from './invites/log-invite-notification.adapter';
import { INVITE_ACCEPTED_NOTIFICATION_PORT } from './invites/notification.port';
import { ResendTransactionalEmailAdapter } from './invites/resend-transactional-email.adapter';
import {
  TRANSACTIONAL_EMAIL_PORT,
  type TransactionalEmailPort,
} from './invites/transactional-email.port';

/** Timeout do envio transacional (ms). Constante — o gate real de envio é `EMAIL_SEND_ENABLED`. */
const EMAIL_TIMEOUT_MS = 10_000;

/**
 * Seleção EXPLÍCITA do adapter de e-mail por ambiente (Story 8.2, G1):
 * - `EMAIL_SEND_ENABLED=true` (com config validada pelo fail-fast do env) → Resend REAL;
 * - caso contrário (default) → Fake (dev/CI/teste). Nenhuma credencial exigida com o gate desligado.
 *
 * A validade da config quando o gate está ligado já foi garantida no boot (`loadEnv` superRefine);
 * aqui os `!` são seguros porque `EMAIL_SEND_ENABLED` só é `true` com as três variáveis presentes.
 */
const emailPortProvider = {
  provide: TRANSACTIONAL_EMAIL_PORT,
  useFactory: (logger: PinoLogger): TransactionalEmailPort => {
    const env = getEnv();
    if (env.EMAIL_SEND_ENABLED) {
      return new ResendTransactionalEmailAdapter(
        env.RESEND_API_KEY!,
        env.EMAIL_FROM!,
        EMAIL_TIMEOUT_MS,
        logger,
      );
    }
    return new FakeTransactionalEmailAdapter();
  },
  inject: [PinoLogger],
};

/**
 * Notificação "convite aceito" (Story 8.3): a porta canônica de E5/5.6 ainda não tem write-side, então
 * o adapter é de LOG (observável, sem fingir entrega). Trocar por um adapter real de 5.6 é aditivo —
 * mesma porta, nenhum consumidor tocado. Débito de planejamento: `DEB-8-3-NOTIF-WRITE-SIDE`.
 */
const inviteNotificationProvider = {
  provide: INVITE_ACCEPTED_NOTIFICATION_PORT,
  useClass: LogInviteAcceptedNotificationAdapter,
};

@Module({
  controllers: [
    OrganizationsController,
    InvitesController,
    InviteAcceptController,
    // Story 8.4 — administração de Membros (alteração de papel).
    MembersController,
  ],
  providers: [
    InvitesService,
    InviteRateLimit,
    emailPortProvider,
    // Story 8.3 — aceite de Convite.
    InviteAcceptService,
    InviteRouteResolver,
    InviteAcceptRateLimit,
    inviteNotificationProvider,
    // Story 8.4 — alteração de papel da Membership. `StepUpService` (1.12) e `AbilityCache` (1.6) são
    // providers GLOBAIS (AuthModule/AuthzModule) e injetados por token, sem novo import de módulo.
    MembershipRoleService,
    // Story 8.5 — suspensão/reativação da Membership. Reusa o mesmo substrato (StepUp/AbilityCache) e
    // as funções PURAS do contrato de Membership da 2.10 (import direto, sem acoplar módulos).
    MembershipStateService,
  ],
})
export class OrganizationsModule {}
