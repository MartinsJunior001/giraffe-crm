import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { PRINCIPAL_PROVIDER } from '../context/principal.provider';
import { AuthController } from './auth.controller';
import { criarAuth } from './auth.factory';
import { AUTH } from './auth.tokens';
import { LoginFailureService } from './login-failure.service';
import { SessaoPrincipalProvider } from './sessao-principal.provider';
import { PasswordController } from './password.controller';
import { StepUpService } from './step-up.service';
import { PasswordChangeService } from './password-change.service';
import { SECURITY_NOTIFICATION_PORT } from './security-notification.port';
import { LogSecurityNotificationAdapter } from './log-security-notification.adapter';

/**
 * Autenticação (Story 1.4).
 *
 * O ponto central: este módulo **sobrescreve** o `PRINCIPAL_PROVIDER` que o `ContextModule` (1.3)
 * registrava com `SemSessaoPrincipalProvider`. Essa era a peça deliberadamente vazia — e trocá-la é
 * a Story inteira do lado da autorização. O guard e o resolvedor de contexto não mudam uma linha.
 */
@Global()
@Module({
  controllers: [AuthController, PasswordController],
  providers: [
    LoginFailureService,
    {
      provide: AUTH,
      useFactory: (prisma: PrismaService, falhas: LoginFailureService) => criarAuth(prisma, falhas),
      inject: [PrismaService, LoginFailureService],
    },
    { provide: PRINCIPAL_PROVIDER, useClass: SessaoPrincipalProvider },
    // Story 1.12: step-up (reautenticação recente) e troca autenticada de senha. A notificação de
    // segurança usa o adapter de LOG (observável) enquanto E5/1.13 não existe.
    StepUpService,
    PasswordChangeService,
    { provide: SECURITY_NOTIFICATION_PORT, useClass: LogSecurityNotificationAdapter },
  ],
  exports: [AUTH, LoginFailureService, PRINCIPAL_PROVIDER, StepUpService],
})
export class AuthModule {}
