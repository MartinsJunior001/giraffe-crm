import { Controller, Get, HttpCode } from '@nestjs/common';
import { livenessPayload, readinessPayload, type HealthStatus } from './health.payload';

@Controller()
export class HealthController {
  /** Liveness — indica apenas que o processo está vivo. */
  @Get('health')
  @HttpCode(200)
  health(): HealthStatus {
    return livenessPayload();
  }

  /** Readiness — indica aptidão para receber tráfego (200 apto / 503 não apto). */
  @Get('ready')
  @HttpCode(200)
  ready(): HealthStatus {
    return readinessPayload();
  }
}
