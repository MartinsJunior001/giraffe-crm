import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL do domínio público (Story 2.8), no estilo das 2.4-2.7 (sem `class-validator`).
 * O canal público é hostil: valida a FORMA do envelope e devolve o tipo estreito, sem vazar estrutura interna.
 */

const IDEMPOTENCY_KEY_MAX = 200;
const PUBLIC_ID_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{16,200}$/; // opaco: base64url-ish, comprimento mínimo

/** Corpo da submissão pública: `valores` (mapa Field.id→valor) + `idempotencyKey` opcional (dedup de reenvio). */
export interface SubmissaoPublicaDTO {
  valores: unknown;
  idempotencyKey?: string;
}

/** Valida um `:id` de rota como UUID (rotas autenticadas de triagem). */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/**
 * Valida o `:publicId` da rota pública. Formato opaco (base64url-like, ≥16 chars). Fora do formato → **404
 * uniforme** (nunca 400 detalhado): o canal público não confirma sequer se o formato do link é "quase certo".
 */
export function validarPublicId(publicId: string): string {
  if (
    typeof publicId !== 'string' ||
    publicId.length > PUBLIC_ID_MAX ||
    !PUBLIC_ID_RE.test(publicId)
  ) {
    throw new NotFoundException();
  }
  return publicId;
}

/** Valida o corpo da submissão pública. `valores` objeto (ausente → `{}`); `idempotencyKey` opcional ≤200. */
export function parseSubmissaoPublica(body: unknown): SubmissaoPublicaDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  let valores: unknown = dados.valores;
  if (valores === undefined) valores = {};
  if (typeof valores !== 'object' || valores === null || Array.isArray(valores)) {
    throw new BadRequestException('valores deve ser um objeto');
  }

  let idempotencyKey: string | undefined;
  const chave = dados.idempotencyKey;
  if (chave !== undefined && chave !== null) {
    if (
      typeof chave !== 'string' ||
      chave.trim().length === 0 ||
      chave.length > IDEMPOTENCY_KEY_MAX
    ) {
      throw new BadRequestException('idempotencyKey inválida');
    }
    idempotencyKey = chave;
  }

  return { valores, idempotencyKey };
}

/** Modo de submissão pública ao habilitar (config autenticada). */
export function parseModoPublico(body: unknown): 'TRIAGE' | 'DIRECT' {
  const dados = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const modo = dados.mode ?? dados.modo ?? 'TRIAGE';
  if (modo !== 'TRIAGE' && modo !== 'DIRECT') throw new BadRequestException('mode inválido');
  return modo;
}
