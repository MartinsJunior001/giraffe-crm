/**
 * Núcleo PURO da fonte única de Notificações (Story 5.3) — sanitização de conteúdo e derivações, SEM banco e
 * SEM Nest. É aqui que a segurança do write-side (§1571; NFR-8/AD-30) vira código testável: os parâmetros de
 * renderização são um subconjunto MÍNIMO SANITIZADO (allowlist estrutural, fail-closed), escapado contra
 * HTML/script; nada de payload bruto/token/segredo/URL temporária/PII aninhada passa cru. O estado lido/
 * não-lido é DERIVADO de `readAt` (nunca um booleano persistido — precedente: `card-health.core`).
 *
 * A allowlist aqui é ESTRUTURAL (formato de chave + valor escalar), não semântica por-tipo: o catálogo de
 * tipos de Notificação é a 5.6 (AD-11). Espelha `codigoSanitizado` da Trilha de Execuções (4.8).
 */

/** Teto de comprimento de um valor de texto renderizável (defesa anti-DoS/anti-abuso). */
const MAX_TAMANHO_VALOR = 500;
/** Teto de número de parâmetros de renderização (defesa contra objeto inflado). */
const MAX_PARAMS = 20;
/** Teto de comprimento de uma chave de parâmetro. */
const MAX_TAMANHO_CHAVE = 64;

/** Formato estrutural de um TIPO de Notificação / `resourceType` (enum estrutural — nunca texto livre). */
const TIPO_RE = /^[A-Z][A-Z0-9_]*$/;
/** Formato de uma chave de parâmetro. Começa por letra => bloqueia `__proto__`/`_x` (prototype pollution). */
const CHAVE_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chaves nunca aceitas, mesmo que casassem o formato — blindagem extra de prototype pollution. */
const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Escapa os cinco metacaracteres de HTML. `<script>` -> `&lt;script&gt;`. É a defesa anti-XSS no WRITE: o
 * conteúdo é armazenado já escapado, então nenhuma superfície (5.4) o renderiza como marcação, mesmo que
 * esqueça de escapar na saída.
 */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Remove chars de controle (C0 + DEL) — evita quebra de log/terminal e payload escondido. */
function removerControle(valor: string): string {
  // eslint-disable-next-line no-control-regex
  return valor.replace(/[\x00-\x1f\x7f]/g, '');
}

/**
 * Sanitiza UM valor de texto renderizável: `trim` -> remove controle -> escapa HTML -> aplica o teto. Fonte
 * única do tratamento de string do conteúdo (aplicada a cada valor escalar de `params`).
 */
export function sanitizarValorRenderizavel(valor: string): string {
  const limpo = escaparHtml(removerControle(valor.trim()));
  return limpo.length > MAX_TAMANHO_VALOR ? limpo.slice(0, MAX_TAMANHO_VALOR) : limpo;
}

/** Um valor de parâmetro só é aceito se for ESCALAR: string (sanitizada), número finito ou booleano. */
function sanitizarValorParam(valor: unknown): string | number | boolean | undefined {
  if (typeof valor === 'string') return sanitizarValorRenderizavel(valor);
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor === 'boolean') return valor;
  // objeto/array/null/função/símbolo -> descartado (fail-closed: sem payload aninhado).
  return undefined;
}

/**
 * Sanitiza os PARÂMETROS de renderização — allowlist estrutural fail-closed.
 *
 * Regras: `raw` não-objeto (ou array/null) -> `{}`; cada chave precisa casar `CHAVE_RE`, não estar em
 * `CHAVES_PROIBIDAS` e respeitar o teto de tamanho; cada valor precisa ser ESCALAR (senão descartado);
 * no máximo `MAX_PARAMS` chaves (as excedentes são ignoradas de forma determinística por ordenação de
 * chave). O resultado é construído num objeto FRESCO — nunca herda protótipo do `raw`.
 *
 * O que isto GARANTE (§1571): nenhum payload bruto/token/segredo/URL/objeto aninhado é ecoado; um
 * `<script>` num valor vira `&lt;script&gt;` (provado por teste de injeção); `__proto__` é descartado.
 */
export function sanitizarParametros(raw: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;

  let n = 0;
  for (const chave of Object.keys(raw as Record<string, unknown>).sort()) {
    if (n >= MAX_PARAMS) break;
    if (chave.length > MAX_TAMANHO_CHAVE) continue;
    if (CHAVES_PROIBIDAS.has(chave) || !CHAVE_RE.test(chave)) continue;
    const valor = sanitizarValorParam((raw as Record<string, unknown>)[chave]);
    if (valor === undefined) continue;
    out[chave] = valor;
    n += 1;
  }
  return out;
}

/** Valida o formato estrutural de um TIPO de Notificação (`^[A-Z][A-Z0-9_]*$`). */
export function tipoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && TIPO_RE.test(valor);
}

/** Valida o formato estrutural de um `resourceType` (`^[A-Z][A-Z0-9_]*$`). */
export function resourceTypeValido(valor: unknown): valor is string {
  return typeof valor === 'string' && TIPO_RE.test(valor);
}

/** Valida um UUID (referência-por-id: `sourceEventId`, `resourceId`, `actorId`, ids de destinatário). */
export function uuidValido(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor);
}

/**
 * Chave de deduplicação determinística de um destinatário: `"{sourceEventId}|{type}|{recipientMembershipId}"`.
 * Encoda *Org (contexto) + Evento de origem + tipo + destinatário* (§1569); estável no reprocesso e
 * independente do uuid da Notificação. `type` já vem validado (`^[A-Z][A-Z0-9_]*$` — sem `|`).
 */
export function chaveDeduplicacao(
  sourceEventId: string,
  type: string,
  recipientMembershipId: string,
): string {
  return `${sourceEventId}|${type}|${recipientMembershipId}`;
}

/**
 * Estado DERIVADO lido/não-lido a partir de `readAt` (§1568). NÃO se persiste um booleano `lido`; persiste-se
 * o instante `readAt` (nulo = não-lido). Esta é a única fonte da derivação.
 */
export function estaLida(readAt: Date | null): boolean {
  return readAt !== null;
}
