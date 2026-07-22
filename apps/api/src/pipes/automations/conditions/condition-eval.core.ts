import type { Categoria } from '../../../databases/records/record-query.core';
import { categoriaDeCampo } from '../../../databases/records/record-query.core';
import type { Condicao } from '../automation-config';
import {
  type CardSnapshot,
  type RecordSnapshot,
  type SnapshotAvaliacao,
} from './condition-snapshot';

/**
 * Núcleo PURO da avaliação de Condições (Story 4.4 — FR-23, D4.2). Combina N Condições por **AND** sobre o
 * SNAPSHOT pós-Evento (`condition-snapshot.ts`) e devolve um veredito **determinístico**. Sem I/O, sem Nest,
 * sem Prisma — o mesmo desenho de `record-query.core.ts` (3.5) e `card-health.core.ts` (2.13): os invariantes
 * de segurança vivem aqui e são provados em unidade.
 *
 * **Três garantias que este módulo NUNCA quebra:**
 *  1. **AND / ausência = aprovação** — todas verdadeiras ⇒ aprovado; qualquer falsa ⇒ reprovado; conjunto
 *     VAZIO ⇒ aprovado direto (D4.1: "ausência de Condições = aprovação direta").
 *  2. **Fail-closed** — Condição/operador/valor desconhecido, malformado, tipo incompatível ou não-avaliável
 *     ⇒ **falso** (não dispara). Um erro de avaliação vira `false`, NUNCA uma exceção que escape e o motor
 *     interprete como disparo. Erro nunca "vira verdadeiro por omissão" (Story §1363).
 *  3. **Determinismo** — a ÚNICA fonte de tempo é `snapshot.avaliadoEm` (instante do Evento). Nada de
 *     `Date.now()`/aleatório dentro da comparação: mesmo snapshot ⇒ mesmo resultado, mesmo tardiamente na fila.
 *
 * **Semântica de comparação = Arquitetura (gate).** Derivada de `record-query.core.ts` (3.5): a categoria do
 * Campo vem de `categoriaDeCampo` (FONTE ÚNICA — "sem segundo catálogo de operadores"); **data** compara por
 * instante absoluto UTC ("fuso oficial", 2.12/DIV-1) — parse validado, sem coerção implícita; **número** exige
 * `number` finito; **sem coerção** entre tipos incompatíveis (Story §1360). Campo `FILE` é gated (categoria
 * `null`) ⇒ Condição sobre ele é fail-closed.
 */

// ── Contrato de saída ─────────────────────────────────────────────────────────────────────────────────

/** Resultado de UMA Condição (para a trilha da 4.8 — só metadados, NUNCA o valor comparado; possível PII). */
export interface ResultadoCondicao {
  readonly indice: number;
  readonly tipo: string;
  readonly operador: string;
  readonly resultado: boolean;
  /** Motivo SANITIZADO quando `false` (`FAIL_CLOSED` = não-avaliável). `null` quando `true`. Sem valores. */
  readonly motivo: string | null;
}

/** Veredito da avaliação AND — `aprovado` decide se o motor (4.6) prossegue para as Ações. */
export interface ResultadoAvaliacao {
  readonly aprovado: boolean;
  readonly resultados: readonly ResultadoCondicao[];
}

// ── Operadores por categoria (na AVALIAÇÃO) ─────────────────────────────────────────────────────────

/**
 * Compatibilidade FINA operador↔categoria — o mesmo espaço de operadores da consulta (3.5) mais os explícitos
 * de nulo/vazio/mudança. Um operador fora do conjunto da categoria é fail-closed (ex.: `contem` sobre número).
 * É aqui que o `OPERADORES_CAMPO` (união, validado na configuração) é refinado por tipo — como 3.5 refina
 * contra a definição viva.
 */
const OPS_POR_CATEGORIA: Record<Categoria, ReadonlySet<string>> = {
  texto: new Set(['igual', 'diferente', 'contem', 'preenchido', 'vazio', 'mudou']),
  numero: new Set([
    'igual',
    'diferente',
    'maior',
    'menor',
    'intervalo',
    'preenchido',
    'vazio',
    'mudou',
  ]),
  data: new Set([
    'igual',
    'diferente',
    'maior',
    'menor',
    'intervalo',
    'preenchido',
    'vazio',
    'mudou',
  ]),
  selecao: new Set(['contemOpcao', 'igual', 'preenchido', 'vazio', 'mudou']),
  booleano: new Set(['igual', 'diferente', 'preenchido', 'vazio', 'mudou']),
};

// ── Erro interno (nunca escapa do módulo) ───────────────────────────────────────────────────────────

/** Sinaliza "não-avaliável" DENTRO do avaliador. É capturado e vira `false` — jamais escapa como exceção. */
class NaoAvaliavel extends Error {}

// ── Helpers de valor ────────────────────────────────────────────────────────────────────────────────

