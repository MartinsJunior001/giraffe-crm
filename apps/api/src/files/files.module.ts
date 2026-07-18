import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { StorageService } from '../kernel/storage/storage.service';
import { ClamavService } from '../kernel/scanner/clamav.service';
import { FILE_AUTHZ_CONTRACT, type FileAuthzContract } from './file-authz.contract';
import { FILE_EVENT_SINK, type FileEventSink } from './file-event-sink';
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
 * Binding PADRÃO da porta de evento — **no-op**. Sem consumidor, o anexo não gera evento de domínio (AD-11); o
 * consumidor (3.8) sobrescreve com o dispatcher real (CARD→`CardHistory`, RECORD→`RecordHistory`).
 */
const NOOP_FILE_EVENT_SINK: FileEventSink = {
  registrar: async () => {},
};

/**
 * Módulo da capacidade compartilhada de arquivos (Story 3.7, ADR-001). Desacoplado de `pipes/` e `databases/`.
 *
 * Providencia o domínio (`FilesService`/`FilesController`) e as fronteiras técnicas do kernel que ele consome
 * diretamente (`StorageService` S3, `ClamavService`); o semáforo `ScanSlotSemaphore` vem do `AntiabusoModule`
 * global (não re-registrado). Contexto de Organização e Prisma vêm de `ContextModule`/`DbModule` globais; o guard
 * de autz global de `AuthzModule`. A porta `FILE_AUTHZ_CONTRACT` tem binding deny-all por padrão (fail-closed).
 */
const PROVIDERS_BASE: Provider[] = [FilesService, StorageService, ClamavService];

@Module({
  controllers: [FilesController],
  providers: [
    ...PROVIDERS_BASE,
    { provide: FILE_AUTHZ_CONTRACT, useValue: DENY_ALL_FILE_AUTHZ },
    { provide: FILE_EVENT_SINK, useValue: NOOP_FILE_EVENT_SINK },
  ],
  exports: [FilesService, FILE_AUTHZ_CONTRACT, FILE_EVENT_SINK],
})
export class FilesModule {
  /**
   * Liga as implementações REAIS das portas (Story 3.8) SEM que `files/` conheça Card/Registro: o consumidor
   * (`AppModule`) injeta os providers de `FILE_AUTHZ_CONTRACT` (dispatcher de autz que roteia por `resourceType`
   * para `pipe-authz`/`database-authz`) e `FILE_EVENT_SINK` (dispatcher de evento que roteia para `CardHistory`/
   * `RecordHistory`). Preserva o desacoplamento da 3.7 (`files/` não importa domínio) e os defaults deny-all/no-op
   * quando importado sem binding (`imports: [FilesModule]`).
   */
  static register(authz: Provider, eventSink: Provider): DynamicModule {
    // Os bindings reais por último: sobrescrevem os tokens para o `FilesService` dentro do injetor deste módulo.
    // `global` para que o `FilesService` (com os dispatchers REAIS) seja o único visível a `pipes/`/`databases/`
    // — evita uma 2ª instância deny-all/no-op se algum módulo importasse `FilesModule` estático (os controllers
    // de anexo apenas injetam `FilesService`, sem reimportar este módulo).
    return {
      module: FilesModule,
      global: true,
      controllers: [FilesController],
      providers: [...PROVIDERS_BASE, authz, eventSink],
      exports: [FilesService, FILE_AUTHZ_CONTRACT, FILE_EVENT_SINK],
    };
  }
}
