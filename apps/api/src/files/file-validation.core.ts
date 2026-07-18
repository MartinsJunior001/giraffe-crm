/**
 * Núcleo PURO da validação server-side de upload (Story 3.7) — magic bytes + tamanho + contagem. Sem banco,
 * sem I/O: recebe os bytes já em memória (o upload é limitado por `FILE_MAX_BYTES`) e decide. Fail-closed:
 * qualquer coisa fora da allowlist determinística é REJEITADA (400), nunca aceita por omissão.
 *
 * **Allowlist por CONTEÚDO real (magic bytes), não por extensão/Content-Type** (que o cliente controla):
 * um executável renomeado `.png` é rejeitado pelo conteúdo. `.txt/.csv/.json` ficam FORA (Q3 — sem assinatura
 * binária determinística; incluí-los exigiria heurística que o atacante contorna). Formatos baseados em ZIP
 * (docx/xlsx/zip) também ficam FORA do allowlist inicial: a assinatura `PK\x03\x04` é IDÊNTICA à de um `.jar`/
 * `.zip` com executável dentro — discriminá-los por magic bytes é impossível sem inspeção profunda, e a Story
 * proíbe enfraquecer o gate. A capacidade é genérica; ampliar a allowlist é decisão futura com consumidor real.
 */

/** Uma assinatura de tipo permitido: o mime canônico e o teste sobre os primeiros bytes. */
interface AssinaturaTipo {
  mime: string;
  /** Testa o conteúdo real. Recebe os bytes iniciais do arquivo. */
  casa: (b: Uint8Array) => boolean;
}

/** Confere que `b` começa com a sequência `sig` a partir de `offset`. */
function prefixo(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (b[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Allowlist inicial — formatos binários com assinatura determinística e única, sem risco de execução:
 * PNG, JPEG, GIF, WEBP, PDF. Ordem irrelevante (assinaturas disjuntas).
 */
const ALLOWLIST: readonly AssinaturaTipo[] = [
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', casa: (b) => prefixo(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', casa: (b) => prefixo(b, [0xff, 0xd8, 0xff]) },
  // GIF: "GIF87a" ou "GIF89a"
  {
    mime: 'image/gif',
    casa: (b) =>
      prefixo(b, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      prefixo(b, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  },
  // WEBP: "RIFF"....(4 bytes tamanho)...."WEBP" — offset 0 = RIFF, offset 8 = WEBP
  {
    mime: 'image/webp',
    casa: (b) => prefixo(b, [0x52, 0x49, 0x46, 0x46]) && prefixo(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  // PDF: "%PDF-"
  { mime: 'application/pdf', casa: (b) => prefixo(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
];

/** Mimes permitidos, derivados da ALLOWLIST — fonte ÚNICA para "exibir antes do envio" (evita lista duplicada). */
export const MIMES_PERMITIDOS: readonly string[] = ALLOWLIST.map((a) => a.mime);

/**
 * Detecta o tipo por conteúdo real. Devolve o mime canônico se casar com a allowlist, ou `null` (rejeitado).
 * `null` cobre tudo que não está na allowlist — inclusive executáveis (MZ/ELF), scripts e ZIP/office.
 */
export function detectarTipo(bytes: Uint8Array): string | null {
  for (const a of ALLOWLIST) {
    if (a.casa(bytes)) return a.mime;
  }
  return null;
}

export type ResultadoValidacao =
  | { ok: true; mime: string }
  | {
      ok: false;
      codigo: 'TIPO_NAO_PERMITIDO' | 'TAMANHO_EXCEDIDO' | 'VAZIO' | 'CONTAGEM_EXCEDIDA';
      motivo: string;
    };

export interface EntradaValidacao {
  bytes: Uint8Array;
  tamanhoBytes: number;
  maxBytes: number;
  /** Quantidade de arquivos NÃO-expurgados/NÃO-bloqueados já no recurso (para o teto de contagem). */
  contagemAtual: number;
  maxPorRecurso: number;
}

/**
 * Valida um upload por completo, fail-closed. Ordem: vazio → tamanho → contagem → tipo (conteúdo real).
 * Devolve o mime detectado quando aprovado; caso contrário, o código + motivo do 400.
 */
export function validarUpload(e: EntradaValidacao): ResultadoValidacao {
  if (e.tamanhoBytes <= 0 || e.bytes.length === 0) {
    return { ok: false, codigo: 'VAZIO', motivo: 'arquivo vazio' };
  }
  if (e.tamanhoBytes > e.maxBytes) {
    return {
      ok: false,
      codigo: 'TAMANHO_EXCEDIDO',
      motivo: `tamanho ${e.tamanhoBytes} excede o máximo ${e.maxBytes}`,
    };
  }
  if (e.contagemAtual >= e.maxPorRecurso) {
    return {
      ok: false,
      codigo: 'CONTAGEM_EXCEDIDA',
      motivo: `recurso já possui ${e.contagemAtual} arquivos (máximo ${e.maxPorRecurso})`,
    };
  }
  const mime = detectarTipo(e.bytes);
  if (mime === null) {
    return {
      ok: false,
      codigo: 'TIPO_NAO_PERMITIDO',
      motivo: 'tipo não permitido pelo conteúdo real (magic bytes)',
    };
  }
  return { ok: true, mime };
}
