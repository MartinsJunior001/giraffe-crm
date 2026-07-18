/**
 * Helpers HTTP compartilhados da capacidade de arquivos (3.7 + anexo geral 3.8). Extraídos de
 * `files.controller.ts` para que as rotas de anexo por recurso (Card/Registro) reusem exatamente os mesmos
 * limites de multipart e a mesma sanitização de header — sem duplicar a regra de segurança.
 */

/**
 * Teto de memória do multipart (bound de DoS) — ACIMA do `FILE_MAX_BYTES` configurável, conferido no núcleo
 * puro de validação. Barreira dura contra upload gigante; o limite fino (e a mensagem) vêm do serviço.
 */
export const MULTER_MAX_BYTES = 52_428_800; // 50 MiB (== StreamMaxLength do clamd).

/** Limites APERTADOS do multipart (1 arquivo, poucos campos/partes) — sem isto ficam Infinity. */
export const MULTER_LIMITS = {
  fileSize: MULTER_MAX_BYTES,
  files: 1,
  fields: 5,
  parts: 10,
} as const;

/**
 * `Content-Disposition` seguro (RFC 5987) — evita injeção de header via nome original (PII/controle do cliente):
 * fallback ASCII sanitizado + `filename*` UTF-8 percent-encoded.
 */
export function contentDisposition(nomeOriginal: string): string {
  const asciiFallback = nomeOriginal.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(nomeOriginal);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`;
}
