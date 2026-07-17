import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limit';

/**
 * Fronteira técnica ANTIABUSO (kernel — AD-4/AD-5). Concentra os primitivos transversais de mitigação de
 * abuso (hoje o `RateLimiter` genérico), sem regra de negócio: a política (chave, janela, teto, resposta)
 * vive nos domínios consumidores.
 *
 * Global porque tem consumidor concreto imediato — o `PublicRateLimit` da submissão pública (2.8, em
 * `pipes/`) — e será a porta única para os demais baldes antiabuso das Stories seguintes (ex.: 3.7), sem
 * que estes precisem importar `pipes/`. Depende de `PrismaService` (DbModule global).
 */
@Global()
@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class AntiabusoModule {}
