import { Module } from '@nestjs/common';
import { AvatarController } from './avatar/avatar.controller';
import { AvatarService } from './avatar/avatar.service';

/**
 * Domínio da CONTA do próprio usuário (Story 3.10). Hoje só o avatar (FR-32).
 *
 * Não declara `FilesService` como provider: ele vem do `FilesModule.register(...)`, registrado como **global**
 * no `AppModule` — é a instância com os dispatchers REAIS de autz/evento. Re-registrá-lo aqui criaria uma
 * segunda instância com os bindings deny-all/no-op, e o avatar simplesmente não autorizaria ninguém.
 *
 * O módulo não conhece a capacidade de arquivos por dentro: consome `FilesService` pela fachada, e a ligação
 * `resourceType='ACCOUNT'` → self-only mora no `FileAuthzDispatcher`, fora de `files/` (padrão da 3.8).
 */
@Module({
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AccountsModule {}
