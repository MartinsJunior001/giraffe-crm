import { Injectable, Logger } from '@nestjs/common';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { assinar, encodarCaminho, formatarData, sha256hex, SHA256_VAZIO } from './s3-sigv4';
import { getEnv } from '../config/env';

interface RespostaS3 {
  status: number;
  headers: IncomingMessage['headers'];
  body: IncomingMessage;
}

/**
 * Client de STORAGE de objetos (Story 3.7) — fronteira técnica do kernel (AD-4/AD-5): S3-compatível (MinIO em
 * dev/CI), buckets PRIVADOS. **Zero dependência externa** — `node:http` + SigV4 próprio (`s3-sigv4.ts`), evitando
 * o `@aws-sdk/client-s3` (50+ pacotes). Sem regra de negócio: só põe, lê (bytes/stream), copia com if-match e
 * remove objetos por chave. A política (estados, promoção, autz) vive em `files/`.
 *
 * **Nada de credencial em log/health.** A chave é OPACA e nunca é autorização. Cada operação abre sua própria
 * requisição HTTP (stateless); a config é lida sob demanda (o boot não morre com o gate desligado).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private cfg() {
    const env = getEnv();
    if (!env.STORAGE_ENDPOINT || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
      throw new Error('storage não configurado (STORAGE_ENDPOINT/ACCESS_KEY/SECRET_KEY ausentes)');
    }
    return {
      url: new URL(env.STORAGE_ENDPOINT),
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    };
  }

  /** Executa uma requisição S3 assinada. Não consome o corpo da resposta — quem chama decide (stream/bytes). */
  private enviar(
    method: string,
    key: string,
    opts: { headersExtra?: Record<string, string>; body?: Buffer } = {},
  ): Promise<RespostaS3> {
    const cfg = this.cfg();
    const { amzDate, dateStamp } = formatarData(new Date());
    const canonicalPath = `/${cfg.bucket}/${key}`;
    const payloadHash = opts.body ? sha256hex(opts.body) : SHA256_VAZIO;

    const assinados = assinar({
      method,
      canonicalPath,
      headers: { host: cfg.url.host, ...(opts.headersExtra ?? {}) },
      payloadHash,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: 's3',
      amzDate,
      dateStamp,
    });

    const requester = cfg.url.protocol === 'https:' ? httpsRequest : httpRequest;

    return new Promise<RespostaS3>((resolve, reject) => {
      const req = requester(
        {
          protocol: cfg.url.protocol,
          hostname: cfg.url.hostname,
          port: cfg.url.port,
          method,
          path: encodarCaminho(canonicalPath),
          headers: assinados,
        },
        (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
      );
      req.on('error', reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  /** Drena e descarta o corpo da resposta (evita vazar socket em respostas que não consumimos). */
  private async descartar(res: RespostaS3): Promise<void> {
    for await (const _ of res.body) {
      /* descarta */
    }
  }

  /** Põe o binário (na chave de quarentena). Devolve o ETag do objeto — âncora do if-match da promoção. */
  async put(key: string, body: Buffer): Promise<{ etag: string | undefined }> {
    // `content-length` NÃO é assinado (a AWS não o exige; o node:http o adiciona ao escrever o corpo) — evita
    // qualquer divergência entre o header assinado e o efetivamente enviado.
    const res = await this.enviar('PUT', key, { body });
    await this.descartar(res);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`storage PUT falhou (status ${res.status})`);
    }
    const etag = res.headers['etag'];
    return { etag: typeof etag === 'string' ? etag : undefined };
  }

  /** Lê o objeto inteiro como bytes (releitura para o 2º SHA durante o scan). */
  async getBytes(key: string): Promise<Uint8Array> {
    const res = await this.enviar('GET', key);
    if (res.status < 200 || res.status >= 300) {
      await this.descartar(res);
      throw new Error(`storage GET falhou (status ${res.status})`);
    }
    const partes: Buffer[] = [];
    for await (const chunk of res.body) partes.push(chunk as Buffer);
    return Buffer.concat(partes);
  }

  /** Abre um stream de leitura do objeto (entrega por stream sob sessão — nunca redirect a bucket). */
  async getStream(key: string): Promise<IncomingMessage> {
    const res = await this.enviar('GET', key);
    if (res.status < 200 || res.status >= 300) {
      await this.descartar(res);
      throw new Error(`storage GET falhou (status ${res.status})`);
    }
    return res.body; // IncomingMessage é um Readable.
  }

  /**
   * Copia `srcKey` → `destKey` **apenas se** o ETag da origem ainda for `etag` (CopyObject if-match, ADR §5):
   * prova que o objeto promovido é byte-a-byte o verificado. `true` se copiou; `false` se o if-match falhou (412)
   * ou qualquer erro (fail-closed — o chamador bloqueia).
   */
  async copyIfMatch(srcKey: string, destKey: string, etag: string): Promise<boolean> {
    const cfg = this.cfg();
    try {
      const res = await this.enviar('PUT', destKey, {
        headersExtra: {
          'x-amz-copy-source': encodarCaminho(`/${cfg.bucket}/${srcKey}`),
          'x-amz-copy-source-if-match': etag,
        },
      });
      const status = res.status;
      await this.descartar(res);
      if (status === 200) return true;
      this.logger.warn({ event: 'storage.copyIfMatch.falha', status }, 'if-match da promoção falhou');
      return false;
    } catch (err) {
      this.logger.warn(
        { event: 'storage.copyIfMatch.erro', motivo: (err as { message?: string })?.message ?? 'erro' },
        'erro no CopyObject if-match',
      );
      return false;
    }
  }

  /** Remove um objeto por chave (limpeza da quarentena e expurgo físico do binário). Idempotente. */
  async remove(key: string): Promise<void> {
    const res = await this.enviar('DELETE', key);
    await this.descartar(res);
    // 204 (removido) e 404 (já não existe) são ambos aceitáveis — remoção é idempotente.
    if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
      throw new Error(`storage DELETE falhou (status ${res.status})`);
    }
  }
}
