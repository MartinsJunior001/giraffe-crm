import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { IncomingMessage } from 'node:http';
import { proxiesConfiaveisDoAmbiente, resolverIpCliente } from '../../kernel/auth/client-ip';
import { SemContextoOrganizacional } from '../../kernel/context/sem-contexto.decorator';
import { MULTER_MAX_BYTES } from '../../files/file-http.util';
import { parseSubmissaoPublica, validarPublicId } from './public-submissions.dto';
import { type ArquivoPublico, PublicSubmissionService } from './public-submission.service';
import { PublicUploadSizeGuard } from './public-upload-size.guard';

/**
 * Barreira DURA do multipart público (defesa em profundidade anti-DoS, Story 3.8/F6). O `AnyFilesInterceptor`
 * usa memory storage e bufferia ANTES do serviço; o `PublicUploadSizeGuard` já rejeita cedo por `Content-Length`
 * (o caso comum), e esta barreira limita o consumo de requisições chunked (sem `Content-Length`): `files ×
 * fileSize` é o teto de memória. `files` é conservador (o limite fino por submissão é do serviço); `fileSize`
 * casa com o teto absoluto por arquivo (`MULTER_MAX_BYTES`, ≥ `FILE_MAX_BYTES` configurável).
 */
const MULTER_LIMITS_PUBLICO = { fileSize: MULTER_MAX_BYTES, files: 20, fields: 5, parts: 30 };

/**
 * Endpoint PÚBLICO da submissão do Formulário inicial (Story 2.8). **Sem autenticação e sem contexto**:
 * `@SemContextoOrganizacional()` dispensa o `TenantContextGuard`, e a ausência de `@Requer` faz o `AuthzGuard`
 * não exigir nada. O tenant é resolvido **no servidor** pelo `publicId` opaco (nunca do cliente).
 *
 * O IP confiável é resolvido do **socket** (não do `X-Forwarded-For` cru — `client-ip.ts`), para o rate limit.
 * A resposta é sempre uma confirmação opaca; erros são uniformes (404 para link inválido/revogado, 400 genérico
 * para valores inválidos, 429 para excesso) — nunca vazam dado interno.
 */
@Controller('public')
export class PublicSubmissionController {
  constructor(private readonly submissao: PublicSubmissionService) {}

  @SemContextoOrganizacional()
  @Post('forms/:publicId/submit')
  @UseGuards(PublicUploadSizeGuard) // rejeita por Content-Length ANTES de o multer bufferizar (guard precede interceptor)
  @UseInterceptors(AnyFilesInterceptor({ limits: MULTER_LIMITS_PUBLICO }))
  async submeter(
    @Param('publicId') publicId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() arquivos: { fieldname: string; buffer: Buffer; originalname: string }[],
    @Req() req: IncomingMessage,
  ): Promise<{ ok: true }> {
    const id = validarPublicId(publicId);
    const ip = this.ipCliente(req);

    // Sem partes de arquivo ⇒ caminho JSON da 2.8 (inalterado). Com arquivos ⇒ orquestração inline da 3.8 (F6).
    if (!arquivos || arquivos.length === 0) {
      return this.submissao.submeter(id, ip, parseSubmissaoPublica(body));
    }

    // Multipart: `valores` chega como string JSON num campo de texto; `idempotencyKey` como texto.
    const dto = parseSubmissaoPublica(this.envelopeMultipart(body));
    const arquivosPublicos: ArquivoPublico[] = arquivos.map((a) => ({
      campoId: a.fieldname,
      buffer: a.buffer,
      nomeOriginal: a.originalname,
    }));
    return this.submissao.submeterComArquivos(id, ip, { ...dto, arquivos: arquivosPublicos });
  }

  /** Normaliza o envelope multipart em `{ valores, idempotencyKey }`: `valores` vem como string JSON. */
  private envelopeMultipart(body: Record<string, unknown>): {
    valores: unknown;
    idempotencyKey?: unknown;
  } {
    let valores: unknown = {};
    const bruto = body?.valores;
    if (typeof bruto === 'string' && bruto.trim() !== '') {
      try {
        valores = JSON.parse(bruto);
      } catch {
        throw new BadRequestException('valores inválido');
      }
    } else if (bruto !== undefined) {
      valores = bruto;
    }
    return { valores, idempotencyKey: body?.idempotencyKey };
  }

  /** IP confiável do cliente: socket + cadeia XFF só quando o peer é um proxy confiável (nunca falsificável). */
  private ipCliente(req: IncomingMessage): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    return resolverIpCliente({
      peer: req.socket?.remoteAddress,
      forwarded: Array.isArray(forwarded) ? forwarded.join(',') : forwarded,
      proxiesConfiaveis: proxiesConfiaveisDoAmbiente(),
    });
  }
}