/** Um valor de Campo está "preenchido"? Nulo, indefinido, texto vazio e array vazio são "vazio" (Story §1360). */
function estaPreenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Igualdade determinística para os shapes de valor de Campo (escalar ou array de opções). */
function iguaisProfundos(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}

/** Coage/valida o valor da CONDIÇÃO como número finito. Fail-closed (não-avaliável) se não for. */
function numeroDaCondicao(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new NaoAvaliavel();
  return v;
}

/** Instante absoluto (ms UTC) de um valor de data (Condição ou armazenado). Fail-closed se não parseável. */
function instanteDe(v: unknown): number {
  if (typeof v !== 'string') throw new NaoAvaliavel();
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new NaoAvaliavel();
  return t;
}

// ── Comparação por categoria (semântica de 3.5) ─────────────────────────────────────────────────────

function compararTexto(op: string, armazenado: unknown, valor: unknown): boolean {
  if (typeof valor !== 'string') throw new NaoAvaliavel();
  if (typeof armazenado !== 'string') return false; // sem coerção: valor ausente/tipo errado não é comparável
  if (op === 'igual') return armazenado === valor;
  if (op === 'diferente') return armazenado !== valor;
  if (op === 'contem') return armazenado.includes(valor);
  throw new NaoAvaliavel();
}

function compararNumero(op: string, armazenado: unknown, valor: unknown): boolean {
  if (typeof armazenado !== 'number' || !Number.isFinite(armazenado)) return false;
  if (op === 'intervalo') {
    if (!Array.isArray(valor) || valor.length !== 2) throw new NaoAvaliavel();
    const min = numeroDaCondicao(valor[0]);
    const max = numeroDaCondicao(valor[1]);
    return armazenado >= min && armazenado <= max;
  }
  const v = numeroDaCondicao(valor);
  if (op === 'igual') return armazenado === v;
  if (op === 'diferente') return armazenado !== v;
  if (op === 'maior') return armazenado > v;
  if (op === 'menor') return armazenado < v;
  throw new NaoAvaliavel();
}

/** Data por INSTANTE ABSOLUTO UTC (fuso oficial, 2.12). Sem cast SQL — parse validado em memória. */
function compararData(op: string, armazenado: unknown, valor: unknown): boolean {
  if (typeof armazenado !== 'string' || Number.isNaN(Date.parse(armazenado))) return false;
  const a = Date.parse(armazenado);
  if (op === 'intervalo') {
    if (!Array.isArray(valor) || valor.length !== 2) throw new NaoAvaliavel();
    const min = instanteDe(valor[0]);
    const max = instanteDe(valor[1]);
    return a >= min && a <= max;
  }
  const v = instanteDe(valor);
  if (op === 'igual') return a === v;
  if (op === 'diferente') return a !== v;
  if (op === 'maior') return a > v;
  if (op === 'menor') return a < v;
  throw new NaoAvaliavel();
}

function compararSelecao(op: string, armazenado: unknown, valor: unknown): boolean {
  if (op === 'contemOpcao') {
    if (typeof valor !== 'string') throw new NaoAvaliavel();
    if (Array.isArray(armazenado)) return armazenado.includes(valor);
    return armazenado === valor;
  }
  if (op === 'igual') {
    if (typeof valor !== 'string') throw new NaoAvaliavel();
    return armazenado === valor; // seleção múltipla (array) usa `contemOpcao`, não `igual`
  }
  throw new NaoAvaliavel();
}

function compararBooleano(op: string, armazenado: unknown, valor: unknown): boolean {
  if (typeof valor !== 'boolean') throw new NaoAvaliavel();
  if (typeof armazenado !== 'boolean') return false;
  if (op === 'igual') return armazenado === valor;
  if (op === 'diferente') return armazenado !== valor;
  throw new NaoAvaliavel();
}

/** Roteia a comparação para a categoria do Campo. `preenchido`/`vazio` são transversais e vêm antes. */
function compararPorCategoria(
  categoria: Categoria,
  op: string,
  armazenado: unknown,
  valor: unknown,
): boolean {
  if (op === 'preenchido') return estaPreenchido(armazenado);
  if (op === 'vazio') return !estaPreenchido(armazenado);
  switch (categoria) {
    case 'texto':
      return compararTexto(op, armazenado, valor);
    case 'numero':
      return compararNumero(op, armazenado, valor);
    case 'data':
      return compararData(op, armazenado, valor);
    case 'selecao':
      return compararSelecao(op, armazenado, valor);
    case 'booleano':
      return compararBooleano(op, armazenado, valor);
    default: {
      const _exaustivo: never = categoria;
      return _exaustivo;
    }
  }
}

// ── Avaliação de UMA Condição por domínio ────────────────────────────────────────────────────────────

/** `refs` da primeira referência de um tipo, ou `undefined`. */
function refId(c: Condicao, tipo: string): string | undefined {
  return c.refs.find((r) => r.tipo === tipo)?.id;
}

