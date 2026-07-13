import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Fronteira técnica de acesso a dados (kernel — AD-4/AD-5).
 * Global porque tem consumidor concreto imediato (health/readiness) e será a única
 * porta de entrada ao banco para os domínios das Stories seguintes.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DbModule {}
