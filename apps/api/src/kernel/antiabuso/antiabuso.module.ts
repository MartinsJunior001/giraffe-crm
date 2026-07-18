import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limit';
import { ScanSlotSemaphore } from './scan-slot';

/**
 * Fronteira técnica ANTIABUSO (kernel — AD-4/AD-5). Concentra os primitivos transversais de mitigação de
 * abuso (o `RateLimiter` genérico e o semáforo de concorrência `ScanSlotSemaphore`), sem regra de negócio:
 * a política (chave, janela, teto, resposta) vive nos domínios consumidores.
 *
 * Global porque tem consumidores concretos — o `PublicRateLimit` da submissão pública (2.8, em `pipes/`) e o
 * `FilesService` da capacidade de arquivos (3.7), que consome o `ScanSlotSemaphore` para limitar verificações
 * concorrentes por Organização — sem que estes precisem importar `pipes/`. Depende de `PrismaService` (DbModule global).
 */
@Global()
@Module({
  providers: [RateLimiter, ScanSlotSemaphore],
  exports: [RateLimiter, ScanSlotSemaphore],
})
export class AntiabusoModule {}
