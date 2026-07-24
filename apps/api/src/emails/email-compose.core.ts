/**
 * Núcleo PURO da Story 6.1 — validação/sanitização do e-mail canônico (sem framework, sem banco).
 *
 * Tudo aqui é FAIL-CLOSED: entrada fora do contrato lança `ComposicaoInvalidaError` com um motivo
 * sanitizado (vira 400 no serviço) — nunca "corrige" silenciosamente nem deixa passar para o banco.
 * É a garantia de que NENHUM destinatário/assunto/corpo é aceito só por validação client-side (AC-2/AC-3)
 * e de que não há HTML/script/conteúdo ativo persistido (RF-4).
 */

/** Teto de destinatários por e-mail (D-61.2 — definido pré-implementação; hostil a disparo em massa). */
export const LIMITE_DESTINATARIOS = 20;
export const LIMITE_ASSUNTO = 200;
export const LIMITE_CORPO = 20_000;

/**
 * Sintaxe conservadora de e-mail: local@dominio.tld, sem espaços/controle, domínio com ponto. Não tenta
 * cobrir todo o RFC 5322 (aceitar menos é seguro; aceitar mais não é) — validação real de entrega é do
 * provedor (6.4).
 */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@.]{2,}$/;

/** Caracteres de CONTROLE proibidos em texto plano (o corpo mantém `\n`, `\r` e `\t`; o assunto, nenhum). */
// eslint-disable-next-line no-control-regex
const CONTROLE_CORPO_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');
// eslint-disable-next-line no-control-regex
const CONTROLE_ASSUNTO_RE = new RegExp('[\\u0000-\\u001F\\u007F]');

export class ComposicaoInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ComposicaoInvalidaError';
  }
}

/**
 * Normaliza (trim + lowercase), valida a sintaxe e DEDUPLICA a lista de destinatários principais.
 * `exigirMinimo` distingue o rascunho (pode estar vazio enquanto DRAFT) do submit (≥1 obrigatório).
 * A entrada é `unknown` de ponta a ponta (anti-mass-assignment: só uma lista de strings é aceita).
 */
export function normalizarDestinatarios(input: unknown, exigirMinimo: boolean): string[] {
  if (input === undefined || input === null) {
    if (exigirMinimo) throw new ComposicaoInvalidaError('ao menos um destinatário é obrigatório');
    return [];
  }
  if (!Array.isArray(input)) {
    throw new ComposicaoInvalidaError('destinatários devem ser uma lista');
  }
  const vistos = new Set<string>();
  for (const item of input) {
    if (typeof item !== 'string') {
      throw new ComposicaoInvalidaError('destinatário deve ser um texto');
    }
    const normalizado = item.trim().toLowerCase();
    if (normalizado.length === 0 || !EMAIL_RE.test(normalizado)) {
      // Sanitizado: NÃO ecoa o valor recebido (pode ser lixo/ataque de log injection).
      throw new ComposicaoInvalidaError('destinatário com endereço inválido');
    }
    vistos.add(normalizado); // dedup case-insensitive (Set após normalização)
  }
  if (vistos.size > LIMITE_DESTINATARIOS) {
    throw new ComposicaoInvalidaError(
      `número de destinatários excede o limite (${LIMITE_DESTINATARIOS})`,
    );
  }
  if (exigirMinimo && vistos.size === 0) {
    throw new ComposicaoInvalidaError('ao menos um destinatário é obrigatório');
  }
  return [...vistos];
}

/**
 * Valida assunto/corpo como TEXTO PLANO seguro (RF-4/D-61.4): sem caracteres de controle (corpo admite
 * `\n`/`\r`/`\t`), dentro dos tetos. NÃO faz strip silencioso — conteúdo fora do contrato é 400
 * (fail-closed). HTML/`<script>`/URLs são armazenados como texto inerte (nunca interpretados; a
 * renderização escapa) — o que se proíbe aqui é o que quebraria "texto plano": bytes de controle e
 * tamanhos abusivos.
 */
export function validarConteudo(
  subject: unknown,
  body: unknown,
): { subject: string; body: string } {
  if (typeof subject !== 'string' || typeof body !== 'string') {
    throw new ComposicaoInvalidaError('assunto e corpo devem ser texto');
  }
  if (subject.length > LIMITE_ASSUNTO) {
    throw new ComposicaoInvalidaError('assunto excede o tamanho máximo');
  }
  if (body.length > LIMITE_CORPO) {
    throw new ComposicaoInvalidaError('corpo excede o tamanho máximo');
  }
  if (CONTROLE_ASSUNTO_RE.test(subject)) {
    throw new ComposicaoInvalidaError('assunto contém caracteres de controle');
  }
  if (CONTROLE_CORPO_RE.test(body)) {
    throw new ComposicaoInvalidaError('corpo contém caracteres de controle');
  }
  return { subject, body };
}

export type EstadoEmail = 'DRAFT' | 'SUBMITTED' | 'DISCARDED';
export type AcaoEmail = 'submeter' | 'descartar';

export type PlanoTransicao =
  | { tipo: 'aplicar'; alvo: EstadoEmail }
  | { tipo: 'noop' } // já está no estado-alvo — idempotente, SEM updateMany (sem falso `denied`)
  | { tipo: 'invalido' }; // transição impossível a partir do estado atual → 409

/**
 * Decide a transição de estado (espelho de `card-lifecycle.transitions.ts`): `submeter`/`descartar` só a
 * partir de DRAFT; repetir a mesma ação no estado-alvo é no-op idempotente; cruzar (submeter um DISCARDED,
 * descartar um SUBMITTED) é inválido — descartar NÃO exclui enviados (AC-5).
 */
export function planejarTransicao(atual: EstadoEmail, acao: AcaoEmail): PlanoTransicao {
  const alvo: EstadoEmail = acao === 'submeter' ? 'SUBMITTED' : 'DISCARDED';
  if (atual === alvo) return { tipo: 'noop' };
  if (atual !== 'DRAFT') return { tipo: 'invalido' };
  return { tipo: 'aplicar', alvo };
}
