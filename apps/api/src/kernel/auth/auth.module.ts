import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../db/prisma.service';
import { PRINCIPAL_PROVIDER } from '../context/principal.provider';
import { AuthController } from './auth.controller';
import { criarAuth } from './auth.factory';
import { AUTH } from './auth.tokens';
import { LoginFailureService } from './login-failure.service';
import { SessaoPrincipalProvider } from './sessao-principal.provider';

/**
 * Autenticação (Story 1.4).
 *
 * O ponto central: este módulo **sobrescreve** o `PRINCIPAL_PROVIDER` que o `ContextModule` (1.3)
 * registrava com `SemSessaoPrincipalProvider`. Essa era a peça deliberadamente vazia — e trocá-la é
 * a Story inteira do lado da autorização. O guard e o resolvedor de contexto não mudam uma linha.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    LoginFailureService,
    {
      provide: AUTH,
      useFactory: (prisma: PrismaService, falhas: LoginFailureService, logger: PinoLogger) =>
        criarAuth(prisma, falhas, logger),
      inject: [PrismaService, LoginFailureService, PinoLogger],
    },
    { provide: PRINCIPAL_PROVIDER, useClass: SessaoPrincipalProvider },
  ],
  exports: [AUTH, LoginFailureService, PRINCIPAL_PROVIDER],
})
export class AuthModule {}
