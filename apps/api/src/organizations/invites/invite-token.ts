import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token do Convite (Story 8.2) — geração forte e armazenamento **só como hash**.
 *
 * O invariante de segurança: o banco **nunca** guarda o token utilizável, só o seu hash. Um vazamento
 * da tabela de Convites não entrega links válidos. O token bruto existe apenas em memória, o tempo de
 * montar a URL e enviá-la; a partir daí, só o hash. Isso espelha o tratamento de segredo de sessão da
 * base (armazenar hash, comparar em tempo constante).
 */

/** 32 bytes de entropia (256 bits) — inviável de adivinhar por força bruta; codificado base64url. */
const BYTES_TOKEN = 32;

/** Um token recém-emitido: o valor BRUTO (para a URL) e o HASH (para persistir). */
export interface TokenEmitido {
  /** Valor utilizável, vai na URL do e-mail. NUNCA persistido, NUNCA logado. */
  bruto: string;
  /** SHA-256 do bruto, em hex. É isto que a coluna `tokenHash` guarda. */
  hash: string;
}

/** Base64url sem padding — seguro em URL, sem `+`/`/`/`=`. */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Gera um novo token. O `bruto` sai daqui e não deve ser guardado em lugar nenhum além da URL. */
export function emitirToken(): TokenEmitido {
  const bruto = base64url(randomBytes(BYTES_TOKEN));
  return { bruto, hash: hashToken(bruto) };
}

/** Hash determinístico do token, para lookup e comparação. SHA-256 hex. */
export function hashToken(bruto: string): string {
  return createHash('sha256').update(bruto, 'utf8').digest('hex');
}

/**
 * Compara em TEMPO CONSTANTE o hash de um token apresentado com o hash persistido.
 *
 * O lookup por hash já é O(1) por índice, mas a comparação final é feita com `timingSafeEqual` para
 * não abrir canal lateral de temporização — a mesma disciplina do resto da base. Comprimentos
 * diferentes retornam `false` sem lançar (evita vazar tamanho por exceção).
 */
export function tokenConfere(brutoApresentado: string, hashPersistido: string): boolean {
  const a = Buffer.from(hashToken(brutoApresentado), 'hex');
  const b = Buffer.from(hashPersistido, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
