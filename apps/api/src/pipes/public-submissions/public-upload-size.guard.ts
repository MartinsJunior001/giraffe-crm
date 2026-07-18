import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { getEnv } from '../../kernel/config/env';

/** Folga sobre o teto de bytes de arquivo: campos de texto (`valores` ≤ 256 KiB) + boundaries do multipart. */
const OVERHEAD_BYTES = 1_048_576; // 1 MiB

/**
 * Barreira de tamanho do corpo no canal PÚBLICO (Story 3.8/F6, defesa anti-DoS). O `AnyFilesInterceptor` usa
 * memory storage e bufferia TODAS as partes ANTES do controller — então os limites finos do canal (por
 * Campo/submissão/total) e o rate limit, que rodam no serviço, chegariam tarde demais para conter um corpo
 * gigante. Este guard roda ANTES dos interceptors (guards precedem interceptors no Nest) e rejeita cedo, pelo
 * `Content-Length`, qualquer corpo acima do teto do canal (`PUBLIC_FILE_MAX_TOTAL_BYTES` + folga) — 413, sem
 * bufferizar. Fail-open só quando não há `Content-Length` (requisição chunked): aí a barreira dura do multer
 * (`files`/`fileSize`) limita o consumo. Lê o env em runtime (nunca no load — evita efeito colateral de import).
 */
@Injectable()
export class PublicUploadSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    const bruto = req.headers['content-length'];
    const contentLength = Number(Array.isArray(bruto) ? bruto[0] : bruto);
    if (Number.isFinite(contentLength) && contentLength > 0) {
      const teto = getEnv().PUBLIC_FILE_MAX_TOTAL_BYTES + OVERHEAD_BYTES;
      if (contentLength > teto) {
        throw new PayloadTooLargeException('corpo da submissão excede o limite');
      }
    }
    return true;
  }
}
