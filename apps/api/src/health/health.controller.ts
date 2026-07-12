import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../kernel/db/prisma.service';
import { livenessPayload, readinessPayload, type HealthStatus } from './health.payload';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness — indica apenas que o processo está vivo.
   * NÃO checa o banco, de propósito: se o banco cair, o processo continua vivo e
   * reiniciá-lo não resolveria nada. Quem reflete a dependência é o `/ready`.
   */
  @Get('health')
  @HttpCode(200)
  health(): HealthStatus {
    return livenessPayload();
  }

  /**
   * Readiness — aptidão para receber tráfego. Checa o banco (primeira dependência
   * externa). Banco fora ⇒ **503**: esconder indisponibilidade seria mentir sobre
   * o estado. O erro do driver (que carrega host, porta e usuário) nunca vai ao corpo.
   */
  @Get('ready')
  @HttpCode(200)
  async ready(): Promise<HealthStatus> {
    if (!(await this.prisma.isReachable())) {
      throw new ServiceUnavailableException();
    }
    return readinessPayload();
  }
}
