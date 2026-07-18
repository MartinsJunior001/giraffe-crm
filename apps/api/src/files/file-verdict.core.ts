/**
 * Núcleo PURO do veredito COMPOSTO de segurança (Story 3.7, ADR §5) — sem banco, sem I/O. Recebe o resultado de
 * cada verificação e decide `CLEAN` ou `BLOCKED`. **Fail-closed absoluto**: `CLEAN` exige que TODAS as provas
 * passem; qualquer falta, dúvida, erro ou omissão ⇒ `BLOCKED`. Nunca há "CLEAN por omissão".
 *
 * As seis provas (ADR §5): magic bytes (tipo permitido) · tamanho dentro do limite · 2×SHA iguais (o conteúdo
 * verificado é o que será promovido — anti-troca-de-bytes) · ClamAV CLEAN · base do ClamAV fresca (scanner não
 * cego) · CopyObject if-match (o objeto promovido é byte-a-byte o verificado).
 */

/** Resultado do antivírus, normalizado do clamd (INSTREAM): `OK`→LIMPO, `FOUND`→INFECTADO, erro/limite/timeout→NAO_ESCANEAVEL. */
export type ResultadoClamAV = 'LIMPO' | 'INFECTADO' | 'NAO_ESCANEAVEL';

export interface EntradaVeredito {
  /** Tipo detectado por conteúdo real; `null` = fora da allowlist. */
  tipoDetectado: string | null;
  /** Tamanho dentro do limite. */
  tamanhoOk: boolean;
  /** Checksum no aceite. */
  sha256Ingest: string;
  /** Checksum na releitura durante o scan. */
  sha256Releitura: string;
  /** Veredito do ClamAV normalizado. */
  clamav: ResultadoClamAV;
  /** Base de assinaturas do ClamAV dentro da idade máxima (não está "cega"). */
  baseClamAVFresca: boolean;
  /** CopyObject if-match teve sucesso (o objeto promovido é o verificado). */
  ifMatchOk: boolean;
}

export type Veredito =
  | { veredito: 'CLEAN' }
  | { veredito: 'BLOCKED'; motivo: string };

/**
 * Computa o veredito composto. A primeira prova que falhar bloqueia (ordem determinística, mensagem específica).
 * Sanitizado: o motivo não carrega bytes, nome original nem chave — só o nome da prova que reprovou.
 */
export function computarVeredito(e: EntradaVeredito): Veredito {
  if (e.tipoDetectado === null) {
    return { veredito: 'BLOCKED', motivo: 'tipo não permitido (magic bytes)' };
  }
  if (!e.tamanhoOk) {
    return { veredito: 'BLOCKED', motivo: 'tamanho fora do limite' };
  }
  // Anti-troca-de-bytes: o que foi verificado tem de ser o que será promovido.
  if (e.sha256Ingest !== e.sha256Releitura) {
    return { veredito: 'BLOCKED', motivo: 'checksum de ingestão difere do de releitura (conteúdo alterado)' };
  }
  if (!e.baseClamAVFresca) {
    // Scanner com base velha é scanner cego — recusar o veredito, não confiar num "LIMPO" sem valor.
    return { veredito: 'BLOCKED', motivo: 'base de assinaturas do antivírus desatualizada' };
  }
  if (e.clamav === 'INFECTADO') {
    return { veredito: 'BLOCKED', motivo: 'antivírus detectou ameaça' };
  }
  if (e.clamav === 'NAO_ESCANEAVEL') {
    // isInfected === null / erro / timeout / limite excedido ⇒ suspeito, nunca OK.
    return { veredito: 'BLOCKED', motivo: 'antivírus não conseguiu escanear (erro/timeout/limite)' };
  }
  if (!e.ifMatchOk) {
    return { veredito: 'BLOCKED', motivo: 'promoção if-match falhou (objeto divergente)' };
  }
  return { veredito: 'CLEAN' };
}

/** Idade da base fresca? Puro: compara a data da base com o teto em horas, ancorado em `agora`. */
export function baseFresca(dataBase: Date | null, maxIdadeHoras: number, agora: Date): boolean {
  if (dataBase === null) return false; // idade desconhecida ⇒ tratada como cega (fail-closed).
  const idadeHoras = (agora.getTime() - dataBase.getTime()) / 3_600_000;
  return idadeHoras >= 0 && idadeHoras <= maxIdadeHoras;
}
