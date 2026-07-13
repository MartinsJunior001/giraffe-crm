import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { SemContextoOrganizacional } from '../kernel/context/sem-contexto.decorator';
import { PrismaService } from '../kernel/db/prisma.service';
import { livenessPayload, readinessPayload, type HealthStatus } from './health.payload';

/**
 * As ÚNICAS rotas dispensadas de contexto organizacional, e é preciso que continue assim.
 *
 * Um probe não tem Organização: exigir contexto dele faria o healthcheck do orquestrador receber
 * 401, o container nunca ficaria healthy e o serviço não entraria em rotação — o guard mataria o
 * deploy que deveria proteger.
 *
 * A dispensa fica em CADA MÉTODO, e não na classe, de propósito. Na classe, ela valeria também para
 * toda rota futura adicionada aqui — e este é o lugar natural para alguém pendurar um `/metrics` ou
 * um `/info` ("é infra também"). Essa rota nasceria fora do guard global sem uma única linha no diff
 * dizendo isso: o decorator estaria vinte linhas acima, fora do hunk, e o code review não veria
 * nada. Por método, o custo do esquecimento é 401 — fail-closed —, não uma rota aberta.
 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness — indica apenas que o processo está vivo.
   * NÃO checa o banco, de propósito: se o banco cair, o processo continua vivo e
   * reiniciá-lo não resolveria nada. Quem reflete a dependência é o `/ready`.
   */
  @SemContextoOrganizacional()
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
  @SemContextoOrganizacional()
  @Get('ready')
  @HttpCode(200)
  async ready(): Promise<HealthStatus> {
    if (!(await this.prisma.isReachable())) {
      throw new ServiceUnavailableException();
    }
    return readinessPayload();
  }
}
