import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Adapter Socket.IO com CORS + credenciais (Story 5.5). O Socket.IO tem CORS PRÓPRIO (não usa o `cors`
 * do Express): sem isto, um browser cross-origin (web:3000 → api:3001) com cookie de sessão seria
 * bloqueado no handshake. `credentials: true` + origem EXPLÍCITA (a lista do `CORS_ALLOWED_ORIGINS`,
 * já validada sem wildcard no `env.ts`).
 *
 * Instalado em `main.ts` (`app.useWebSocketAdapter`), lendo as origens no BOOTSTRAP — nunca no import
 * de `AppModule` (preserva a decisão de não validar env no load). Em teste, o cliente conecta
 * same-origin (`app.getUrl()`), então o adapter default basta e este não é instalado.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: readonly string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    // `as ServerOptions` porque o spread de `options?` reintroduz `path?: string | undefined`, que sob
    // `exactOptionalPropertyTypes` não casa com o `path: string` do tipo — o cast preserva o valor real.
    const merged = {
      ...(options ?? {}),
      cors: { origin: [...this.origins], credentials: true },
    } as ServerOptions;
    return super.createIOServer(port, merged) as unknown;
  }
}
