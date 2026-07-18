import { Module } from '@nestjs/common';
import { StorageService } from '../kernel/storage/storage.service';
import { ClamavService } from '../kernel/scanner/clamav.service';
import { FILE_AUTHZ_CONTRACT, type FileAuthzContract } from './file-authz.contract';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/**
 * Binding PADRÃO da porta de autorização — **deny-all, fail-closed**. Sem um consumidor concreto (3.8 liga
 * Card/Registro; 3.10 liga Conta/avatar), NINGUÉM acessa arquivos: a capacidade existe, mas a autz de recurso
 * nega tudo por padrão. Os consumidores sobrescrevem o provider `FILE_AUTHZ_CONTRACT` com a implementação real;
 * os testes da 3.7 o sobrescrevem com um binding permissivo para provar a capacidade isolada.
 */
const DENY_ALL_FILE_AUTHZ: FileAuthzContract = {
  podeLer: async () => false,
  podeEditar: async () => false,
};

/**
 * Módulo da capacidade compartilhada de arquivos (Story 3.7, ADR-001). Desacoplado de `pipes/` e `databases/`.
 *
 * Providencia o domínio (`FilesService`/`FilesController`) e as fronteiras técnicas do kernel que ele consome
 * diretamente (`StorageService` S3, `ClamavService`); o semáforo `ScanSlotSemaphore` vem do `AntiabusoModule`
 * global (não re-registrado). Contexto de Organização e Prisma vêm de `ContextModule`/`DbModule` globais; o guard
 * de autz global de `AuthzModule`. A porta `FILE_AUTHZ_CONTRACT` tem binding deny-all por padrão (fail-closed).
 */
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    StorageService,
    ClamavService,
    { provide: FILE_AUTHZ_CONTRACT, useValue: DENY_ALL_FILE_AUTHZ },
  ],
  exports: [FilesService, FILE_AUTHZ_CONTRACT],
})
export class FilesModule {}
