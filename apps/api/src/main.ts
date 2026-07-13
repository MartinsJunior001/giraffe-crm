import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getEnv, parseCorsOrigins } from './kernel/config/env';

async function bootstrap(): Promise<void> {
  // Fail-fast: valida o ambiente ANTES de subir o Nest. Lança se inválido.
  // (AppModule não valida env no import — o getEnv() vive no useFactory do logger.)
  const env = getEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // CORS restrito e configurável — sem wildcard.
  app.enableCors({
    origin: parseCorsOrigins(env.CORS_ALLOWED_ORIGINS),
  });

  // Encerramento gracioso (SIGTERM/SIGINT) — AD-32.
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
}

bootstrap().catch((err: unknown) => {
  // Falha honesta e sanitizada: só a mensagem, nunca valores/segredos.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[giraffe-api] Falha ao iniciar:\n${message}\n`);
  process.exit(1);
});
