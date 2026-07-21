import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getEnv } from '../kernel/config/env';
import { OrganizationsController } from './organizations.controller';
import { FakeTransactionalEmailAdapter } from './invites/fake-transactional-email.adapter';
import { InviteRateLimit } from './invites/invite-rate-limit';
import { InvitesController } from './invites/invites.controller';
import { InvitesService } from './invites/invites.service';
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

@Module({
  controllers: [OrganizationsController, InvitesController],
  providers: [InvitesService, InviteRateLimit, emailPortProvider],
})
export class OrganizationsModule {}