/** Avalia uma Condição de valor de Campo (Card ou Registro). Fail-closed em qualquer inconsistência. */
function avaliarCampo(
  c: Condicao,
  snapshot: SnapshotAvaliacao,
  dono: CardSnapshot | RecordSnapshot | null,
): boolean {
  if (!dono) return false; // Evento não trouxe o recurso ⇒ não-avaliável
  const fieldId = refId(c, 'FIELD');
  if (fieldId === undefined) return false;

  const def = snapshot.camposPorId[fieldId];
  if (!def) return false; // Campo ausente/removido/arquivado/cross-tenant ⇒ referência inválida (§1362)
  const categoria = categoriaDeCampo(def.type);
  if (categoria === null) return false; // FILE gated (AD-28) ⇒ fail-closed

  if (!OPS_POR_CATEGORIA[categoria].has(c.operador)) return false; // operador↔tipo incompatível

  const armazenado = dono.valores[fieldId];

  if (c.operador === 'mudou') {
    // Consulta valor anterior E posterior (Story §1357). Sem "antes" ⇒ não se pode provar mudança ⇒ falso.
    if (!dono.valoresAnteriores) return false;
    return !iguaisProfundos(dono.valoresAnteriores[fieldId], armazenado);
  }

  return compararPorCategoria(categoria, c.operador, armazenado, c.valor);
}

/** Avalia uma Condição contra o snapshot. Pode lançar `NaoAvaliavel` — o chamador captura ⇒ falso. */
function avaliarUma(c: Condicao, snapshot: SnapshotAvaliacao): boolean {
  switch (c.tipo) {
    case 'CARD_LIFECYCLE_STATE': {
      if (!snapshot.card) return false;
      const igual = snapshot.card.lifecycleState === c.valor;
      return c.operador === 'diferente' ? !igual : igual;
    }
    case 'CARD_HEALTH': {
      if (!snapshot.card) return false;
      const igual = snapshot.card.saude === c.valor;
      return c.operador === 'diferente' ? !igual : igual;
    }
    case 'CARD_PHASE': {
      if (!snapshot.card) return false;
      const alvo = refId(c, 'PHASE');
      if (alvo === undefined) return false;
      const igual = snapshot.card.phaseId === alvo;
      return c.operador === 'diferente' ? !igual : igual;
    }
    case 'CARD_MILESTONE': {
      if (!snapshot.card) return false;
      const qual = c.valor;
      const marco =
        qual === 'esperado'
          ? snapshot.card.marcos.esperado
          : qual === 'vencimento'
            ? snapshot.card.marcos.vencimento
            : qual === 'expiracao'
              ? snapshot.card.marcos.expiracao
              : undefined;
      if (marco === undefined) return false; // valor de marco fora do domínio ⇒ fail-closed
      const atingido = marco !== null && snapshot.avaliadoEm.getTime() >= marco.getTime();
      return c.operador === 'nao_atingido' ? !atingido : atingido;
    }
    case 'CARD_HAS_RECORD_LINK': {
      if (!snapshot.card) return false;
      const alvo = refId(c, 'RECORD'); // opcional: vínculo com um Registro específico
      const existe =
        alvo === undefined
          ? snapshot.card.linkedRecordIds.length > 0
          : snapshot.card.linkedRecordIds.includes(alvo);
      return c.operador === 'nao_existe' ? !existe : existe;
    }
    case 'CARD_FIELD_VALUE':
      return avaliarCampo(c, snapshot, snapshot.card);
    case 'RECORD_FIELD_VALUE':
      return avaliarCampo(c, snapshot, snapshot.record);
    default:
      return false; // tipo fora do catálogo ⇒ fail-closed (o config-time já rejeita, defesa em profundidade)
  }
}

/**
 * Avalia N Condições por AND sobre o snapshot. Cada Condição é avaliada de forma ISOLADA e ENVOLVIDA: qualquer
 * exceção interna (`NaoAvaliavel` ou inesperada) é capturada e vira `false` — nunca escapa para o motor. AND
 * completo (sem short-circuit) para que a trilha (4.8) registre o resultado de CADA Condição; a decisão final
 * é a conjunção. Conjunto vazio ⇒ aprovado (ausência = aprovação direta).
 */
export function avaliarCondicoes(
  condicoes: readonly Condicao[],
  snapshot: SnapshotAvaliacao,
): ResultadoAvaliacao {
  const resultados: ResultadoCondicao[] = condicoes.map((c, indice) => {
    let resultado = false;
    try {
      resultado = avaliarUma(c, snapshot);
    } catch {
      resultado = false; // fail-closed absoluto: erro de avaliação nunca vira disparo
    }
    return {
      indice,
      tipo: c.tipo,
      operador: c.operador,
      resultado,
      motivo: resultado ? null : 'FAIL_CLOSED',
    };
  });

  return { aprovado: resultados.every((r) => r.resultado), resultados };
}
