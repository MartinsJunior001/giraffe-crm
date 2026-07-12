import type { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { getEnv } from './kernel/config/env';

/**
 * Identifica os probes de liveness/readiness, cujo log automático é puro ruído.
 * Compara o pathname (ignora query string) — qualquer outra rota continua logada.
 */
export function isHealthProbe(req: IncomingMessage): boolean {
  const pathname = (req.url ?? '').split('?')[0];
  return pathname === '/health' || pathname === '/ready';
}

/**
 * Seleciona o transport pino-pretty apenas em desenvolvimento E se o pacote estiver
 * disponível. pino-pretty é devDependency e NÃO existe na imagem de produção; sem este
 * guard, rodar o container com NODE_ENV=development crasharia o logger no boot.
 */
function devPrettyTransport(nodeEnv: string): { target: string; options: object } | undefined {
  if (nodeEnv !== 'development') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { singleLine: true } };
  } catch {
    return undefined;
  }
}

@Module({
  imports: [
    // useFactory adia getEnv() para a fase de DI: importar este módulo deixa de ter
    // efeito colateral de validação — o fail-fast fica exclusivamente no bootstrap
    // (main.ts), e importar AppModule (ex.: em testes e2e) não valida env no load.
    LoggerModule.forRootAsync({
      useFactory: () => {
        const env = getEnv();
        return {
          pinoHttp: {
            level: env.LOG_LEVEL,
            // Identificação do serviço/ambiente em todo log.
            base: { service: 'giraffe-api', env: env.NODE_ENV },
            // Probes de liveness/readiness batem a cada 30s e não têm valor de diagnóstico:
            // silenciá-los evita afogar os eventos que importam. Só estas duas rotas — todo
            // o resto (incluindo 4xx/5xx) continua sendo registrado.
            autoLogging: { ignore: isHealthProbe },
            // Sanitização: nunca registrar credenciais/cookies/tokens (AD-29/NFR-1).
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },
            // Formato legível só em desenvolvimento (e se pino-pretty existir); JSON em produção.
            transport: devPrettyTransport(env.NODE_ENV),
          },
        };
      },
    }),
    HealthModule,
  ],
})
export class AppModule {}
