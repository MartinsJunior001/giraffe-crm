import { Module } from '@nestjs/common';
import { PipesController } from './pipes.controller';
import { PipesService } from './pipes.service';

/**
 * Domínio Pipes (Story 2.1). Depende de `PrismaService` (DbModule é global) e do `RequestContext`
 * (ContextModule é global) — nada além. O `AuthzGuard`/`TenantContextGuard` já são globais no
 * AppModule; este módulo só registra o controller e o serviço do catálogo.
 */
@Module({
  controllers: [PipesController],
  providers: [PipesService],
})
export class PipesModule {}
